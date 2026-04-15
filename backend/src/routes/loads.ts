import { Router } from 'express';
import {
  postLoad,
  getUserLoads,
  getLoadById,
  updateLoad,
  deleteLoad,
  getMatchingVehicles
} from '../controllers/loadController';
import { authenticate } from '../middleware/auth';
import { validateLoad, validateId, validatePagination } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimit';

const router = Router();

router.use(authenticate);
router.use(apiLimiter);

router.post('/', validateLoad, postLoad);
router.get('/', validatePagination, getUserLoads);
router.get('/:id', validateId, getLoadById);
router.get('/:id/matching-vehicles', validateId, getMatchingVehicles);
router.put('/:id', validateId, updateLoad);
router.delete('/:id', validateId, deleteLoad);

export default router;