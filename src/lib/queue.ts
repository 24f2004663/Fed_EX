let allocationQueue: any = null;
let ingestionQueue: any = null;

export const JOB_QUEUES = {
  ALLOCATION: 'allocation-queue',
  INGESTION: 'ingestion-queue',
};

// Only initialize queues if REDIS_URL exists
const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;

const isRedisConfigured = !!redisUrl || !!redisHost;

if (isRedisConfigured) {
  const { Queue } = require('bullmq');
  const IORedis = require('ioredis');

  let connection;
  if (redisUrl) {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  } else {
    connection = new IORedis({
      host: redisHost || 'localhost',
      port: parseInt(redisPort || '6379'),
    });
  }

  allocationQueue = new Queue(JOB_QUEUES.ALLOCATION, { connection });
  ingestionQueue = new Queue(JOB_QUEUES.INGESTION, { connection });

  console.log('[Queue] Redis connected');
} else {
  console.warn('[Queue] Redis not configured — queues disabled');
}

export { allocationQueue, ingestionQueue };
