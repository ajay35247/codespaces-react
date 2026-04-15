import { Router } from 'express';
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';
import { validateId, validatePagination } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimit';

const router = Router();

router.use(authenticate);
router.use(apiLimiter);

router.get('/', validatePagination, getUserNotifications);
router.put('/:id/read', validateId, markNotificationRead);
router.put('/mark-all-read', markAllNotificationsRead);
router.delete('/:id', validateId, deleteNotification);

export default router;