// backend/src/utils/redis.js
const { Redis } = require('@upstash/redis');
const { logger } = require('./logger');

let redisClient = null;

const initRedis = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.info('UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set in environment. Running without Upstash Redis cache (fallback to DB).');
    return null;
  }

  try {
    redisClient = new Redis({
      url,
      token
    });
    logger.info('Upstash Redis HTTP client initialized successfully.');
    return redisClient;
  } catch (err) {
    logger.error(`Failed to initialize Upstash Redis: ${err.message}`);
    redisClient = null;
    return null;
  }
};

const getRedisClient = () => {
  return redisClient;
};

// Helper to set cache with TTL (Time To Live) in seconds
const setCache = async (key, value, ttlSeconds = 300) => {
  const client = getRedisClient();
  if (!client) return;

  try {
    const serialized = JSON.stringify(value);
    await client.set(key, serialized, {
      ex: ttlSeconds
    });
  } catch (err) {
    logger.error(`Failed to set cache for key ${key}: ${err.message}`);
  }
};

// Helper to get cache
const getCache = async (key) => {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (!data) return null;
    
    // Upstash client can parse JSON automatically if stored natively, 
    // but since we serialized as string, let's parse safely:
    if (typeof data === 'object') {
      return data;
    }
    try {
      return JSON.parse(data);
    } catch (parseErr) {
      return data;
    }
  } catch (err) {
    logger.error(`Failed to get cache for key ${key}: ${err.message}`);
    return null;
  }
};

// Helper to delete cache key(s)
const clearCache = async (keysPattern) => {
  const client = getRedisClient();
  if (!client) return;

  try {
    if (keysPattern.includes('*')) {
      const keys = await client.keys(keysPattern);
      if (keys && keys.length > 0) {
        await client.del(...keys);
        logger.info(`Cleared ${keys.length} cached keys matching pattern: ${keysPattern}`);
      }
    } else {
      await client.del(keysPattern);
      logger.info(`Cleared cached key: ${keysPattern}`);
    }
  } catch (err) {
    logger.error(`Failed to clear cache keys matching ${keysPattern}: ${err.message}`);
  }
};

module.exports = {
  initRedis,
  getRedisClient,
  setCache,
  getCache,
  clearCache
};
