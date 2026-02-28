// src/routes/propertyRoutes.js
const router = require('express').Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');

// ─── GET /api/properties ──────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  const { type, purpose, status, search, page = 1, limit = 20 } = req.query;
  const tid = req.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    tenantId: tid,
    ...(type    && { type }),
    ...(purpose && { purpose }),
    ...(status  && { status }),
    ...(search  && {
      OR: [
        { title:        { contains: search, mode: 'insensitive' } },
        { neighborhood: { contains: search, mode: 'insensitive' } },
        { city:         { contains: search, mode: 'insensitive' } },
      ],
    }),
    // Por padrão, não retorna deletados
    ...(!status && { NOT: { status: 'deleted' } }),
  };

  try {
    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        include: { agent: { select: { id: true, name: true, phone: true } } },
      }),
      prisma.property.count({ where }),
    ]);

    res.json({
      properties: properties.map(formatProperty),
      total,
      page: parseInt(page),
    });
  } catch (e) {
    console.error('[PROPERTIES GET]', e);
    res.status(500).json({ error: 'Erro ao listar imóveis' });
  }
});

// ─── GET /api/properties/:id ──────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const p = await prisma.property.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: { agent: { select: { id: true, name: true, phone: true, email: true } } },
    });
    if (!p) return res.status(404).json({ error: 'Imóvel não encontrado' });
    res.json(formatProperty(p));
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── POST /api/properties ─────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const {
    title, type, purpose, price, area, bedrooms, bathrooms, parking,
    address, neighborhood, city, state, description, status, featured,
    images, amenities, latitude, longitude,
  } = req.body;

  if (!title || !type || !purpose || !price) {
    return res.status(400).json({ error: 'Campos obrigatórios: title, type, purpose, price' });
  }

  try {
    const property = await prisma.property.create({
      data: {
        tenantId:    req.tenantId,
        agentId:     req.user.id,
        title,
        type,
        purpose,
        price:       parseFloat(price),
        area:        area ? parseFloat(area) : null,
        bedrooms:    parseInt(bedrooms) || 0,
        bathrooms:   parseInt(bathrooms) || 0,
        parking:     parseInt(parking) || 0,
        address:     address || '',
        neighborhood: neighborhood || '',
        city:        city || '',
        state:       state || '',
        description: description || '',
        status:      status || 'active',
        featured:    Boolean(featured),
        images:      images || [],
        amenities:   amenities || [],
        latitude:    latitude  ? parseFloat(latitude)  : null,
        longitude:   longitude ? parseFloat(longitude) : null,
      },
    });

    await prisma.activity.create({
      data: {
        tenantId:   req.tenantId,
        userId:     req.user.id,
        propertyId: property.id,
        type:       'property_created',
        description: `Imóvel "${title}" cadastrado`,
      },
    });

    res.status(201).json({ id: property.id, message: 'Imóvel cadastrado com sucesso' });
  } catch (e) {
    console.error('[PROPERTIES POST]', e);
    res.status(500).json({ error: 'Erro ao criar imóvel' });
  }
});

// ─── PUT /api/properties/:id ──────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const {
    title, type, purpose, price, area, bedrooms, bathrooms, parking,
    address, neighborhood, city, state, description, status, featured,
    images, amenities,
  } = req.body;

  try {
    await assertTenantOwns('property', req.params.id, req.tenantId, res);

    await prisma.property.update({
      where: { id: req.params.id },
      data: {
        title, type, purpose,
        price:    parseFloat(price),
        area:     area ? parseFloat(area) : null,
        bedrooms: parseInt(bedrooms) || 0,
        bathrooms: parseInt(bathrooms) || 0,
        parking:  parseInt(parking) || 0,
        address, neighborhood, city, state, description,
        status: status || 'active',
        featured: Boolean(featured),
        images:    images || [],
        amenities: amenities || [],
      },
    });

    res.json({ message: 'Imóvel actualizado com sucesso' });
  } catch (e) {
    if (e._handled) return;
    res.status(500).json({ error: 'Erro ao actualizar imóvel' });
  }
});

// ─── DELETE /api/properties/:id ───────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await assertTenantOwns('property', req.params.id, req.tenantId, res);
    await prisma.property.update({
      where: { id: req.params.id },
      data:  { status: 'deleted' },
    });
    res.json({ message: 'Imóvel removido' });
  } catch (e) {
    if (e._handled) return;
    res.status(500).json({ error: 'Erro ao remover imóvel' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────
function formatProperty(p) {
  return {
    ...p,
    price: parseFloat(p.price),
    area:  p.area ? parseFloat(p.area) : null,
    latitude:  p.latitude  ? parseFloat(p.latitude)  : null,
    longitude: p.longitude ? parseFloat(p.longitude) : null,
    agent_name:  p.agent?.name  || null,
    agent_phone: p.agent?.phone || null,
  };
}

async function assertTenantOwns(model, id, tenantId, res) {
  const record = await prisma.property.findFirst({ where: { id, tenantId } });
  if (!record) {
    res.status(404).json({ error: 'Não encontrado' });
    const err = new Error('Not found');
    err._handled = true;
    throw err;
  }
  return record;
}

module.exports = router;
