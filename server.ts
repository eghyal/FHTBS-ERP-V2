import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initDb } from './src/db/database.ts';
import { initPostgresDb } from './src/db/postgresClient.ts';
import { runFullPostgresMigration } from './src/db/postgresMigrationEngine.ts';

// Fail-fast security guard: JWT secret wajib eksplisit di production.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[Server] FATAL: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn('[Server] WARNING: JWT_SECRET is not set; using the development fallback secret. Set JWT_SECRET before deploying.');
}

// Guarantee SQLite database schema initialization before mounting routes
try {
  initDb();
  console.log('[Server] SQLite database initialized successfully.');
} catch (err) {
  console.error('[Server] Failed to initialize SQLite database:', err);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS allowlist: default same-origin (no cross-origin). Tambahkan origin
// tepercaya via env ALLOWED_ORIGINS="https://a.com,https://b.com".
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Request tanpa Origin header (same-origin, curl, server-to-server) diizinkan.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} tidak diizinkan oleh kebijakan CORS.`));
  },
  credentials: true,
};

app.use(helmet({
  contentSecurityPolicy: false, // SPA + PWA asset compatibility; CSP granular dapat diaktifkan bertahap.
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Rate limiting global untuk API: melindungi dari brute-force & abuse.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate exceeded. Too many requests, please slow down.' },
});
// Rate limiting ketat untuk endpoint autentikasi.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate exceeded. Too many authentication attempts, please try again later.' },
});
app.use('/api/', apiLimiter);
app.use(['/api/auth', '/api/hr-auth'], authLimiter);

// Health & Time endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/time", (req, res) => {
  res.json({ timestamp: Date.now(), time: new Date().toISOString() });
});

// Routes
import { populateUserSession } from './src/middleware/auth.ts';
import { router as adminRouter } from './src/routes/admin_routes.ts';
import { router as authRouter } from './src/routes/auth_routes.ts';
import { chatRouter } from './src/routes/chat.ts';
import { router as dashboardRouter } from './src/routes/dashboard.ts';
import { router as datacenterRouter } from './src/routes/datacenter.ts';
import { router as financeRouter } from './src/routes/finance.ts';
import { forumRouter } from './src/routes/forum.ts';
import { hrAttendanceRouter } from './src/routes/hr-attendance.ts';
import { hrRouter } from './src/routes/hr.ts';
import { router as hrPayrollRouter } from './src/routes/hr_payroll.ts';
import { inventoryRouter } from './src/routes/inventory.ts';
import { router as migrationRouter } from './src/routes/migration_routes.ts';
import { router as productionRouter } from './src/routes/production.ts';
import { router as projectsRouter } from './src/routes/projects.ts';
import { purchasingRouter } from './src/routes/purchasing.ts';
import { salesRouter } from './src/routes/sales.ts';
import { shopRouter } from './src/routes/shop.ts';
import { initShopCatalogAndSeed } from './src/db/shopSeed.ts';
import { router as systemRouter } from './src/routes/system_routes.ts';
import { usersRouter } from './src/routes/users.ts';
import { router as workflowRouter } from './src/routes/workflow.ts';
import { uploadRouter } from './src/routes/upload_routes.ts';
import { router as annualEventRouter } from './src/routes/annual_event_routes.ts';

app.use(populateUserSession);
app.use(uploadRouter);
app.use(annualEventRouter);
app.use(adminRouter);
app.use(authRouter);
app.use(chatRouter);
app.use(dashboardRouter);
app.use(datacenterRouter);
app.use(financeRouter);
app.use(forumRouter);
app.use(hrAttendanceRouter);
app.use(hrRouter);
app.use(hrPayrollRouter);
app.use(inventoryRouter);
app.use(migrationRouter);
app.use(productionRouter);
app.use(projectsRouter);
app.use(purchasingRouter);
app.use(salesRouter);
app.use(shopRouter);
app.use(systemRouter);
app.use(usersRouter);
app.use(workflowRouter);

async function startServer() {
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin tidak diizinkan oleh kebijakan CORS.'));
      },
      credentials: true,
    }
  });

  (global as any).io = io;

  io.on('connection', (socket) => {
    console.log('[Socket.io] Client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('[Socket.io] Client disconnected:', socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist'))
      ? path.join(process.cwd(), 'dist')
      : path.join(process.cwd(), 'build');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize and seed B2C shop catalog and demo data
  initShopCatalogAndSeed();

  // Initialize and migrate data to PostgreSQL engine in the background
  initPostgresDb()
    .then(() => runFullPostgresMigration())
    .then((summary) => {
      console.log(
        `[Server] PostgreSQL initialization & data migration complete (${summary.totalMigratedRows} rows across ${summary.totalTables} tables).`,
      );
    })
    .catch((err) => {
      console.error('[Server] PostgreSQL background migration error:', err);
    });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
