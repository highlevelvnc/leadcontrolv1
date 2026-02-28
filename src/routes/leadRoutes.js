// src/routes/leadRoutes.js
const router = require('express').Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');
const { calcLeadScore } = require('../lib/score');

// ─── GET /api/leads ───────────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const { temperature, status, search, page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    tenantId: req.tenantId,
    ...(temperature && { temperature }),
    ...(status      && { status }),
    ...(search      && {
      OR: [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(!status && { NOT: { status: 'deleted' } }),
  };

  try {
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        include: { agent: { select: { id: true, name: true } } },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({ leads: leads.map(formatLead), total });
  } catch (e) {
    console.error('[LEADS GET]', e);
    res.status(500).json({ error: 'Erro ao listar leads' });
  }
});

// ─── GET /api/leads/:id ───────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        agent:        { select: { id: true, name: true } },
        activities:   { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { name: true } } } },
        deals:        { include: { stage: { select: { name: true, color: true } } } },
        tasks:        { orderBy: { dueDate: 'asc' } },
        appointments: { orderBy: { date: 'asc' } },
      },
    });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json(formatLead(lead));
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── POST /api/leads ──────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const { name, email, phone, source, status, temperature, interest, budget_min, budget_max, notes, agent_id } = req.body;

  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const score = calcLeadScore({
    phone,
    email,
    budgetMax: budget_max,
    source:    source || 'manual',
    temperature: temperature || 'cold',
  });

  try {
    const lead = await prisma.lead.create({
      data: {
        tenantId:    req.tenantId,
        agentId:     agent_id || req.user.id,
        name,
        email:       email  || null,
        phone:       phone  || null,
        source:      source || 'manual',
        status:      status || 'new',
        temperature: temperature || 'cold',
        interest:    interest   || null,
        budgetMin:   budget_min  ? parseFloat(budget_min)  : null,
        budgetMax:   budget_max  ? parseFloat(budget_max)  : null,
        notes:       notes      || null,
        score,
        lastContact: new Date(),
      },
    });

    // Activity + Notification em paralelo
    await Promise.all([
      prisma.activity.create({
        data: {
          tenantId:    req.tenantId,
          userId:      req.user.id,
          leadId:      lead.id,
          type:        'lead_created',
          description: `Lead "${name}" adicionado via ${source || 'manual'}`,
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: req.tenantId,
          userId:   req.user.id,
          leadId:   lead.id,
          type:     'lead',
          title:    'Novo Lead',
          message:  `${name} adicionado como lead`,
          link:     '/leads',
        },
      }),
    ]);

    res.status(201).json({ id: lead.id, message: 'Lead criado com sucesso', score });
  } catch (e) {
    console.error('[LEADS POST]', e);
    res.status(500).json({ error: 'Erro ao criar lead' });
  }
});

// ─── PUT /api/leads/:id ───────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const { name, email, phone, source, status, temperature, interest, budget_min, budget_max, notes, agent_id } = req.body;

  const score = calcLeadScore({ phone, email, budgetMax: budget_max, source, temperature });

  try {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Lead não encontrado' });

    await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        name,
        email:       email  || null,
        phone:       phone  || null,
        source:      source || 'manual',
        status:      status || existing.status,
        temperature: temperature || 'cold',
        interest:    interest || null,
        budgetMin:   budget_min  ? parseFloat(budget_min)  : null,
        budgetMax:   budget_max  ? parseFloat(budget_max)  : null,
        notes:       notes || null,
        score,
        agentId:     agent_id || existing.agentId,
      },
    });

    await prisma.activity.create({
      data: {
        tenantId:    req.tenantId,
        userId:      req.user.id,
        leadId:      req.params.id,
        type:        'lead_updated',
        description: `Lead "${name}" actualizado`,
      },
    });

    res.json({ message: 'Lead actualizado', score });
  } catch (e) {
    console.error('[LEADS PUT]', e);
    res.status(500).json({ error: 'Erro ao actualizar lead' });
  }
});

// ─── DELETE /api/leads/:id ────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Lead não encontrado' });

    await prisma.lead.update({
      where: { id: req.params.id },
      data:  { status: 'deleted' },
    });
    res.json({ message: 'Lead removido' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover lead' });
  }
});

// ─── POST /api/leads/:id/contact ──────────────────────────────
router.post('/:id/contact', verifyToken, async (req, res) => {
  const { type, description } = req.body;
  try {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Lead não encontrado' });

    await Promise.all([
      prisma.lead.update({ where: { id: req.params.id }, data: { lastContact: new Date() } }),
      prisma.activity.create({
        data: {
          tenantId:    req.tenantId,
          userId:      req.user.id,
          leadId:      req.params.id,
          type:        type || 'contact',
          description: description || 'Contacto registado',
        },
      }),
    ]);

    res.json({ message: 'Contacto registado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registar contacto' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────
function formatLead(l) {
  return {
    ...l,
    budget_min:  l.budgetMin  ? parseFloat(l.budgetMin)  : null,
    budget_max:  l.budgetMax  ? parseFloat(l.budgetMax)  : null,
    last_contact: l.lastContact,
    agent_name:   l.agent?.name || null,
  };
}

module.exports = router;
