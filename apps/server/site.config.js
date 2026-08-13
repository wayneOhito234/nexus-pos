// ============================================================
// SITE CONFIGURATION
//
// This is the only file that changes when deploying to a new store.
// Everything network-related for this deployment lives here.
//
// Finding a machine's address, on that machine:
//   Get-NetIPAddress -AddressFamily IPv4 |
//     Where-Object { $_.IPAddress -like "192.168.*" } |
//     Select-Object IPAddress, InterfaceAlias
//
// Use the address on the SAME SUBNET as the server. Ignore anything
// from WSL (172.x), VirtualBox (192.168.56.x) or Docker -- those are
// virtual adapters and are not reachable from other machines.
// ============================================================

export const siteConfig = {
  // Appears in logs and Telegram alerts.
  siteName: 'Zummart Supermarket, Pangani',

  // The machine running this server. Each till's terminal.config.json
  // must point at http://<this address>:4000
  serverIp: '192.168.100.16',

  // Machines allowed to reach manager, admin and inventory functions.
  // Usually just the manager's PC.
  managerIps: [
    '192.168.100.16',
  ],

  // One entry per till PC.
  tillIps: [
    '192.168.100.16',
    // '192.168.100.30',
  ],

  // Allow a whole subnet rather than listing every device.
  //
  // Keep this set during setup and testing -- it means a till whose
  // DHCP address shifts overnight still works in the morning, which
  // matters more than the marginal security of an exact list on a
  // private store network.
  //
  // Set to null to require every device be listed above explicitly.
  allowSubnet: '192.168.100.0/24',
};
