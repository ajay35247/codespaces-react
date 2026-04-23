import mongoose from 'mongoose';
import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';
import { Joi, validateBody } from '../middleware/validation.js';
import User from '../schemas/UserSchema.js';
import Load from '../schemas/LoadSchema.js';

const router = Router();
router.use(verifyJWT);

/**
 * Compute a trust score (0–100) from user attributes and activity metrics.
 *
 * Breakdown:
 *   base                 50
 *   KYC approved        +20  / rejected −10
 *   account active      +10
 *   avg rating ≥ 4.5    +20  / ≥ 4.0 +15 / ≥ 3.5 +10 / ≥ 3.0 +5
 *   deliveries ≥ 20     +15  / ≥ 5 +10  / ≥ 1 +5
 *   max                 100
 */
function computeTrustScore({ user, deliveredCount, avgRating, ratingCount }) {
  let score = 50;

  if (user.kycStatus === 'approved') score += 20;
  else if (user.kycStatus === 'rejected') score -= 10;

  if (user.accountStatus === 'active') score += 10;

  if (ratingCount > 0) {
    if (avgRating >= 4.5) score += 20;
    else if (avgRating >= 4.0) score += 15;
    else if (avgRating >= 3.5) score += 10;
    else if (avgRating >= 3.0) score += 5;
  }

  if (deliveredCount >= 20) score += 15;
  else if (deliveredCount >= 5) score += 10;
  else if (deliveredCount >= 1) score += 5;

  return Math.min(100, Math.max(0, score));
}

/**
 * GET /api/profile
 * Returns the authenticated user's profile, KYC status, rating summary,
 * activity counts, and computed trust score.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(userId)
      .select('-password -refreshTokens -resetToken -verificationToken -mfaCodeHash -mfaChallengeHash -mfaCodeExpires -mfaChallengeExpires')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const uid = new mongoose.Types.ObjectId(userId);

    // Build role-specific delivery filter.
    let deliveredFilter;
    if (user.role === 'driver') {
      deliveredFilter = { assignedDriver: uid, status: 'delivered' };
    } else if (user.role === 'shipper') {
      deliveredFilter = { postedBy: uid, status: 'delivered' };
    } else if (user.role === 'broker') {
      deliveredFilter = { 'bids.bidderId': uid, 'bids.status': 'accepted', status: 'delivered' };
    } else {
      // truck_owner: approximate via loads they touched through fleet management.
      deliveredFilter = { status: 'delivered', _id: { $exists: false } }; // no result, avoids full-scan
    }

    let activeFilter;
    if (user.role === 'driver') {
      activeFilter = { assignedDriver: uid, status: 'in-transit' };
    } else if (user.role === 'shipper') {
      activeFilter = { postedBy: uid, status: { $in: ['posted', 'in-transit'] } };
    } else {
      activeFilter = { _id: { $exists: false } };
    }

    const [ratingStats, deliveredCount, activeCount] = await Promise.all([
      Load.aggregate([
        { $match: { 'ratings.rateeId': uid } },
        { $unwind: '$ratings' },
        { $match: { 'ratings.rateeId': uid } },
        { $group: { _id: null, avg: { $avg: '$ratings.stars' }, count: { $sum: 1 } } },
      ]).then((r) => r[0] || { avg: 0, count: 0 }),
      Load.countDocuments(deliveredFilter),
      Load.countDocuments(activeFilter),
    ]);

    const trustScore = computeTrustScore({
      user,
      deliveredCount,
      avgRating: ratingStats.avg,
      ratingCount: ratingStats.count,
    });

    return res.json({
      profile: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        gstin: user.gstin || '',
        accountStatus: user.accountStatus,
        kycStatus: user.kycStatus,
        kycDocuments: (user.kycDocuments || []).map((d) => ({
          docType: d.docType,
          number: d.number,
          holderName: d.holderName,
          submittedAt: d.submittedAt,
        })),
        kycSubmittedAt: user.kycSubmittedAt,
        kycReviewedAt: user.kycReviewedAt,
        kycRejectionReason: user.kycRejectionReason || '',
        createdAt: user.createdAt,
        fundAccount: user.fundAccount
          ? {
            method: user.fundAccount.method,
            vpa: user.fundAccount.vpa,
            beneficiaryName: user.fundAccount.beneficiaryName,
          }
          : null,
      },
      stats: {
        deliveredCount,
        activeCount,
        avgRating: ratingStats.count > 0 ? Number(ratingStats.avg.toFixed(1)) : null,
        ratingCount: ratingStats.count,
        trustScore,
      },
    });
  } catch (error) {
    console.error('Profile fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).optional(),
  phone: Joi.string().trim().max(30).allow('').optional(),
  gstin: Joi.string().trim().max(30).allow('').optional(),
});

/**
 * PATCH /api/profile
 * Update name, phone, and/or gstin for the authenticated user.
 */
router.patch('/', validateBody(updateProfileSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.gstin !== undefined) updates.gstin = req.body.gstin;

    if (Object.keys(updates).length === 0) {
      return res.json({ message: 'No changes' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('name email role phone gstin accountStatus kycStatus').lean();

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({ message: 'Profile updated', user });
  } catch (error) {
    console.error('Profile update error:', error.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
