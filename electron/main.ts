import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { DesktopNotesController, getAppIconPath } from './desktop-notes-controller';
import { IPC_CHANNELS } from './ipc/channels';
import { ConfigService } from './services/config-service';
import { DeleteService } from './services/delete-service';
import { DnsService } from './services/dns-service';
import { ElevationService } from './services/elevation-service';
import { HostsService } from './services/hosts-service';
import { PackageCacheService } from './services/package-cache-service';
import { PortService } from './services/port-service';
import { DesktopNotesService } from './services/desktop-notes-service';
import { ScanService } from './services/scan-service';
import { calculateDirectorySize } from './services/size-service';
import type { PackageManagerName, PortUsageQuery } from '../shared/developer-tools-types';
import type { HostsSaveRequest } from '../shared/network-tools-types';
import type {
  DeleteMode,
  DirectoryHistoryItem,
  IgnoredProject,
  NodeModulesItem,
  ProtectedProject,
  TaskEvent,
} from '../shared/task-types';

let mainWindow: BrowserWindow | undefined;
let configService: ConfigService;
let desktopNotesController: DesktopNotesController;
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: '开发者本地助手',
    icon: getAppIconPath(),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // preload 需要加载本地编译模块；关闭 sandbox 不会向页面开放 Node 能力。
      sandbox: false,
    },
  });

  desktopNotesController.attachMainWindow(mainWindow);

  if (process.env.NODE_ENV === 'development') {
    void mainWindow.loadURL(process.env.DEV_SERVER_URL ?? 'http://127.0.0.1:8137');
    return;
  }

  void mainWindow.loadFile(getRendererEntry());
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
  ipcMain.handle(IPC_CHANNELS.getAppConfig, async () => configService.getConfig());

  ipcMain.handle(IPC_CHANNELS.saveProtectedProjects, async (_, projects: ProtectedProject[]) =>
    configService.saveProtectedProjects(projects),
  );

  ipcMain.handle(IPC_CHANNELS.saveDirectoryHistory, async (_, historyItems: DirectoryHistoryItem[]) =>
    configService.saveDirectoryHistory(historyItems),
  );

  ipcMain.handle(IPC_CHANNELS.saveIgnoredProjects, async (_, projects: IgnoredProject[]) =>
    configService.saveIgnoredProjects(projects),
  );
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

function isIgnoredItem(item: NodeModulesItem, ignoredProjects: Awaited<ReturnType<typeof getIgnoredProjects>>) {
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
    return scanService.start(rootPath, handleItemFound, (taskId, status, message) => {
      sendTaskEvent({ type: 'scan:status', taskId, status, message });
    }, (targetPath) => {
      if (configService.isPathProtected(targetPath, protectedProjects)) {
        return 'protected';
      }

      if (configService.isPathIgnored(targetPath, ignoredProjects)) {
        return 'ignored';
      }

      return undefined;
    });
  });

  ipcMain.handle(IPC_CHANNELS.pauseScan, async (_, taskId: string) => {
    scanService.pause(taskId, (currentTaskId, status, message) => {
      sendTaskEvent({ type: 'scan:status', taskId: currentTaskId, status, message });
    });
  });

  ipcMain.handle(IPC_CHANNELS.resumeScan, async (_, taskId: string) => {
    const protectedProjects = await getActiveProtectedProjects();
    const ignoredProjects = await getIgnoredProjects();
    scanService.resume(taskId, handleItemFound, (currentTaskId, status, message) => {
      sendTaskEvent({ type: 'scan:status', taskId: currentTaskId, status, message });
    }, (targetPath) => {
      if (configService.isPathProtected(targetPath, protectedProjects)) {
        return 'protected';
      }

      if (configService.isPathIgnored(targetPath, ignoredProjects)) {
        return 'ignored';
      }

      return undefined;
    });
  });

  ipcMain.handle(IPC_CHANNELS.restartScan, async (_, taskId: string) => {
    itemMap.clear();
    const protectedProjects = await getActiveProtectedProjects();
    const ignoredProjects = await getIgnoredProjects();
    const nextTaskId = scanService.restart(taskId, handleItemFound, (currentTaskId, status, message) => {
      sendTaskEvent({ type: 'scan:status', taskId: currentTaskId, status, message });
    }, (targetPath) => {
      if (configService.isPathProtected(targetPath, protectedProjects)) {
        return 'protected';
      }

      if (configService.isPathIgnored(targetPath, ignoredProjects)) {
        return 'ignored';
      }

      return undefined;
    });

    return nextTaskId;
  });
}

