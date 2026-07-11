const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const User = require('../models/User');

const inspect = async () => {
  try {
    const uri = 'mongodb+srv://turab05:n-8j3t%40T2c%23vKn-@cluster0.seoo8f1.mongodb.net/campus?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(uri);
    console.log('Connected to DB');
    
    const listings = await Listing.find({}).populate('seller', 'name email blocked flagged');
    console.log(`Found ${listings.length} listings:`);
    listings.forEach(l => {
      console.log(`- Title: "${l.title}" | Price: ${l.price} | isSold: ${l.isSold} | salePending: ${l.salePending} | seller: ${l.seller ? l.seller.email : 'None'} (Blocked: ${l.seller ? l.seller.blocked : false}, Flagged: ${l.seller ? l.seller.flagged : false}) | flagged: ${l.flagged}`);
    });

    mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

inspect();
