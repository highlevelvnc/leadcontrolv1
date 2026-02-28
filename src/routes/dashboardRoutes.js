// src/routes/dashboardRoutes.js
const router = require('express').Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');

// ─── GET /api/dashboard/stats ─────────────────────────────────
router.get('/stats', verifyToken, async (req, res) => {
  const tid = req.tenantId;
  const now  = new Date();
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  try {
    // ── KPIs principais ──────────────────────────────────────
    const [
      vgvResult,
      vgvLastResult,
      activeLeads,
      activeLeadsLast,
      totalProperties,
      visits,
      pendingTasks,
      wonDeals,
      pipelineValue,
    ] = await Promise.all([
      // VGV mês actual
      prisma.deal.aggregate({
        where:  { tenantId: tid, status: 'open', createdAt: { gte: monthStart } },
        _sum:   { value: true },
      }),
      // VGV mês anterior
      prisma.deal.aggregate({
        where:  { tenantId: tid, status: 'open', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum:   { value: true },
      }),
      // Leads activos
      prisma.lead.count({
        where: { tenantId: tid, NOT: { status: { in: ['deleted', 'lost'] } } },
      }),
      // Leads activos mês anterior (baseline)
      prisma.lead.count({
        where: { tenantId: tid, NOT: { status: { in: ['deleted', 'lost'] } }, createdAt: { lt: monthStart } },
      }),
      // Imóveis activos
      prisma.property.count({ where: { tenantId: tid, status: 'active' } }),
      // Visitas agendadas este mês
      prisma.appointment.count({
        where: { tenantId: tid, status: 'scheduled', date: { gte: monthStart } },
      }),
      // Tarefas pendentes
      prisma.task.count({ where: { tenantId: tid, status: 'pending' } }),
      // Negócios fechados este mês
      prisma.deal.count({ where: { tenantId: tid, status: 'won', createdAt: { gte: monthStart } } }),
      // Valor total pipeline
      prisma.deal.aggregate({
        where: { tenantId: tid, status: 'open' },
        _sum:  { value: true },
      }),
    ]);

    // ── Actividades recentes ─────────────────────────────────
    const activities = await prisma.activity.findMany({
      where:   { tenantId: tid },
      orderBy: { createdAt: 'desc' },
      take:    10,
      include: {
        user: { select: { name: true } },
        lead: { select: { name: true } },
      },
    });

    // ── Imóveis em destaque ──────────────────────────────────
    const topProperties = await prisma.property.findMany({
      where:   { tenantId: tid, featured: true, status: 'active' },
      take:    5,
      include: { agent: { select: { name: true } } },
    });

    // ── Hot leads ────────────────────────────────────────────
    const hotLeads = await prisma.lead.findMany({
      where:   { tenantId: tid, temperature: { in: ['hot', 'warm'] }, NOT: { status: { in: ['deleted', 'won'] } } },
      orderBy: { score: 'desc' },
      take:    5,
      include: { agent: { select: { name: true } } },
    });

    // ── Pipeline summary ─────────────────────────────────────
    const stages = await prisma.pipelineStage.findMany({
      where:   { tenantId: tid },
      orderBy: { position: 'asc' },
      include: {
        deals: {
          where:  { status: 'open' },
          select: { value: true },
        },
      },
    });

    const pipeline = stages.map(s => ({
      name:  s.name,
      color: s.color,
      count: s.deals.length,
      total: s.deals.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0),
    }));

    // ── Gráfico mensal (últimos 6 meses) ─────────────────────
    const monthlyChart = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const d      = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const start  = d;
        const end    = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        return prisma.deal.aggregate({
          where: { tenantId: tid, createdAt: { gte: start, lte: end } },
          _sum:  { value: true },
        }).then(r => ({
          month: d.toLocaleString('pt-PT', { month: 'short' }),
          value: parseFloat(r._sum.value) || 0,
        }));
      })
    );

    res.json({
      vgv:             parseFloat(vgvResult._sum.value)     || 0,
      vgvLast:         parseFloat(vgvLastResult._sum.value) || 0,
      activeLeads,
      activeLeadsLast,
      totalProperties,
      visits,
      pendingTasks,
      wonDeals,
      pipelineValue:   parseFloat(pipelineValue._sum.value) || 0,
      activities:      activities.map(a => ({
        ...a,
        user_name: a.user?.name || null,
        lead_name: a.lead?.name || null,
      })),
      topProperties: topProperties.map(p => ({
        ...p,
        price:      parseFloat(p.price),
        agent_name: p.agent?.name || null,
      })),
      hotLeads: hotLeads.map(l => ({
        ...l,
        budget_min: l.budgetMin ? parseFloat(l.budgetMin) : null,
        budget_max: l.budgetMax ? parseFloat(l.budgetMax) : null,
        agent_name: l.agent?.name || null,
      })),
      pipeline,
      monthlyChart,
    });
  } catch (e) {
    console.error('[DASHBOARD STATS]', e);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

// ─── GET /api/dashboard/notifications ────────────────────────
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where:   { tenantId: req.tenantId, userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take:    20,
      }),
      prisma.notification.count({
        where: { tenantId: req.tenantId, userId: req.user.id, read: false },
      }),
    ]);
    res.json({ notifications, unread });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao carregar notificações' });
  }
});

// ─── PATCH /api/dashboard/notifications/read ──────────────────
router.patch('/notifications/read', verifyToken, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { tenantId: req.tenantId, userId: req.user.id, read: false },
      data:  { read: true },
    });
    res.json({ message: 'Notificações marcadas como lidas' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao actualizar notificações' });
  }
});

module.exports = router;
