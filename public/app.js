// LeadControl — Frontend App
const API = '';
let currentUser = null;
let token = localStorage.getItem('lc_token');

// ─── AUTH ───────────────────────────────────────────────────
async function checkAuth() {
  if (!token) return window.location.href = '/login.html';
  try {
    const r = await apiFetch('/api/auth/me');
    currentUser = r;
    document.getElementById('agentName').textContent = currentUser.name;
    document.getElementById('agentRole').textContent = currentUser.role === 'admin' ? 'Administrador' : 'Corretor';
    const initials = currentUser.name.split(' ').map(n=>n[0]).slice(0,2).join('');
    document.getElementById('agentInitials').textContent = initials;
  } catch { 
    localStorage.removeItem('lc_token');
    window.location.href = '/login.html'; 
  }
}

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  localStorage.removeItem('lc_token');
  localStorage.removeItem('lc_user');
  window.location.href = '/login.html';
}

// ─── API HELPER ─────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const r = await fetch(url, { ...options, headers, credentials: 'include' });
  if (r.status === 401) { localStorage.removeItem('lc_token'); window.location.href = '/login.html'; return; }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

// ─── NAVIGATION ─────────────────────────────────────────────
const pages = {
  dashboard: loadDashboard,
  imoveis: loadImoveis,
  leads: loadLeads,
  pipeline: loadPipeline,
  agenda: loadAgenda,
  relatorios: loadRelatorios,
};

let currentPage = 'dashboard';

function navigate(page, navEl) {
  currentPage = page;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = document.getElementById('view-' + page);
  if (view) view.classList.add('active');
  if (navEl) navEl.classList.add('active');
  const titles = { dashboard:['Dashboard','Visão geral do negócio'], imoveis:['Imóveis','Portfólio de imóveis'], leads:['Leads & Clientes','Gestão de relacionamento'], pipeline:['Pipeline','Kanban de negociações'], agenda:['Agenda','Visitas e compromissos'], relatorios:['Relatórios','Analytics e performance'] };
  const t = titles[page] || ['',''];
  document.getElementById('pageTitle').textContent = t[0];
  document.getElementById('pageSubtitle').textContent = t[1];
  if (pages[page]) pages[page]();
}

// ─── TOAST ─────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastIcon').textContent = icons[type] || '✅';
  t.style.display = 'flex'; t.className = 'toast show';
  setTimeout(() => t.style.display = 'none', 3500);
}

