// ============================================================
//  app.js — lógica principal do CGEG Controle de Demandas
// ============================================================

// ── Estado global ──────────────────────────────────────────
let currentUser   = null;
let allDemandas   = [];
let editingId     = null;
let chartStatus   = null;
let chartArea     = null;

// ── Lista de e-mails autorizados ───────────────────────────
const EMAILS_AUTORIZADOS = [
  'crromero@sp.gov.br',
  'bcmartins@sp.gov.br',
  'darruda@sp.gov.br',
  'gdcampos@sp.gov.br',
  'tboliveira@sp.gov.br',
  'tpfranca@sp.gov.br',
  'mdtalves@sp.gov.br',
  'jvmartins@sp.gov.br'
];

// ── Dados completos da equipe ──────────────────────────────
const EQUIPE = [
  { nome: 'Cássia Regina Donato Romero',    email: 'crromero@sp.gov.br',  primeiro: 'Cassia'    },
  { nome: 'Joao Victor de Jesus Martins Silva', email: 'jvmartins@sp.gov.br', primeiro: 'Joao Victor' },
  { nome: 'Thais Barbosa de Oliveira',       email: 'tboliveira@sp.gov.br', primeiro: 'Thais'    },
  { nome: 'Maria Deusliene Teixeira Alves',  email: 'mdtalves@sp.gov.br',  primeiro: 'Maria'     },
  { nome: 'Tatiane de Paula França',         email: 'tpfranca@sp.gov.br',  primeiro: 'Tatiane'   },
  { nome: 'Diego Nascimento de Arruda',      email: 'darruda@sp.gov.br',   primeiro: 'Diego'     },
  { nome: 'Bernardo Campos Martins',         email: 'bcmartins@sp.gov.br', primeiro: 'Bernardo'  },
  { nome: 'Giovanna Doretto de Campos',      email: 'gdcampos@sp.gov.br',  primeiro: 'Giovanna'  },
];

// ── Utilitários ────────────────────────────────────────────
function fmt(date) {
  if (!date) return '—';
  if (date.toDate) date = date.toDate();
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
}

function diasEmAberto(criadoEm) {
  if (!criadoEm) return '—';
  const inicio = criadoEm.toDate ? criadoEm.toDate() : new Date(criadoEm);
  const diff = Math.floor((new Date() - inicio) / (1000 * 60 * 60 * 24));
  return diff + ' dia' + (diff !== 1 ? 's' : '');
}

