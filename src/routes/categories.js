// backend/src/routes/categories.js
const express = require('express');
const { getAll, createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');
const protect = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

// Public – list all categories
router.get('/', getAll);

// Protected – admin-only actions
router.post('/', protect, isAdmin, createCategory);
router.put('/:id', protect, isAdmin, updateCategory);
router.delete('/:id', protect, isAdmin, deleteCategory);

module.exports = router;
