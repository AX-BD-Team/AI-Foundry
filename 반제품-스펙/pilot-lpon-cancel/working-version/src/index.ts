import { Hono } from 'hono';
import { cors } from 'hono/cors';
import chargingRoutes from './routes/charging.js';
import paymentRoutes from './routes/payment.js';
import cancelRoutes from './routes/cancel.js';
import refundRoutes from './routes/refund.js';
import { getDb } from './db.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = new Hono();

app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ success: true, data: { status: 'ok' } }));

// Voucher balance (demo)
app.get('/api/v1/vouchers/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const v = db.prepare('SELECT id, user_id, balance, status, face_amount FROM vouchers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!v) return c.json({ success: false, error: { code: 'E404', message: 'Voucher not found' } }, 404);
  return c.json({ success: true, data: v });
});

// API routes
app.route('/api/v1/vouchers', chargingRoutes);
app.route('/api/v1/payments', paymentRoutes);
app.route('/api/v1/payments', cancelRoutes);
app.route('/api/v1/refunds', refundRoutes);

// Demo UI
app.get('/favicon.ico', (c) => c.body(null, 204));
app.get('/', (c) => {
  const html = readFileSync(join(import.meta.dirname, '..', 'public', 'index.html'), 'utf-8');
  return c.html(html);
});

export default app;
