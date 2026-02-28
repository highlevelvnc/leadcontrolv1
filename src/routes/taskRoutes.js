// src/routes/taskRoutes.js
const router = require('express').Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, async (req, res) => {
  const { status, priority } = req.query;
  try {
    const tasks = await prisma.task.findMany({
      where: {
        tenantId: req.tenantId,
        ...(status   && { status }),
        ...(priority && { priority }),
      },
      orderBy: [
        // high → medium → low
        { priority: 'asc' },
        { dueDate:  'asc' },
      ],
      include: {
        assignee: { select: { id: true, name: true } },
        lead:     { select: { id: true, name: true } },
      },
    });
    res.json(tasks.map(t => ({ ...t, assigned_name: t.assignee?.name, lead_name: t.lead?.name })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar tarefas' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  const { title, description, due_date, priority, lead_id, property_id, deal_id, assigned_to } = req.body;
  try {
    const task = await prisma.task.create({
      data: {
        tenantId:   req.tenantId,
        createdBy:  req.user.id,
        assignedTo: assigned_to || req.user.id,
        leadId:     lead_id     || null,
        propertyId: property_id || null,
        dealId:     deal_id     || null,
        title,
        description: description || null,
        dueDate:  due_date ? new Date(due_date) : null,
        priority: priority || 'medium',
      },
    });
    res.status(201).json({ id: task.id, message: 'Tarefa criada' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
});

router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    await prisma.task.updateMany({
      where: { id: req.params.id, tenantId: req.tenantId },
      data:  { status: req.body.status },
    });
    res.json({ message: 'Status actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao actualizar tarefa' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await prisma.task.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId } });
    res.json({ message: 'Tarefa removida' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover tarefa' });
  }
});

module.exports = router;
