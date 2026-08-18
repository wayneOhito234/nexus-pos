const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// Lives in the OS's per-user app data folder, e.g.
// C:\Users\<name>\AppData\Roaming\@nexus-pos\terminal\terminal.config.json
// Survives app updates and reinstalls, and is unique per machine.
const CONFIG_PATH = path.join(app.getPath('userData'), 'terminal.config.json');

// Everything hardware-related lives here rather than in code, so a new site
// only needs this file changed rather than a rebuild. terminalId and
// serverOrigin have no defaults on purpose -- a till with neither should
// show the setup screen rather than quietly pointing at localhost.
const DEFAULTS = {
  serverOrigin: 'http://localhost:4000',

  // The cash drawer hangs off the printer's DK port, so opening it means
  // sending ESC/POS bytes to the printer's Windows share.
  drawerShareName: 'POS80C',
  drawerPin: 2, // 2 on most drawers, 5 on a minority

  // Customer display. Check Device Manager for the actual port.
  vfdPort: 'COM3',
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    // Merging over defaults means a config written before a new setting
    // existed still gets a sensible value rather than undefined.
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...DEFAULTS, ...config }, null, 2));
}

function isConfigured() {
  const c = readConfig();
  return !!(c && c.terminalId && c.serverOrigin);
}

module.exports = { readConfig, writeConfig, isConfigured, CONFIG_PATH, DEFAULTS };