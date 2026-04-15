import { Router } from 'express';
import {
  registerVehicle,
  updateVehicle,
  getUserVehicles,
  getVehicleById,
  deleteVehicle
} from '../controllers/vehicleController';
import { authenticate } from '../middleware/auth';
import { validateVehicle, validateId } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimit';

const router = Router();

router.use(authenticate);
router.use(apiLimiter);

router.post('/', validateVehicle, registerVehicle);
router.get('/', getUserVehicles);
router.get('/:id', validateId, getVehicleById);
router.put('/:id', validateId, updateVehicle);
router.delete('/:id', validateId, deleteVehicle);

export default router;