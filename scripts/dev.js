const { spawn } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const nodePath = process.execPath;
const devServerUrl = process.env.DEV_SERVER_URL || 'http://127.0.0.1:8137';

const childProcesses = new Set();

function runNodeScript(relativeScriptPath, args, options = {}) {
  const child = spawn(nodePath, [path.join(rootDir, relativeScriptPath), ...args], {
    cwd: rootDir,
    env: { ...process.env, ...options.env },
    shell: false,
    stdio: 'inherit',
  });

  childProcesses.add(child);
  child.once('exit', () => childProcesses.delete(child));

  return child;
}

function stopChildren() {
  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill();
    }
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`子进程退出码：${code}`));
    });
  });
}

async function startElectronWhenWebReady() {
  await waitForExit(runNodeScript('node_modules/wait-on/bin/wait-on', [devServerUrl]));
  await waitForExit(runNodeScript('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.electron.json']));

  // Electron 必须继承开发服务地址，否则主进程无法加载 Umi dev server。
  runNodeScript('node_modules/electron/cli.js', ['.'], {
    env: {
      DEV_SERVER_URL: devServerUrl,
      NODE_ENV: 'development',
    },
  });
}

process.once('SIGINT', () => {
  stopChildren();
  process.exit(0);
});

process.once('SIGTERM', () => {
  stopChildren();
  process.exit(0);
});

runNodeScript('node_modules/@umijs/max/bin/max.js', ['dev']);

startElectronWhenWebReady().catch((error) => {
  stopChildren();
  console.error(error);
  process.exit(1);
});