// ─── MODAL ─────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ─── DASHBOARD ──────────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await apiFetch('/api/dashboard/stats');
    
    // KPIs
    const vgvTrend = data.vgvLast > 0 ? (((data.vgv - data.vgvLast) / data.vgvLast) * 100).toFixed(0) : 0;
    document.getElementById('kpi-vgv').textContent = formatMoney(data.vgv);
    document.getElementById('kpi-vgv-trend').textContent = `${vgvTrend >= 0 ? '▲' : '▼'} ${Math.abs(vgvTrend)}%`;
    document.getElementById('kpi-vgv-trend').className = 'kpi-trend ' + (vgvTrend >= 0 ? 'up' : 'down');
    document.getElementById('kpi-leads').textContent = data.activeLeads;
    document.getElementById('kpi-properties').textContent = data.totalProperties;
    document.getElementById('kpi-visits').textContent = data.visits;
    document.getElementById('kpi-tasks').textContent = data.pendingTasks;

    // Top Properties
    const propList = document.getElementById('dash-properties');
    if (propList) propList.innerHTML = data.topProperties.map(p => `
      <div class="property-card" onclick="navigate('imoveis',null)">
        <img class="prop-image" src="${p.images[0] || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=200&q=60'}" alt="" onerror="this.src='https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=200&q=60'">
        <div class="prop-info">
          <div class="prop-title">${p.title}</div>
          <div class="prop-address"><i class="fas fa-map-marker-alt" style="color:var(--gold);font-size:10px;"></i> ${p.neighborhood}, ${p.city}</div>
          <div class="prop-tags">
            <span class="tag ${p.purpose === 'venda' ? 'sell' : 'rent'}">${p.purpose === 'venda' ? 'Venda' : 'Locação'}</span>
            <span class="tag type">${capitalize(p.type)}</span>
          </div>
        </div>
        <div class="prop-right">
          <div>
            <div class="prop-price">${p.purpose === 'locacao' ? formatMoney(p.price)+'/mês' : formatMoney(p.price)}</div>
            <div class="prop-price-label">Preço</div>
          </div>
          <div class="prop-stats">
            <div class="prop-stat"><i class="fas fa-bed"></i> ${p.bedrooms}</div>
            <div class="prop-stat"><i class="fas fa-expand-arrows-alt"></i> ${p.area}m²</div>
            <div class="prop-stat"><i class="fas fa-car"></i> ${p.parking}</div>
          </div>
        </div>
      </div>`).join('');

    // Hot Leads
    const leadList = document.getElementById('dash-leads');
    if (leadList) leadList.innerHTML = data.hotLeads.map(l => `
      <div class="lead-item" onclick="navigate('leads',null)">
        <div class="lead-avatar" style="background:${l.temperature==='hot'?'linear-gradient(135deg,#e05c5c,#f5935a)':l.temperature==='warm'?'linear-gradient(135deg,#f5935a,#f5c842)':'linear-gradient(135deg,#4a9eff,#9b7fe8)'}">
          ${l.name.split(' ').map(n=>n[0]).slice(0,2).join('')}
        </div>
        <div class="lead-info">
          <div class="lead-name">${l.name}</div>
          <div class="lead-meta">${l.interest || 'Sem interesse definido'} — até ${formatMoney(l.budget_max || 0)}</div>
        </div>
        <span class="lead-status ${l.temperature}">${l.temperature === 'hot' ? '🔥 Quente' : l.temperature === 'warm' ? '🌡️ Morno' : '❄️ Frio'}</span>
      </div>`).join('');

    // Pipeline summary
    const pipelineEl = document.getElementById('dash-pipeline');
    if (pipelineEl) pipelineEl.innerHTML = data.pipeline.map(s => `
      <div class="pipeline-stage">
        <div class="stage-dot" style="background:${s.color}"></div>
        <div class="stage-info">
          <div class="stage-name">${s.name}</div>
          <div class="stage-bar"><div class="stage-fill" style="width:${Math.min(s.count*20,100)}%;background:${s.color}"></div></div>
        </div>
        <div class="stage-value" style="color:${s.color}">${s.count}</div>
      </div>`).join('');

    // Activities
    const actEl = document.getElementById('dash-activities');
    if (actEl) actEl.innerHTML = data.activities.map(a => `
      <div class="activity-item">
        <div class="activity-dot ${activityColor(a.type)}"></div>
        <div class="activity-content">
          <div class="activity-text">${a.description}</div>
          <div class="activity-time">${timeAgo(a.created_at)}</div>
        </div>
      </div>`).join('');

    // Monthly chart
    renderMonthlyChart(data.monthlyChart);
    
    // Notifications
    loadNotifications();

  } catch(e) { toast('Erro ao carregar dashboard: ' + e.message, 'error'); }
}

function renderMonthlyChart(months) {
  const el = document.getElementById('monthlyChart');
  if (!el) return;
  const max = Math.max(...months.map(m => m.value), 1);
  el.innerHTML = months.map(m => `
    <div class="bar-wrap">
      <div class="bar" style="height:${(m.value/max*100)||5}%;background:${m === months[months.length-1] ? 'linear-gradient(180deg,var(--gold),rgba(201,168,76,0.3))' : 'linear-gradient(180deg,var(--blue),rgba(74,158,255,0.3))'};" title="${formatMoney(m.value)}"></div>
      <div class="bar-label">${m.month}</div>
    </div>`).join('');
}

// ─── IMÓVEIS ────────────────────────────────────────────────
async function loadImoveis(page = 1, filters = {}) {
  const el = document.getElementById('imoveis-grid');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2)">Carregando imóveis...</div>';
  try {
    const params = new URLSearchParams({ page, limit: 12, ...filters });
    const data = await apiFetch('/api/properties?' + params);
    el.innerHTML = data.properties.length ? data.properties.map(p => propCard(p)).join('') : '<div style="text-align:center;padding:40px;color:var(--text2)">Nenhum imóvel encontrado</div>';
  } catch(e) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red)">Erro ao carregar imóveis</div>'; }
}

