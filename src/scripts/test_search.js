const mongoose = require('mongoose');
const { searchListings } = require('../controllers/listingController');
const Listing = require('../models/Listing');

const testSearch = async () => {
  try {
    const uri = 'mongodb+srv://turab05:n-8j3t%40T2c%23vKn-@cluster0.seoo8f1.mongodb.net/campus?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(uri);
    
    // Simulate req/res
    const req = {
      query: {},
      headers: {}
    };
    const res = {
      json: (data) => {
        console.log('Search response listings count:', data.listings.length);
        console.log('Search response listings:', JSON.stringify(data.listings, null, 2));
      },
      status: (code) => ({
        json: (data) => console.log('Error status:', code, data)
      })
    };
    
    await searchListings(req, res);
    
    mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

testSearch();
