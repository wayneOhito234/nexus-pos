const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { getCachedProducts, setCachedProducts } = require('./db');
const { readConfig, writeConfig, isConfigured } = require('./config');

app.disableHardwareAcceleration();
Menu.setApplicationMenu(null);

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

  win.removeMenu();

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('cache:get-products', () => getCachedProducts());
ipcMain.handle('cache:set-products', (_event, products) => setCachedProducts(products));

ipcMain.handle('session:set-cashier', (_event, cashierId) => {
  currentCashierId = cashierId;
});
ipcMain.handle('session:clear-cashier', () => {
  currentCashierId = null;
});

ipcMain.handle('config:read', () => readConfig());
ipcMain.handle('config:write', (_event, config) => writeConfig(config));
ipcMain.handle('config:is-configured', () => isConfigured());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (!currentCashierId) return;
  event.preventDefault();
  await clockOutCurrentCashier();
  app.exit(0);
});