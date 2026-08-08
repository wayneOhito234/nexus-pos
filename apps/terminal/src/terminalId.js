const STORAGE_KEY = 'nexus_terminal_id';

export function getTerminalId() {
  // Prefer the stable label set by Electron's main process (Till 1 / Till 2)
  // over a random ID, so it's readable everywhere it's shown.
  if (window.nexusTerminalLabel) {
    return window.nexusTerminalLabel.toLowerCase().replace(' ', '-'); // "till-1" / "till-2"
  }

  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `till-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}