import { siteConfig } from '../site.config.js';

const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function normalise(ip) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inSubnet(ip, cidr) {
  try {
    const [range, bitsRaw] = cidr.split('/');
    const bits = Number(bitsRaw);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
  } catch {
    return false;
  }
}

function clientIp(req) {
  return normalise(req.ip || req.socket.remoteAddress || '');
}

function isLocal(req) {
  const raw = req.ip || req.socket.remoteAddress || '';
  return loopback.includes(raw) || loopback.includes(normalise(raw));
}

// Every device that may reach the API at all: tills, the manager PC,
// and anything inside the allowed subnet.
export function ipAllowlist(req, res, next) {
  const known = [...siteConfig.tillIps, ...siteConfig.managerIps, siteConfig.serverIp];

  // Nothing configured means the restriction is off. Fails open on purpose:
  // locking every till out over a config mistake is worse than the
  // restriction not applying yet.
  if (known.length === 0 && !siteConfig.allowSubnet) return next();

  if (isLocal(req)) return next();

  const ip = clientIp(req);

  if (known.includes(ip)) return next();
  if (siteConfig.allowSubnet && inSubnet(ip, siteConfig.allowSubnet)) return next();

  console.warn(`Blocked ${ip}: ${req.method} ${req.originalUrl}`);
  return res.status(403).json({ error: 'This device is not authorised to use this system.' });
}

// Manager, admin and inventory functions. Deliberately does NOT honour
// allowSubnet -- a till being on the store network shouldn't grant it
// manager access.
export function managerIpGuard(req, res, next) {
  if (siteConfig.managerIps.length === 0) return next();
  if (isLocal(req)) return next();

  const ip = clientIp(req);
  if (siteConfig.managerIps.includes(ip)) return next();

  console.warn(`Manager route blocked for ${ip}: ${req.method} ${req.originalUrl}`);
  return res.status(403).json({
    error: 'Manager functions are only available on the manager terminal.',
  });
}

// Safaricom's published callback origins.
const SAFARICOM_IPS = [
  '196.201.214.200', '196.201.214.206', '196.201.213.114',
  '196.201.214.207', '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.138', '196.201.212.129',
  '196.201.212.136', '196.201.212.74',  '196.201.212.69',
];

export function mpesaCallbackAllowlist(req, res, next) {
  // While tunnelling through ngrok, the request arrives from the tunnel
  // rather than Safaricom, so IP checking is meaningless. Independent
  // transaction verification in the callback handler covers this.
  if (process.env.MPESA_SKIP_IP_CHECK === 'true') return next();

  const ip = clientIp(req);
  if (SAFARICOM_IPS.includes(ip)) return next();

  console.warn(`Rejected M-Pesa callback from ${ip}`);
  return res.status(403).json({ error: 'forbidden' });
}