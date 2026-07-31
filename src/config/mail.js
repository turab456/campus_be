// backend/src/config/mail.js
const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

// Create standard transporter function
const createTransporter = (user, pass) => {
  const host = process.env.SMTP_HOST || 'smtp.zoho.com';
  // Zoho standard port is 465 (secure SSL) or 587 (TLS/STARTTLS)
  // Default to 465 for Zoho, secure = true.
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: user || process.env.SMTP_USER,
      pass: pass || process.env.SMTP_PASS,
    },
  });
};

// Define transporters
const transporters = {
  noreply: createTransporter(process.env.SMTP_NOREPLY_USER, process.env.SMTP_NOREPLY_PASS),
  contact: createTransporter(process.env.SMTP_CONTACT_USER, process.env.SMTP_CONTACT_PASS),
  support: createTransporter(process.env.SMTP_SUPPORT_USER, process.env.SMTP_SUPPORT_PASS),
  default: createTransporter(process.env.SMTP_USER, process.env.SMTP_PASS)
};

/**
 * Get transporter based on the 'from' email address
 * @param {string} from - From header value (e.g. "RevoShelf <no-reply@revoshelf.com>")
 */
const getTransporter = (from) => {
  if (!from) return transporters.default;
  
  const fromStr = String(from).toLowerCase();
  
  const hasValidCreds = (user, pass) => {
    return user && pass && !pass.includes('your_') && pass.trim() !== '';
  };

  if (fromStr.includes('no-reply@revoshelf.com') || fromStr.includes('noreply')) {
    if (hasValidCreds(process.env.SMTP_NOREPLY_USER, process.env.SMTP_NOREPLY_PASS)) {
      return transporters.noreply;
    }
  } else if (fromStr.includes('contact@revoshelf.com') || fromStr.includes('contact')) {
    if (hasValidCreds(process.env.SMTP_CONTACT_USER, process.env.SMTP_CONTACT_PASS)) {
      return transporters.contact;
    }
  } else if (fromStr.includes('support@revoshelf.com') || fromStr.includes('support')) {
    if (hasValidCreds(process.env.SMTP_SUPPORT_USER, process.env.SMTP_SUPPORT_PASS)) {
      return transporters.support;
    }
  }
  
  return transporters.default;
};

/**
 * Get display 'from' header address by type
 * @param {string} type - 'noreply' | 'contact' | 'support'
 */
const getFromAddress = (type) => {
  if (type === 'noreply') {
    const user = process.env.SMTP_NOREPLY_USER || process.env.SMTP_USER || 'no-reply@revoshelf.com';
    return `RevoShelf <${user}>`;
  }
  if (type === 'contact') {
    const user = process.env.SMTP_CONTACT_USER || process.env.SMTP_USER || 'contact@revoshelf.com';
    return `RevoShelf Contact <${user}>`;
  }
  if (type === 'support') {
    const user = process.env.SMTP_SUPPORT_USER || process.env.SMTP_USER || 'support@revoshelf.com';
    return `RevoShelf Support <${user}>`;
  }
  return `RevoShelf <${process.env.SMTP_USER || 'no-reply@revoshelf.com'}>`;
};

// Export both the main transporter (for backwards compatibility) and helper functions
module.exports = transporters.default;
module.exports.getTransporter = getTransporter;
module.exports.getFromAddress = getFromAddress;
module.exports.transporters = transporters;

