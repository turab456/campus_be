// backend/src/config/db.js
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Seed default categories if they don't exist
    const Category = require('../models/Category');
    const defaultCategories = [
      { name: 'Books', icon: 'Book' },
      { name: 'Calculators', icon: 'Calculator' },
      { name: 'Electronics', icon: 'Laptop' },
      { name: 'Lab Equipment', icon: 'FlaskConical' },
      { name: 'Notes', icon: 'FileText' },
      { name: 'Cycles', icon: 'Bike' },
      { name: 'Hostel Essentials', icon: 'Home' },
      { name: 'Project Components', icon: 'Cpu' },
      { name: 'Stationery', icon: 'PenTool' }
    ];
    for (const cat of defaultCategories) {
      await Category.findOneAndUpdate(
        { name: cat.name },
        { name: cat.name, icon: cat.icon },
        { upsert: true, new: true }
      );
    }
    logger.info('Default categories checked/seeded');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
