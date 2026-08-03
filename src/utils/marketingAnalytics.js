const crypto = require('crypto');

const DEFAULT_CHANNEL = 'Direct';

const detectDevice = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return 'Mobile Android';
  if (/iphone|ipad|ipod/.test(ua)) return 'Mobile iOS';
  if (/tablet/.test(ua)) return 'Tablet';
  return 'Desktop';
};

const detectBrowser = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  if (/edg/.test(ua)) return 'Edge';
  if (/chrome/.test(ua)) return 'Chrome';
  if (/firefox/.test(ua)) return 'Firefox';
  if (/safari/.test(ua)) return 'Safari';
  if (/opr/.test(ua)) return 'Opera';
  return 'Unknown';
};

const detectOperatingSystem = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  if (/windows/.test(ua)) return 'Windows';
  if (/mac os x/.test(ua)) return 'macOS';
  if (/android/.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/.test(ua)) return 'iOS';
  if (/linux/.test(ua)) return 'Linux';
  return 'Unknown';
};

const classifyTrafficSource = ({ utmSource, ref, referrer, landingPage }) => {
  const source = (utmSource || ref || referrer || '').toLowerCase().trim();
  if (!source && landingPage) {
    return DEFAULT_CHANNEL;
  }

  if (!source) return DEFAULT_CHANNEL;

  if (source.includes('google')) return 'Google Search';
  if (source.includes('instagram')) return 'Instagram';
  if (source.includes('linkedin')) return 'LinkedIn';
  if (source.includes('facebook')) return 'Facebook';
  if (source.includes('whatsapp')) return 'WhatsApp';
  if (source.includes('telegram')) return 'Telegram';
  if (source.includes('twitter') || source.includes('x.com')) return 'Twitter/X';
  if (source.includes('reddit')) return 'Reddit';
  if (source.includes('direct') || source === 'none' || source === '') return DEFAULT_CHANNEL;
  return 'Other';
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const getLocationFromHeaders = (req) => {
  return {
    country: req.headers['cf-ipcountry'] || req.headers['x-country'] || undefined,
    state: req.headers['x-region'] || req.headers['x-state'] || undefined,
    city: req.headers['x-city'] || undefined
  };
};

const buildVisitorId = () => crypto.randomUUID();

module.exports = {
  detectDevice,
  detectBrowser,
  detectOperatingSystem,
  classifyTrafficSource,
  getClientIp,
  getLocationFromHeaders,
  buildVisitorId
};
