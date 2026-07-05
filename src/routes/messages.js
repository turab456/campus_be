// backend/src/routes/messages.js
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const protect = require('../middlewares/auth');
const checkBlocked = require('../middlewares/checkBlocked');
const { validateSendMessage } = require('../middlewares/validators');
const { moderateMessageMiddleware } = require('../middlewares/contentModeration');

router.get('/:chatId', protect, messageController.getMessages);
router.post('/', protect, checkBlocked, validateSendMessage, moderateMessageMiddleware, messageController.sendMessage);

module.exports = router;
