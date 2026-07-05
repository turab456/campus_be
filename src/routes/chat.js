// backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const protect = require('../middlewares/auth');
const checkBlocked = require('../middlewares/checkBlocked');
const { validateCreateChat } = require('../middlewares/validators');

router.get('/', protect, chatController.getChats);
router.post('/', protect, checkBlocked, validateCreateChat, chatController.createOrGetChat);
router.put('/:id/read', protect, checkBlocked, chatController.markChatAsRead);

module.exports = router;
