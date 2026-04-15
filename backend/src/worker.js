import { matchingQueue, notificationQueue } from './queues/queueConfig.js';
import { MatchingEngine } from './services/matchingEngine.js';
import { NotificationService } from './services/notificationService.js';

const startWorker = async () => {
  console.log('Queue worker starting...');

  matchingQueue.process('match-load', 10, async (job) => {
    return await MatchingEngine.matchLoad(job);
  });

  matchingQueue.process('match-vehicle', 10, async (job) => {
    return await MatchingEngine.matchVehicle(job);
  });

  notificationQueue.process('user-notification', 20, async (job) => {
    return await NotificationService.sendNotification(job);
  });

  matchingQueue.on('failed', (job, err) => {
    console.error('Matching job failed', job.id, err);
  });

  notificationQueue.on('failed', (job, err) => {
    console.error('Notification job failed', job.id, err);
  });
};

startWorker().catch((err) => {
  console.error('Worker failed', err);
  process.exit(1);
});