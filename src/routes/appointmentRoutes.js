// src/routes/appointmentRoutes.js
const router = require('express').Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, async (req, res) => {
  const { start, end } = req.query;
  try {
    const where = {
      tenantId: req.tenantId,
      ...(start && end && {
        date: { gte: new Date(start), lte: new Date(end + 'T23:59:59') },
      }),
    };
    const appts = await prisma.appointment.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        lead:     { select: { id: true, name: true, phone: true } },
        property: { select: { id: true, title: true } },
        agent:    { select: { id: true, name: true } },
      },
    });
    res.json(appts.map(a => ({
      ...a,
      lead_name:      a.lead?.name     || null,
      lead_phone:     a.lead?.phone    || null,
      property_title: a.property?.title || null,
      agent_name:     a.agent?.name    || null,
    })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar agendamentos' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  const { title, type, date, duration, lead_id, property_id, agent_id, notes } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Título e data obrigatórios' });

  try {
    const appt = await prisma.appointment.create({
      data: {
        tenantId:   req.tenantId,
        agentId:    agent_id || req.user.id,
        leadId:     lead_id     || null,
        propertyId: property_id || null,
        title,
        type:     type     || 'visit',
        date:     new Date(date),
        duration: parseInt(duration) || 60,
        notes:    notes || null,
      },
    });

    if (lead_id) {
      await prisma.activity.create({
        data: {
          tenantId:    req.tenantId,
          userId:      req.user.id,
          leadId:      lead_id,
          type:        'appointment_created',
          description: `Agendamento: ${title}`,
        },
      });
    }

    res.status(201).json({ id: appt.id, message: 'Agendamento criado' });
  } catch (e) {
    console.error('[APPT POST]', e);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    await prisma.appointment.updateMany({
      where: { id: req.params.id, tenantId: req.tenantId },
      data:  { status: req.body.status },
    });
    res.json({ message: 'Status actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao actualizar status' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await prisma.appointment.deleteMany({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    res.json({ message: 'Agendamento removido' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover agendamento' });
  }
});

module.exports = router;
