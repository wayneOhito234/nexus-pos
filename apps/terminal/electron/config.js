const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// Lives in the OS's per-user app data folder, e.g.
// C:\Users\<name>\AppData\Roaming\nexus-pos-terminal\terminal.config.json
// Survives app updates/reinstalls, unique per machine.
const CONFIG_PATH = path.join(app.getPath('userData'), 'terminal.config.json');

// Site-overridable defaults. Anything set in terminal.config.json wins;
// unset keys fall back to these.
const DEFAULTS = {
  serverOrigin: 'http://localhost:4000',
  drawerShareName: 'POS80C',
  drawerPin: 2,
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function isConfigured() {
  const c = readConfig();
  return !!(c && c.terminalId && c.serverOrigin);
}

module.exports = { readConfig, writeConfig, isConfigured, DEFAULTS };