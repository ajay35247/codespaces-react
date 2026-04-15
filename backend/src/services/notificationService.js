import { notificationQueue, queueOptions } from '../queues/queueConfig.js';

export class NotificationService {
  static async scheduleNotification(payload) {
    await notificationQueue.add('user-notification', payload, {
      ...queueOptions,
      priority: payload.priority === 'high' ? 1 : 3,
      attempts: 5
    });
  }

  static async sendNotification(workflow) {
    const { userId, title, message, data } = workflow.data;
    console.log('Sending notification to', userId, title);
    // In production, integrate FCM or push service with retry and audit.
    return { userId, title, delivered: true };
  }
}
