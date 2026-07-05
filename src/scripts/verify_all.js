const mongoose = require('mongoose');
const User = require('../models/User');

const verifyAll = async () => {
  try {
    const uri = 'mongodb+srv://turab05:n-8j3t%40T2c%23vKn-@cluster0.seoo8f1.mongodb.net/campus?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(uri);
    console.log('Connected to DB');
    
    const res1 = await User.updateOne({ email: 'sufiturabhusssain@gmail.com' }, { isVerified: true });
    console.log('Updated User 1 (sufiturabhusssain@gmail.com):', res1);

    const res2 = await User.updateOne({ email: 'turab@gce.edu' }, { isVerified: true });
    console.log('Updated User 2 (turab@gce.edu):', res2);

    mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

verifyAll();
