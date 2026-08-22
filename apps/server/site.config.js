export const siteConfig = {
  // Shown on startup and served to the manager app via GET /api/site.
  siteName: 'Zummart Supermarket',

  serverIp: '192.168.100.11',

  tillIps: [
    '192.168.100.9',
    '192.168.100.17',
  ],

  managerIps: [
    '192.168.100.11',
  ],

  allowSubnet: '192.168.100.0/24',
};