function registerDeleteHandlers() {
  ipcMain.handle(IPC_CHANNELS.startDelete, async (_, itemIds: string[], mode: DeleteMode) => {
    const protectedProjects = await getActiveProtectedProjects();
    const ignoredProjects = await getIgnoredProjects();
    const items = itemIds
      .map((itemId) => itemMap.get(itemId))
      .filter((item): item is NodeModulesItem => Boolean(item));
    const allowedItems = items.filter(
      (item) => !isProtectedItem(item, protectedProjects) && !isIgnoredItem(item, ignoredProjects),
    );
    const blockedItems = items.filter(
      (item) => isProtectedItem(item, protectedProjects) || isIgnoredItem(item, ignoredProjects),
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
        sendTaskEvent({ type: 'delete:status', taskId, status, currentItemId, progress });
      },
    );
  });

  ipcMain.handle(IPC_CHANNELS.pauseDelete, async (_, taskId: string) => {
    deleteService.pause(taskId, (currentTaskId, status, currentItemId, progress) => {
      sendTaskEvent({
        type: 'delete:status',
        taskId: currentTaskId,
        status,
        currentItemId,
        progress,
      });
    });
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
        sendTaskEvent({ type: 'delete:status', taskId: currentTaskId, status, currentItemId, progress });
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
        sendTaskEvent({ type: 'delete:status', taskId: currentTaskId, status, currentItemId, progress });
      },
    );
  });
}

function registerDeveloperToolsHandlers() {
  ipcMain.handle(IPC_CHANNELS.scanPackageCaches, async () => packageCacheService.scanCaches());

  ipcMain.handle(IPC_CHANNELS.cleanPackageCache, async (_, manager: PackageManagerName) =>
    packageCacheService.cleanCache(manager),
  );

  ipcMain.handle(IPC_CHANNELS.openPackageCacheDirectory, async (_, cachePath: string) =>
    packageCacheService.openCacheDirectory(cachePath),
  );

  ipcMain.handle(IPC_CHANNELS.listPortUsages, async (_, query: PortUsageQuery) =>
    portService.listPortUsages(query),
  );

  ipcMain.handle(IPC_CHANNELS.killPortProcess, async (_, pid: number) => portService.killProcess(pid));

  ipcMain.handle(IPC_CHANNELS.getHostsDocument, async () => hostsService.getDocument());

  ipcMain.handle(IPC_CHANNELS.saveHosts, async (_, request: HostsSaveRequest) =>
    hostsService.save(request),
  );

  ipcMain.handle(IPC_CHANNELS.listHostsBackups, async () => hostsService.listBackups());

  ipcMain.handle(
    IPC_CHANNELS.restoreHostsBackup,
    async (_, backupId: string, sourceHash: string) => hostsService.restore(backupId, sourceHash),
  );

  ipcMain.handle(IPC_CHANNELS.flushDns, async () => dnsService.flush());
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.devlocalassistant.app');
  configService = new ConfigService(app.getPath('userData'));
  const elevationService = new ElevationService(getHostsHelperPath());
  dnsService = new DnsService(elevationService);
  hostsService = new HostsService(app.getPath('userData'), elevationService, dnsService);
  desktopNotesController = new DesktopNotesController({
    configService,
    notesService: new DesktopNotesService(app.getPath('userData')),
    getPreloadPath,
    getRendererEntry,
    getIconPath: getAppIconPath,
  });
  registerDialogHandlers();
  registerConfigHandlers();
  registerScanHandlers();
  registerDeleteHandlers();
  registerDeveloperToolsHandlers();
  desktopNotesController.registerIpc();
  await desktopNotesController.start();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    return;
  }

  if (desktopNotesController.shouldQuitWhenAllWindowsClosed()) {
    app.quit();
  }
});
