import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';
import { generateGSTInvoice } from '../utils/pdfGenerator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const invoices = [
  {
    id: 'GST-2101',
    shipper: 'Acme Exports',
    date: '2026-04-10',
    value: 124800,
    cgst: 22464,
    sgst: 22464,
    igst: 0,
    hsn: '8704',
    status: 'Paid',
  },
  {
    id: 'GST-2102',
    shipper: 'TransIndia',
    date: '2026-04-09',
    value: 87200,
    cgst: 15696,
    sgst: 15696,
    igst: 0,
    hsn: '8704',
    status: 'Pending',
  },
];

router.use(verifyJWT);

router.get('/invoices', (req, res) => {
  res.json({ invoices });
});

router.get('/invoices/:id', (req, res) => {
  const invoice = invoices.find((item) => item.id === req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  res.json({ invoice });
});

router.get('/download/:id', async (req, res) => {
  try {
    const invoice = invoices.find((item) => item.id === req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const fileName = `invoice-${invoice.id}.pdf`;
    const filePath = path.join('/tmp', fileName);

    await generateGSTInvoice(invoice, filePath);

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

export default router;
