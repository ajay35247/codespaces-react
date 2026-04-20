import mongoose from 'mongoose';
import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';
import Load from '../schemas/LoadSchema.js';
import Payment from '../schemas/PaymentSchema.js';
import GstInvoice from '../schemas/GstInvoiceSchema.js';
import SupportTicket from '../schemas/SupportTicketSchema.js';

const router = Router();
router.use(verifyJWT);

/**
 * GET /api/dashboard/stats
 * Returns role-specific aggregated statistics from the database.
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    switch (role) {
      case 'shipper': {
        const [loadStats, invoiceStats, paymentStats] = await Promise.all([
          Load.aggregate([
            { $match: { postedBy: new mongoose.Types.ObjectId(userId) } },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalFreight: { $sum: { $ifNull: ['$freightPrice', 0] } },
              },
            },
          ]),
          GstInvoice.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalValue: { $sum: '$value' },
              },
            },
          ]),
          Payment.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'captured' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        ]);

        const byStatus = {};
        let totalFreight = 0;
        for (const s of loadStats) {
          byStatus[s._id] = s.count;
          totalFreight += s.totalFreight;
        }
        const totalLoads = Object.values(byStatus).reduce((a, b) => a + b, 0);
        const delivered = byStatus.delivered || 0;
        const onTimeRate = totalLoads > 0 ? Math.round((delivered / totalLoads) * 100) : 0;

        return res.json({
          stats: {
            activeLoads: (byStatus.posted || 0) + (byStatus['in-transit'] || 0),
            onTimeDelivery: `${onTimeRate}%`,
            invoiceValue: invoiceStats[0]?.totalValue || 0,
            totalLoads,
            delivered,
            totalFreight,
            paymentsTotal: paymentStats[0]?.total || 0,
          },
        });
      }

      case 'driver': {
        const [myLoads, earnings] = await Promise.all([
          Load.aggregate([
            { $match: { assignedDriver: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$status', count: { $sum: 1 }, freight: { $sum: { $ifNull: ['$freightPrice', 0] } } } },
          ]),
          Payment.aggregate([
            { $match: { sender: String(userId), status: 'captured' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        ]);

        const byStatus = {};
        let totalFreight = 0;
        for (const s of myLoads) {
          byStatus[s._id] = s.count;
          totalFreight += s.freight;
        }
        const tripsToday = (byStatus['in-transit'] || 0) + (byStatus.delivered || 0);

        return res.json({
          stats: {
            tripsToday,
            earnings: earnings[0]?.total || totalFreight,
            performanceScore: tripsToday > 0 ? `${Math.min(100, 80 + tripsToday)}%` : '0%',
            inTransit: byStatus['in-transit'] || 0,
            delivered: byStatus.delivered || 0,
          },
        });
      }

      case 'fleet-manager': {
        const [vehicleStats, loadStats, maintenanceCount] = await Promise.all([
          mongoose.connection.db.collection('vehicles').aggregate([
            { $match: { ownerId: String(userId) } },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
              },
            },
          ]).toArray(),
          Load.aggregate([
            { $match: { postedBy: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]),
          mongoose.connection.db.collection('maintenance_requests').countDocuments({
            reportedBy: String(userId),
            status: 'open',
          }),
        ]);

        const vehicleByStatus = {};
        let totalVehicles = 0;
        for (const s of vehicleStats) {
          vehicleByStatus[s._id] = s.count;
          totalVehicles += s.count;
        }
        const activeVehicles = vehicleByStatus.active || 0;
        const utilization = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0;

        const loadByStatus = {};
        for (const s of loadStats) {
          loadByStatus[s._id] = s.count;
        }

        return res.json({
          stats: {
            trucksActive: activeVehicles,
            utilization: `${utilization}%`,
            maintenanceAlerts: maintenanceCount,
            totalVehicles,
            postedLoads: loadByStatus.posted || 0,
            inTransitLoads: loadByStatus['in-transit'] || 0,
            deliveredLoads: loadByStatus.delivered || 0,
          },
        });
      }

      case 'broker': {
        const [openLoads, myBids, invoiceStats] = await Promise.all([
          Load.countDocuments({ status: 'posted' }),
          Load.aggregate([
            { $match: { 'bids.brokerId': new mongoose.Types.ObjectId(userId) } },
            { $unwind: '$bids' },
            { $match: { 'bids.brokerId': new mongoose.Types.ObjectId(userId) } },
            {
              $group: {
                _id: '$bids.status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$bids.amount' },
              },
            },
          ]),
          Payment.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'captured' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        ]);

        const bidByStatus = {};
        let totalCommission = 0;
        for (const s of myBids) {
          bidByStatus[s._id] = s.count;
          if (s._id === 'accepted') totalCommission += s.totalAmount;
        }

        return res.json({
          stats: {
            openBids: openLoads,
            commission: totalCommission,
            contracts: bidByStatus.accepted || 0,
            pendingBids: bidByStatus.pending || 0,
            rejectedBids: bidByStatus.rejected || 0,
            paymentsTotal: invoiceStats[0]?.total || 0,
          },
        });
      }

      default:
        return res.status(403).json({ error: 'Role not supported for dashboard stats' });
    }
  } catch (error) {
    console.error('Dashboard stats error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