function diasParaVencer(prazo, status) {
  if (!prazo || status === 'Concluída') return '—';
  const p = prazo.toDate ? prazo.toDate() : new Date(prazo);
  const diff = Math.floor((p - new Date()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `<span style="color:var(--red)">${Math.abs(diff)}d atrasado</span>`;
  if (diff === 0) return `<span style="color:var(--amber)">Vence hoje</span>`;
  if (diff <= 3) return `<span style="color:var(--amber)">${diff} dia${diff !== 1 ? 's' : ''}</span>`;
  return `${diff} dias`;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function badgePrioridade(p) {
  const map = { Urgente: 'urgente', Alta: 'alta', 'Média': 'media', Baixa: 'baixa' };
  return `<span class="badge badge-${map[p] || 'baixa'}">${p || '—'}</span>`;
}

function badgeStatus(s) {
  const map = {
    'Concluída':    'concluida',
    'Em Andamento': 'andamento',
    'Em Revisão':   'revisao',
    'Pausada':      'pausada'
  };
  return `<span class="badge badge-${map[s] || 'pausada'}">${s || '—'}</span>`;
}

function progressBar(pct) {
  const v = Math.round((pct || 0) * 100);
  const color = v >= 100 ? 'var(--green)' : v >= 50 ? 'var(--accent)' : 'var(--amber)';
  return `
    <div class="progress-wrap">
      <div class="progress-bar">
        <div class="progress-fill" style="width:${v}%;background:${color}"></div>
      </div>
      <span class="progress-pct">${v}%</span>
    </div>`;
}

function dotColor(status) {
  const map = {
    'Concluída': 'var(--green)',
    'Em Andamento': 'var(--accent)',
    'Em Revisão': 'var(--purple)',
    'Pausada': 'var(--text3)'
  };
  return map[status] || 'var(--text3)';
}

function estrelas(n) {
  if (!n) return '—';
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// ── Navegação ──────────────────────────────────────────────
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId)?.classList.add('active');
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'demandas')  renderTabela();
  if (pageId === 'minhas')    renderMinhas();
  if (pageId === 'equipe')    renderEquipe();
}

// ── Equipe ─────────────────────────────────────────────────
function renderEquipe() {
  // Resumo por status
  const statusList = ['Em Andamento','Em Revisão','Concluída','Pausada','Cancelada'];
  const statusColors = {
    'Em Andamento': 'var(--accent)',
    'Em Revisão':   'var(--purple)',
    'Concluída':    'var(--green)',
    'Pausada':      'var(--text3)',
    'Cancelada':    'var(--red)'
  };
  const total = allDemandas.length;
  const statusResumo = document.getElementById('eq-status-resumo');
  statusResumo.innerHTML = statusList.map(s => {
    const qtd = allDemandas.filter(d => d.status === s).length;
    const pct = total ? Math.round(qtd / total * 100) : 0;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="width:10px;height:10px;border-radius:50%;background:${statusColors[s]};flex-shrink:0"></div>
        <span style="flex:1;font-size:13px">${s}</span>
        <span style="font-size:13px;font-weight:500;min-width:24px;text-align:right">${qtd}</span>
        <span style="font-size:12px;color:var(--text3);min-width:36px;text-align:right">${pct}%</span>
      </div>`;
  }).join('') + `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0">
      <span style="flex:1;font-size:13px;font-weight:500">Total</span>
      <span style="font-size:15px;font-weight:600">${total}</span>
    </div>`;

  // Resumo por área
  const areas = {};
  allDemandas.forEach(d => { const a = d.area || 'Sem área'; areas[a] = (areas[a]||0)+1; });
  const areaResumo = document.getElementById('eq-area-resumo');
  areaResumo.innerHTML = Object.entries(areas).map(([area, qtd]) => {
    const pct = total ? Math.round(qtd / total * 100) : 0;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="flex:1;font-size:13px">${area}</span>
        <div style="width:80px;height:4px;background:var(--bg4);border-radius:99px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:99px"></div>
        </div>
        <span style="font-size:13px;font-weight:500;min-width:24px;text-align:right">${qtd}</span>
      </div>`;
  }).join('');

  // Tabela por funcionário
  const tbody = document.getElementById('eq-tabela-body');
  tbody.innerHTML = EQUIPE.map(p => {
    const demandas   = allDemandas.filter(d => (d.responsavel||'').toLowerCase().includes(p.primeiro.toLowerCase()));
    const concluidas = demandas.filter(d => d.status === 'Concluída').length;
    const andamento  = demandas.filter(d => d.status === 'Em Andamento').length;
    const revisao    = demandas.filter(d => d.status === 'Em Revisão').length;
    const pausadas   = demandas.filter(d => d.status === 'Pausada').length;
    const pctConc    = demandas.length ? Math.round(concluidas / demandas.length * 100) : 0;
    const avals      = demandas.filter(d => d.avaliacao > 0).map(d => d.avaliacao);
    const mediaAval  = avals.length ? (avals.reduce((a,b)=>a+b,0)/avals.length).toFixed(1) : '—';
    return `
      <tr>
        <td style="font-weight:500">${p.nome}</td>
        <td style="color:var(--accent);font-size:12px">${p.email}</td>
        <td style="text-align:center;font-family:'DM Mono',monospace">${demandas.length}</td>
        <td style="text-align:center;color:var(--green);font-family:'DM Mono',monospace">${concluidas}</td>
        <td style="text-align:center;color:var(--accent);font-family:'DM Mono',monospace">${andamento}</td>
        <td style="text-align:center;color:var(--purple);font-family:'DM Mono',monospace">${revisao}</td>
        <td style="text-align:center;color:var(--text3);font-family:'DM Mono',monospace">${pausadas}</td>
        <td style="text-align:center">
          <div class="progress-wrap">
            <div class="progress-bar"><div class="progress-fill" style="width:${pctConc}%"></div></div>
            <span class="progress-pct">${pctConc}%</span>
          </div>
        </td>
        <td style="text-align:center;color:var(--amber)">${mediaAval === '—' ? '—' : '★ ' + mediaAval}</td>
      </tr>`;
  }).join('');

  // Tabela demandas por responsável detalhado
  const respBody = document.getElementById('eq-resp-body');
  respBody.innerHTML = EQUIPE.map(p => {
    const demandas   = allDemandas.filter(d => (d.responsavel||'').toLowerCase().includes(p.primeiro.toLowerCase()));
    const andamento  = demandas.filter(d => d.status === 'Em Andamento').length;
    const revisao    = demandas.filter(d => d.status === 'Em Revisão').length;
    const concluidas = demandas.filter(d => d.status === 'Concluída').length;
    const pausadas   = demandas.filter(d => d.status === 'Pausada').length;
    const pctConc    = demandas.length ? Math.round(concluidas / demandas.length * 100) : 0;
    return `
      <tr>
        <td style="font-weight:500">${p.primeiro}</td>
        <td style="text-align:center;font-family:'DM Mono',monospace">${demandas.length}</td>
        <td style="text-align:center;color:var(--accent);font-family:'DM Mono',monospace">${andamento}</td>
        <td style="text-align:center;color:var(--purple);font-family:'DM Mono',monospace">${revisao}</td>
        <td style="text-align:center;color:var(--green);font-family:'DM Mono',monospace">${concluidas}</td>
        <td style="text-align:center;color:var(--text3);font-family:'DM Mono',monospace">${pausadas}</td>
        <td style="text-align:center">
          <div class="progress-wrap">
            <div class="progress-bar"><div class="progress-fill" style="width:${pctConc}%"></div></div>
            <span class="progress-pct">${pctConc}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Autenticação ───────────────────────────────────────────
function initAuth() {
  auth.onAuthStateChanged(user => {
    if (user) {
      if (!EMAILS_AUTORIZADOS.includes(user.email.toLowerCase())) {
        auth.signOut();
        mostrarErroLogin('Acesso não autorizado. Entre em contato com o administrador.');
        return;
      }
      currentUser = user;
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('app-page').style.display   = 'grid';
      document.getElementById('user-name').textContent    = user.email;
      document.getElementById('user-photo').src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.email.split('@')[0]) + '&background=5b8fff&color=fff&size=60';
      loadDemandas();
    } else {
      document.getElementById('login-page').style.display = 'flex';
      document.getElementById('app-page').style.display   = 'none';
    }
  });
}

function mostrarErroLogin(msg) {
  const erro = document.getElementById('login-erro');
  if (erro) { erro.style.display = 'block'; erro.textContent = msg; }
}

function loginEmail() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const erro  = document.getElementById('login-erro');
  const btn   = document.getElementById('btn-login');

  if (!email || !senha) {
    erro.style.display = 'block';
    erro.textContent = 'Preencha o e-mail e a senha.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando…';
  erro.style.display = 'none';

  auth.signInWithEmailAndPassword(email, senha)
    .catch(err => {
      erro.style.display = 'block';
      erro.textContent = 'E-mail ou senha incorretos. Tente novamente.';
      btn.disabled = false;
      btn.textContent = 'Entrar';
    });
}

function logout() {
  auth.signOut();
}

// ── Firestore: carregar em tempo real ─────────────────────
function loadDemandas() {
  db.collection('demandas')
    .orderBy('criadoEm', 'desc')
    .onSnapshot(snap => {
      allDemandas = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
      if (activePage === 'dashboard') renderDashboard();
      if (activePage === 'demandas')  renderTabela();
      if (activePage === 'minhas')    renderMinhas();
    }, err => {
      toast('Erro ao carregar dados: ' + err.message, 'error');
    });
}

// ── Dashboard ──────────────────────────────────────────────
function renderDashboard() {
  const total      = allDemandas.length;
  const concluidas = allDemandas.filter(d => d.status === 'Concluída').length;
  const andamento  = allDemandas.filter(d => d.status === 'Em Andamento').length;
  const atrasadas  = allDemandas.filter(d => {
    if (!d.prazo || d.status === 'Concluída') return false;
    const p = d.prazo.toDate ? d.prazo.toDate() : new Date(d.prazo);
    return p < new Date();
  }).length;

  document.getElementById('m-total').textContent      = total;
  document.getElementById('m-concluidas').textContent = concluidas;
  document.getElementById('m-andamento').textContent  = andamento;
  document.getElementById('m-atrasadas').textContent  = atrasadas;

  renderCharts();
  renderRecentes();
}

function renderCharts() {
  if (!window.Chart) return;

  const statusCounts = { 'Concluída': 0, 'Em Andamento': 0, 'Em Revisão': 0, 'Pausada': 0 };
  allDemandas.forEach(d => { if (statusCounts[d.status] !== undefined) statusCounts[d.status]++; });

  const ctxStatus = document.getElementById('chart-status').getContext('2d');
  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: ['#3ecf8e','#5b8fff','#a78bfa','#555b6e'],
        borderWidth: 0, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#8b90a0', font: { size: 12, family: 'DM Sans' }, boxWidth: 12, padding: 12 } } },
      cutout: '70%'
    }
  });

  const areaCounts = {};
  allDemandas.forEach(d => { areaCounts[d.area || 'Sem área'] = (areaCounts[d.area || 'Sem área'] || 0) + 1; });

  const ctxArea = document.getElementById('chart-area').getContext('2d');
  if (chartArea) chartArea.destroy();
  chartArea = new Chart(ctxArea, {
    type: 'bar',
    data: {
      labels: Object.keys(areaCounts),
      datasets: [{ data: Object.values(areaCounts), backgroundColor: 'rgba(91,143,255,0.25)', borderColor: '#5b8fff', borderWidth: 1.5, borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b90a0', font: { size: 12 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#8b90a0', font: { size: 12 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

function renderRecentes() {
  const lista = [...allDemandas]
    .filter(d => d.status !== 'Concluída')
    .sort((a, b) => {
      const ap = a.prazo?.toDate ? a.prazo.toDate() : new Date(a.prazo || 0);
      const bp = b.prazo?.toDate ? b.prazo.toDate() : new Date(b.prazo || 0);
      return ap - bp;
    })
    .slice(0, 6);

  const el = document.getElementById('lista-recentes');
  if (!lista.length) { el.innerHTML = '<div class="empty-state"><p>Nenhuma demanda em aberto</p></div>'; return; }

  el.innerHTML = lista.map(d => `
    <div class="recente-item" onclick="abrirDetalhe('${d.id}')">
      <div class="recente-dot" style="background:${dotColor(d.status)}"></div>
      <div class="recente-info">
        <div class="recente-titulo">${d.titulo || '—'}</div>
        <div class="recente-meta">${d.responsavel || '—'} · Prazo: ${fmt(d.prazo)} · ${diasParaVencer(d.prazo, d.status)}</div>
      </div>
      ${badgePrioridade(d.prioridade)}
    </div>
  `).join('');
}

// ── Lista de demandas ──────────────────────────────────────
function renderTabela(filtros) {
  filtros = filtros || getFiltros();
  let lista = [...allDemandas];

  if (filtros.busca) {
    const b = filtros.busca.toLowerCase();
    lista = lista.filter(d =>
      (d.titulo || '').toLowerCase().includes(b) ||
      (d.atividade || '').toLowerCase().includes(b) ||
      (d.responsavel || '').toLowerCase().includes(b)
    );
  }
  if (filtros.area)       lista = lista.filter(d => d.area === filtros.area);
  if (filtros.status)     lista = lista.filter(d => d.status === filtros.status);
  if (filtros.prioridade) lista = lista.filter(d => d.prioridade === filtros.prioridade);

  const tbody = document.getElementById('tabela-body');
  document.getElementById('tabela-count').textContent = lista.length + ' demanda' + (lista.length !== 1 ? 's' : '');

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <p>Nenhuma demanda encontrada</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(d => `
    <tr onclick="abrirDetalhe('${d.id}')">
      <td>
        <div class="demanda-titulo">${d.titulo || '—'}</div>
        <div class="demanda-atividade">${d.atividade || ''}</div>
      </td>
      <td><span class="badge badge-${(d.area || '').toLowerCase().replace(/[^a-z]/g,'')} ">${d.area || '—'}</span></td>
      <td>${badgePrioridade(d.prioridade)}</td>
      <td>${badgeStatus(d.status)}</td>
      <td style="color:var(--text2);font-size:13px">${d.responsavel || '—'}</td>
      <td style="color:var(--text2);font-size:13px">${fmt(d.prazo)}</td>
      <td style="font-size:12px;color:var(--text2)">${diasEmAberto(d.criadoEm)}</td>
      <td style="font-size:12px">${diasParaVencer(d.prazo, d.status)}</td>
    </tr>
  `).join('');
}

function getFiltros() {
  return {
    busca:      document.getElementById('f-busca')?.value || '',
    area:       document.getElementById('fm-area')?.value || '',
    status:     document.getElementById('fm-status')?.value || '',
    prioridade: document.getElementById('fm-prioridade')?.value || ''
  };
}

// ── Minhas demandas ────────────────────────────────────────
function renderMinhas() {
  const email = currentUser?.email || '';
  const minhas = allDemandas.filter(d =>
    (d.responsavel || '').toLowerCase().includes(email.split('@')[0].toLowerCase()) &&
    d.status !== 'Concluída'
  );

  const el = document.getElementById('minhas-lista');
  if (!minhas.length) {
    el.innerHTML = '<div class="empty-state"><p>Nenhuma demanda aberta para você</p></div>';
    return;
  }

  el.innerHTML = `<div class="table-wrap"><table class="demandas-table">
    <thead><tr>
      <th>Demanda</th><th>Prioridade</th><th>Status</th><th>Prazo</th><th>Dias p/ Vencer</th><th>Progresso</th>
    </tr></thead>
    <tbody>
    ${minhas.map(d => `
      <tr onclick="abrirDetalhe('${d.id}')">
        <td>
          <div class="demanda-titulo">${d.titulo || '—'}</div>
          <div class="demanda-atividade">${d.atividade || ''}</div>
        </td>
        <td>${badgePrioridade(d.prioridade)}</td>
        <td>${badgeStatus(d.status)}</td>
        <td style="color:var(--text2);font-size:13px">${fmt(d.prazo)}</td>
        <td style="font-size:12px">${diasParaVencer(d.prazo, d.status)}</td>
        <td>${progressBar(d.porcentoConcluido)}</td>
      </tr>
    `).join('')}
    </tbody>
  </table></div>`;
}

// ── Formulário: novo / editar ──────────────────────────────
function abrirFormulario(id) {
  editingId = id || null;
  const d = id ? allDemandas.find(x => x.id === id) : null;
  document.getElementById('modal-form-title').textContent = d ? 'Editar demanda' : 'Nova demanda';

  const campos = ['titulo','descricao','atividade','area','tipo','prioridade','status','responsavel','apoio','prazo','dataconclusaoreal','entregavel','observacoes'];
  const prefix = 'fm-';
  campos.forEach(c => {
    const el = document.getElementById('fm-' + c);
    if (!el) return;
    if ((c === 'prazo' || c === 'dataconclusaoreal') && d?.[c]) {
      const dt = d[c].toDate ? d[c].toDate() : new Date(d[c]);
      el.value = dt.toISOString().split('T')[0];
    } else {
      el.value = d?.[c] || '';
    }
  });

  const pct = Math.round((d?.porcentoConcluido || 0) * 100);
  document.getElementById('fm-pct').value = pct;
  document.getElementById('fm-pct-display').textContent = pct + '%';

  // Mostra data de abertura no formulário de edição
  const aberturaEl = document.getElementById('fm-abertura-display');
  if (aberturaEl) aberturaEl.textContent = d ? fmt(d.criadoEm) : 'Gerada automaticamente ao salvar';

  document.getElementById('modal-form').classList.add('open');
}

async function salvarDemanda() {
  const titulo = document.getElementById('fm-titulo').value.trim();
  if (!titulo) { toast('O título é obrigatório', 'error'); return; }

  const prazoVal       = document.getElementById('fm-prazo').value;
  const conclusaoVal   = document.getElementById('fm-dataconclusaoreal').value;
  const pct            = parseInt(document.getElementById('fm-pct').value) / 100;
  const statusAtual    = document.getElementById('fm-status').value;

  const data = {
    titulo,
    descricao:          document.getElementById('fm-descricao').value,
    atividade:          document.getElementById('fm-atividade').value,
    area:               document.getElementById('fm-area').value,
    tipo:               document.getElementById('fm-tipo').value,
    prioridade:         document.getElementById('fm-prioridade').value,
    status:             statusAtual,
    responsavel:        document.getElementById('fm-responsavel').value,
    apoio:              document.getElementById('fm-apoio').value,
    prazo:              prazoVal ? firebase.firestore.Timestamp.fromDate(new Date(prazoVal + 'T12:00:00')) : null,
    dataConclusaoReal:  conclusaoVal ? firebase.firestore.Timestamp.fromDate(new Date(conclusaoVal + 'T12:00:00')) : null,
    entregavel:         document.getElementById('fm-entregavel').value,
    observacoes:        document.getElementById('fm-observacoes').value,
    porcentoConcluido:  pct,
    atualizadoEm:       firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor:      currentUser?.email
  };

  // Se status for Concluída e não tiver data de conclusão real, preenche automaticamente
  if (statusAtual === 'Concluída' && !conclusaoVal) {
    data.dataConclusaoReal = firebase.firestore.FieldValue.serverTimestamp();
  }

  try {
    const btn = document.getElementById('btn-salvar');
    btn.disabled = true; btn.textContent = 'Salvando…';

    if (editingId) {
      await db.collection('demandas').doc(editingId).update(data);
      toast('Demanda atualizada com sucesso!');
    } else {
      data.criadoEm  = firebase.firestore.FieldValue.serverTimestamp();
      data.criadoPor = currentUser?.email;
      await db.collection('demandas').add(data);
      toast('Demanda criada com sucesso!');
    }
    fecharModal('modal-form');
  } catch (err) {
    toast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('btn-salvar');
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

// ── Detalhe ────────────────────────────────────────────────
function abrirDetalhe(id) {
  const d = allDemandas.find(x => x.id === id);
  if (!d) return;

  document.getElementById('det-titulo').textContent      = d.titulo || '—';
  document.getElementById('det-atividade').textContent   = d.atividade || '—';
  document.getElementById('det-descricao').textContent   = d.descricao || '—';
  document.getElementById('det-area').textContent        = d.area || '—';
  document.getElementById('det-tipo').textContent        = d.tipo || '—';
  document.getElementById('det-responsavel').textContent = d.responsavel || '—';
  document.getElementById('det-apoio').textContent       = d.apoio || '—';
  document.getElementById('det-abertura').textContent    = fmt(d.criadoEm);
  document.getElementById('det-prazo').textContent       = fmt(d.prazo);
  document.getElementById('det-conclusao').textContent   = fmt(d.dataConclusaoReal);
  document.getElementById('det-entregavel').textContent  = d.entregavel || '—';
  document.getElementById('det-obs').textContent         = d.observacoes || '—';
  document.getElementById('det-diasaberto').textContent  = diasEmAberto(d.criadoEm);
  document.getElementById('det-diasvencer').innerHTML    = diasParaVencer(d.prazo, d.status);
  document.getElementById('det-avaliacao').textContent   = estrelas(d.avaliacao);
  document.getElementById('det-prioridade').innerHTML    = badgePrioridade(d.prioridade);
  document.getElementById('det-status').innerHTML        = badgeStatus(d.status);

  const pct = Math.round((d.porcentoConcluido || 0) * 100);
  const color = pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--amber)';
  document.getElementById('det-progress-fill').style.width = pct + '%';
  document.getElementById('det-progress-fill').style.background = color;
  document.getElementById('det-progress-pct').textContent = pct + '%';

  document.getElementById('btn-det-editar').onclick  = () => { fecharModal('modal-detalhe'); abrirFormulario(id); };
  document.getElementById('btn-det-excluir').onclick = () => confirmarExcluir(id, d.titulo);

  document.getElementById('modal-detalhe').classList.add('open');
}

async function confirmarExcluir(id, titulo) {
  if (!confirm(`Excluir a demanda "${titulo}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await db.collection('demandas').doc(id).delete();
    fecharModal('modal-detalhe');
    toast('Demanda excluída');
  } catch (err) {
    toast('Erro ao excluir: ' + err.message, 'error');
  }
}

function fecharModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  ['f-busca','f-area','f-status','f-prioridade'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => renderTabela());
  });

  document.getElementById('fm-pct')?.addEventListener('input', function() {
    document.getElementById('fm-pct-display').textContent = this.value + '%';
  });

  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
});
