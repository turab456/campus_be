// backend/server.js
const http = require('http');
require('dotenv').config({ path: '.env' });
const app = require('./app');
const connectDB = require('./src/config/db');
const { initSocket } = require('./src/utils/socket');

const PORT = process.env.PORT || 5000;
connectDB();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
