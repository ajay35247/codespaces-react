import crypto from 'crypto';
import { Router } from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';
import { requireGstEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import { generateGSTInvoice } from '../utils/pdfGenerator.js';
import { generateEwayBill, generateIrn, getActiveProviderName, isGspConfigured } from '../utils/gspAdapter.js';
import GstInvoice from '../schemas/GstInvoiceSchema.js';
import fs from 'fs';
import path from 'path';

const router = Router();

const GST_RATE = 0.18;

const createInvoiceSchema = Joi.object({
  shipper: Joi.string().trim().min(2).max(200).required(),
  shipperGstin: Joi.string().trim().max(15).optional(),
  value: Joi.number().positive().required(),
  hsn: Joi.string().trim().max(10).optional(),
  // Supply type determines CGST+SGST vs IGST
  // 'intra' = same state (CGST+SGST), 'inter' = different state (IGST)
  supplyType: Joi.string().valid('intra', 'inter').default('intra'),
  loadId: Joi.string().trim().max(128).optional(),
  date: Joi.date().iso().optional(),
});

function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(10000, 100000);
  return `GST-${year}-${rand}`;
}

function computeTax(value, supplyType) {
  const taxAmount = Math.round(value * GST_RATE * 100) / 100;
  if (supplyType === 'inter') {
    return { cgst: 0, sgst: 0, igst: taxAmount };
  }
  const half = Math.round((taxAmount / 2) * 100) / 100;
  return { cgst: half, sgst: half, igst: 0 };
}

router.use(verifyJWT);

router.get('/invoices', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      GstInvoice.find({ userId: req.user.id })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      GstInvoice.countDocuments({ userId: req.user.id }),
    ]);

    return res.json({
      invoices,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('GST invoice list error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await GstInvoice.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).lean();
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return res.json({ invoice });
  } catch (error) {
    console.error('GST invoice fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.post(
  '/invoices',
  requireRole(['shipper']),
  requireGstEnabled(),
  validateBody(createInvoiceSchema),
  async (req, res) => {
    try {
      const { shipper, shipperGstin, value, hsn, supplyType, loadId, date } = req.body;
      const { cgst, sgst, igst } = computeTax(value, supplyType || 'intra');

      // Unique invoice number with a retry on collision
      let invoiceNumber;
      let attempts = 0;
      do {
        invoiceNumber = generateInvoiceNumber();
        const exists = await GstInvoice.exists({ invoiceNumber });
        if (!exists) break;
        attempts += 1;
      } while (attempts < 5);

      if (attempts >= 5) {
        return res.status(503).json({ error: 'Unable to generate a unique invoice number. Please try again.' });
      }

      const invoice = await GstInvoice.create({
        invoiceNumber,
        userId: req.user.id,
        loadId: loadId || undefined,
        shipper,
        shipperGstin: shipperGstin || undefined,
        date: date ? new Date(date) : new Date(),
        value,
        cgst,
        sgst,
        igst,
        hsn: hsn || '9965',
        status: 'issued',
      });

      return res.status(201).json({ invoice });
    } catch (error) {
      console.error('GST invoice create error:', error.message);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }
  }
);

router.get('/download/:id', async (req, res) => {
  try {
    const invoice = await GstInvoice.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).lean();
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
    const filePath = path.join('/tmp', fileName);

    const pdfData = {
      id: invoice.invoiceNumber,
      shipper: invoice.shipper,
      date: invoice.date.toISOString().split('T')[0],
      value: invoice.value,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      hsn: invoice.hsn,
      status: invoice.status,
    };

    await generateGSTInvoice(pdfData, filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (error) {
    console.error('PDF generation error:', error.message);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ── GSP integration (e-way bill, IRN/e-invoice) ───────────────────────────────
// These endpoints go through utils/gspAdapter.js.  When GSP_PROVIDER=none
// (the default) they return 501 Not Implemented with a human-readable reason.
// Wiring a real provider is a one-file change — see utils/gspAdapter.js.

router.get('/gsp/status', (req, res) => {
  res.json({
    provider: getActiveProviderName(),
    configured: isGspConfigured(),
  });
});

router.post('/invoices/:id/eway-bill', async (req, res) => {
  try {
    const invoice = await GstInvoice.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).lean();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const result = await generateEwayBill(invoice);
    if (!result.configured) {
      return res.status(501).json({
        error: 'E-way bill generation is not configured',
        provider: result.provider,
        reason: result.reason,
      });
    }
    return res.json({ ewayBill: result });
  } catch (error) {
    console.error('E-way bill error:', error.message);
    return res.status(500).json({ error: 'Failed to generate e-way bill' });
  }
});

router.post('/invoices/:id/irn', async (req, res) => {
  try {
    const invoice = await GstInvoice.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).lean();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const result = await generateIrn(invoice);
    if (!result.configured) {
      return res.status(501).json({
        error: 'IRN generation is not configured',
        provider: result.provider,
        reason: result.reason,
      });
    }
    return res.json({ irn: result });
  } catch (error) {
    console.error('IRN error:', error.message);
    return res.status(500).json({ error: 'Failed to generate IRN' });
  }
});

export default router;
