import Queue from 'bull';
import { bullRedisOpts } from '../config/redis.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const matchingQueue = new Queue('matching-queue', redisUrl, { redis: bullRedisOpts });

export const notificationQueue = new Queue('notification-queue', redisUrl, { redis: bullRedisOpts });

export const queueOptions = {
  removeOnComplete: true,
  removeOnFail: { age: 3600 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
};