function propCard(p) {
  const img = p.images && p.images[0] ? p.images[0] : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=500&q=80';
  const price = p.purpose === 'locacao' ? formatMoney(p.price) + '/mês' : formatMoney(p.price);
  const statusClass = p.status === 'reserved' ? 'reserved' : p.purpose === 'locacao' ? 'rent' : 'sell';
  const statusLabel = p.status === 'reserved' ? 'Reservado' : p.purpose === 'locacao' ? 'Locação' : 'Venda';
  return `<div class="imovel-card">
    <div class="imovel-img">
      <img src="${img}" alt="${p.title}" onerror="this.src='https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=500&q=80'">
      <div class="imovel-badges"><span class="tag ${statusClass}">${statusLabel}</span>${p.featured?'<span class="tag launch">Destaque</span>':''}</div>
      <div class="imovel-fav" onclick="event.stopPropagation();this.classList.toggle('active')"><i class="fas fa-heart"></i></div>
    </div>
    <div class="imovel-body">
      <div class="imovel-title">${p.title}</div>
      <div class="imovel-location"><i class="fas fa-map-marker-alt"></i> ${p.neighborhood || ''}, ${p.city || ''}</div>
      <div class="imovel-specs">
        <div class="spec"><i class="fas fa-expand-arrows-alt"></i> ${p.area || '?'}m²</div>
        <div class="spec"><i class="fas fa-bed"></i> ${p.bedrooms || 0} q</div>
        <div class="spec"><i class="fas fa-car"></i> ${p.parking || 0} vg</div>
        <div class="spec"><i class="fas fa-bath"></i> ${p.bathrooms || 0} bh</div>
      </div>
      <div class="imovel-footer">
        <div><div class="imovel-price">${price}</div><div class="imovel-price-label">por ${p.agent_name || 'Corretor'}</div></div>
        <button class="btn btn-primary" style="padding:7px 14px;font-size:12px;" onclick="showPropertyDetail(${p.id})">Ver mais</button>
      </div>
    </div>
  </div>`;
}

async function showPropertyDetail(id) {
  try {
    const p = await apiFetch('/api/properties/' + id);
    const img = p.images && p.images[0] ? p.images[0] : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80';
    document.getElementById('propDetailContent').innerHTML = `
      <img src="${img}" style="width:100%;height:240px;object-fit:cover;border-radius:12px;margin-bottom:16px;" onerror="this.src='https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80'">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div><div style="font-size:11px;color:var(--text2)">Tipo</div><div style="font-weight:600">${capitalize(p.type)}</div></div>
        <div><div style="font-size:11px;color:var(--text2)">Finalidade</div><div style="font-weight:600">${p.purpose === 'venda' ? 'Venda' : 'Locação'}</div></div>
        <div><div style="font-size:11px;color:var(--text2)">Preço</div><div style="font-weight:700;color:var(--gold2);font-size:18px;">${formatMoney(p.price)}${p.purpose==='locacao'?'/mês':''}</div></div>
        <div><div style="font-size:11px;color:var(--text2)">Área</div><div style="font-weight:600">${p.area || '?'} m²</div></div>
        <div><div style="font-size:11px;color:var(--text2)">Quartos</div><div style="font-weight:600">${p.bedrooms}</div></div>
        <div><div style="font-size:11px;color:var(--text2)">Vagas</div><div style="font-weight:600">${p.parking}</div></div>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Endereço</div>
      <div style="font-size:13px;margin-bottom:12px;">${p.address || ''}, ${p.neighborhood || ''} — ${p.city || ''}/${p.state || ''}</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Descrição</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6;">${p.description || 'Sem descrição.'}</div>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
        <div style="font-size:11px;color:var(--text2);margin-bottom:4px">Corretor Responsável</div>
        <div style="font-size:13px;font-weight:600;">${p.agent_name || 'Não definido'}</div>
      </div>`;
    openModal('propDetailModal');
  } catch(e) { toast('Erro ao carregar imóvel', 'error'); }
}

