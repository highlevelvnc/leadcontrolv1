// scripts/seed.js
// Popula o banco com um tenant demo + dados reais de Portugal
// Usage: npm run db:seed
// Reset:  npm run db:reset  (apaga tudo e re-seed)

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('\n🌱 LeadControl SaaS — Seed\n');

  // ─── 1. Tenant demo ────────────────────────────────────────
  const tenantSlug = process.env.SEED_TENANT_SLUG || 'leadcontrol-demo';

  const tenant = await prisma.tenant.upsert({
    where:  { slug: tenantSlug },
    update: {},
    create: {
      name:  process.env.SEED_TENANT_NAME || 'LeadControl Demo',
      slug:  tenantSlug,
      plan:  'GROWTH',
      email: 'geral@leadcontrol.pt',
      phone: '+351 21 000 0000',
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ─── 2. Utilizadores ───────────────────────────────────────
  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@leadcontrol.pt';
  const adminPwd   = process.env.SEED_ADMIN_PASSWORD || 'admin123';

  const admin = await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      name:     'Rafael Santana',
      email:    adminEmail,
      password: hash(adminPwd),
      role:     'ADMIN',
      phone:    '+351 912 000 001',
    },
  });

  const juliana = await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: tenant.id, email: 'juliana@leadcontrol.pt' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name:     'Juliana Costa',
      email:    'juliana@leadcontrol.pt',
      password: hash('agent123'),
      role:     'AGENT',
      phone:    '+351 913 000 002',
    },
  });

  const bruno = await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: tenant.id, email: 'bruno@leadcontrol.pt' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name:     'Bruno Almeida',
      email:    'bruno@leadcontrol.pt',
      password: hash('agent123'),
      role:     'AGENT',
      phone:    '+351 914 000 003',
    },
  });

  console.log(`✅ Utilizadores: ${admin.name}, ${juliana.name}, ${bruno.name}`);

  // ─── 3. Pipeline Stages ────────────────────────────────────
  const stagesData = [
    { name: 'Novo Lead',     color: '#00d4ff', position: 0, isDefault: true },
    { name: 'Qualificação',  color: '#7c5cfc', position: 1 },
    { name: 'Proposta',      color: '#ffb422', position: 2 },
    { name: 'Negociação',    color: '#ff3e9d', position: 3 },
    { name: 'Fechamento',    color: '#00e59b', position: 4 },
  ];

  // Limpa e re-cria stages para este tenant
  await prisma.pipelineStage.deleteMany({ where: { tenantId: tenant.id } });
  const stages = await Promise.all(
    stagesData.map(s =>
      prisma.pipelineStage.create({ data: { ...s, tenantId: tenant.id } })
    )
  );
  console.log(`✅ Pipeline: ${stages.length} etapas`);

  // ─── 4. Integrações ────────────────────────────────────────
  await prisma.integration.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.integration.createMany({
    data: [
      { tenantId: tenant.id, name: 'WhatsApp Business', type: 'whatsapp',  active: true  },
      { tenantId: tenant.id, name: 'Idealista Portugal', type: 'portal',   active: true  },
      { tenantId: tenant.id, name: 'Imovirtual',         type: 'portal',   active: false },
      { tenantId: tenant.id, name: 'Casa Sapo',          type: 'portal',   active: false },
      { tenantId: tenant.id, name: 'Google Ads',         type: 'ads',      active: true  },
      { tenantId: tenant.id, name: 'Meta / Instagram',   type: 'ads',      active: true  },
      { tenantId: tenant.id, name: 'Google Analytics',   type: 'analytics',active: false },
      { tenantId: tenant.id, name: 'Zapier',             type: 'webhook',  active: false },
    ],
  });
  console.log(`✅ Integrações: 8`);

  // ─── 5. Automações ─────────────────────────────────────────
  await prisma.automation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.automation.createMany({
    data: [
      {
        tenantId: tenant.id, createdBy: admin.id, active: true, runCount: 47,
        name: 'Boas-vindas WhatsApp',
        triggerType: 'new_lead', triggerConfig: { sources: ['all'] },
        actionType: 'whatsapp_message',
        actionConfig: { template: 'Olá {name}! Recebemos o seu contacto. Em breve um consultor entrará em contacto consigo.' },
      },
      {
        tenantId: tenant.id, createdBy: admin.id, active: true, runCount: 23,
        name: 'Follow-up 3 dias sem resposta',
        triggerType: 'no_contact', triggerConfig: { days: 3 },
        actionType: 'email',
        actionConfig: { subject: 'Ainda interessado em imóveis?', template: 'Olá {name}, temos imóveis novos que podem interessar-lhe!' },
      },
      {
        tenantId: tenant.id, createdBy: admin.id, active: true, runCount: 89,
        name: 'Match automático de imóveis',
        triggerType: 'new_property', triggerConfig: { auto_match: true },
        actionType: 'notify_matching_leads',
        actionConfig: { channel: 'email' },
      },
      {
        tenantId: tenant.id, createdBy: juliana.id, active: false, runCount: 15,
        name: 'Lembrete de visita (24h antes)',
        triggerType: 'appointment_reminder', triggerConfig: { hours_before: 24 },
        actionType: 'whatsapp_message',
        actionConfig: { template: 'Olá {name}! Lembrete da sua visita amanhã. Aguardamos a sua presença!' },
      },
      {
        tenantId: tenant.id, createdBy: admin.id, active: true, runCount: 12,
        name: 'Relatório semanal automático',
        triggerType: 'schedule', triggerConfig: { day: 'monday', time: '08:00' },
        actionType: 'email_report',
        actionConfig: { recipients: ['admin'] },
      },
      {
        tenantId: tenant.id, createdBy: admin.id, active: true, runCount: 8,
        name: 'Lead frio — reactivação 7 dias',
        triggerType: 'no_contact', triggerConfig: { days: 7, temperature: 'cold' },
        actionType: 'whatsapp_message',
        actionConfig: { template: 'Olá {name}! Continuamos a ter imóveis exclusivos em Lisboa. Posso ajudar?' },
      },
    ],
  });
  console.log(`✅ Automações: 6`);

  // ─── 6. Imóveis (Portugal real) ────────────────────────────
  await prisma.property.deleteMany({ where: { tenantId: tenant.id } });
  const propertiesData = [
    {
      title: 'Penthouse T4 Vista Rio Tejo', type: 'cobertura', purpose: 'venda',
      price: 2850000, area: 285, bedrooms: 4, bathrooms: 3, parking: 2,
      address: 'Largo das Portas do Sol', neighborhood: 'Alfama', city: 'Lisboa', state: 'Lisboa',
      description: 'Penthouse de luxo com vista panorâmica sobre o Tejo. Acabamentos premium, terraço privativo de 80m².',
      status: 'active', featured: true, agentId: admin.id,
      images: ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800'],
      amenities: ['piscina', 'ginásio', 'porteiro', 'garagem', 'ar-condicionado'],
      latitude: 38.7139, longitude: -9.1334,
    },
    {
      title: 'Apartamento T3 Chiado Renovado', type: 'apartamento', purpose: 'venda',
      price: 1250000, area: 145, bedrooms: 3, bathrooms: 2, parking: 1,
      address: 'Rua do Carmo', neighborhood: 'Chiado', city: 'Lisboa', state: 'Lisboa',
      description: 'Apartamento completamente renovado no coração do Chiado. Tectos altos, pavimento em madeira.',
      status: 'active', featured: true, agentId: juliana.id,
      images: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'],
      amenities: ['elevador', 'ar-condicionado', 'lareira'],
      latitude: 38.7101, longitude: -9.1406,
    },
    {
      title: 'Moradia V5 Cascais com Piscina', type: 'moradia', purpose: 'venda',
      price: 1890000, area: 420, bedrooms: 5, bathrooms: 4, parking: 3,
      address: 'Rua das Flores', neighborhood: 'Cascais Centro', city: 'Cascais', state: 'Lisboa',
      description: 'Moradia V5 com jardim e piscina aquecida. Próximo ao centro e praia.',
      status: 'active', featured: true, agentId: bruno.id,
      images: ['https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800'],
      amenities: ['piscina', 'jardim', 'garagem', 'barbecue', 'arrecadação'],
      latitude: 38.6979, longitude: -9.4215,
    },
    {
      title: 'Studio T0 Porto Baixa', type: 'apartamento', purpose: 'venda',
      price: 285000, area: 42, bedrooms: 0, bathrooms: 1, parking: 0,
      address: 'Rua de Santa Catarina', neighborhood: 'Baixa', city: 'Porto', state: 'Porto',
      description: 'Studio moderno na Baixa do Porto. Excelente para investimento ou residência.',
      status: 'active', featured: false, agentId: juliana.id,
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'],
      amenities: ['elevador', 'ar-condicionado'],
      latitude: 41.1495, longitude: -8.6108,
    },
    {
      title: 'Apartamento T2 Parque das Nações', type: 'apartamento', purpose: 'locacao',
      price: 2400, area: 98, bedrooms: 2, bathrooms: 2, parking: 1,
      address: 'Alameda dos Oceanos', neighborhood: 'Parque das Nações', city: 'Lisboa', state: 'Lisboa',
      description: 'T2 moderno com vista para o Tejo. Condomínio com ginásio e piscina.',
      status: 'active', featured: true, agentId: admin.id,
      images: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800'],
      amenities: ['piscina', 'ginásio', 'porteiro', 'garagem'],
      latitude: 38.7668, longitude: -9.0956,
    },
    {
      title: 'Cobertura T3 Príncipe Real', type: 'cobertura', purpose: 'locacao',
      price: 5800, area: 165, bedrooms: 3, bathrooms: 2, parking: 2,
      address: 'Rua Dom Pedro V', neighborhood: 'Príncipe Real', city: 'Lisboa', state: 'Lisboa',
      description: 'Cobertura de luxo no Príncipe Real. Terraço privativo com vista para o Castelo.',
      status: 'reserved', featured: true, agentId: juliana.id,
      images: ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800'],
      amenities: ['terraço', 'ar-condicionado', 'lareira', 'garagem'],
      latitude: 38.7150, longitude: -9.1502,
    },
    {
      title: 'Moradia T4 Sintra Serra', type: 'moradia', purpose: 'venda',
      price: 980000, area: 320, bedrooms: 4, bathrooms: 3, parking: 2,
      address: 'Estrada da Pena', neighborhood: 'São Pedro de Sintra', city: 'Sintra', state: 'Lisboa',
      description: 'Moradia de charme na Serra de Sintra. Rodeada de natureza, a 30min de Lisboa.',
      status: 'active', featured: false, agentId: bruno.id,
      images: ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800'],
      amenities: ['jardim', 'lareira', 'garagem', 'arrecadação'],
      latitude: 38.7978, longitude: -9.3880,
    },
    {
      title: 'Apartamento T1 Bairro Alto', type: 'apartamento', purpose: 'locacao',
      price: 1650, area: 55, bedrooms: 1, bathrooms: 1, parking: 0,
      address: 'Rua do Diário de Notícias', neighborhood: 'Bairro Alto', city: 'Lisboa', state: 'Lisboa',
      description: 'T1 renovado no Bairro Alto. Totalmente mobilado e equipado. Disponível de imediato.',
      status: 'active', featured: false, agentId: admin.id,
      images: ['https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800'],
      amenities: ['mobilado', 'ar-condicionado', 'elevador'],
      latitude: 38.7126, longitude: -9.1459,
    },
  ];

  const properties = await Promise.all(
    propertiesData.map(p => prisma.property.create({ data: { ...p, tenantId: tenant.id } }))
  );
  console.log(`✅ Imóveis: ${properties.length}`);

  // ─── 7. Leads (Clientes Portugal) ──────────────────────────
  await prisma.lead.deleteMany({ where: { tenantId: tenant.id } });
  const leadsData = [
    {
      name: 'Carlos Mendes', email: 'carlos.mendes@email.pt', phone: '+351 912 345 678',
      source: 'idealista', status: 'contacted', temperature: 'hot', score: 92,
      interest: 'T3 Lisboa €900k-€1.4M', budgetMin: 900000, budgetMax: 1400000,
      notes: 'Muito interessado no Chiado. Pretende fechar em 3 meses. Comprador cash.',
      agentId: admin.id,
    },
    {
      name: 'Ana Lima', email: 'ana.lima@empresa.pt', phone: '+351 913 456 789',
      source: 'instagram', status: 'qualified', temperature: 'hot', score: 85,
      interest: 'Moradia Cascais €1.5M-€2.2M', budgetMin: 1500000, budgetMax: 2200000,
      notes: 'Empresária, procura moradia para família. Viu 3 propriedades. Muito exigente.',
      agentId: juliana.id,
    },
    {
      name: 'Pedro Rocha', email: 'pedro.rocha@gmail.com', phone: '+351 914 567 890',
      source: 'indicacao', status: 'contacted', temperature: 'warm', score: 60,
      interest: 'Investimento €500k-€1.2M', budgetMin: 500000, budgetMax: 1200000,
      notes: 'Investidor imobiliário. Procura imóveis com rendimento acima de 5%.',
      agentId: admin.id,
    },
    {
      name: 'Marina Fernandes', email: 'marina.f@hotmail.com', phone: '+351 915 678 901',
      source: 'google_ads', status: 'new', temperature: 'cold', score: 45,
      interest: 'Studio/T1 €200k-€320k', budgetMin: 200000, budgetMax: 320000,
      notes: 'Primeira casa. Precisa de financiamento. Contacto inicial via formulário.',
      agentId: juliana.id,
    },
    {
      name: 'João Batista', email: 'joao.batista@corp.pt', phone: '+351 916 789 012',
      source: 'indicacao', status: 'won', temperature: 'hot', score: 100,
      interest: 'Escritório Chiado', budgetMin: 5000, budgetMax: 8000,
      notes: 'NEGÓCIO FECHADO — Escritório no Chiado por €6.500/mês. Contrato 3 anos.',
      agentId: admin.id,
    },
    {
      name: 'Sofia Castro', email: 'sofia.castro@gmail.com', phone: '+351 917 890 123',
      source: 'casa_sapo', status: 'contacted', temperature: 'warm', score: 55,
      interest: 'T2 Porto €350k-€650k', budgetMin: 350000, budgetMax: 650000,
      notes: 'Trabalha no Porto, quer comprar. Prefere Baixa ou Bonfim.',
      agentId: bruno.id,
    },
    {
      name: 'Rodrigo Alves', email: 'rodrigo.alves@private.pt', phone: '+351 918 901 234',
      source: 'indicacao', status: 'qualified', temperature: 'hot', score: 98,
      interest: 'Penthouse Lisboa €2M-€4M', budgetMin: 2000000, budgetMax: 4000000,
      notes: 'Cliente VIP. Procura penthouse de luxo. Budget ilimitado na prática.',
      agentId: admin.id,
    },
  ];

  const leads = await Promise.all(
    leadsData.map(l =>
      prisma.lead.create({
        data: {
          ...l,
          tenantId: tenant.id,
          lastContact: new Date(),
        },
      })
    )
  );
  console.log(`✅ Leads: ${leads.length}`);

  // ─── 8. Deals no Pipeline ──────────────────────────────────
  await prisma.deal.deleteMany({ where: { tenantId: tenant.id } });
  const dealsData = [
    { title: 'Penthouse Alfama — Carlos Mendes',    leadId: leads[0].id, propertyId: properties[0].id, stageId: stages[2].id, value: 2850000, agentId: admin.id },
    { title: 'Moradia Cascais — Ana Lima',          leadId: leads[1].id, propertyId: properties[2].id, stageId: stages[3].id, value: 1890000, agentId: juliana.id },
    { title: 'Investimento Porto — Pedro Rocha',   leadId: leads[2].id, propertyId: properties[3].id, stageId: stages[1].id, value: 285000,  agentId: admin.id },
    { title: 'T1 Bairro Alto — Marina Fernandes',  leadId: leads[3].id, propertyId: properties[7].id, stageId: stages[0].id, value: 1650,    agentId: juliana.id },
    { title: 'Escritório Chiado — João Batista',   leadId: leads[4].id, stageId: stages[4].id, value: 78000, agentId: admin.id, status: 'won' },
    { title: 'T2 Porto — Sofia Castro',            leadId: leads[5].id, stageId: stages[1].id, value: 480000, agentId: bruno.id },
    { title: 'Penthouse Luxo — Rodrigo Alves',     leadId: leads[6].id, propertyId: properties[0].id, stageId: stages[3].id, value: 2850000, agentId: admin.id },
  ];

  await prisma.deal.createMany({
    data: dealsData.map(d => ({ ...d, tenantId: tenant.id, status: d.status || 'open' })),
  });
  console.log(`✅ Deals: ${dealsData.length}`);

  // ─── 9. Actividades iniciais ───────────────────────────────
  await prisma.activity.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.activity.createMany({
    data: [
      { tenantId: tenant.id, userId: admin.id,   leadId: leads[0].id, type: 'lead_created',      description: 'Lead "Carlos Mendes" adicionado via idealista' },
      { tenantId: tenant.id, userId: juliana.id,  leadId: leads[1].id, type: 'contact',           description: 'Visita realizada à Moradia Cascais' },
      { tenantId: tenant.id, userId: admin.id,   leadId: leads[4].id, type: 'deal_won',          description: 'Negócio fechado — Escritório Chiado €6.500/mês' },
      { tenantId: tenant.id, userId: bruno.id,    leadId: leads[5].id, type: 'lead_created',      description: 'Lead "Sofia Castro" via Casa Sapo' },
      { tenantId: tenant.id, userId: admin.id,   leadId: leads[6].id, type: 'stage_changed',     description: 'Rodrigo Alves movido para Negociação' },
      { tenantId: tenant.id, userId: juliana.id,  leadId: leads[3].id, type: 'appointment_created', description: 'Visita agendada T1 Bairro Alto' },
    ],
  });
  console.log(`✅ Actividades: 6`);

  // ─── 10. Notificações ──────────────────────────────────────
  await prisma.notification.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.notification.createMany({
    data: [
      { tenantId: tenant.id, userId: admin.id, type: 'deal', title: '🎉 Negócio Fechado!', message: 'Escritório Chiado por €6.500/mês', link: '/pipeline', read: false },
      { tenantId: tenant.id, userId: admin.id, type: 'lead', title: 'Novo Lead VIP', message: 'Rodrigo Alves — budget €2M-€4M', link: '/leads', read: false },
      { tenantId: tenant.id, userId: admin.id, type: 'lead', title: 'Lead Quente', message: 'Carlos Mendes quer fechar em 3 meses', link: '/leads', read: true },
      { tenantId: tenant.id, userId: juliana.id, type: 'appointment', title: 'Visita Amanhã', message: 'Ana Lima — Moradia Cascais 10:00', link: '/agenda', read: false },
    ],
  });
  console.log(`✅ Notificações: 4`);

  // ─── Sumário ────────────────────────────────────────────────
  console.log(`
╔════════════════════════════════════════╗
║   🌱 Seed concluído com sucesso!       ║
╠════════════════════════════════════════╣
║  Tenant : ${tenant.name.padEnd(28)} ║
║  Slug   : ${tenant.slug.padEnd(28)} ║
╠════════════════════════════════════════╣
║  Login  : ${adminEmail.padEnd(28)} ║
║  Password: ${adminPwd.padEnd(27)} ║
╚════════════════════════════════════════╝
  `);
}

main()
  .catch(e => { console.error('❌ Seed falhou:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
