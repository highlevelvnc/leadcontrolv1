// src/middleware/auth.js
// Verifica JWT e injeta req.user + req.tenantId em todos os handlers
// O tenantId garante isolamento total dos dados (Row-Level Security via app)

const jwt  = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'leadcontrol_dev_secret_change_in_prod';

// ─── Gera token ───────────────────────────────────────────────
function generateToken(user) {
  return jwt.sign(
    {
      id:       user.id,
      email:    user.email,
      role:     user.role,
      name:     user.name,
      tenantId: user.tenantId,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ─── Middleware: verifica token + garante tenant ──────────────
async function verifyToken(req, res, next) {
  const raw =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!raw) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const payload = jwt.verify(raw, JWT_SECRET);

    // Opcional: revalidar user no banco (garante que ainda está activo)
    // Descomente em produção se precisar revogar tokens imediatamente:
    // const user = await prisma.user.findUnique({ where: { id: payload.id } });
    // if (!user || !user.active) return res.status(401).json({ error: 'Utilizador inactivo' });

    req.user     = payload;
    req.tenantId = payload.tenantId;  // ← chave do multi-tenant
    next();
  } catch {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ─── Middleware: apenas ADMIN ou MANAGER ──────────────────────
function requireAdmin(req, res, next) {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso negado — sem permissão' });
  }
  next();
}

// ─── Middleware: apenas ADMIN ─────────────────────────────────
function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado — requer ADMIN' });
  }
  next();
}

module.exports = { generateToken, verifyToken, requireAdmin, requireSuperAdmin };
