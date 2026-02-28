// src/routes/dealRoutes.js
const router = require('express').Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');

// ─── GET /api/deals (Kanban) ──────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const tid = req.tenantId;
  try {
    const [stages, deals] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { tenantId: tid },
        orderBy: { position: 'asc' },
      }),
      prisma.deal.findMany({
        where:   { tenantId: tid, NOT: { status: 'deleted' } },
        orderBy: { updatedAt: 'desc' },
        include: {
          lead:     { select: { id: true, name: true, phone: true } },
          property: { select: { id: true, title: true } },
          agent:    { select: { id: true, name: true } },
        },
      }),
    ]);

    const kanban = stages.map(s => ({
      ...s,
      deals: deals
        .filter(d => d.stageId === s.id)
        .map(formatDeal),
    }));

    const totalValue = deals.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0);

    res.json({ kanban, total_value: totalValue });
  } catch (e) {
    console.error('[DEALS GET]', e);
    res.status(500).json({ error: 'Erro ao carregar pipeline' });
  }
});

// ─── POST /api/deals ──────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const { title, lead_id, property_id, stage_id, value, notes, expected_close } = req.body;
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });

  try {
    // Se não vier stage_id, usa o primeiro stage do tenant
    let stageId = stage_id;
    if (!stageId) {
      const first = await prisma.pipelineStage.findFirst({
        where:   { tenantId: req.tenantId },
        orderBy: { position: 'asc' },
      });
      stageId = first?.id || null;
    }

    const deal = await prisma.deal.create({
      data: {
        tenantId:      req.tenantId,
        agentId:       req.user.id,
        title,
        leadId:        lead_id      || null,
        propertyId:    property_id  || null,
        stageId:       stageId      || null,
        value:         value        ? parseFloat(value) : null,
        notes:         notes        || null,
        expectedClose: expected_close ? new Date(expected_close) : null,
      },
    });

    await prisma.activity.create({
      data: {
        tenantId:    req.tenantId,
        userId:      req.user.id,
        dealId:      deal.id,
        leadId:      lead_id || null,
        type:        'deal_created',
        description: `Negócio "${title}" criado`,
      },
    });

    res.status(201).json({ id: deal.id, message: 'Negócio criado com sucesso' });
  } catch (e) {
    console.error('[DEALS POST]', e);
    res.status(500).json({ error: 'Erro ao criar negócio' });
  }
});

// ─── PATCH /api/deals/:id/stage ───────────────────────────────
router.patch('/:id/stage', verifyToken, async (req, res) => {
  const { stage_id } = req.body;

  try {
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!deal) return res.status(404).json({ error: 'Negócio não encontrado' });

    const stage = await prisma.pipelineStage.findFirst({
      where: { id: stage_id, tenantId: req.tenantId },
    });

    await prisma.deal.update({
      where: { id: req.params.id },
      data:  { stageId: stage_id },
    });

    await prisma.activity.create({
      data: {
        tenantId:    req.tenantId,
        userId:      req.user.id,
        dealId:      req.params.id,
        leadId:      deal.leadId,
        type:        'stage_changed',
        description: `Negócio movido para "${stage?.name}"`,
      },
    });

    // Se o stage for "Fechamento", marca lead como won + cria notificação
    if (stage?.name === 'Fechamento') {
      const actions = [
        prisma.deal.update({ where: { id: req.params.id }, data: { status: 'won', closedAt: new Date() } }),
        prisma.notification.create({
          data: {
            tenantId: req.tenantId,
            userId:   req.user.id,
            type:     'deal',
            title:    '🎉 Negócio Fechado!',
            message:  `${deal.title} movido para Fechamento`,
            link:     '/pipeline',
          },
        }),
      ];
      if (deal.leadId) {
        actions.push(prisma.lead.update({ where: { id: deal.leadId }, data: { status: 'won' } }));
      }
      await Promise.all(actions);
    }

    res.json({ message: 'Etapa actualizada' });
  } catch (e) {
    console.error('[DEALS STAGE]', e);
    res.status(500).json({ error: 'Erro ao mover negócio' });
  }
});

// ─── PUT /api/deals/:id ───────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const { title, lead_id, property_id, stage_id, value, notes, expected_close, status } = req.body;
  try {
    const existing = await prisma.deal.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Negócio não encontrado' });

    await prisma.deal.update({
      where: { id: req.params.id },
      data: {
        title,
        leadId:        lead_id     || null,
        propertyId:    property_id || null,
        stageId:       stage_id    || null,
        value:         value       ? parseFloat(value) : null,
        notes:         notes       || null,
        expectedClose: expected_close ? new Date(expected_close) : null,
        status:        status      || 'open',
      },
    });
    res.json({ message: 'Negócio actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao actualizar negócio' });
  }
});

// ─── DELETE /api/deals/:id ────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const existing = await prisma.deal.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Negócio não encontrado' });

    await prisma.deal.update({ where: { id: req.params.id }, data: { status: 'deleted' } });
    res.json({ message: 'Negócio removido' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover negócio' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────
function formatDeal(d) {
  return {
    ...d,
    value:         d.value    ? parseFloat(d.value)  : null,
    lead_name:     d.lead?.name     || null,
    lead_phone:    d.lead?.phone    || null,
    property_title: d.property?.title || null,
    agent_name:    d.agent?.name    || null,
  };
}

module.exports = router;
