import { io } from 'socket.io-client';

let socketInstance = null;

export function connectSocket(serverOrigin) {
  if (socketInstance) return socketInstance;
  socketInstance = io(serverOrigin, {
    autoConnect: true,
    reconnection: true,
  });
  return socketInstance;
}

export function getSocket() {
  return socketInstance;
}