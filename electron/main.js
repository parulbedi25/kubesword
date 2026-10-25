'use strict';

/**
 * KubeSword desktop shell (Electron).
 * - Production: starts the bundled Express+WS server on a free port and loads it.
 * - Development: connects to the Vite dev server (CLIENT_URL) + local API server.
 */

const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow = null;
let serverChild = null;
let serverPort = Number(process.env.KUBESWORD_PORT || 0);
let tray = null;

function findFreePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

function serverEntryCandidates() {
  return [
    path.join(__dirname, '../server/dist/index.js'),
    path.join(__dirname, '../server/src/index.js'),
    path.join(process.resourcesPath || '', 'server/dist/index.js'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked/server/dist/index.js'),
  ];
}

async function startServer() {
  serverPort = serverPort || (await findFreePort());
  const entry = serverEntryCandidates().find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!entry) {
    console.error('[kubesword] server entry not found. Tried:', serverEntryCandidates());
    return null;
  }
  console.log(`[kubesword] starting server ${entry} on port ${serverPort}`);
  serverChild = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1', ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverChild.stdout.on('data', (d) => console.log('[server]', d.toString().trim()));
  serverChild.stderr.on('data', (d) => console.error('[server]', d.toString().trim()));
  await waitForPort(serverPort, 15000);
  return serverPort;
}

function waitForPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function probe() {
      const sock = net.connect(port, '127.0.0.1', () => { sock.end(); resolve(true); });
      sock.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('server start timeout'));
        setTimeout(probe, 250);
      });
    })();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0e14',
    title: 'KubeSword',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    const url = process.env.CLIENT_URL || 'http://localhost:5173';
    console.log('[kubesword] dev mode, loading', url);
    await mainWindow.loadURL(url);
    if (process.env.OPEN_DEVTOOLS) mainWindow.webContents.openDevTools();
  } else {
    const port = await startServer();
    if (!port) {
      await mainWindow.loadURL('data:text/html,<h1>KubeSword failed to start the local server.</h1>');
    } else {
      await mainWindow.loadURL(`http://127.0.0.1:${port}`);
    }
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open in browser', click: () => serverPort && shell.openExternal(`http://127.0.0.1:${serverPort}`) },
        { label: 'KubeSword on GitHub', click: () => shell.openExternal('https://github.com/parulbedi25/kubesword') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupTray() {
  try {
    const iconPath = path.join(__dirname, '../build/icon.png');
    const image = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
    tray = new Tray(image);
    tray.setToolTip('KubeSword');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open KubeSword', click: () => mainWindow?.show() || createWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('click', () => mainWindow?.show());
  } catch (e) {
    console.warn('[kubesword] tray unavailable:', e.message);
  }
}

app.whenReady().then(async () => {
  buildMenu();
  await createWindow();
  setupTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { tray?.destroy(); } catch { /* noop */ }
  if (serverChild) {
    try { serverChild.kill(); } catch { /* noop */ }
    serverChild = null;
  }
});
