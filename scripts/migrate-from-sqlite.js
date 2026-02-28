#!/usr/bin/env node
// scripts/migrate-from-sqlite.js
// ══════════════════════════════════════════════════════════════════
// Migração one-shot: SQLite (leadcontrol-beta) → PostgreSQL (SaaS)
// Uso:
//   node scripts/migrate-from-sqlite.js --sqlite ../leadcontrol-beta/database/leadcontrol.db
//   node scripts/migrate-from-sqlite.js --sqlite ../leadcontrol-beta/database/leadcontrol.db --tenant-name "Minha Imobiliária"
// ══════════════════════════════════════════════════════════════════
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// SQLite dependency (só é necessária neste script)
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  console.error('❌ Instale better-sqlite3 para executar a migração:');
  console.error('   npm install better-sqlite3 --save-dev');
  process.exit(1);
}

const args = process.argv.slice(2);
const sqlitePath = args[args.indexOf('--sqlite') + 1] || '../leadcontrol-beta/database/leadcontrol.db';
const tenantName = args[args.indexOf('--tenant-name') + 1] || 'Importado do SQLite';

const prisma = new PrismaClient();

async function migrate() {
  console.log('\n🔄 LeadControl — Migração SQLite → PostgreSQL\n');
  console.log(`📂 SQLite: ${sqlitePath}`);
  console.log(`🏢 Tenant: ${tenantName}\n`);

  // ── Abrir SQLite ─────────────────────────────────────────────
  let sqlite;
  try {
    sqlite = new Database(sqlitePath, { readonly: true });
  } catch (e) {
    console.error('❌ Não foi possível abrir o ficheiro SQLite:', e.message);
    process.exit(1);
  }

  // ── Helpers ───────────────────────────────────────────────────
  const safeAll = (sql) => { try { return sqlite.prepare(sql).all(); } catch { return []; } };
  const idMap   = {}; // { 'users': { oldId: newId }, ... }
  const map     = (model, old) => idMap[model]?.[old] ?? null;

  // ── 1. Criar Tenant ───────────────────────────────────────────
  const slug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)
    + '-' + Date.now().toString(36);

  const tenant = await prisma.tenant.create({
    data: { name: tenantName, slug, plan: 'STARTER' },
  });
  console.log(`✅ Tenant criado: ${tenant.id}`);

  // ── 2. Utilizadores ───────────────────────────────────────────
  idMap.users = {};
  const sqliteUsers = safeAll('SELECT * FROM users WHERE active = 1');
  for (const u of sqliteUsers) {
    const roleMap = { admin: 'ADMIN', manager: 'MANAGER', agent: 'AGENT' };
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name:     u.name,
        email:    u.email,
        password: u.password, // já está em bcrypt no SQLite
        role:     roleMap[u.role] || 'AGENT',
        phone:    u.phone || null,
        active:   Boolean(u.active),
      },
    });
    idMap.users[u.id] = user.id;
  }
  console.log(`✅ Utilizadores: ${sqliteUsers.length}`);

  // ── 3. Pipeline Stages ────────────────────────────────────────
  idMap.pipeline_stages = {};
  const sqliteStages = safeAll('SELECT * FROM pipeline_stages ORDER BY position');
  if (sqliteStages.length === 0) {
    // Criar stages padrão se não existirem no SQLite
    const defaults = [
      { name: 'Novo Lead', color: '#00d4ff', position: 0 },
      { name: 'Qualificação', color: '#7c5cfc', position: 1 },
      { name: 'Proposta', color: '#ffb422', position: 2 },
      { name: 'Negociação', color: '#ff3e9d', position: 3 },
      { name: 'Fechamento', color: '#00e59b', position: 4 },
    ];
    for (const s of defaults) {
      const stage = await prisma.pipelineStage.create({ data: { ...s, tenantId: tenant.id } });
      // Mapear pelo position para associar deals
      idMap.pipeline_stages[s.position] = stage.id;
    }
  } else {
    for (const s of sqliteStages) {
      const stage = await prisma.pipelineStage.create({
        data: { tenantId: tenant.id, name: s.name, color: s.color || '#4a9eff', position: s.position, isDefault: Boolean(s.is_default) },
      });
      idMap.pipeline_stages[s.id] = stage.id;
    }
  }
  console.log(`✅ Pipeline stages: ${Object.keys(idMap.pipeline_stages).length}`);

  // ── 4. Imóveis ────────────────────────────────────────────────
  idMap.properties = {};
  const sqliteProps = safeAll('SELECT * FROM properties');
  for (const p of sqliteProps) {
    let images = [], amenities = [];
    try { images    = JSON.parse(p.images    || '[]'); } catch {}
    try { amenities = JSON.parse(p.amenities || '[]'); } catch {}

    const prop = await prisma.property.create({
      data: {
        tenantId:    tenant.id,
        agentId:     map('users', p.agent_id),
        title:       p.title,
        type:        p.type,
        purpose:     p.purpose,
        price:       parseFloat(p.price) || 0,
        area:        p.area ? parseFloat(p.area) : null,
        bedrooms:    parseInt(p.bedrooms) || 0,
        bathrooms:   parseInt(p.bathrooms) || 0,
        parking:     parseInt(p.parking) || 0,
        address:     p.address || '',
        neighborhood: p.neighborhood || '',
        city:        p.city || '',
        state:       p.state || '',
        description: p.description || '',
        status:      p.status || 'active',
        featured:    Boolean(p.featured),
        images,
        amenities,
        latitude:    p.latitude  ? parseFloat(p.latitude)  : null,
        longitude:   p.longitude ? parseFloat(p.longitude) : null,
      },
    });
    idMap.properties[p.id] = prop.id;
  }
  console.log(`✅ Imóveis: ${sqliteProps.length}`);

  // ── 5. Leads ──────────────────────────────────────────────────
  idMap.leads = {};
  const sqliteLeads = safeAll('SELECT * FROM leads');
  for (const l of sqliteLeads) {
    const lead = await prisma.lead.create({
      data: {
        tenantId:    tenant.id,
        agentId:     map('users', l.agent_id),
        name:        l.name,
        email:       l.email || null,
        phone:       l.phone || null,
        source:      l.source || 'manual',
        status:      l.status || 'new',
        temperature: l.temperature || 'cold',
        interest:    l.interest || null,
        budgetMin:   l.budget_min ? parseFloat(l.budget_min) : null,
        budgetMax:   l.budget_max ? parseFloat(l.budget_max) : null,
        notes:       l.notes || null,
        score:       parseInt(l.score) || 0,
        lastContact: l.last_contact ? new Date(l.last_contact) : null,
      },
    });
    idMap.leads[l.id] = lead.id;
  }
  console.log(`✅ Leads: ${sqliteLeads.length}`);

  // ── 6. Deals ──────────────────────────────────────────────────
  idMap.deals = {};
  const sqliteDeals = safeAll('SELECT * FROM deals');
  for (const d of sqliteDeals) {
    const deal = await prisma.deal.create({
      data: {
        tenantId:      tenant.id,
        agentId:       map('users', d.agent_id),
        leadId:        map('leads', d.lead_id),
        propertyId:    map('properties', d.property_id),
        stageId:       map('pipeline_stages', d.stage_id),
        title:         d.title,
        value:         d.value ? parseFloat(d.value) : null,
        notes:         d.notes || null,
        expectedClose: d.expected_close ? new Date(d.expected_close) : null,
        closedAt:      d.closed_at ? new Date(d.closed_at) : null,
        status:        d.status || 'open',
      },
    });
    idMap.deals[d.id] = deal.id;
  }
  console.log(`✅ Deals: ${sqliteDeals.length}`);

  // ── 7. Appointments ───────────────────────────────────────────
  const sqliteAppts = safeAll('SELECT * FROM appointments');
  for (const a of sqliteAppts) {
    await prisma.appointment.create({
      data: {
        tenantId:   tenant.id,
        agentId:    map('users', a.agent_id),
        leadId:     map('leads', a.lead_id),
        propertyId: map('properties', a.property_id),
        title:      a.title,
        type:       a.type || 'visit',
        date:       new Date(a.date),
        duration:   parseInt(a.duration) || 60,
        status:     a.status || 'scheduled',
        notes:      a.notes || null,
      },
    });
  }
  console.log(`✅ Agendamentos: ${sqliteAppts.length}`);

  // ── 8. Tasks ──────────────────────────────────────────────────
  const sqliteTasks = safeAll('SELECT * FROM tasks');
  for (const t of sqliteTasks) {
    await prisma.task.create({
      data: {
        tenantId:   tenant.id,
        assignedTo: map('users', t.assigned_to),
        createdBy:  map('users', t.created_by),
        leadId:     map('leads', t.lead_id),
        propertyId: map('properties', t.property_id),
        dealId:     map('deals', t.deal_id),
        title:      t.title,
        description: t.description || null,
        dueDate:    t.due_date ? new Date(t.due_date) : null,
        priority:   t.priority || 'medium',
        status:     t.status   || 'pending',
      },
    });
  }
  console.log(`✅ Tarefas: ${sqliteTasks.length}`);

  // ── 9. Integrações ────────────────────────────────────────────
  await prisma.integration.createMany({
    data: [
      { tenantId: tenant.id, name: 'WhatsApp Business', type: 'whatsapp',  active: false },
      { tenantId: tenant.id, name: 'Idealista Portugal', type: 'portal',   active: false },
      { tenantId: tenant.id, name: 'Imovirtual',         type: 'portal',   active: false },
      { tenantId: tenant.id, name: 'Casa Sapo',          type: 'portal',   active: false },
      { tenantId: tenant.id, name: 'Google Ads',         type: 'ads',      active: false },
      { tenantId: tenant.id, name: 'Meta / Instagram',   type: 'ads',      active: false },
    ],
  });
  console.log(`✅ Integrações: 6 (padrão)`);

  // ── Sumário ───────────────────────────────────────────────────
  sqlite.close();

  const counts = await Promise.all([
    prisma.user.count({ where: { tenantId: tenant.id } }),
    prisma.property.count({ where: { tenantId: tenant.id } }),
    prisma.lead.count({ where: { tenantId: tenant.id } }),
    prisma.deal.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log(`
╔══════════════════════════════════════════╗
║   ✅ Migração concluída!                  ║
╠══════════════════════════════════════════╣
║  Tenant ID : ${tenant.id.slice(0, 25).padEnd(25)} ║
║  Users     : ${String(counts[0]).padEnd(25)} ║
║  Properties: ${String(counts[1]).padEnd(25)} ║
║  Leads     : ${String(counts[2]).padEnd(25)} ║
║  Deals     : ${String(counts[3]).padEnd(25)} ║
╚══════════════════════════════════════════╝

  ⚠️  Guarde o Tenant ID — vai precisar dele.
  `);
}

migrate()
  .catch(e => { console.error('❌ Migração falhou:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