async function saveProperty() {
  const form = {
    title: document.getElementById('propTitle').value,
    type: document.getElementById('propType').value,
    purpose: document.getElementById('propPurpose').value,
    price: parseFloat(document.getElementById('propPrice').value.replace(/\D/g,'')),
    area: parseFloat(document.getElementById('propArea').value) || null,
    bedrooms: parseInt(document.getElementById('propBedrooms').value) || 0,
    bathrooms: parseInt(document.getElementById('propBathrooms').value) || 0,
    parking: parseInt(document.getElementById('propParking').value) || 0,
    neighborhood: document.getElementById('propNeighborhood').value,
    city: document.getElementById('propCity').value,
    state: document.getElementById('propState').value,
    description: document.getElementById('propDesc').value,
    images: [document.getElementById('propImageUrl').value].filter(Boolean),
    featured: document.getElementById('propFeatured').checked,
  };
  if (!form.title || !form.price) return toast('Preencha título e preço', 'warning');
  try {
    await apiFetch('/api/properties', { method: 'POST', body: JSON.stringify(form) });
    toast('Imóvel cadastrado com sucesso!');
    closeModal('novoImovelModal');
    loadImoveis();
  } catch(e) { toast('Erro: ' + e.message, 'error'); }
}

// ─── LEADS ──────────────────────────────────────────────────
async function loadLeads(filters = {}) {
  const el = document.getElementById('leads-tbody');
  if (!el) return;
  el.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text2)">Carregando...</td></tr>';
  try {
    const params = new URLSearchParams({ limit: 50, ...filters });
    const data = await apiFetch('/api/leads?' + params);
    el.innerHTML = data.leads.map(l => leadRow(l)).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text2)">Nenhum lead encontrado</td></tr>';
  } catch(e) { el.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red)">Erro ao carregar</td></tr>'; }
}

function leadRow(l) {
  const initials = l.name.split(' ').map(n=>n[0]).slice(0,2).join('');
  const gradients = {hot:'linear-gradient(135deg,#e05c5c,#f5935a)', warm:'linear-gradient(135deg,#f5935a,#f5c842)', cold:'linear-gradient(135deg,#4a9eff,#9b7fe8)'};
  const statusLabels = {hot:'🔥 Quente', warm:'🌡️ Morno', cold:'❄️ Frio', won:'✅ Fechado'};
  const tempDisplay = l.status === 'won' ? 'closed' : l.temperature;
  return `<tr>
    <td><div class="td-user">
      <div class="lead-avatar" style="width:36px;height:36px;background:${gradients[l.temperature]||'linear-gradient(135deg,#4a9eff,#9b7fe8)'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
      <div><div class="td-name">${l.name}</div><div class="td-email">${l.email||'—'}</div></div>
    </div></td>
    <td><span style="font-size:12px;">${l.interest||'—'}</span></td>
    <td><span class="tag type" style="font-size:11px;">${l.source||'—'}</span></td>
    <td><div style="display:flex;align-items:center;gap:8px;">
      <div class="score-bar"><div class="score-fill" style="width:${l.score}%;background:${l.score>80?'var(--green)':l.score>50?'var(--orange)':'var(--blue)'}"></div></div>
      <span style="font-size:12px;font-weight:600;color:${l.score>80?'var(--green)':l.score>50?'var(--orange)':'var(--blue)'}">${l.score}</span>
    </div></td>
    <td><span class="lead-status ${tempDisplay}">${statusLabels[l.status==='won'?'won':l.temperature]||'—'}</span></td>
    <td><span style="font-size:12px;color:var(--text2)">${l.last_contact ? timeAgo(l.last_contact) : 'Nunca'}</span></td>
    <td><div class="action-btns">
      ${l.phone ? `<div class="action-btn whatsapp" title="WhatsApp" onclick="openWhatsApp('${l.phone}','${l.name}')"><i class="fab fa-whatsapp"></i></div>` : ''}
      ${l.email ? `<div class="action-btn email" title="E-mail" onclick="window.open('mailto:${l.email}')"><i class="fas fa-envelope"></i></div>` : ''}
      ${l.phone ? `<div class="action-btn call" title="Ligar" onclick="window.open('tel:${l.phone}')"><i class="fas fa-phone"></i></div>` : ''}
      <div class="action-btn" title="Editar" onclick="editLead(${l.id})"><i class="fas fa-edit"></i></div>
      <div class="action-btn" title="Excluir" onclick="deleteLead(${l.id},'${l.name}')"><i class="fas fa-trash" style="color:var(--red)"></i></div>
    </div></td>
  </tr>`;
}

