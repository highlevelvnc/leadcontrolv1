// src/routes/automationRoutes.js
const router = require('express').Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');

// ─── GET /api/automations ─────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const tid = req.tenantId;
  try {
    const [automations, logs] = await Promise.all([
      prisma.automation.findMany({
        where:   { tenantId: tid },
        orderBy: { createdAt: 'desc' },
        include: { creator: { select: { name: true } } },
      }),
      prisma.automationLog.findMany({
        where:   { tenantId: tid },
        orderBy: { ranAt: 'desc' },
        take:    30,
      }),
    ]);

    res.json({
      automations: automations.map(a => ({
        ...a,
        creator: undefined,
        creator_name: a.creator?.name || null,
        run_count:    a.runCount,
        last_run:     a.lastRun,
        trigger_type: a.triggerType,
        trigger_config: a.triggerConfig,
        action_type:    a.actionType,
        action_config:  a.actionConfig,
      })),
      logs: logs.map(l => ({
        ...l,
        automation_id: l.automationId,
        ran_at:        l.ranAt,
      })),
    });
  } catch (e) {
    console.error('[AUTOMATIONS GET]', e);
    res.status(500).json({ error: 'Erro ao listar automações' });
  }
});

// ─── POST /api/automations ────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  if (!name || !trigger_type || !action_type) {
    return res.status(400).json({ error: 'name, trigger_type e action_type são obrigatórios' });
  }
  try {
    const auto = await prisma.automation.create({
      data: {
        tenantId:      req.tenantId,
        createdBy:     req.user.id,
        name,
        triggerType:   trigger_type,
        triggerConfig: trigger_config || {},
        actionType:    action_type,
        actionConfig:  action_config  || {},
        active:        true,
      },
    });
    res.status(201).json({ id: auto.id, message: 'Automação criada com sucesso' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar automação' });
  }
});

// ─── PATCH /api/automations/:id/toggle ───────────────────────
router.patch('/:id/toggle', verifyToken, async (req, res) => {
  const tid = req.tenantId;
  try {
    const auto = await prisma.automation.findFirst({ where: { id: req.params.id, tenantId: tid } });
    if (!auto) return res.status(404).json({ error: 'Automação não encontrada' });

    const newState = !auto.active;
    await prisma.automation.update({ where: { id: req.params.id }, data: { active: newState } });

    await prisma.automationLog.create({
      data: {
        tenantId:      tid,
        automationId:  auto.id,
        status:        newState ? 'activated' : 'deactivated',
        message:       `Automação "${auto.name}" ${newState ? 'activada' : 'desactivada'}`,
      },
    });

    res.json({ active: newState, message: `Automação ${newState ? 'activada' : 'desactivada'}` });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao alterar automação' });
  }
});

// ─── POST /api/automations/:id/run ───────────────────────────
router.post('/:id/run', verifyToken, async (req, res) => {
  const tid = req.tenantId;
  try {
    const auto = await prisma.automation.findFirst({ where: { id: req.params.id, tenantId: tid } });
    if (!auto) return res.status(404).json({ error: 'Automação não encontrada' });

    // Executa a acção simulada (aqui entraria a integração real — WhatsApp API, e-mail, etc.)
    await prisma.$transaction([
      prisma.automation.update({
        where: { id: req.params.id },
        data:  { runCount: { increment: 1 }, lastRun: new Date() },
      }),
      prisma.automationLog.create({
        data: {
          tenantId:     tid,
          automationId: auto.id,
          status:       'success',
          message:      `Executada manualmente por ${req.user.name}`,
        },
      }),
    ]);

    res.json({
      message:   `Automação "${auto.name}" executada com sucesso!`,
      simulated: true,
      action:    auto.actionType,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao executar automação' });
  }
});

// ─── DELETE /api/automations/:id ─────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // Cascade: logs são eliminados também (onDelete: Cascade no schema)
    await prisma.automation.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId } });
    res.json({ message: 'Automação eliminada' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao eliminar automação' });
  }
});

// ─── GET /api/automations/integrations ───────────────────────
router.get('/integrations', verifyToken, async (req, res) => {
  try {
    const list = await prisma.integration.findMany({
      where:   { tenantId: req.tenantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar integrações' });
  }
});

// ─── PATCH /api/automations/integrations/:id/toggle ──────────
router.patch('/integrations/:id/toggle', verifyToken, async (req, res) => {
  try {
    const integ = await prisma.integration.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!integ) return res.status(404).json({ error: 'Integração não encontrada' });

    await prisma.integration.update({ where: { id: req.params.id }, data: { active: !integ.active } });
    res.json({ active: !integ.active, message: 'Integração actualizada' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao actualizar integração' });
  }
});

// ─── GET /api/automations/map-properties ─────────────────────
router.get('/map-properties', verifyToken, async (req, res) => {
  try {
    const props = await prisma.property.findMany({
      where: {
        tenantId:  req.tenantId,
        status:    'active',
        latitude:  { not: null },
        longitude: { not: null },
      },
      select: {
        id:           true,
        title:        true,
        type:         true,
        purpose:      true,
        price:        true,
        neighborhood: true,
        city:         true,
        latitude:     true,
        longitude:    true,
        status:       true,
        images:       true,
      },
    });

    res.json(props.map(p => ({
      ...p,
      price:     parseFloat(p.price),
      latitude:  parseFloat(p.latitude),
      longitude: parseFloat(p.longitude),
    })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao carregar mapa' });
  }
});

module.exports = router;
