// backend/src/utils/socket.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { accessSecret } = require('../config/jwt');

let io;
// Map userIds to socketIds
const activeUsers = new Map();

const initSocket = (server) => {
  const allowedOrigins = [
    process.env.CLIENT_URL,
    'https://revoshelf.netlify.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://192.168.31.124:5173',
    'http://172.20.10.14:5173',
  ].filter(Boolean);

  io = socketIO(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Security: limit payload size to prevent abuse
    maxHttpBufferSize: 1e6, // 1MB max per message
  });

  io.on('connection', (socket) => {
    // Register mapping between user ID and socket ID.
    // JWT token is MANDATORY to prevent user impersonation.
    socket.on('register', (data) => {
      let userId = null;
      let token = null;

      if (data && typeof data === 'object') {
        userId = data.userId;
        token = data.token;
      }

      // Require both userId and token
      if (!userId || !token) {
        console.warn(`[Socket] Registration rejected: missing userId or token. Socket: ${socket.id}`);
        socket.disconnect(true);
        return;
      }

      // Verify the token
      try {
        const decoded = jwt.verify(token, accessSecret);
        if (decoded.id !== userId) {
          console.warn(`[Socket] Token userId mismatch: token=${decoded.id}, claimed=${userId}. Socket: ${socket.id}`);
          socket.disconnect(true);
          return;
        }
      } catch (err) {
        console.warn(`[Socket] Invalid token for userId: ${userId}. Socket: ${socket.id}`);
        socket.disconnect(true);
        return;
      }

      activeUsers.set(userId, socket.id);
      console.log(`[Socket] User registered: ${userId} -> Socket: ${socket.id}`);
    });

    socket.on('disconnect', () => {
      for (const [userId, socketId] of activeUsers.entries()) {
        if (socketId === socket.id) {
          activeUsers.delete(userId);
          break;
        }
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

const emitToUser = (userId, event, data) => {
  const socketId = activeUsers.get(userId);
  if (socketId && io) {
    io.to(socketId).emit(event, data);
    return true;
  }
  return false;
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  activeUsers
};