async function saveLead() {
  const form = {
    name: document.getElementById('leadName').value,
    email: document.getElementById('leadEmail').value,
    phone: document.getElementById('leadPhone').value,
    source: document.getElementById('leadSource').value,
    temperature: document.getElementById('leadTemp').value,
    interest: document.getElementById('leadInterest').value,
    budget_max: parseFloat(document.getElementById('leadBudget').value) || null,
    notes: document.getElementById('leadNotes').value,
  };
  if (!form.name) return toast('Nome obrigatório', 'warning');
  try {
    const editId = document.getElementById('leadEditId').value;
    if (editId) {
      await apiFetch('/api/leads/' + editId, { method: 'PUT', body: JSON.stringify(form) });
      toast('Lead atualizado com sucesso!');
    } else {
      await apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(form) });
      toast('Lead adicionado com sucesso!');
    }
    closeModal('novoLeadModal');
    loadLeads();
  } catch(e) { toast('Erro: ' + e.message, 'error'); }
}

async function editLead(id) {
  try {
    const l = await apiFetch('/api/leads/' + id);
    document.getElementById('leadEditId').value = id;
    document.getElementById('leadName').value = l.name || '';
    document.getElementById('leadEmail').value = l.email || '';
    document.getElementById('leadPhone').value = l.phone || '';
    document.getElementById('leadSource').value = l.source || 'manual';
    document.getElementById('leadTemp').value = l.temperature || 'cold';
    document.getElementById('leadInterest').value = l.interest || '';
    document.getElementById('leadBudget').value = l.budget_max || '';
    document.getElementById('leadNotes').value = l.notes || '';
    document.getElementById('leadModalTitle').textContent = 'Editar Lead';
    openModal('novoLeadModal');
  } catch(e) { toast('Erro ao carregar lead', 'error'); }
}

async function deleteLead(id, name) {
  if (!confirm(`Remover lead "${name}"?`)) return;
  try {
    await apiFetch('/api/leads/' + id, { method: 'DELETE' });
    toast('Lead removido');
    loadLeads();
  } catch(e) { toast('Erro: ' + e.message, 'error'); }
}

function openWhatsApp(phone, name) {
  const num = phone.replace(/\D/g,'');
  const msg = encodeURIComponent(`Olá ${name}, tudo bem? Sou da LeadControl Imobiliária e entro em contato referente ao seu interesse em imóveis. Posso ajudá-lo?`);
  window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
}

function openLeadModal() {
  document.getElementById('leadEditId').value = '';
  document.getElementById('novoLeadForm').reset();
  document.getElementById('leadModalTitle').textContent = 'Novo Lead';
  openModal('novoLeadModal');
}

// ─── PIPELINE (KANBAN) ──────────────────────────────────────
async function loadPipeline() {
  const el = document.getElementById('kanban-cols');
  if (!el) return;
  try {
    const data = await apiFetch('/api/deals');
    document.getElementById('pipeline-total').textContent = formatMoney(data.total_value);
    el.innerHTML = data.kanban.map(stage => `
      <div class="kanban-col" data-stage="${stage.id}">
        <div class="kanban-col-header">
          <div class="col-title"><div class="col-dot" style="background:${stage.color}"></div> ${stage.name}</div>
          <span class="col-count">${stage.deals.length}</span>
        </div>
        <div class="kanban-cards" id="stage-${stage.id}">
          ${stage.deals.map(d => kanbanCard(d, stage)).join('')}
          <div class="kanban-add" onclick="openNewDeal(${stage.id})" style="padding:10px;text-align:center;font-size:12px;color:var(--text3);cursor:pointer;border:1px dashed var(--border);border-radius:8px;margin-top:4px;transition:all 0.2s;" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text3)'">+ Adicionar</div>
        </div>
      </div>`).join('');
  } catch(e) { toast('Erro ao carregar pipeline', 'error'); }
}

