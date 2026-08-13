let cachedId = null;

export async function loadTerminalId() {
  if (cachedId) return cachedId;
  const config = await window.nexusConfig?.read();
  cachedId = config?.terminalId || 'till-unconfigured';
  return cachedId;
}

// Synchronous accessor for code that can't await -- only safe to call
// after loadTerminalId() has resolved at least once during app startup.
export function getTerminalId() {
  return cachedId || 'till-unconfigured';
}