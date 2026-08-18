const path    = require('node:path');
const fs      = require('node:fs');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { initDb, getCachedProducts, setCachedProducts, saveSaleLocally, getPendingSales, markSaleSynced, getPendingSyncCount } = require('./db');
const { readConfig, writeConfig, isConfigured } = require('./config');
const { vfdOpen, vfdClose, vfdWelcome, vfdItemAdded, vfdCheckout, vfdSaleComplete, vfdClear } = require('./vfd');
const { openDrawer } = require('./drawer');

// ── Boot logger ───────────────────────────────────────────────────────────────
const logFile = path.join(__dirname, 'boot-debug.log');
function log(msg) {
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
}

log('1: requires done');

Menu.setApplicationMenu(null);
log('2: menu set to null');

let currentCashierId = null;

async function clockOutCurrentCashier() {
  if (!currentCashierId) return;
  const config = readConfig();
  if (!config) return;
  try {
    await fetch(`${config.serverOrigin}/api/manager/shifts/clock-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashier_id: currentCashierId }),
    });
  } catch (err) {
    console.warn('auto clock-out failed:', err.message);
  }
  currentCashierId = null;
}

function createWindow() {
  log('createWindow called');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Nexus POS',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    kiosk: process.env.NEXUS_KIOSK === 'true',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  log('createWindow: BrowserWindow constructed');

  win.removeMenu();

  win.once('ready-to-show', () => {
    log('ready-to-show fired, calling win.show()');
    win.show();
  });

  win.webContents.on('did-finish-load', () => log('did-finish-load fired'));
  win.webContents.on('did-fail-load', (_e, code, desc) => log(`did-fail-load: ${code} ${desc}`));
  win.webContents.on('render-process-gone', (_e, details) => log(`render-process-gone: ${JSON.stringify(details)}`));

  if (process.env.NODE_ENV === 'production') {
    log('loading production build from dist/index.html');
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    log('loading dev URL http://localhost:5173');
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

log('3: about to register ipcMain handlers');

// ── Cache and local sales ─────────────────────────────────────────────────────
ipcMain.handle('cache:get-products',    ()                              => getCachedProducts());
ipcMain.handle('cache:set-products',    (_event, products)              => setCachedProducts(products));
ipcMain.handle('sales:save-local',      (_event, sale)                  => saveSaleLocally(sale));
ipcMain.handle('sales:get-pending',     ()                              => getPendingSales());
ipcMain.handle('sales:mark-synced',     (_event, localSaleId, serverId) => markSaleSynced(localSaleId, serverId));
ipcMain.handle('sales:pending-count',   ()                              => getPendingSyncCount());

// ── Session and config ────────────────────────────────────────────────────────
ipcMain.handle('session:set-cashier',   (_event, cashierId)             => { currentCashierId = cashierId; });
ipcMain.handle('session:clear-cashier', ()                              => { currentCashierId = null; });
ipcMain.handle('config:read',           ()                              => readConfig());
ipcMain.handle('config:write',          (_event, config)                => writeConfig(config));
ipcMain.handle('config:is-configured',  ()                              => isConfigured());

// ── Customer display ──────────────────────────────────────────────────────────
ipcMain.handle('vfd:item-added', (_event, { productName, unitPrice, cartTotal }) => {
  vfdItemAdded(productName, unitPrice, cartTotal);
});
ipcMain.handle('vfd:checkout', (_event, { total, paymentMethod }) => {
  vfdCheckout(total, paymentMethod);
});
ipcMain.handle('vfd:sale-complete', (_event, { changeGiven, paymentMethod }) => {
  vfdSaleComplete(changeGiven, paymentMethod);
});
ipcMain.handle('vfd:welcome', () => vfdWelcome());
ipcMain.handle('vfd:clear',   () => vfdClear());

// ── Cash drawer ───────────────────────────────────────────────────────────────
//
// The drawer hangs off the printer's DK port, so opening it means sending
// ESC/POS bytes to the printer rather than talking to the drawer directly.
// Failures are returned rather than thrown, so the renderer can tell the
// cashier the drawer did not move without the whole sale falling over.
ipcMain.handle('drawer:open', async (_event, options) => {
  try {
    const config = readConfig() || {};
    await openDrawer({
      shareName: options?.shareName ?? config.drawerShareName,
      pin:       options?.pin       ?? config.drawerPin,
    });
    return { ok: true };
  } catch (err) {
    log(`drawer kick failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

log('4: ipcMain handlers registered');

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('5: app ready, initialising local database');
  try {
    await initDb();
    log('6: local database ready');
  } catch (err) {
    log(`local database init failed: ${err.message}`);
  }

  // The VFD port differs by machine, so it comes from config rather than
  // being hardcoded. Falls back to COM3, which is the usual default.
  const config = readConfig() || {};
  const vfdPort = config.vfdPort || 'COM3';
  log(`opening customer display on ${vfdPort}`);
  vfdOpen(vfdPort);

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

log('7: whenReady handler registered, script reached end');

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  vfdClose();
  if (!currentCashierId) return;
  event.preventDefault();
  await clockOutCurrentCashier();
  app.exit(0);
});