// backend/src/middlewares/upload.js
const multer = require('multer');
const path = require('path');

// Allowed MIME types for image uploads
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Map MIME types to expected extensions
const MIME_EXT_MAP = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

// Multer file filter — validates MIME type and extension
const imageFileFilter = (req, file, cb) => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP images are allowed.`), false);
  }

  // Double-check: extension must match MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = MIME_EXT_MAP[file.mimetype] || [];
  if (ext && !allowedExts.includes(ext)) {
    return cb(new Error(`File extension ${ext} does not match MIME type ${file.mimetype}.`), false);
  }

  cb(null, true);
};

// Listing images upload: max 5 images, 5MB each
const uploadListingImages = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5
  }
}).array('images', 5);

// Avatar upload: single image, 2MB max
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1
  }
}).single('avatar');

/**
 * Wraps multer middleware to catch multer-specific errors and return clean 400 responses.
 */
const handleMulterError = (uploadMiddleware) => {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Multer-specific errors (file too large, too many files, etc.)
        let message = 'File upload error.';
        if (err.code === 'LIMIT_FILE_SIZE') message = 'File is too large. Maximum size is 5MB.';
        if (err.code === 'LIMIT_FILE_COUNT') message = 'Too many files. Maximum is 5 images.';
        if (err.code === 'LIMIT_UNEXPECTED_FILE') message = 'Unexpected file field.';
        return res.status(400).json({ success: false, message });
      }
      if (err) {
        // Custom file filter errors
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  };
};

module.exports = {
  uploadListingImages: handleMulterError(uploadListingImages),
  uploadAvatar: handleMulterError(uploadAvatar)
};
