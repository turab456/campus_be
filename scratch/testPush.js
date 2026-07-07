const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../src/models/User');
const { sendPushNotification } = require('../src/utils/pushNotification');

async function test() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('Error: MONGODB_URI is not defined in backend/.env');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');
    
    // Find all users who have active push subscriptions
    const users = await User.find({ pushSubscriptions: { $exists: true, $not: { $size: 0 } } });
    console.log(`Found ${users.length} users with push subscriptions:`);
    users.forEach(u => {
      console.log(`- User: ${u.email} (${u._id}), Subscriptions: ${u.pushSubscriptions.length}`);
    });

    if (users.length === 0) {
      console.log('\n❌ No users with push subscriptions found in the database.');
      console.log('Please log into your app, go to the Settings Page (/settings), and click "Enable Notifications" to register your subscription first!');
      process.exit(0);
    }

    // Test sending to the first user
    const testUser = users[0];
    console.log(`\nSending test push notification to: ${testUser.email}...`);
    await sendPushNotification(testUser._id, {
      title: 'Test Notification',
      body: 'Hello from the backend script!',
      data: { click_action: '/messages' }
    });
    console.log('Test dispatch complete. Check the browser!');
  } catch (err) {
    console.error('Error running test:', err);
  } finally {
    await mongoose.disconnect();
  }
}

test();
