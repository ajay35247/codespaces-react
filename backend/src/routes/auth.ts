import { Router } from 'express';
import { register, login, getProfile, updateProfile } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validateRegister, validateLogin } from '../middleware/validation';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/register', authLimiter, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);
router.get('/me', authenticate, getProfile);
router.put('/me', authenticate, updateProfile);

export default router;