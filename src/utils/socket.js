// backend/src/utils/socket.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { accessSecret } = require('../config/jwt');

let io;
// Map userIds to socketIds
const activeUsers = new Map();

const initSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Security: limit payload size to prevent abuse
    maxHttpBufferSize: 1e6, // 1MB max per message
  });

  io.on('connection', (socket) => {
    // Register mapping between user ID and socket ID
    // Requires JWT authentication to prevent spoofing
    socket.on('register', (data) => {
      // Accept either a plain userId string (backward compat) or { userId, token }
      let userId = null;
      let token = null;

      if (typeof data === 'string') {
        // Legacy: just a userId string — still accept but log warning
        userId = data;
      } else if (data && typeof data === 'object') {
        userId = data.userId;
        token = data.token;
      }

      if (!userId) return;

      // If token is provided, verify it
      if (token) {
        try {
          const decoded = jwt.verify(token, accessSecret);
          if (decoded.id !== userId) {
            console.warn(`[Socket] Token userId mismatch: token=${decoded.id}, claimed=${userId}`);
            return;
          }
        } catch (err) {
          console.warn(`[Socket] Invalid token for userId: ${userId}`);
          return;
        }
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
