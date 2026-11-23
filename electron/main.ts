import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  PackageManagerName,
  PortUsageQuery,
} from '../shared/developer-tools-types';
import {
  MAIN_WINDOW_COLORS,
  MAIN_WINDOW_TITLE_BAR_HEIGHT,
  resolveMainWindowScheme,
} from '../shared/main-window-appearance';
import type { HostsSaveRequest } from '../shared/network-tools-types';
import type {
  DeleteMode,
  DirectoryHistoryItem,
  IgnoredProject,
  NodeModulesItem,
  ProtectedProject,
  TaskEvent,
} from '../shared/task-types';
import {
  AppSettingsController,
  BACKGROUND_LAUNCH_ARG,
} from './app-settings-controller';
import { DesktopCalendarController } from './desktop-calendar-controller';
import {
  DesktopNotesController,
  getAppIconPath,
} from './desktop-notes-controller';
import { IPC_CHANNELS } from './ipc/channels';
import {
  getMainWindowMenu,
  runMainWindowMenuCommand,
} from './main-window-menu';
import { ConfigService } from './services/config-service';
import { DeleteService } from './services/delete-service';
import { DesktopNotesService } from './services/desktop-notes-service';
import { DnsService } from './services/dns-service';
import { ElevationService } from './services/elevation-service';
import { HolidayService } from './services/holiday-service';
import { HostsService } from './services/hosts-service';
import { PackageCacheService } from './services/package-cache-service';
import { PortService } from './services/port-service';
import { ScanService } from './services/scan-service';
import { calculateDirectorySize } from './services/size-service';
import { TimeService } from './services/time-service';
import { TrayController } from './tray-controller';

// 项目主页由主进程固定，渲染层不能指定要打开的地址。
const PROJECT_HOME_URL = 'https://github.com/gyxing/dev-local-assistant';

let mainWindow: BrowserWindow | undefined;
let configService: ConfigService;
let appSettingsController: AppSettingsController;
let desktopNotesController: DesktopNotesController;
let desktopCalendarController: DesktopCalendarController;
let trayController: TrayController | undefined;
let quitPending: Promise<void> | undefined;
let quitting = false;
let pendingConfigWrite: Promise<unknown> = Promise.resolve();
let dnsService: DnsService;
let hostsService: HostsService;
const scanService = new ScanService();
const deleteService = new DeleteService();
const packageCacheService = new PackageCacheService();
const portService = new PortService();
const itemMap = new Map<string, NodeModulesItem>();

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function getRendererEntry() {
  return path.join(__dirname, '../../dist/index.html');
}

function getHostsHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'hosts-helper.ps1')
    : path.join(app.getAppPath(), 'electron', 'resources', 'hosts-helper.ps1');
}

function getMainWindowColors() {
  return MAIN_WINDOW_COLORS[
    resolveMainWindowScheme(
      appSettingsController.mainWindowTheme,
      nativeTheme.shouldUseDarkColors,
    )
  ];
}

function mainWindowOverlay(
  colors: (typeof MAIN_WINDOW_COLORS)[keyof typeof MAIN_WINDOW_COLORS],
) {
  return {
    color: colors.titleBar,
    symbolColor: colors.symbol,
    height: MAIN_WINDOW_TITLE_BAR_HEIGHT,
  };
}

/** 主窗口单独更新原生按钮颜色，托盘继续跟随系统主题。 */
function updateMainWindowAppearance() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed())
    return;
  const colors = getMainWindowColors();
  mainWindow.setBackgroundColor(colors.canvas);
  mainWindow.setTitleBarOverlay(mainWindowOverlay(colors));
}

function createWindow() {
  const colors = getMainWindowColors();
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: '本地助手',
    icon: getAppIconPath(),
    backgroundColor: colors.canvas,
    ...(process.platform === 'win32'
      ? ({
          frame: false,
          titleBarStyle: 'hidden',
          titleBarOverlay: mainWindowOverlay(colors),
        } as const)
      : {}),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // preload 需要加载本地编译模块；关闭 sandbox 不会向页面开放 Node 能力。
      sandbox: false,
    },
  });

  desktopNotesController.attachMainWindow(mainWindow);
  desktopCalendarController.attachMainWindow(mainWindow);
  const window = mainWindow;
  if (process.platform === 'win32') {
    // 无边框窗口保留原有菜单快捷键，菜单内容由渲染层展示。
    nativeTheme.on('updated', updateMainWindowAppearance);
    window.once('closed', () =>
      nativeTheme.off('updated', updateMainWindowAppearance),
    );
  }
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (!trayController || appSettingsController.quitWhenMainWindowCloses) {
      void quitApplication().catch(reportDesktopError);
    } else {
      window.hide();
    }
  });

  if (process.env.NODE_ENV === 'development') {
    void mainWindow.loadURL(
      process.env.DEV_SERVER_URL ?? 'http://127.0.0.1:8137',
    );
    return;
  }

  void mainWindow.loadFile(getRendererEntry());
}

