import 'dotenv/config';

// Published Safaricom callback origin IPs. Safaricom has added new IPs in
// the past without notice, so if legitimate callbacks start getting
// rejected, check their current documentation before assuming a spoof.
const SAFARICOM_IPS = [
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
  '196.201.212.127',
  '196.201.212.138',
  '196.201.212.129',
  '196.201.212.136',
  '196.201.212.74',
  '196.201.212.69',
];

// Any extra IPs, e.g. a tunnel provider's egress address during testing.
const extra = (process.env.SAFARICOM_EXTRA_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

const allowed = [...SAFARICOM_IPS, ...extra];

function normalise(ip) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function safaricomOnly(req, res, next) {
  // While tunnelling through ngrok in sandbox, the callback arrives from the
  // tunnel rather than Safaricom directly, so IP checking is meaningless.
  // This must be false before going live.
  if (process.env.MPESA_SKIP_IP_CHECK === 'true') {
    console.warn('M-Pesa callback IP check is DISABLED (sandbox mode)');
    return next();
  }

  const raw = req.ip || req.socket.remoteAddress || '';
  const ip = normalise(raw);

  if (allowed.includes(ip)) return next();

  console.warn(`Rejected M-Pesa callback from unrecognised IP: ${ip}`);
  return res.status(403).json({ error: 'forbidden' });
}