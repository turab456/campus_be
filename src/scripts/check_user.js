const mongoose = require('mongoose');
const User = require('../models/User');
const Listing = require('../models/Listing');
require('dotenv').config({ path: '../../.env' });

const check = async () => {
  try {
    const uri = 'mongodb+srv://turab05:n-8j3t%40T2c%23vKn-@cluster0.seoo8f1.mongodb.net/campus?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(uri);
    console.log('--- Connected to DB ---');
    
    const user1 = await User.findOne({ email: 'sufiturabhusssain@gmail.com' });
    console.log('User 1 (sufiturabhusssain@gmail.com):', user1 ? {
      id: user1._id,
      name: user1.name,
      isVerified: user1.isVerified,
      role: user1.role,
      spamScore: user1.spamScore,
      scamScore: user1.scamScore,
      blocked: user1.blocked
    } : 'Not Found');

    const user2 = await User.findOne({ email: 'turab@gce.edu' });
    console.log('User 2 (turab@gce.edu):', user2 ? {
      id: user2._id,
      name: user2.name,
      isVerified: user2.isVerified,
      role: user2.role,
      spamScore: user2.spamScore,
      scamScore: user2.scamScore,
      blocked: user2.blocked
    } : 'Not Found');

    // Count active listings
    const listingCount = await Listing.countDocuments({});
    console.log('Total listings in DB:', listingCount);

    // List recent 3 listings
    const recentListings = await Listing.find({}).sort({ createdAt: -1 }).limit(3).populate('seller', 'name email');
    console.log('Recent 3 listings:', recentListings.map(l => ({
      id: l._id,
      title: l.title,
      category: l.category,
      price: l.price,
      sellerName: l.seller ? l.seller.name : 'Unknown',
      isSold: l.isSold,
      salePending: l.salePending
    })));

    mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

check();
