import 'dotenv/config';

// Only these machines may reach manager and admin functions. Separate from
// ALLOWED_IPS, which governs who may reach the API at all.
const configured = (process.env.MANAGER_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function normalise(ip) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function managerIpGuard(req, res, next) {
  // Unset means the restriction is off. Fails open on purpose -- locking
  // the manager out of their own system over a missing config line is a
  // worse outcome than the restriction not applying yet.
  if (configured.length === 0) return next();

  const raw = req.ip || req.socket.remoteAddress || '';
  const ip = normalise(raw);

  if (loopback.includes(raw) || loopback.includes(ip) || configured.includes(ip)) {
    return next();
  }

  console.warn(`Manager route blocked for ${ip}: ${req.method} ${req.originalUrl}`);
  return res.status(403).json({
    error: 'Manager functions are only available on the manager terminal.',
  });
}