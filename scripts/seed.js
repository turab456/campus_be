// backend/scripts/seed.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@campus.edu' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists:', existingAdmin.email);
      console.log('Skipping seed...');
      await mongoose.connection.close();
      return;
    }

    // Create admin user
    const adminUser = new User({
      name: 'Campus Admin',
      email: 'admin@campus.edu',
      password: 'admin123', // Will be hashed by model pre-save hook
      college: 'Administration',
      department: 'System',
      isVerified: true,
      role: 'admin',
      rating: 5.0,
      reviewsCount: 0,
      spamScore: 0,
      scamScore: 0,
      flagged: false,
    });

    await adminUser.save();

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@campus.edu');
    console.log('🔐 Password: admin123');
    console.log('\n⚠️  IMPORTANT: Change these credentials in production!');

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    process.exit(1);
  }
};

seedAdmin();
