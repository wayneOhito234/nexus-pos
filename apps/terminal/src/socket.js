import { io } from 'socket.io-client';

export let socket = null;

export function connectSocket(serverOrigin) {
  if (socket) return socket;
  socket = io(serverOrigin, {
    autoConnect: true,
    reconnection: true,
  });
  return socket;
}