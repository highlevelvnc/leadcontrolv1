// src/index.js
// LeadControl SaaS — Express Server (PostgreSQL + Prisma + Multi-tenant)
require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const morgan      = require('morgan');
const helmet      = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const fs          = require('fs');
const prisma      = require('./lib/prisma');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Security ─────────────────────────────────────────────────
app.use(helmet({
  // Relaxar CSP para servir o frontend legado em /public
  contentSecurityPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Permitir requests sem origin (Postman, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado para origem: ${origin}`));
  },
  credentials: true,
}));

// ─── Body & Cookies ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Logging ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Rate Limiting ────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max:      20,               // 20 tentativas por IP
  message:  { error: 'Demasiadas tentativas — tente novamente em 15 minutos' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 min
  max:      300,              // 300 req/min por IP
  message:  { error: 'Limite de pedidos excedido' },
});

// ─── Static (Frontend legado em /public) ──────────────────────
// O teu frontend actual em /public é servido directamente aqui.
// Quando migrares para Next.js, remove estas linhas.
const publicPath = path.join(__dirname, '../public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log(`📁 Servindo frontend estático em /public`);
}

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',         authLimiter);
app.use('/api/auth',         require('./routes/authRoutes'));
app.use('/api',              apiLimiter);
app.use('/api/properties',   require('./routes/propertyRoutes'));
app.use('/api/leads',        require('./routes/leadRoutes'));
app.use('/api/deals',        require('./routes/dealRoutes'));
app.use('/api/tasks',        require('./routes/taskRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/dashboard',    require('./routes/dashboardRoutes'));
app.use('/api/users',        require('./routes/userRoutes'));
app.use('/api/automations',  require('./routes/automationRoutes'));

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', version: '3.0.0', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── SPA fallback (serve index.html para rotas do frontend) ───
// Só activo se /public existir; ignorado quando Next.js tomar conta
if (fs.existsSync(publicPath)) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Rota não encontrada' });
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// ─── Global error handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  // Erros CORS
  if (err.message?.startsWith('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  // Erros Prisma conhecidos
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Registo duplicado — verifique os dados' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registo não encontrado' });
  }
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({
    error: 'Erro interno do servidor',
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
});

// ─── Startup ──────────────────────────────────────────────────
async function start() {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL conectado via Prisma');
  } catch (e) {
    console.error('❌ Falha ao conectar ao PostgreSQL:', e.message);
    console.error('   → Certifique-se que o Docker está a correr: docker compose up -d');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`
  ┌─────────────────────────────────────────┐
  │  🏢  LeadControl SaaS — Backend v3      │
  │  🚀  http://localhost:${PORT}              │
  │  🐘  PostgreSQL + Prisma                 │
  │  🏗️   Multi-tenant pronto para SaaS      │
  └─────────────────────────────────────────┘
    `);
  });
}

// ─── Graceful shutdown ────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('\n👋 SIGTERM recebido — a fechar ligações...');
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

start();
