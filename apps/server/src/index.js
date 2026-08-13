import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { pool } from './db.js';
import { ipAllowlist, mpesaCallbackAllowlist } from './ipAllowlist.js';
import { productsRouter } from './routes/products.js';
import { salesRouter } from './routes/sales.js';
import { mpesaRouter } from './routes/mpesa.js';
import { managerRouter } from './routes/manager.js';
import { analyticsRouter } from './routes/analytics.js';
import { inventoryRouter } from './routes/inventory.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.set('io', io);
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Left unprotected on purpose so the server can always be reached for a
// liveness check from any machine while troubleshooting.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// The M-Pesa callback arrives from Safaricom, not the store LAN, so it gets
// its own allowlist rather than being left open.
app.use('/api/mpesa/callback', mpesaCallbackAllowlist);

// Everything else is restricted to the store's own till and manager machines.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/mpesa/callback')) return next();
  return ipAllowlist(req, res, next);
});

app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/mpesa', mpesaRouter);
app.use('/api/manager', managerRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/inventory', inventoryRouter);

io.on('connection', (socket) => {
  console.log(`terminal connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`terminal disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Nexus POS server listening on port ${PORT}`);
});

process.on('SIGTERM', () => pool.end());