function kanbanCard(d, stage) {
  return `<div class="kanban-card" draggable="true" data-deal="${d.id}" ondragstart="dragStart(event)" ondragend="dragEnd(event)">
    <div class="kcard-prop">🏠 ${d.property_title || 'Sem imóvel vinculado'}</div>
    <div class="kcard-name">${d.lead_name || 'Lead não definido'}</div>
    <div class="kcard-price">${formatMoney(d.value || 0)}</div>
    <div class="kcard-footer">
      <div class="kcard-agent" style="background:${stage.color}20;color:${stage.color};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;">${(d.agent_name||'?').split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
      <div class="kcard-date">${d.expected_close ? formatDate(d.expected_close) : 'Sem prazo'}</div>
    </div>
  </div>`;
}

// Drag & Drop
let draggedDeal = null;
function dragStart(e) { draggedDeal = e.target.dataset.deal; e.target.style.opacity = '0.5'; }
function dragEnd(e) { e.target.style.opacity = '1'; }

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
  const col = e.target.closest('.kanban-col');
  if (!col || !draggedDeal) return;
  const stageId = col.dataset.stage;
  try {
    await apiFetch(`/api/deals/${draggedDeal}/stage`, { method: 'PATCH', body: JSON.stringify({ stage_id: stageId }) });
    loadPipeline();
    toast('Negócio movido com sucesso!');
  } catch(e) { toast('Erro ao mover negócio', 'error'); }
  draggedDeal = null;
});

async function openNewDeal(stageId) {
  document.getElementById('dealStageId').value = stageId || '';
  document.getElementById('newDealForm').reset();
  // Load leads for select
  const data = await apiFetch('/api/leads?limit=100');
  const sel = document.getElementById('dealLeadId');
  sel.innerHTML = '<option value="">Selecionar lead...</option>' + data.leads.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  // Load properties for select
  const props = await apiFetch('/api/properties?limit=100');
  const psel = document.getElementById('dealPropId');
  psel.innerHTML = '<option value="">Selecionar imóvel...</option>' + props.properties.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
  openModal('newDealModal');
}

async function saveDeal() {
  const form = {
    title: document.getElementById('dealTitle').value,
    lead_id: document.getElementById('dealLeadId').value || null,
    property_id: document.getElementById('dealPropId').value || null,
    stage_id: document.getElementById('dealStageId').value || null,
    value: parseFloat(document.getElementById('dealValue').value) || null,
    expected_close: document.getElementById('dealClose').value || null,
    notes: document.getElementById('dealNotes').value,
  };
  if (!form.title) return toast('Título obrigatório', 'warning');
  try {
    await apiFetch('/api/deals', { method: 'POST', body: JSON.stringify(form) });
    toast('Negócio criado!');
    closeModal('newDealModal');
    loadPipeline();
  } catch(e) { toast('Erro: ' + e.message, 'error'); }
}

