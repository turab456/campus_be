// backend/src/controllers/messageController.js
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { emitToUser } = require('../utils/socket');
const { sendPushNotification } = require('../utils/fcm');

// Get all messages in a chat conversation
exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    // Validate chatId format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ success: false, message: 'Invalid chat ID' });
    }

    // Authorization: verify the requesting user is a participant of this chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }
    if (chat.buyer.toString() !== userId && chat.seller.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this conversation' });
    }

    const messages = await Message.find({ chat: chatId, flagged: { $ne: true } }).sort({ timestamp: 1 });
    
    const mappedMessages = messages.map(m => ({
      id: m._id.toString(),
      chatId: m.chat.toString(),
      senderId: m.sender.toString(),
      text: m.text,
      timestamp: m.timestamp.toISOString()
    }));
    
    res.json({ success: true, messages: mappedMessages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { chatId, text } = req.body;

    // chatId and text are already validated by the validators middleware
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Authorization: verify sender is a participant of this chat
    if (chat.buyer.toString() !== senderId && chat.seller.toString() !== senderId) {
      return res.status(403).json({ success: false, message: 'Not authorized to send messages in this conversation' });
    }

    const message = new Message({
      chat: chatId,
      sender: senderId,
      text
    });
    await message.save();

    chat.lastMessage = text.substring(0, 200); // Truncate preview to prevent oversized storage
    chat.lastMessageTime = new Date();

    const isBuyerSender = chat.buyer.toString() === senderId;
    const recipientId = isBuyerSender ? chat.seller.toString() : chat.buyer.toString();

    if (isBuyerSender) {
      chat.unreadSeller = true;
    } else {
      chat.unreadBuyer = true;
    }
    await chat.save();

    const mappedMessage = {
      id: message._id.toString(),
      chatId: message.chat.toString(),
      senderId: message.sender.toString(),
      text: message.text,
      timestamp: message.timestamp.toISOString()
    };

    // Emit the message details
    emitToUser(recipientId, 'message', mappedMessage);

    // Emit a generic notification event to show in-app popup notifications
    emitToUser(recipientId, 'notification', {
      type: 'message',
      title: 'New Message',
      body: text.substring(0, 100), // Truncate notification body
      chatId: chatId
    });

    // Send FCM push notification asynchronously
    (async () => {
      try {
        const sender = await User.findById(senderId).select('name');
        const senderName = sender ? sender.name : 'Someone';
        await sendPushNotification(recipientId, {
          title: `New message from ${senderName}`,
          body: text.substring(0, 150),
          data: { type: 'chat', chatId: chatId, click_action: `/messages` }
        });
      } catch (err) {
        console.error('[FCM Hook Error] Message FCM hook failed:', err);
      }
    })();

    res.status(201).json({ success: true, message: mappedMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
