import { io } from 'socket.io-client';
import { SERVER_ORIGIN } from './api/client.js';

export const socket = io(SERVER_ORIGIN, {
  autoConnect: true,
  reconnection: true,
});