/** 创建或显示主窗口；托盘点击与二次启动都通过它回到主界面 */
function showMainWindow() {
  // 启动尚未完成时忽略，避免在桌面便利贴控制器初始化前创建窗口
  if (!desktopNotesController) {
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

/** 托盘动作失败时即使主窗口隐藏也给出反馈。 */
function reportDesktopError(error: unknown) {
  console.error('桌面工具操作失败', error);
  dialog.showErrorBox(
    '桌面工具操作失败',
    error instanceof Error ? error.message : String(error),
  );
}

/** 同一份配置的读改写按顺序执行，避免不同模块覆盖彼此的新值。 */
function writeAppConfig<T>(write: () => Promise<T>): Promise<T> {
  const task = pendingConfigWrite.then(write);
  pendingConfigWrite = task.catch(() => undefined);
  return task;
}

/** 等待最后一次便签保存，避免退出时丢失草稿。 */
function quitApplication(): Promise<void> {
  if (quitting) return Promise.resolve();
  quitPending ??= (async () => {
    await desktopNotesController?.prepareQuit();
    quitting = true;
    app.quit();
  })().finally(() => {
    quitPending = undefined;
  });
  return quitPending;
}

function registerDialogHandlers() {
  ipcMain.handle(IPC_CHANNELS.selectDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    return result.canceled ? undefined : result.filePaths[0];
  });
}

function registerConfigHandlers() {
  ipcMain.handle(IPC_CHANNELS.getAppConfig, async () =>
    configService.getConfig(),
  );

  ipcMain.handle(
    IPC_CHANNELS.saveProtectedProjects,
    async (_, projects: ProtectedProject[]) =>
      writeAppConfig(() => configService.saveProtectedProjects(projects)),
  );

  ipcMain.handle(
    IPC_CHANNELS.saveDirectoryHistory,
    async (_, historyItems: DirectoryHistoryItem[]) =>
      writeAppConfig(() => configService.saveDirectoryHistory(historyItems)),
  );

  ipcMain.handle(
    IPC_CHANNELS.saveIgnoredProjects,
    async (_, projects: IgnoredProject[]) =>
      writeAppConfig(() => configService.saveIgnoredProjects(projects)),
  );
}

/** 主窗口专用命令只接受应用页面的主框架调用。 */
function assertMainWindowSender(event: IpcMainInvokeEvent): BrowserWindow {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error('请在本地助手主窗口中执行此操作');
  }
  const expected =
    process.env.NODE_ENV === 'development'
      ? new URL(process.env.DEV_SERVER_URL ?? 'http://127.0.0.1:8137')
      : pathToFileURL(getRendererEntry());
  const actual = new URL(event.senderFrame.url);
  // 只允许本地助手自己的页面访问；前端用 Hash 路由切换视图。
  actual.hash = '';
  expected.hash = '';
  if (actual.href !== expected.href) {
    throw new Error('请在本地助手主窗口中执行此操作');
  }
  return mainWindow;
}

function registerMainWindowHandlers() {
  if (process.platform !== 'win32') return;

  ipcMain.handle(IPC_CHANNELS.mainWindowMenu, (event) => {
    assertMainWindowSender(event);
    return getMainWindowMenu();
  });
  ipcMain.handle(IPC_CHANNELS.mainWindowMenuCommand, (event, id: unknown) => {
    runMainWindowMenuCommand(assertMainWindowSender(event), id);
  });
  ipcMain.handle(IPC_CHANNELS.mainWindowAboutVersion, (event) => {
    assertMainWindowSender(event);
    return app.getVersion();
  });
  ipcMain.handle(IPC_CHANNELS.mainWindowOpenProjectHome, (event) => {
    assertMainWindowSender(event);
    return shell.openExternal(PROJECT_HOME_URL);
  });
}

