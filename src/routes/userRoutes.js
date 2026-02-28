// src/routes/userRoutes.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const prisma  = require('../lib/prisma');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/users — lista membros do tenant
router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where:   { tenantId: req.tenantId, active: true },
      select:  { id: true, name: true, email: true, role: true, phone: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar utilizadores' });
  }
});

// POST /api/users — adicionar membro ao tenant (admin)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email e password são obrigatórios' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const user = await prisma.user.create({
      data: {
        tenantId: req.tenantId,
        name,
        email,
        password: hash,
        role:     role  || 'AGENT',
        phone:    phone || null,
      },
    });
    res.status(201).json({ id: user.id, message: 'Utilizador criado com sucesso' });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Email já registado neste tenant' });
    res.status(500).json({ error: 'Erro ao criar utilizador' });
  }
});

// PUT /api/users/:id — actualizar perfil
router.put('/:id', verifyToken, async (req, res) => {
  const isSelf  = req.user.id === req.params.id;
  const isAdmin = ['ADMIN', 'MANAGER'].includes(req.user.role);
  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Sem permissão' });

  try {
    await prisma.user.updateMany({
      where: { id: req.params.id, tenantId: req.tenantId },
      data:  { name: req.body.name, phone: req.body.phone || null },
    });
    res.json({ message: 'Perfil actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao actualizar perfil' });
  }
});

// PATCH /api/users/:id/password
router.patch('/:id/password', verifyToken, async (req, res) => {
  const isSelf  = req.user.id === req.params.id;
  const isAdmin = req.user.role === 'ADMIN';
  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Sem permissão' });

  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado' });

    if (!bcrypt.compareSync(req.body.current, user.password)) {
      return res.status(400).json({ error: 'Password actual incorrecta' });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data:  { password: bcrypt.hashSync(req.body.newPassword, 10) },
    });
    res.json({ message: 'Password actualizada' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao actualizar password' });
  }
});

module.exports = router;
