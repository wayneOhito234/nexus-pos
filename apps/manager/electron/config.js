const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const CONFIG_PATH = path.join(app.getPath('userData'), 'manager.config.json');

// The manager machine is usually the server machine, so localhost is the
// sensible default. Overridable for sites where they differ.
const DEFAULTS = { serverOrigin: 'http://localhost:4000' };

function readConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
  } catch {
    return DEFAULTS;
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { readConfig, writeConfig };