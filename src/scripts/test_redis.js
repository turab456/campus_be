require('dotenv').config({ path: 'backend/.env' });
const { initRedis, setCache, getCache, clearCache } = require('../utils/redis');

const testRedis = async () => {
  initRedis();
  
  await setCache('listings:test1', { a: 1 });
  await setCache('listings:test2', { b: 2 });
  
  console.log('Before clear:');
  console.log('test1:', await getCache('listings:test1'));
  console.log('test2:', await getCache('listings:test2'));
  
  await clearCache('listings:*');
  
  console.log('After clear:');
  console.log('test1:', await getCache('listings:test1'));
  console.log('test2:', await getCache('listings:test2'));
};

testRedis();
