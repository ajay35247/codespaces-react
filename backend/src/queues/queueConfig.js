import Queue from 'bull';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisOpts = {
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 100, 3000),
};

export const matchingQueue = new Queue('matching-queue', redisUrl, { redis: redisOpts });

export const notificationQueue = new Queue('notification-queue', redisUrl, { redis: redisOpts });

export const queueOptions = {
  removeOnComplete: true,
  removeOnFail: { age: 3600 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
};
