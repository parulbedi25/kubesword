'use strict';

/**
 * KubeSword desktop shell (Electron).
 * - Production: starts the bundled Express+WS server on a free port and loads it.
 * - Development: connects to the Vite dev server (CLIENT_URL) + local API server.
 */

const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron');
const path = require('path');
const { setupPortablePaths, serverDataDir } = require('./portable');

// Portable mode (Windows standalone .exe): keep all data next to the exe.
// Must run before app.ready / any window creation.
const portableDataDir = setupPortablePaths(app);
if (portableDataDir) console.log(`[kubesword] portable mode — data dir: ${portableDataDir}`);
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow = null;
let serverChild = null;
let serverPort = Number(process.env.KUBESWORD_PORT || 0);
let tray = null;

function errorPage(title, detail) {
  const safe = String(detail || '').replace(/</g, '&lt;');
  return `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="background:#0a0e14;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="max-width:560px;text-align:center"><h2>⚔️ ${title}</h2><p style="color:#94a3b8;font-size:14px;white-space:pre-wrap">${safe}</p></div></body></html>`)}`;
}

function viteDevServerUp(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

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
  // NOTE: the server ships as a single bundled file (server/dist/index.js)
  // with zero runtime node_modules. It is unpacked from the asar so plain
  // node (ELECTRON_RUN_AS_NODE) can always load it.
  const unpacked = path.join(process.resourcesPath || '', 'app.asar.unpacked/server/dist/index.js');
  const fromSource = [
    path.join(__dirname, '../server/dist/index.js'),
    path.join(__dirname, '../server/src/index.js'),
  ];
  const fromAsar = [
    unpacked,
    path.join(process.resourcesPath || '', 'server/dist/index.js'),
  ];
  // Prefer the unpacked bundle when packaged; prefer the local build in dev.
  return isDev ? [...fromSource, ...fromAsar] : [...fromAsar, ...fromSource];
}

async function startServer() {
  serverPort = serverPort || (await findFreePort());
  const entry = serverEntryCandidates().find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!entry) {
    throw new Error(`local server bundle not found.\nTried:\n${serverEntryCandidates().join('\n')}\n\nRun "npm run build" and try again.`);
  }
  console.log(`[kubesword] starting server ${entry} on port ${serverPort}`);
  const kubeswordData = serverDataDir(portableDataDir);
  // The server child runs as plain node (ELECTRON_RUN_AS_NODE), so it cannot
  // read inside app.asar — point it at the unpacked UI explicitly. (The
  // server also probes relative paths as a fallback.)
  let uiDirEnv = {};
  try {
    const unpackedUi = path.join(process.resourcesPath || '', 'app.asar.unpacked/client/dist');
    if (!isDev && fs.existsSync(path.join(unpackedUi, 'index.html'))) {
      console.log(`[kubesword] packaged UI found at ${unpackedUi}`);
      uiDirEnv = { KUBESWORD_UI_DIR: unpackedUi };
    } else if (!isDev) {
      console.warn(`[kubesword] WARNING: packaged UI not found at ${unpackedUi} — the window may show the API page instead of the app. Rebuild with "npm run build" first.`);
    }
  } catch { /* fall through to server-side probing */ }
  serverChild = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOST: '127.0.0.1',
      ELECTRON_RUN_AS_NODE: '1',
      ...(kubeswordData ? { KUBESWORD_DATA: kubeswordData } : {}),
      ...uiDirEnv,
    },
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
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (url.startsWith('data:')) return;
    console.error(`[kubesword] page failed to load (${code}): ${desc}`);
    mainWindow?.loadURL(errorPage('KubeSword failed to load', `${desc}\n\nIf this keeps happening, run the web version instead:\n  npm install && npm start`));
  });

  try {
    if (isDev) {
      const viteUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      if (await viteDevServerUp(viteUrl)) {
        console.log('[kubesword] dev mode, loading', viteUrl);
        await mainWindow.loadURL(viteUrl);
      } else {
        // No Vite dev server (e.g. plain `electron .` after `npm run build`):
        // behave like the packaged app and serve the built UI locally.
        console.log('[kubesword] no Vite dev server found — serving built app instead (run `npm run build` first if this fails)');
        const port = await startServer();
        await mainWindow.loadURL(`http://127.0.0.1:${port}`);
      }
      if (process.env.OPEN_DEVTOOLS) mainWindow.webContents.openDevTools();
    } else {
      const port = await startServer();
      await mainWindow.loadURL(`http://127.0.0.1:${port}`);
    }
  } catch (err) {
    console.error('[kubesword] startup failed:', err.message);
    await mainWindow.loadURL(errorPage('KubeSword failed to start', err.message || err));
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
