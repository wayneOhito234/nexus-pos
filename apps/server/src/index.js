import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { pool } from './db.js';
import { productsRouter } from './routes/products.js';
import { salesRouter } from './routes/sales.js';
import { mpesaRouter } from './routes/mpesa.js';
import { managerRouter } from './routes/manager.js';
import { analyticsRouter } from './routes/analytics.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.set('io', io);
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/mpesa', mpesaRouter);
app.use('/api/manager', managerRouter);
app.use('/api/analytics', analyticsRouter);

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