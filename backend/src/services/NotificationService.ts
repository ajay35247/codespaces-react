import { Notification } from '../models/Notification';
import { io } from '../server'; // Assuming Socket.IO is set up

export class NotificationService {
  async notifyShipperOfAvailableVehicles(shipperId: string, count: number, load: any): Promise<void> {
    const notification = new Notification({
      userId: shipperId,
      type: 'vehicle_available',
      title: `${count} vehicles available for your load`,
      message: `Found ${count} matching vehicles near ${load.pickupLocation.city} to ${load.dropLocation.city}`,
      data: { loadId: load._id, vehicleCount: count },
      priority: 'high'
    });
    await notification.save();

    // Send realtime notification
    io.to(shipperId).emit('notification', notification);
  }

  async notifyVehicleOwnerOfLoadMatch(userId: string, load: any): Promise<void> {
    const notification = new Notification({
      userId: userId,
      type: 'load_match',
      title: 'New load available on your route',
      message: `Load from ${load.pickupLocation.city} to ${load.dropLocation.city}, ${load.loadWeight}kg`,
      data: { loadId: load._id },
      priority: load.urgent ? 'high' : 'medium'
    });
    await notification.save();

    io.to(userId).emit('notification', notification);
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true }
    );
  }

  async getUserNotifications(userId: string, page: number = 1, limit: number = 20): Promise<any[]> {
    return await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
  }
}