// src/routes/authRoutes.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const prisma  = require('../lib/prisma');
const { generateToken, verifyToken } = require('../middleware/auth');

// ─── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password, tenantSlug } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password obrigatórios' });
  }

  try {
    // Multi-tenant: se vier tenantSlug, filtra por tenant específico
    // (útil quando houver subdomínios: silva.leadcontrol.pt → slug "silva")
    const whereUser = tenantSlug
      ? { email, tenant: { slug: tenantSlug }, active: true }
      : { email, active: true };

    const user = await prisma.user.findFirst({
      where: whereUser,
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true, active: true } } },
    });

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    if (!user.tenant.active) {
      return res.status(403).json({ error: 'Conta suspensa — contacte o suporte' });
    }

    const token = generateToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
      tenant: user.tenant,
    });
  } catch (e) {
    console.error('[AUTH LOGIN]', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Sessão terminada' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, phone: true, avatar: true, createdAt: true, tenantId: true },
    });
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── POST /api/auth/register ──────────────────────────────────
// Cria um novo Tenant + Admin (self-service SaaS onboarding)
router.post('/register', async (req, res) => {
  const { tenantName, tenantSlug, adminName, adminEmail, adminPassword } = req.body;

  if (!tenantName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'tenantName, adminEmail e adminPassword são obrigatórios' });
  }

  const slug = tenantSlug?.toLowerCase().replace(/[^a-z0-9-]/g, '-') ||
    tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);

  try {
    // Verifica se slug já existe
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) return res.status(409).json({ error: 'Slug já em uso — escolha outro nome de empresa' });

    const hash = bcrypt.hashSync(adminPassword, 10);

    // Cria tenant + admin + dados iniciais em transação
    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar tenant
      const tenant = await tx.tenant.create({
        data: { name: tenantName, slug, plan: 'FREE' },
      });

      // 2. Criar admin
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name:     adminName || adminEmail.split('@')[0],
          email:    adminEmail,
          password: hash,
          role:     'ADMIN',
        },
      });

      // 3. Pipeline stages padrão
      const stages = [
        { name: 'Novo',          color: '#00d4ff', position: 0, isDefault: true },
        { name: 'Qualificação',  color: '#7c5cfc', position: 1 },
        { name: 'Proposta',      color: '#ffb422', position: 2 },
        { name: 'Negociação',    color: '#ff3e9d', position: 3 },
        { name: 'Fechamento',    color: '#00e59b', position: 4 },
      ];
      await tx.pipelineStage.createMany({
        data: stages.map(s => ({ ...s, tenantId: tenant.id })),
      });

      // 4. Integrações padrão
      await tx.integration.createMany({
        data: [
          { tenantId: tenant.id, name: 'WhatsApp Business', type: 'whatsapp', active: false },
          { tenantId: tenant.id, name: 'Idealista Portugal', type: 'portal',   active: false },
          { tenantId: tenant.id, name: 'Imovirtual',         type: 'portal',   active: false },
          { tenantId: tenant.id, name: 'Casa Sapo',          type: 'portal',   active: false },
          { tenantId: tenant.id, name: 'Google Ads',         type: 'ads',      active: false },
          { tenantId: tenant.id, name: 'Meta / Instagram',   type: 'ads',      active: false },
          { tenantId: tenant.id, name: 'Google Analytics',   type: 'analytics',active: false },
          { tenantId: tenant.id, name: 'Zapier',             type: 'webhook',  active: false },
        ],
      });

      return { tenant, admin };
    });

    const token = generateToken(result.admin);
    res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      tenant: { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name },
      user:   { id: result.admin.id,  email: result.admin.email, role: result.admin.role },
    });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Email já registado neste tenant' });
    console.error('[AUTH REGISTER]', e);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

module.exports = router;