function registerAppSettingsHandlers() {
  ipcMain.handle(IPC_CHANNELS.appSettingsGetSnapshot, (event) => {
    assertMainWindowSender(event);
    return appSettingsController.getSnapshot();
  });
  ipcMain.handle(IPC_CHANNELS.appSettingsSave, (event, patch: unknown) => {
    assertMainWindowSender(event);
    return writeAppConfig(async () => {
      const previousTheme = appSettingsController.mainWindowTheme;
      const settings = await appSettingsController.save(patch);
      if (settings.mainWindowTheme !== previousTheme)
        updateMainWindowAppearance();
      return settings;
    });
  });
}

function sendTaskEvent(event: TaskEvent) {
  mainWindow?.webContents.send(IPC_CHANNELS.taskEvent, event);
}

async function getActiveProtectedProjects() {
  const config = await configService.getConfig();
  return configService.getActiveProjects(config);
}

async function getIgnoredProjects() {
  const config = await configService.getConfig();
  return configService.getIgnoredProjects(config);
}

function isProtectedItem(
  item: NodeModulesItem,
  protectedProjects: Awaited<ReturnType<typeof getActiveProtectedProjects>>,
) {
  return (
    configService.isPathProtected(item.projectPath, protectedProjects) ||
    configService.isPathProtected(item.nodeModulesPath, protectedProjects)
  );
}

function isIgnoredItem(
  item: NodeModulesItem,
  ignoredProjects: Awaited<ReturnType<typeof getIgnoredProjects>>,
) {
  return (
    configService.isPathIgnored(item.projectPath, ignoredProjects) ||
    configService.isPathIgnored(item.nodeModulesPath, ignoredProjects)
  );
}

function handleItemFound(item: NodeModulesItem) {
  itemMap.set(item.id, item);
  sendTaskEvent({ type: 'scan:item-found', item });

  void calculateDirectorySize(item.nodeModulesPath)
    .then((summary) => {
      sendTaskEvent({
        type: 'size:updated',
        itemId: item.id,
        sizeBytes: summary.sizeBytes,
        fileCount: summary.fileCount,
      });
    })
    .catch((error: unknown) => {
      sendTaskEvent({
        type: 'size:failed',
        itemId: item.id,
        errorMessage: error instanceof Error ? error.message : '统计失败',
      });
    });
}

function registerScanHandlers() {
  ipcMain.handle(IPC_CHANNELS.startScan, async (_, rootPath: string) => {
    itemMap.clear();
    const protectedProjects = await getActiveProtectedProjects();
    const ignoredProjects = await getIgnoredProjects();
    return scanService.start(
      rootPath,
      handleItemFound,
      (taskId, status, message) => {
        sendTaskEvent({ type: 'scan:status', taskId, status, message });
      },
      (targetPath) => {
        if (configService.isPathProtected(targetPath, protectedProjects)) {
          return 'protected';
        }

        if (configService.isPathIgnored(targetPath, ignoredProjects)) {
          return 'ignored';
        }

        return undefined;
      },
    );
  });

  ipcMain.handle(IPC_CHANNELS.pauseScan, async (_, taskId: string) => {
    scanService.pause(taskId, (currentTaskId, status, message) => {
      sendTaskEvent({
        type: 'scan:status',
        taskId: currentTaskId,
        status,
        message,
      });
    });
  });

  ipcMain.handle(IPC_CHANNELS.resumeScan, async (_, taskId: string) => {
    const protectedProjects = await getActiveProtectedProjects();
    const ignoredProjects = await getIgnoredProjects();
    scanService.resume(
      taskId,
      handleItemFound,
      (currentTaskId, status, message) => {
        sendTaskEvent({
          type: 'scan:status',
          taskId: currentTaskId,
          status,
          message,
        });
      },
      (targetPath) => {
        if (configService.isPathProtected(targetPath, protectedProjects)) {
          return 'protected';
        }

        if (configService.isPathIgnored(targetPath, ignoredProjects)) {
          return 'ignored';
        }

        return undefined;
      },
    );
  });

  ipcMain.handle(IPC_CHANNELS.restartScan, async (_, taskId: string) => {
    itemMap.clear();
    const protectedProjects = await getActiveProtectedProjects();
    const ignoredProjects = await getIgnoredProjects();
    const nextTaskId = scanService.restart(
      taskId,
      handleItemFound,
      (currentTaskId, status, message) => {
        sendTaskEvent({
          type: 'scan:status',
          taskId: currentTaskId,
          status,
          message,
        });
      },
      (targetPath) => {
        if (configService.isPathProtected(targetPath, protectedProjects)) {
          return 'protected';
        }

        if (configService.isPathIgnored(targetPath, ignoredProjects)) {
          return 'ignored';
        }

        return undefined;
      },
    );

    return nextTaskId;
  });
}

function registerDeleteHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.startDelete,
    async (_, itemIds: string[], mode: DeleteMode) => {
      const protectedProjects = await getActiveProtectedProjects();
      const ignoredProjects = await getIgnoredProjects();
      const items = itemIds
        .map((itemId) => itemMap.get(itemId))
        .filter((item): item is NodeModulesItem => Boolean(item));
      const allowedItems = items.filter(
        (item) =>
          !isProtectedItem(item, protectedProjects) &&
          !isIgnoredItem(item, ignoredProjects),
      );
      const blockedItems = items.filter(
        (item) =>
          isProtectedItem(item, protectedProjects) ||
          isIgnoredItem(item, ignoredProjects),
      );

      for (const item of blockedItems) {
        sendTaskEvent({
          type: 'delete:item-updated',
          itemId: item.id,
          status: 'delete-failed',
          errorMessage: isProtectedItem(item, protectedProjects)
            ? '该项目已被保护，已跳过删除'
            : '该项目已被忽略，已跳过删除',
        });
      }

      return deleteService.start(
        allowedItems,
        mode,
        (event) => {
          sendTaskEvent({
            type: 'delete:item-updated',
            itemId: event.itemId,
            status: event.status,
            errorMessage: event.errorMessage,
            failureDetail: event.failureDetail,
          });
        },
        (taskId, status, currentItemId, progress) => {
          sendTaskEvent({
            type: 'delete:status',
            taskId,
            status,
            currentItemId,
            progress,
          });
        },
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.pauseDelete, async (_, taskId: string) => {
    deleteService.pause(
      taskId,
      (currentTaskId, status, currentItemId, progress) => {
        sendTaskEvent({
          type: 'delete:status',
          taskId: currentTaskId,
          status,
          currentItemId,
          progress,
        });
      },
    );
  });

  ipcMain.handle(IPC_CHANNELS.resumeDelete, async (_, taskId: string) => {
    deleteService.resume(
      taskId,
      Array.from(itemMap.values()),
      (event) => {
        sendTaskEvent({
          type: 'delete:item-updated',
          itemId: event.itemId,
          status: event.status,
          errorMessage: event.errorMessage,
          failureDetail: event.failureDetail,
        });
      },
      (currentTaskId, status, currentItemId, progress) => {
        sendTaskEvent({
          type: 'delete:status',
          taskId: currentTaskId,
          status,
          currentItemId,
          progress,
        });
      },
    );
  });

  ipcMain.handle(IPC_CHANNELS.finishDelete, async (_, taskId: string) => {
    deleteService.finish(
      taskId,
      (event) => {
        sendTaskEvent({
          type: 'delete:item-updated',
          itemId: event.itemId,
          status: event.status,
          errorMessage: event.errorMessage,
          failureDetail: event.failureDetail,
        });
      },
      (currentTaskId, status, currentItemId, progress) => {
        sendTaskEvent({
          type: 'delete:status',
          taskId: currentTaskId,
          status,
          currentItemId,
          progress,
        });
      },
    );
  });
}

function registerDeveloperToolsHandlers() {
  ipcMain.handle(IPC_CHANNELS.scanPackageCaches, async () =>
    packageCacheService.scanCaches(),
  );

  ipcMain.handle(
    IPC_CHANNELS.cleanPackageCache,
    async (_, manager: PackageManagerName) =>
      packageCacheService.cleanCache(manager),
  );

  ipcMain.handle(
    IPC_CHANNELS.openPackageCacheDirectory,
    async (_, cachePath: string) =>
      packageCacheService.openCacheDirectory(cachePath),
  );

  ipcMain.handle(
    IPC_CHANNELS.listPortUsages,
    async (_, query: PortUsageQuery) => portService.listPortUsages(query),
  );

  ipcMain.handle(IPC_CHANNELS.killPortProcess, async (_, pid: number) =>
    portService.killProcess(pid),
  );

  ipcMain.handle(IPC_CHANNELS.getHostsDocument, async () =>
    hostsService.getDocument(),
  );

  ipcMain.handle(IPC_CHANNELS.saveHosts, async (_, request: HostsSaveRequest) =>
    hostsService.save(request),
  );

  ipcMain.handle(IPC_CHANNELS.listHostsBackups, async () =>
    hostsService.listBackups(),
  );

  ipcMain.handle(
    IPC_CHANNELS.restoreHostsBackup,
    async (_, backupId: string, sourceHash: string) =>
      hostsService.restore(backupId, sourceHash),
  );

  ipcMain.handle(IPC_CHANNELS.flushDns, async () => dnsService.flush());
}