// ─── AGENDA ─────────────────────────────────────────────────
async function loadAgenda() {
  const el = document.getElementById('agenda-list');
  if (!el) return;
  try {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()).toISOString().split('T')[0];
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + 13).toISOString().split('T')[0];
    const appts = await apiFetch(`/api/appointments?start=${start}&end=${end}`);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - today.getDay() + i);
      const ds = d.toISOString().split('T')[0];
      const dayAppts = appts.filter(a => a.date && a.date.startsWith(ds));
      days.push({ date: d, appts: dayAppts, isToday: ds === today.toISOString().split('T')[0] });
    }
    
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px;">` + days.map(day => `
      <div style="text-align:center;${day.isToday ? 'border:2px solid var(--gold);border-radius:12px;padding:8px;background:rgba(201,168,76,0.04);' : ''}">
        <div style="font-size:11px;color:${day.isToday?'var(--gold)':'var(--text3)'};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${day.date.toLocaleDateString('pt-BR',{weekday:'short'})}</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:10px;${day.isToday?'color:var(--gold2)':''}">${day.date.getDate()}</div>
        ${day.appts.map(a => `
          <div style="background:${apptColor(a.type)};border-radius:8px;padding:8px;font-size:11px;margin-bottom:6px;cursor:pointer;text-align:left;" onclick="toast('${a.title} — ${a.lead_name||''}')">
            ${a.date.includes('T') ? a.date.split('T')[1].slice(0,5) : ''}${a.date.includes(' ') ? a.date.split(' ')[1] : ''} — ${a.title}
            ${a.lead_name ? `<div style="color:rgba(255,255,255,0.6);font-size:10px;margin-top:2px;">${a.lead_name}</div>` : ''}
          </div>`).join('')}
        ${day.isToday ? `<div onclick="openAgendaModal()" style="font-size:10px;color:var(--gold);cursor:pointer;margin-top:4px;">+ Agendar</div>` : ''}
      </div>`).join('') + '</div>';
  } catch(e) { toast('Erro ao carregar agenda', 'error'); }
}

async function saveAppointment() {
  const form = {
    title: document.getElementById('apptTitle').value,
    type: document.getElementById('apptType').value,
    date: document.getElementById('apptDate').value,
    duration: parseInt(document.getElementById('apptDuration').value) || 60,
    notes: document.getElementById('apptNotes').value,
  };
  if (!form.title || !form.date) return toast('Título e data obrigatórios', 'warning');
  try {
    await apiFetch('/api/appointments', { method: 'POST', body: JSON.stringify(form) });
    toast('Agendamento criado!');
    closeModal('agendaModal');
    loadAgenda();
  } catch(e) { toast('Erro: ' + e.message, 'error'); }
}

function openAgendaModal() {
  document.getElementById('agendaForm').reset();
  const now = new Date();
  now.setHours(now.getHours() + 1, 0);
  document.getElementById('apptDate').value = now.toISOString().slice(0,16);
  openModal('agendaModal');
}

// ─── RELATÓRIOS ─────────────────────────────────────────────
async function loadRelatorios() {
  try {
    const data = await apiFetch('/api/dashboard/stats');
    renderMonthlyChartBig(data.monthlyChart);
    renderFunnel(data);
    renderAgentRanking();
  } catch(e) {}
}

function renderMonthlyChartBig(months) {
  const el = document.getElementById('bigChart');
  if (!el) return;
  const max = Math.max(...months.map(m => m.value), 1);
  el.innerHTML = months.map(m => `<div class="big-bar" style="height:${Math.max((m.value/max*100),5)}%;background:linear-gradient(180deg,var(--blue),rgba(74,158,255,0.3));" data-label="${m.month}" title="${formatMoney(m.value)}"></div>`).join('');
}

async function renderAgentRanking() {
  const el = document.getElementById('agentRanking');
  if (!el) return;
  try {
    const users = await apiFetch('/api/users');
    el.innerHTML = users.map((u, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid var(--border);">
        <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#c9a84c,#e8c87a);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000;">${u.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
        <div style="flex:1;font-size:13px;">${u.name}</div>
        <div style="font-size:12px;color:var(--text2);">${u.role === 'admin' ? 'Admin' : 'Agente'}</div>
      </div>`).join('');
  } catch(e) {}
}

function renderFunnel(data) {
  const el = document.getElementById('funnelChart');
  if (!el || !data.pipeline) return;
  const total = data.pipeline.reduce((s,p)=>s+p.count,0) || 1;
  el.innerHTML = data.pipeline.map(s => `
    <div class="funnel-item">
      <div class="funnel-label">${s.name}</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.max(s.count/total*100,5)}%;background:${s.color};">${s.count}</div></div>
      <div class="funnel-value" style="color:${s.color}">${s.count}</div>
    </div>`).join('');
}

// ─── NOTIFICATIONS ──────────────────────────────────────────
async function loadNotifications() {
  try {
    const data = await apiFetch('/api/dashboard/notifications');
    const dot = document.querySelector('.notif-dot');
    if (dot) dot.style.display = data.unread > 0 ? 'block' : 'none';
    const el = document.getElementById('notifList');
    if (el) el.innerHTML = data.notifications.map(n => `
      <div class="notif-item" style="${n.read ? 'opacity:0.6' : ''}">
        <div class="notif-icon" style="background:rgba(201,168,76,0.15);color:#c9a84c;">${notifIcon(n.type)}</div>
        <div>
          <div class="notif-text"><strong>${n.title}</strong> — ${n.message}</div>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>`).join('');
  } catch(e) {}
}

