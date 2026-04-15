import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Load } from '../models/Load';
import { Notification } from '../models/Notification';

export class BackupService {
  private backupDir = path.join(__dirname, '../../backups');

  constructor() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackup(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `backup-${timestamp}.json`);

      const data = {
        timestamp: new Date().toISOString(),
        collections: {
          users: await User.find({}).lean(),
          vehicles: await Vehicle.find({}).lean(),
          loads: await Load.find({}).lean(),
          notifications: await Notification.find({}).lean()
        }
      };

      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
      console.log(`Backup created: ${backupFile}`);

      return backupFile;
    } catch (error) {
      console.error('Backup creation failed:', error);
      throw error;
    }
  }

  async restoreBackup(backupFile: string): Promise<void> {
    try {
      if (!fs.existsSync(backupFile)) {
        throw new Error('Backup file not found');
      }

      const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

      // Clear existing data
      await User.deleteMany({});
      await Vehicle.deleteMany({});
      await Load.deleteMany({});
      await Notification.deleteMany({});

      // Restore data
      if (data.collections.users) {
        await User.insertMany(data.collections.users);
      }
      if (data.collections.vehicles) {
        await Vehicle.insertMany(data.collections.vehicles);
      }
      if (data.collections.loads) {
        await Load.insertMany(data.collections.loads);
      }
      if (data.collections.notifications) {
        await Notification.insertMany(data.collections.notifications);
      }

      console.log('Backup restored successfully');
    } catch (error) {
      console.error('Backup restoration failed:', error);
      throw error;
    }
  }

  async listBackups(): Promise<string[]> {
    try {
      const files = fs.readdirSync(this.backupDir);
      return files.filter(file => file.startsWith('backup-') && file.endsWith('.json'));
    } catch (error) {
      console.error('List backups failed:', error);
      return [];
    }
  }

  async cleanupOldBackups(keepDays: number = 30): Promise<void> {
    try {
      const files = await this.listBackups();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - keepDays);

      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
}