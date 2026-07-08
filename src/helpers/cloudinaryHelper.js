const cloudinary = require('../config/cloudinary');

const PLACEHOLDER_AVATAR =
  'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&auto=format&fit=crop&q=80';
const MAX_INLINE_AVATAR_BYTES = 500 * 1024;

const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_KEY !== 'your_api_key' &&
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
      process.env.CLOUDINARY_API_SECRET &&
      process.env.CLOUDINARY_API_SECRET !== 'your_api_secret'
  );

const bufferToDataUrl = (buffer, mimeType = 'image/jpeg') => {
  if (buffer.length > MAX_INLINE_AVATAR_BYTES) {
    throw new Error(
      `Avatar image is too large (${Math.round(buffer.length / 1024)}KB). ` +
        `Maximum is ${MAX_INLINE_AVATAR_BYTES / 1024}KB without Cloudinary storage configured.`
    );
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

const uploadFromBuffer = (buffer, mimeType = 'image/jpeg') => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      try {
        return resolve(bufferToDataUrl(buffer, mimeType));
      } catch (err) {
        return reject(err);
      }
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

const uploadImage = async (file) => {
  if (file.startsWith('data:image')) {
    if (!isCloudinaryConfigured()) {
      const base64 = file.split(',')[1] || '';
      const bytes = Buffer.byteLength(base64, 'base64');
      if (bytes > MAX_INLINE_AVATAR_BYTES) {
        throw new Error(
          `Avatar image is too large (${Math.round(bytes / 1024)}KB). ` +
            `Maximum is ${MAX_INLINE_AVATAR_BYTES / 1024}KB without Cloudinary storage configured.`
        );
      }
      return file;
    }
  } else if (!isCloudinaryConfigured()) {
    return PLACEHOLDER_AVATAR;
  }

  const result = await cloudinary.uploader.upload(file, { folder: 'campus_marketplace' });
  return result.secure_url;
};

module.exports = {
  isCloudinaryConfigured,
  uploadImage,
  uploadFromBuffer,
  deleteImage: async (publicId) => {
    if (!isCloudinaryConfigured()) {
      return true;
    }
    await cloudinary.uploader.destroy(publicId);
    return true;
  },
};
