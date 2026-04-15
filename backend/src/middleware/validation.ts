import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

export const validateRegister = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['shipper', 'truck_owner', 'driver', 'broker', 'admin']),
  body('name').trim().isLength({ min: 2 }),
  body('phone').isMobilePhone('any'),
  handleValidationErrors
];

export const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
  handleValidationErrors
];

export const validateVehicle = [
  body('vehicleNumber').trim().isLength({ min: 3 }),
  body('vehicleCategory').isIn(['bike', '3_wheeler', 'mini_truck', 'pickup', 'lcv', 'mcv', 'hcv', 'trailer', 'container', '20_tyre', '50_ton']),
  body('bodyType').trim().isLength({ min: 2 }),
  body('capacityTon').isNumeric(),
  body('capacityKg').isNumeric(),
  body('wheelCount').isNumeric(),
  body('currentLocation.lat').isNumeric(),
  body('currentLocation.lng').isNumeric(),
  body('currentLocation.address').trim().isLength({ min: 5 }),
  handleValidationErrors
];

export const validateLoad = [
  body('pickupLocation.lat').isNumeric(),
  body('pickupLocation.lng').isNumeric(),
  body('pickupLocation.address').trim().isLength({ min: 5 }),
  body('pickupLocation.city').trim().isLength({ min: 2 }),
  body('pickupLocation.state').trim().isLength({ min: 2 }),
  body('dropLocation.lat').isNumeric(),
  body('dropLocation.lng').isNumeric(),
  body('dropLocation.address').trim().isLength({ min: 5 }),
  body('dropLocation.city').trim().isLength({ min: 2 }),
  body('dropLocation.state').trim().isLength({ min: 2 }),
  body('loadWeight').isNumeric().isFloat({ min: 0 }),
  body('loadType').trim().isLength({ min: 2 }),
  body('vehicleRequired').isIn(['bike', '3_wheeler', 'mini_truck', 'pickup', 'lcv', 'mcv', 'hcv', 'trailer', 'container', '20_tyre', '50_ton']),
  body('bodyType').trim().isLength({ min: 2 }),
  body('scheduleTime').isISO8601(),
  body('price').optional().isNumeric(),
  body('bidMode').optional().isBoolean(),
  body('urgent').optional().isBoolean(),
  handleValidationErrors
];

export const validateId = [
  param('id').isMongoId(),
  handleValidationErrors
];

export const validatePagination = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  handleValidationErrors
];