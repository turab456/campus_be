const cloudinary = require('../config/cloudinary');

const uploadFromBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    // Check if Cloudinary is configured with real credentials
    if (
      !process.env.CLOUDINARY_API_KEY ||
      process.env.CLOUDINARY_API_KEY === 'your_api_key' ||
      !process.env.CLOUDINARY_CLOUD_NAME ||
      process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name'
    ) {
      // Fallback: Return a default mockup image
      return resolve('https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&auto=format&fit=crop&q=80');
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'campus_marketplace' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
};

module.exports = {
  uploadImage: async (file) => {
    // Check if Cloudinary is configured
    if (
      !process.env.CLOUDINARY_API_KEY ||
      process.env.CLOUDINARY_API_KEY === 'your_api_key'
    ) {
      return 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&auto=format&fit=crop&q=80';
    }
    const result = await cloudinary.uploader.upload(file, { folder: 'campus_marketplace' });
    return result.secure_url;
  },
  uploadFromBuffer,
  deleteImage: async (publicId) => {
    if (
      !process.env.CLOUDINARY_API_KEY ||
      process.env.CLOUDINARY_API_KEY === 'your_api_key'
    ) {
      return true;
    }
    await cloudinary.uploader.destroy(publicId);
    return true;
  }
};
