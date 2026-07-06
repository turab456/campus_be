// backend/src/controllers/chatController.js
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const Listing = require('../models/Listing');
const User = require('../models/User');

// Get all chats for logged-in user
exports.getChats = async (req, res) => {
  try {
    const userId = req.user.id;
    // Find all chats where user is buyer or seller
    const chats = await Chat.find({
      $or: [{ buyer: userId }, { seller: userId }]
    })
      .populate('book', 'title price images isSold buyerConfirmedReceipt salePending')
      .populate('buyer', 'name avatarUrl rating college flagged blocked')
      .populate('seller', 'name avatarUrl rating college flagged blocked')
      .sort({ lastMessageTime: -1 });

    const mappedChats = chats
      .filter(c => c.buyer && c.seller)
      .map(c => {
        const isBuyer = c.buyer._id.toString() === userId;
        const otherUser = isBuyer ? c.seller : c.buyer;
        const unread = isBuyer ? c.unreadBuyer : c.unreadSeller;

        return {
          id: c._id.toString(),
          bookId: c.book ? c.book._id.toString() : '',
          bookTitle: c.book ? c.book.title : 'Deleted Book',
          bookImage: c.book && c.book.images && c.book.images.length > 0 ? c.book.images[0] : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=150&auto=format&fit=crop&q=80',
          bookPrice: c.book ? c.book.price : 0,
          bookIsSold: c.book ? c.book.isSold : false,
          buyerConfirmedReceipt: c.book ? c.book.buyerConfirmedReceipt : false,
          salePending: c.book ? c.book.salePending : false,
          buyerId: c.buyer._id.toString(),
          sellerId: c.seller._id.toString(),
          otherParticipant: {
            id: otherUser._id.toString(),
            name: otherUser.name,
            avatar: otherUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            rating: otherUser.rating || 5.0,
            college: otherUser.college || 'N/A',
            flagged: otherUser.flagged || false,
            blocked: otherUser.blocked || false
          },
          lastMessage: c.lastMessage,
          lastMessageTime: c.lastMessageTime ? c.lastMessageTime.toISOString() : new Date().toISOString(),
          unread
        };
      });

    res.json({ success: true, chats: mappedChats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create or get existing chat
exports.createOrGetChat = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { bookId } = req.body;

    // bookId is already validated by validators middleware
    // Additional ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ success: false, message: 'Invalid bookId format' });
    }

    const book = await Listing.findById(bookId);
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book listing not found' });
    }

    const sellerId = book.seller.toString();

    if (buyerId === sellerId) {
      return res.status(400).json({ success: false, message: 'You cannot chat with yourself' });
    }

    // Check if chat already exists
    let chat = await Chat.findOne({
      book: bookId,
      buyer: buyerId,
      seller: sellerId
    })
      .populate('book', 'title price images isSold buyerConfirmedReceipt salePending')
      .populate('buyer', 'name avatarUrl rating college flagged blocked')
      .populate('seller', 'name avatarUrl rating college flagged blocked');

    if (!chat) {
      // Create new conversation
      chat = new Chat({
        book: bookId,
        buyer: buyerId,
        seller: sellerId,
        lastMessage: `Interested in buying "${book.title.substring(0, 100)}"`,
        lastMessageTime: new Date(),
        unreadBuyer: false,
        unreadSeller: true // Seller has an unread interest message
      });
      await chat.save();

      // Populate fresh doc
      chat = await Chat.findById(chat._id)
        .populate('book', 'title price images isSold buyerConfirmedReceipt salePending')
        .populate('buyer', 'name avatarUrl rating college flagged blocked')
        .populate('seller', 'name avatarUrl rating college flagged blocked');
    }

    if (!chat.buyer || !chat.seller) {
      return res.status(404).json({ success: false, message: 'Chat participant was deleted or not found' });
    }

    const isBuyer = chat.buyer._id.toString() === buyerId;
    const otherUser = isBuyer ? chat.seller : chat.buyer;
    const unread = isBuyer ? chat.unreadBuyer : chat.unreadSeller;

    const mappedChat = {
      id: chat._id.toString(),
      bookId: chat.book ? chat.book._id.toString() : '',
      bookTitle: chat.book ? chat.book.title : 'Deleted Book',
      bookImage: chat.book && chat.book.images && chat.book.images.length > 0 ? chat.book.images[0] : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=150&auto=format&fit=crop&q=80',
      bookPrice: chat.book ? chat.book.price : 0,
      bookIsSold: chat.book ? chat.book.isSold : false,
      buyerConfirmedReceipt: chat.book ? chat.book.buyerConfirmedReceipt : false,
      salePending: chat.book ? chat.book.salePending : false,
      buyerId: chat.buyer._id.toString(),
      sellerId: chat.seller._id.toString(),
      otherParticipant: {
        id: otherUser._id.toString(),
        name: otherUser.name,
        avatar: otherUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        rating: otherUser.rating || 5.0,
        college: otherUser.college || 'N/A',
        flagged: otherUser.flagged || false,
        blocked: otherUser.blocked || false
      },
      lastMessage: chat.lastMessage,
      lastMessageTime: chat.lastMessageTime.toISOString(),
      unread
    };

    res.status(200).json({ success: true, chat: mappedChat });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Mark conversation as read
exports.markChatAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const chatId = req.params.id;

    // Validate chatId format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ success: false, message: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    if (chat.buyer.toString() === userId) {
      chat.unreadBuyer = false;
    } else if (chat.seller.toString() === userId) {
      chat.unreadSeller = false;
    } else {
      return res.status(403).json({ success: false, message: 'Not authorized for this chat' });
    }

    await chat.save();
    res.json({ success: true, message: 'Chat marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