async function markAllRead() {
  try {
    await apiFetch('/api/dashboard/notifications/read', { method: 'PATCH' });
    loadNotifications();
    toast('Notificações marcadas como lidas');
  } catch(e) {}
}

// ─── UTILITIES ──────────────────────────────────────────────
function formatMoney(v) {
  if (!v && v !== 0) return 'Sob consulta';
  if (v >= 1000000) return 'R$ ' + (v/1000000).toFixed(1).replace('.0','') + 'M';
  if (v >= 1000) return 'R$ ' + (v/1000).toFixed(0) + 'k';
  return 'R$ ' + v.toLocaleString('pt-BR');
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (d > 7) return formatDate(dateStr);
  if (d > 0) return `há ${d} dia${d>1?'s':''}`;
  if (h > 0) return `há ${h}h`;
  if (m > 0) return `há ${m} min`;
  return 'agora';
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

function activityColor(type) {
  if (type.includes('creat')) return 'blue';
  if (type.includes('win') || type.includes('won') || type.includes('visit')) return 'green';
  if (type.includes('prop')) return 'gold';
  return 'gold';
}

function notifIcon(type) {
  const icons = { lead:'👤', deal:'💰', task:'⏰', appointment:'📅', property:'🏠' };
  return icons[type] || '🔔';
}

function apptColor(type) {
  const colors = { visit:'rgba(74,158,255,0.15)', meeting:'rgba(201,168,76,0.15)', signing:'rgba(46,204,138,0.15)', call:'rgba(155,127,232,0.15)' };
  return colors[type] || 'rgba(74,158,255,0.15)';
}

function filterImoveis() {
  const search = document.getElementById('imoveisSearch').value;
  const type = document.getElementById('imoveisType').value;
  const purpose = document.getElementById('imoveisPurpose').value;
  loadImoveis(1, { search, type, purpose });
}

function filterLeads() {
  const search = document.getElementById('leadsSearch').value;
  const temperature = document.getElementById('leadsTemp').value;
  loadLeads({ search, temperature });
}

// ─── AI CHAT ────────────────────────────────────────────────
const aiResponses = [
  'Baseado nos dados do sistema, **Carlos Mendes** tem 92% de score e está há 10 min sem contato. Recomendo um follow-up via WhatsApp agora! 📱',
  'Identifiquei 3 leads que não recebem contato há mais de 5 dias. Deseja que eu gere mensagens personalizadas para cada um? 💬',
  'A **Cobertura Ipanema** é o imóvel mais visualizado esta semana. Ótimo momento para impulsionar nas redes sociais! 📈',
  'Comparando com o mercado, seus imóveis na Barra estão com preço competitivo. A taxa de conversão está 14% acima da média. 🎯',
  'Para fechar mais negócios, os dados mostram que o melhor horário de contato é entre **14h e 17h** nos dias úteis. ⏰',
  'Você tem **3 tarefas urgentes** para hoje. Quer que eu liste as prioridades? 📋',
];
let aiIdx = 0;

function toggleAI() { document.getElementById('aiChat').classList.toggle('show'); }

function sendAIMessage() {
  const inp = document.getElementById('aiInput');
  const msg = inp.value.trim();
  if (!msg) return;
  const msgs = document.getElementById('aiMessages');
  msgs.innerHTML += `<div class="ai-msg user">${msg}</div>`;
  inp.value = '';
  msgs.scrollTop = msgs.scrollHeight;
  setTimeout(() => {
    msgs.innerHTML += `<div class="ai-msg bot" style="opacity:0;transition:opacity 0.3s;">${aiResponses[aiIdx % aiResponses.length]}</div>`;
    aiIdx++;
    const last = msgs.lastElementChild;
    setTimeout(() => last.style.opacity = 1, 50);
    msgs.scrollTop = msgs.scrollHeight;
  }, 800);
}

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  navigate('dashboard', document.querySelector('.nav-item'));
  
  // Enter on AI input
  document.getElementById('aiInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); });
  });

  // Notification toggle
  document.addEventListener('click', e => {
    const panel = document.getElementById('notifPanel');
    if (panel && !e.target.closest('#notifPanel') && !e.target.closest('[onclick*="notifPanel"]')) {
      panel.classList.remove('show');
    }
  });
});
