import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import authRoutes from './routes/auth.js';
import batchesRoutes from './routes/batches.js';
import shipmentsRoutes from './routes/shipments.js';
import customersRoutes from './routes/customers.js';
import expensesRoutes from './routes/expenses.js';
import expenseCategoriesRoutes from './routes/expenseCategories.js';
import exchangesRoutes from './routes/exchanges.js';
import profitRoutes from './routes/profit.js';
import settingsRoutes from './routes/settings.js';
import dividendRoutes from './routes/dividend.js';
import dashboardRoutes from './routes/dashboard.js';
import dividendsRoutes from './routes/dividends.js';
import productsRoutes from './routes/products.js';
import exportRoutes from './routes/export.js';
import backupRoutes from './routes/backup.js';
import historyRoutes from './routes/history.js';
import auditRoutes from './routes/audit.js';
import { db } from './db.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/batches', batchesRoutes);
app.use('/api/batches', shipmentsRoutes);
app.use('/api/batches', expensesRoutes);
app.use('/api/batches', exchangesRoutes);
app.use('/api/batches', profitRoutes);
app.use('/api/batches', dividendRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/expense-categories', expenseCategoriesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/dividends', dividendsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/audit', auditRoutes);

const webDist = path.resolve(process.cwd(), '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA history fallback: non-API GET requests serve index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

export { app };
