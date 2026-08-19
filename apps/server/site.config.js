export const siteConfig = {
  // Shown on startup and served to the manager app via GET /api/site.
  siteName: 'Zummart Supermarket',

  serverIp: '192.168.100.16',

  tillIps: [
    '192.168.100.28',
    '192.168.100.30',
  ],

  managerIps: [
    '192.168.100.16',
  ],

  allowSubnet: '192.168.100.0/24',
};