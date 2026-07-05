// backend/app.js
require('dotenv').config({ path: '.env' });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { logger, stream } = require('./src/utils/logger');
const { notFoundHandler, errorHandler } = require('./src/middlewares/errorHandler');
const { globalLimiter } = require('./src/middlewares/rateLimiter');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// Import routers
const authRouter = require('./src/routes/auth');
const userRouter = require('./src/routes/users');
const listingRouter = require('./src/routes/listings');
const categoryRouter = require('./src/routes/categories');
const wishlistRouter = require('./src/routes/wishlist');
const chatRouter = require('./src/routes/chat');
const messageRouter = require('./src/routes/messages');
const notificationRouter = require('./src/routes/notifications');
const adminRouter = require('./src/routes/admin');
const violationsRouter = require('./src/routes/violations');

const app = express();

// Disable x-powered-by header to hide Express fingerprint
app.disable('x-powered-by');

// Global middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(compression());

// Body parsers with size limits to prevent memory exhaustion DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(cookieParser());
app.use(morgan('combined', { stream }));

// Global rate limiter (100 req / 15 min per IP)
app.use(globalLimiter);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/listings', listingRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/chat', chatRouter);
app.use('/api/messages', messageRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/admin', adminRouter);
app.use('/api/violations', violationsRouter);

// Swagger docs — only available in development
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// 404 and error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