// Electron 默认按应用名称生成数据目录，改名后沿用原目录，保留已有配置和便利贴。
const appDataPath = app.getPath('appData');
const defaultUserDataPath = path.join(appDataPath, app.name);
if (
  !app.commandLine.hasSwitch('user-data-dir') &&
  path.relative(defaultUserDataPath, app.getPath('userData')) === ''
) {
  const legacyUserDataPath = path.join(appDataPath, '开发者工具箱');
  mkdirSync(legacyUserDataPath, { recursive: true });
  app.setPath('userData', legacyUserDataPath);
}

// 登录启动带 --background 参数，托盘常驻，并按各功能已有偏好恢复桌面窗口。
const isBackgroundLaunch = process.argv.includes(BACKGROUND_LAUNCH_ARG);

// 单实例锁：避免开机自启的实例与手动启动的实例并存两套托盘和便利贴。
// 开发模式跳过，否则已安装的正式版会拦截 dev 启动。
const hasSingleInstanceLock =
  !app.isPackaged || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!app.isReady()) {
      return;
    }

    showMainWindow();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.devbox.app');
    configService = new ConfigService(app.getPath('userData'));
    appSettingsController = new AppSettingsController(configService);
    await appSettingsController.start();
    const elevationService = new ElevationService(getHostsHelperPath());
    dnsService = new DnsService(elevationService);
    hostsService = new HostsService(
      app.getPath('userData'),
      elevationService,
      dnsService,
    );
    desktopNotesController = new DesktopNotesController({
      configService,
      notesService: new DesktopNotesService(app.getPath('userData')),
      getPreloadPath,
      getRendererEntry,
      getIconPath: getAppIconPath,
      saveRuntime: (runtime) =>
        writeAppConfig(() => configService.saveRuntime(runtime)),
      reportError: reportDesktopError,
    });
    desktopCalendarController = new DesktopCalendarController({
      configService,
      holidayService: new HolidayService(app.getPath('userData')),
      timeService: new TimeService(),
      getPreloadPath,
      getRendererEntry,
      saveCalendarSettings: (settings) =>
        writeAppConfig(() => configService.saveCalendarSettings(settings)),
      reportError: reportDesktopError,
    });
    registerDialogHandlers();
    registerConfigHandlers();
    registerAppSettingsHandlers();
    registerMainWindowHandlers();
    registerScanHandlers();
    registerDeleteHandlers();
    registerDeveloperToolsHandlers();
    desktopNotesController.registerIpc();
    desktopCalendarController.registerIpc();
    try {
      trayController = new TrayController({
        iconPath: getAppIconPath(),
        panelPreloadPath: path.join(__dirname, 'tray-panel-preload.js'),
        getRendererEntry,
        getNotesState: () => desktopNotesController.getTrayState(),
        getCalendarState: () => desktopCalendarController.getTrayState(),
        toggleNotesWindow: (activate) =>
          desktopNotesController.toggleWindow(activate),
        toggleNotesDesktopMode: () =>
          desktopNotesController.toggleDesktopMode(),
        highlightNotesBounds: () =>
          desktopNotesController.highlightNotesBounds(),
        toggleCalendarWindow: () => desktopCalendarController.toggleWindow(),
        toggleCalendarTheme: () => desktopCalendarController.toggleTheme(),
        syncCalendarTime: () => desktopCalendarController.syncTime(),
        openMainWindow: showMainWindow,
        quit: quitApplication,
        reportError: reportDesktopError,
      });
      desktopNotesController.setOnStateChanged(() => trayController?.refresh());
      desktopCalendarController.setOnStateChanged(() =>
        trayController?.refresh(),
      );
    } catch (error) {
      reportDesktopError(error);
    }

    await desktopNotesController
      .start(Boolean(trayController))
      .catch(reportDesktopError);
    await desktopCalendarController.start().catch(reportDesktopError);
    trayController?.enable();

    if (!quitting && (!isBackgroundLaunch || !trayController)) {
      showMainWindow();
    }

    app.on('activate', showMainWindow);
  });

  app.on('before-quit', (event) => {
    if (!quitting && desktopNotesController) {
      event.preventDefault();
      void quitApplication().catch(reportDesktopError);
      return;
    }
    trayController?.destroy();
  });

  // 只要托盘存在，就保留进程以便重新打开主窗口。
  app.on('window-all-closed', () => {
    if (!trayController && process.platform !== 'darwin') {
      void quitApplication().catch(reportDesktopError);
    }
  });
}
