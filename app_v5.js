
// ── Popular select de Tipo com valores do banco ────────────
function popularTipos() {
  const tiposFixos = ['Projeto', 'Relatório', 'Análise', 'Desenvolvimento', 'Reunião', 'Suporte', 'Planejamento'];
  
  // Pega tipos únicos do banco que não estão na lista fixa
  const tiposCustom = [...new Set(
    allDemandas
      .map(d => d.tipo)
      .filter(t => t && !tiposFixos.includes(t))
  )].sort();

  const select = document.getElementById('fm-tipo');
  if (!select) return;

  // Salva valor atual antes de repopular
  const valorAtual = select.value;

  // Reconstrói as opções
  select.innerHTML = `
    <option value="">Selecione…</option>
    ${tiposFixos.map(t => `<option value="${t}">${t}</option>`).join('')}
    ${tiposCustom.map(t => `<option value="${t}">${t}</option>`).join('')}
    <option value="Outros">Outros…</option>
  `;

  // Restaura valor se possível
  if (valorAtual) select.value = valorAtual;
}


// ── Tipo "Outros" ──────────────────────────────────────────
function toggleTipoOutros(val) {
  const outrosInput = document.getElementById('fm-tipo-outros');
  if (!outrosInput) return;
  if (val === 'Outros') {
    outrosInput.style.display = 'block';
    outrosInput.focus();
  } else {
    outrosInput.style.display = 'none';
    outrosInput.value = '';
  }
}


// Remove acentos para comparação
function normalizar(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ── EmailJS — Notificações por e-mail ─────────────────────
const EMAILJS_SERVICE_ID  = 'service_s90pafg';
const EMAILJS_TEMPLATE_ID = 'template_orev5qf';
const EMAILJS_PUBLIC_KEY  = 'Q51XuWiEPnyj0dG_4';

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
  if (pageId === 'demandas') {
    const fb = document.getElementById('f-busca'); if(fb) fb.value = '';
    const fa = document.getElementById('f-area'); if(fa) fa.selectedIndex = 0;
    const fs = document.getElementById('f-status'); if(fs) fs.selectedIndex = 0;
    const fp = document.getElementById('f-prioridade'); if(fp) fp.selectedIndex = 0;
    renderTabela({busca:'',area:'',status:'',prioridade:''});
  }
  if (pageId === 'minhas')    renderMinhas();
  if (pageId === 'equipe')    renderEquipe();
  if (pageId === 'relatorios') renderRelatorios();
  if (pageId === 'projetos')   {} // formulário estático, não precisa render
  if (pageId === 'calendario') renderCalendario();
  if (pageId === 'apoio')      renderApoio();
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
    .limit(500)
    .onSnapshot(snap => {
      allDemandas = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a,b) => { const at = a.criadoEm?.toDate?.() || new Date(0); const bt = b.criadoEm?.toDate?.() || new Date(0); return bt - at; });
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
    area:       document.getElementById('f-area')?.value || '',
    status:     document.getElementById('f-status')?.value || '',
    prioridade: document.getElementById('f-prioridade')?.value || ''
  };
}

// ── Minhas demandas ────────────────────────────────────────
function renderMinhas() {
  const email = (currentUser?.email || '').toLowerCase();
  const pessoa = EQUIPE.find(p => p.email.toLowerCase() === email);
  const minhas = allDemandas.filter(d =>
    pessoa && normalizar(d.responsavel).includes(normalizar(pessoa.primeiro))
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

  const campos = ['titulo','descricao','atividade','area','prioridade','status','responsavel','apoio','prazo','dataconclusaoreal','entregavel','observacoes'];
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
  // Trata campo Tipo separadamente (suporte a "Outros")
  const tiposFixos = ['', 'Projeto', 'Relatório', 'Análise', 'Desenvolvimento', 'Reunião', 'Suporte', 'Planejamento'];
  const tipoVal = d?.tipo || '';
  const tipoSelect = document.getElementById('fm-tipo');
  const tipoOutros = document.getElementById('fm-tipo-outros');
  if (tipoSelect) {
  // Verifica se o tipo está disponível no select (incluindo customizados)
    const opcoes = Array.from(tipoSelect.options).map(o => o.value);
    if (!tipoVal || tiposFixos.includes(tipoVal)) {
      tipoSelect.value = tipoVal;
      if (tipoOutros) { tipoOutros.style.display = 'none'; tipoOutros.value = ''; }
    } else if (opcoes.includes(tipoVal)) {
      // Tipo customizado já está na lista
      tipoSelect.value = tipoVal;
      if (tipoOutros) { tipoOutros.style.display = 'none'; tipoOutros.value = ''; }
    } else {
      // Tipo não está na lista — usa campo Outros
      tipoSelect.value = 'Outros';
      if (tipoOutros) { tipoOutros.style.display = 'block'; tipoOutros.value = tipoVal; }
    }
  }

  const pctEl = document.getElementById('fm-pct');
  const pctDisplay = document.getElementById('fm-pct-display');
  if (pctEl) pctEl.value = pct;
  if (pctDisplay) pctDisplay.textContent = pct + '%';

  // Mostra data de abertura no formulário de edição
  const aberturaEl = document.getElementById('fm-abertura-display');
  if (aberturaEl) aberturaEl.textContent = d ? fmt(d.criadoEm) : 'Gerada automaticamente ao salvar';

  popularTipos();
  document.getElementById('modal-form').classList.add('open');
}


// ── Enviar e-mail de notificação ──────────────────────────
async function enviarNotificacao(demanda) {
  // Descobre e-mails dos destinatários (responsável + apoio)
  const destinatarios = [];

  // Adiciona responsável
  const pessoaResp = EQUIPE.find(p => p.primeiro.toLowerCase() === (demanda.responsavel || '').toLowerCase());
  if (pessoaResp) destinatarios.push(pessoaResp.email);

  // Adiciona pessoas do apoio
  if (demanda.apoio) {
    demanda.apoio.split(',').forEach(nome => {
      const p = EQUIPE.find(x => x.primeiro.toLowerCase() === nome.trim().toLowerCase());
      if (p && !destinatarios.includes(p.email)) destinatarios.push(p.email);
    });
  }

  if (!destinatarios.length) return;

  // Formata prazo
  let prazoFmt = '—';
  if (demanda.prazo) {
    const d = demanda.prazo.toDate ? demanda.prazo.toDate() : new Date(demanda.prazo);
    prazoFmt = new Intl.DateTimeFormat('pt-BR').format(d);
  }

  // Envia um e-mail para cada destinatário
  for (const email of destinatarios) {
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        email_destinatario: email,
        titulo:        demanda.titulo || '—',
        area:          demanda.area || '—',
        tipo:          demanda.tipo || '—',
        prioridade:    demanda.prioridade || '—',
        prazo:         prazoFmt,
        responsavel:   demanda.responsavel || '—',
        apoio:         demanda.apoio || '—',
        atividade:     demanda.atividade || '—',
        cadastrado_por: currentUser?.email || '—'
      }, EMAILJS_PUBLIC_KEY);
      console.log('E-mail enviado para:', email);
    } catch(err) {
      console.warn('Erro ao enviar e-mail para', email, err);
    }
  }
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
    tipo:               (() => {
      const sel = document.getElementById('fm-tipo');
      const outros = document.getElementById('fm-tipo-outros');
      if (sel?.value === 'Outros') {
        return outros?.value?.trim() || 'Outros';
      }
      return sel?.value || '';
    })(),
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
      enviarNotificacao(data);
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


// ── Sou Apoio ──────────────────────────────────────────────
function renderApoio() {
  const email = (currentUser?.email || '').toLowerCase();
  const pessoa = EQUIPE.find(p => p.email.toLowerCase() === email);
  
  const minhasApoio = allDemandas.filter(d => {
    if (!d.apoio || !pessoa) return false;
    const apoioNorm = normalizar(d.apoio);
    // Busca pelo primeiro nome E por variações (ex: "João" → "joao", "Joao Victor" → "joao")
    const primeiroNorm = normalizar(pessoa.primeiro.split(' ')[0]);
    return apoioNorm.includes(primeiroNorm);
  });

  const el = document.getElementById('apoio-lista');

  if (!minhasApoio.length) {
    el.innerHTML = '<div class="empty-state"><p>Você não está como apoio em nenhuma demanda</p></div>';
    return;
  }

  el.innerHTML = `<div class="table-wrap"><table class="demandas-table">
    <thead><tr>
      <th>Demanda</th><th>Área</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th>Prazo</th><th>Progresso</th>
    </tr></thead>
    <tbody>
    ${minhasApoio.map(d => `
      <tr onclick="abrirDetalhe('${d.id}')">
        <td>
          <div class="demanda-titulo">${d.titulo || '—'}</div>
          <div class="demanda-atividade">${d.atividade || ''}</div>
        </td>
        <td><span style="font-size:14px;color:#e0e2ea">${d.area || '—'}</span></td>
        <td>${badgePrioridade(d.prioridade)}</td>
        <td>${badgeStatus(d.status)}</td>
        <td style="font-size:14px;color:#e0e2ea">${d.responsavel || '—'}</td>
        <td style="font-size:14px;color:#e0e2ea">${fmt(d.prazo)}</td>
        <td>${progressBar(d.porcentoConcluido)}</td>
      </tr>
    `).join('')}
    </tbody>
  </table></div>`;
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  document.getElementById('f-busca')?.addEventListener('input', () => renderTabela());
  document.getElementById('f-area')?.addEventListener('change', () => renderTabela());
  document.getElementById('f-status')?.addEventListener('change', () => renderTabela());
  document.getElementById('f-prioridade')?.addEventListener('change', () => renderTabela());

  document.getElementById('fm-pct')?.addEventListener('input', function() {
    const d = document.getElementById('fm-pct-display');
    if (d) d.textContent = this.value + '%';
  });

  // Só fecha o modal de detalhe ao clicar fora — formulário NÃO fecha
  document.getElementById('modal-detalhe')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-detalhe')) fecharModal('modal-detalhe');
  });
});

// ── Relatórios ─────────────────────────────────────────────
let chartEvolucao = null;

function renderRelatorios() {
  renderRelKPIs();
  renderRelPorTipo();
  renderRelPorPrioridade();
  renderRelCarga();
  renderRelTempo();
  renderRelSemPrazo();
  renderRelAtrasadas();
  renderRelQualidade();
  renderRelEvolucao();
}

function barRow(label, val, max, color, suffix='') {
  const pct = max ? Math.round(val/max*100) : 0;
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
      <span style="min-width:140px;font-size:14px;color:#e0e2ea">${label}</span>
      <div style="flex:1;height:6px;background:var(--bg4);border-radius:99px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;transition:width 0.5s"></div>
      </div>
      <span style="min-width:40px;text-align:right;font-size:14px;font-weight:600;color:#e0e2ea;font-family:'DM Mono',monospace">${val}${suffix}</span>
    </div>`;
}

function renderRelKPIs() {
  const total     = allDemandas.length;
  const concluidas = allDemandas.filter(d => d.status === 'Concluída').length;
  const abertas   = allDemandas.filter(d => d.status !== 'Concluída').length;
  const atrasadas = allDemandas.filter(d => {
    if (!d.prazo || d.status === 'Concluída') return false;
    const p = d.prazo.toDate ? d.prazo.toDate() : new Date(d.prazo);
    return p < new Date();
  }).length;
  const semPrazo = allDemandas.filter(d => !d.prazo && d.status !== 'Concluída').length;
  const taxaConclusao = total ? Math.round(concluidas/total*100) : 0;

  document.getElementById('rel-kpis').innerHTML = `
    <div class="metric-card"><div class="metric-label">Total</div><div class="metric-value" style="color:#e8eaf0">${total}</div></div>
    <div class="metric-card green"><div class="metric-label">Concluídas</div><div class="metric-value">${concluidas}</div></div>
    <div class="metric-card"><div class="metric-label">Em aberto</div><div class="metric-value" style="color:#5b8fff">${abertas}</div></div>
    <div class="metric-card red"><div class="metric-label">Atrasadas</div><div class="metric-value">${atrasadas}</div></div>
    <div class="metric-card amber"><div class="metric-label">Sem prazo</div><div class="metric-value">${semPrazo}</div></div>
    <div class="metric-card green"><div class="metric-label">Taxa conclusão</div><div class="metric-value">${taxaConclusao}%</div></div>
  `;
}

function renderRelPorTipo() {
  const tipos = {};
  allDemandas.forEach(d => { const t = d.tipo || 'Sem tipo'; tipos[t] = (tipos[t]||0)+1; });
  const sorted = Object.entries(tipos).sort((a,b)=>b[1]-a[1]);
  const max = sorted[0]?.[1] || 1;
  document.getElementById('rel-por-tipo').innerHTML =
    sorted.map(([t,v]) => barRow(t, v, max, 'var(--accent)')).join('') || '<p style="color:var(--text3);font-size:13px;padding:12px 0">Sem dados</p>';
}

function renderRelPorPrioridade() {
  const cores = { Urgente: 'var(--red)', Alta: 'var(--amber)', 'Média': 'var(--accent)', Baixa: 'var(--text3)' };
  const prios = { Urgente:0, Alta:0, 'Média':0, Baixa:0, 'Sem prioridade':0 };
  allDemandas.forEach(d => {
    const p = d.prioridade || 'Sem prioridade';
    if (prios[p] !== undefined) prios[p]++; else prios['Sem prioridade']++;
  });
  const max = Math.max(...Object.values(prios));
  document.getElementById('rel-por-prioridade').innerHTML =
    Object.entries(prios).map(([p,v]) => barRow(p, v, max, cores[p]||'var(--text3)')).join('');
}

function renderRelCarga() {
  const abertas = allDemandas.filter(d => d.status !== 'Concluída');
  const max = Math.max(...EQUIPE.map(p => abertas.filter(d => normalizar(d.responsavel).includes(normalizar(p.primeiro))).length)) || 1;
  document.getElementById('rel-carga').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
    ${EQUIPE.map(p => {
      const qtd = abertas.filter(d => normalizar(d.responsavel).includes(normalizar(p.primeiro))).length;
      const cor = qtd > 20 ? 'var(--red)' : qtd > 10 ? 'var(--amber)' : 'var(--green)';
      return barRow(p.primeiro, qtd, max, cor);
    }).join('')}
    </div>`;
}

function renderRelTempo() {
  const el = document.getElementById('rel-tempo');
  const rows = EQUIPE.map(p => {
    const concluidas = allDemandas.filter(d =>
      d.status === 'Concluída' &&
      normalizar(d.responsavel).includes(normalizar(p.primeiro)) &&
      d.criadoEm && d.dataConclusaoReal
    );
    if (!concluidas.length) return { nome: p.primeiro, media: null, total: 0 };
    const tempos = concluidas.map(d => {
      const ini = d.criadoEm.toDate ? d.criadoEm.toDate() : new Date(d.criadoEm);
      const fim = d.dataConclusaoReal.toDate ? d.dataConclusaoReal.toDate() : new Date(d.dataConclusaoReal);
      return Math.max(0, Math.floor((fim - ini) / (1000*60*60*24)));
    });
    return { nome: p.primeiro, media: Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length), total: concluidas.length };
  }).filter(r => r.media !== null).sort((a,b) => a.media - b.media);

  const max = rows[rows.length-1]?.media || 1;
  el.innerHTML = rows.length ? rows.map(r =>
    barRow(r.primeiro || r.nome, r.media, max, 'var(--purple)', ' dias')
  ).join('') : '<p style="color:var(--text3);font-size:13px;padding:12px 0">Dados insuficientes para calcular</p>';
}

function renderRelSemPrazo() {
  const lista = allDemandas.filter(d => !d.prazo && d.status !== 'Concluída').slice(0,8);
  const el = document.getElementById('rel-sem-prazo');
  if (!lista.length) { el.innerHTML = '<p style="color:var(--green);font-size:13px;padding:12px 0">✓ Todas as demandas abertas têm prazo!</p>'; return; }
  el.innerHTML = lista.map(d => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="abrirDetalhe('${d.id}')">
      <div style="flex:1;font-size:14px;color:#e0e2ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.titulo||'—'}</div>
      <span style="font-size:12px;color:var(--text3)">${d.responsavel||'—'}</span>
    </div>`).join('') + (allDemandas.filter(d=>!d.prazo&&d.status!=='Concluída').length > 8 ? `<p style="font-size:12px;color:var(--text3);margin-top:8px">+${allDemandas.filter(d=>!d.prazo&&d.status!=='Concluída').length-8} mais</p>` : '');
}

function renderRelAtrasadas() {
  const lista = allDemandas.filter(d => {
    if (!d.prazo || d.status === 'Concluída') return false;
    const p = d.prazo.toDate ? d.prazo.toDate() : new Date(d.prazo);
    return p < new Date();
  }).slice(0,8);
  const el = document.getElementById('rel-atrasadas');
  if (!lista.length) { el.innerHTML = '<p style="color:var(--green);font-size:13px;padding:12px 0">✓ Nenhuma demanda atrasada!</p>'; return; }
  el.innerHTML = lista.map(d => {
    const p = d.prazo.toDate ? d.prazo.toDate() : new Date(d.prazo);
    const dias = Math.floor((new Date()-p)/(1000*60*60*24));
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="abrirDetalhe('${d.id}')">
      <div style="flex:1;font-size:14px;color:#e0e2ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.titulo||'—'}</div>
      <span style="font-size:12px;color:var(--red);font-weight:500">${dias}d atraso</span>
    </div>`;
  }).join('');
}

function renderRelQualidade() {
  const rows = EQUIPE.map(p => {
    const avals = allDemandas.filter(d => normalizar(d.responsavel).includes(normalizar(p.primeiro)) && d.avaliacao > 0).map(d => d.avaliacao);
    const media = avals.length ? (avals.reduce((a,b)=>a+b,0)/avals.length) : null;
    return { nome: p.primeiro, media, total: avals.length };
  }).filter(r => r.media !== null).sort((a,b) => b.media - a.media);

  const el = document.getElementById('rel-qualidade');
  if (!rows.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:12px 0">Nenhuma avaliação registrada ainda</p>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">` +
    rows.map(r => `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
      <span style="min-width:140px;font-size:14px;color:#e0e2ea">${r.nome}</span>
      <span style="color:var(--amber);font-size:16px">${'★'.repeat(Math.round(r.media))}${'☆'.repeat(5-Math.round(r.media))}</span>
      <span style="font-size:13px;color:var(--text2);margin-left:4px">${r.media.toFixed(1)} (${r.total} aval.)</span>
    </div>`).join('') + '</div>';
}

function renderRelEvolucao() {
  if (!window.Chart) return;

  const meses = {};
  const hoje = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    meses[key] = { label: d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}), abertas: 0, concluidas: 0 };
  }

  allDemandas.forEach(d => {
    if (d.criadoEm) {
      const dt = d.criadoEm.toDate ? d.criadoEm.toDate() : new Date(d.criadoEm);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (meses[key]) meses[key].abertas++;
    }
    if (d.dataConclusaoReal) {
      const dt = d.dataConclusaoReal.toDate ? d.dataConclusaoReal.toDate() : new Date(d.dataConclusaoReal);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (meses[key]) meses[key].concluidas++;
    }
  });

  const labels  = Object.values(meses).map(m => m.label);
  const abertas = Object.values(meses).map(m => m.abertas);
  const concluidas = Object.values(meses).map(m => m.concluidas);

  const ctx = document.getElementById('chart-evolucao').getContext('2d');
  if (chartEvolucao) chartEvolucao.destroy();
  chartEvolucao = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Abertas', data: abertas, backgroundColor: 'rgba(91,143,255,0.4)', borderColor: '#5b8fff', borderWidth: 1.5, borderRadius: 4 },
        { label: 'Concluídas', data: concluidas, backgroundColor: 'rgba(62,207,142,0.4)', borderColor: '#3ecf8e', borderWidth: 1.5, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b90a0', font: { size: 12, family: 'DM Sans' } } } },
      scales: {
        x: { ticks: { color: '#8b90a0' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#8b90a0', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ── Exportar Excel ─────────────────────────────────────────
function exportarExcel() {
  // Cria CSV com todos os dados
  const headers = ['ID','Título','Atividade','Área','Tipo','Prioridade','Status','Responsável','Apoio/Equipe','Data Abertura','Prazo','Data Conclusão Real','% Concluído','Entregável','Observações','Avaliação','Dias em Aberto','Cadastrado Por'];

  const rows = allDemandas.map((d,i) => {
    const abertura = d.criadoEm ? fmt(d.criadoEm) : '';
    const prazo    = d.prazo ? fmt(d.prazo) : '';
    const conclusao = d.dataConclusaoReal ? fmt(d.dataConclusaoReal) : '';
    const pct = Math.round((d.porcentoConcluido||0)*100) + '%';
    const diasAb = d.criadoEm ? Math.floor((new Date() - (d.criadoEm.toDate?d.criadoEm.toDate():new Date(d.criadoEm)))/(1000*60*60*24)) : '';

    return [
      i+1,
      `"${(d.titulo||'').replace(/"/g,'""')}"`,
      `"${(d.atividade||'').replace(/"/g,'""')}"`,
      d.area||'',
      d.tipo||'',
      d.prioridade||'',
      d.status||'',
      d.responsavel||'',
      `"${(d.apoio||'').replace(/"/g,'""')}"`,
      abertura, prazo, conclusao, pct,
      `"${(d.entregavel||'').replace(/"/g,'""')}"`,
      `"${(d.observacoes||'').replace(/"/g,'""')}"`,
      d.avaliacao||'',
      diasAb,
      d.criadoPor||''
    ].join(',');
  });

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `CGEG_Demandas_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Arquivo exportado com sucesso!');
}

// ── Fichas de Projeto ──────────────────────────────────────
function limparFicha() {
  const ids = ['pj-nome','pj-area','pj-status','pj-setor-sol','pj-nome-sol','pj-data-sol',
    'pj-como-chegou','pj-setor-dest','pj-publico','pj-gestor','pj-equipe',
    'pj-inicio','pj-termino','pj-encerramento','pj-avanco',
    'pj-objetivo','pj-entregaveis','pj-fora-escopo','pj-atividades','pj-riscos','pj-obs'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  toast('Campos limpos!');
}

function fmtData(val) {
  if (!val) return '—';
  const d = new Date(val + 'T12:00:00');
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

function pj(id) {
  return document.getElementById(id)?.value?.trim() || '—';
}

async function gerarFichaWord() {
  const nome = document.getElementById('pj-nome')?.value?.trim();
  if (!nome) { toast('Preencha o nome do projeto!', 'error'); return; }

  if (!window.docx) { toast('Biblioteca de Word ainda carregando, tente novamente!', 'error'); return; }

  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
          AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
          HeadingLevel } = window.docx;

  const corPrimaria = '1F3D6E'; // azul escuro PGE
  const corSecundaria = 'E8EEF7'; // azul claro fundo

  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  function titulo(texto) {
    return new Paragraph({
      spacing: { before: 320, after: 120 },
      children: [new TextRun({
        text: texto.toUpperCase(),
        bold: true,
        size: 22,
        color: corPrimaria,
        font: 'Arial'
      })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: corPrimaria, space: 4 } }
    });
  }

  function labelValor(label, valor, largLabel = 3000, largValor = 6026) {
    return new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: largLabel, type: WidthType.DXA },
          shading: { fill: corSecundaria, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial', color: '333333' })]
          })]
        }),
        new TableCell({
          borders,
          width: { size: largValor, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text: valor || '—', size: 20, font: 'Arial' })]
          })]
        })
      ]
    });
  }

  function tabelaSecao(rows) {
    return new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [3000, 6026],
      rows
    });
  }

  function espacamento() {
    return new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun('')] });
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
        }
      },
      children: [

        // Cabeçalho
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'PROCURADORIA GERAL DO ESTADO DE SÃO PAULO', bold: true, size: 22, font: 'Arial', color: corPrimaria })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'Coordenadoria de Gestão Estratégica e Governança — CGEG', size: 20, font: 'Arial', color: '555555' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 280 },
          children: [new TextRun({ text: 'FICHA DE ABERTURA DE PROJETO', bold: true, size: 28, font: 'Arial', color: corPrimaria })]
        }),

        // Identificação
        titulo('1. Identificação'),
        tabelaSecao([
          labelValor('Nome do projeto', pj('pj-nome')),
          labelValor('Área responsável', pj('pj-area')),
          labelValor('Status', pj('pj-status')),
        ]),
        espacamento(),

        // Solicitação
        titulo('2. Solicitação'),
        tabelaSecao([
          labelValor('Setor solicitante', pj('pj-setor-sol')),
          labelValor('Nome do solicitante', pj('pj-nome-sol')),
          labelValor('Data da solicitação', fmtData(document.getElementById('pj-data-sol')?.value)),
          labelValor('Como chegou', pj('pj-como-chegou')),
        ]),
        espacamento(),

        // Beneficiários
        titulo('3. Usuários / Beneficiários'),
        tabelaSecao([
          labelValor('Setor que vai receber/usar', pj('pj-setor-dest')),
          labelValor('Público beneficiado', pj('pj-publico')),
        ]),
        espacamento(),

        // Equipe
        titulo('4. Equipe CGEG'),
        tabelaSecao([
          labelValor('Gestor do projeto', pj('pj-gestor')),
          labelValor('Equipe envolvida', pj('pj-equipe')),
        ]),
        espacamento(),

        // Prazos
        titulo('5. Prazos e Avanço'),
        tabelaSecao([
          labelValor('Previsão de início', fmtData(document.getElementById('pj-inicio')?.value)),
          labelValor('Previsão de término', fmtData(document.getElementById('pj-termino')?.value)),
          labelValor('Encerramento real', fmtData(document.getElementById('pj-encerramento')?.value)),
          labelValor('% de avanço', (document.getElementById('pj-avanco')?.value || '0') + '%'),
        ]),
        espacamento(),

        // Escopo
        titulo('6. Escopo do Projeto'),
        tabelaSecao([
          labelValor('Objetivo / Justificativa', pj('pj-objetivo')),
          labelValor('O que será entregue', pj('pj-entregaveis')),
          labelValor('Fora do escopo', pj('pj-fora-escopo')),
          labelValor('Principais atividades', pj('pj-atividades')),
          labelValor('Riscos identificados', pj('pj-riscos')),
          labelValor('Observações gerais', pj('pj-obs')),
        ]),
        espacamento(),

        // Assinaturas
        titulo('7. Aprovação'),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [4513, 4513],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders,
                  width: { size: 4513, type: WidthType.DXA },
                  margins: { top: 400, bottom: 400, left: 120, right: 120 },
                  children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '_______________________________', size: 20, font: 'Arial' })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: 'Gestor do Projeto', bold: true, size: 20, font: 'Arial' })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Data: ___/___/______', size: 18, font: 'Arial', color: '888888' })] }),
                  ]
                }),
                new TableCell({
                  borders,
                  width: { size: 4513, type: WidthType.DXA },
                  margins: { top: 400, bottom: 400, left: 120, right: 120 },
                  children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '_______________________________', size: 20, font: 'Arial' })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: 'Coordenadora CGEG', bold: true, size: 20, font: 'Arial' })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Data: ___/___/______', size: 18, font: 'Arial', color: '888888' })] }),
                  ]
                })
              ]
            })
          ]
        }),

        // Rodapé
        espacamento(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: `Gerado em ${new Intl.DateTimeFormat('pt-BR', {dateStyle:'full'}).format(new Date())} — CGEG/PGE-SP`,
            size: 16, font: 'Arial', color: '999999', italics: true
          })]
        }),

      ]
    }]
  });

  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement('a');
  const nomeArq = (pj('pj-nome')).replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,'_').slice(0,40);
  a.href = url;
  a.download = `Ficha_Projeto_${nomeArq}_${new Date().toISOString().slice(0,10)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Ficha gerada com sucesso!');
}

// ── Calendário ─────────────────────────────────────────────
let calAno  = new Date().getFullYear();
let calMes  = new Date().getMonth();

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const COR_PRIORIDADE = {
  'Urgente': 'var(--red)',
  'Alta':    'var(--amber)',
  'Média':   'var(--accent)',
  'Baixa':   'var(--text3)',
  '—':       'var(--text3)'
};

function mudarMes(delta) {
  calMes += delta;
  if (calMes > 11) { calMes = 0; calAno++; }
  if (calMes < 0)  { calMes = 11; calAno--; }
  renderCalendario();
}

function irParaHoje() {
  calAno = new Date().getFullYear();
  calMes = new Date().getMonth();
  renderCalendario();
}

function renderCalendario() {
  document.getElementById('cal-titulo').textContent = `${MESES[calMes]} ${calAno}`;

  const hoje = new Date();
  const primeiroDia = new Date(calAno, calMes, 1).getDay();
  const ultimoDia   = new Date(calAno, calMes + 1, 0).getDate();

  // Monta mapa de demandas por dia
  const demandaPorDia = {};
  allDemandas.forEach(d => {
    if (!d.prazo) return;
    const p = d.prazo.toDate ? d.prazo.toDate() : new Date(d.prazo);
    if (p.getFullYear() === calAno && p.getMonth() === calMes) {
      const dia = p.getDate();
      if (!demandaPorDia[dia]) demandaPorDia[dia] = [];
      demandaPorDia[dia].push(d);
    }
  });

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Dias vazios antes do primeiro dia
  for (let i = 0; i < primeiroDia; i++) {
    grid.innerHTML += `<div style="min-height:100px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg3);opacity:0.4"></div>`;
  }

  // Dias do mês
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const isHoje = hoje.getDate() === dia && hoje.getMonth() === calMes && hoje.getFullYear() === calAno;
    const demandas = demandaPorDia[dia] || [];
    const temAtrasada = demandas.some(d => d.status !== 'Concluída');

    const diaDiv = document.createElement('div');
    diaDiv.style.cssText = `
      min-height:100px;
      border-right:1px solid var(--border);
      border-bottom:1px solid var(--border);
      padding:8px;
      cursor:${demandas.length ? 'pointer' : 'default'};
      transition:background 0.15s;
      position:relative;
      background:${isHoje ? 'rgba(62,207,142,0.06)' : 'transparent'};
      ${isHoje ? 'box-shadow:inset 0 0 0 1px rgba(62,207,142,0.3);' : ''}
    `;

    // Número do dia — DEVE vir antes do addEventListener
    diaDiv.innerHTML = `
      <div style="font-size:13px;font-weight:${isHoje ? '700' : '500'};color:${isHoje ? 'var(--green)' : '#c0c4d0'};margin-bottom:6px">${dia}</div>
    `;

    if (demandas.length) {
      diaDiv.onmouseover = () => diaDiv.style.background = 'var(--bg3)';
      diaDiv.onmouseout  = () => diaDiv.style.background = isHoje ? 'rgba(62,207,142,0.06)' : 'transparent';
      diaDiv.style.cursor = 'pointer';
      const ids = demandas.map(d => d.id).join(',');
      diaDiv.setAttribute('data-ids', ids);
      diaDiv.setAttribute('data-dia', dia);
      diaDiv.addEventListener('click', function(e) {
        e.stopPropagation();
        const idsArr = this.getAttribute('data-ids').split(',');
        const demandasDia = allDemandas.filter(d => idsArr.includes(d.id));
        const diaNum = parseInt(this.getAttribute('data-dia'));
        abrirCalModal(diaNum, demandasDia);
      });
    }

    // Demandas do dia (máx 3 visíveis)
    const visiveis = demandas.slice(0, 3);
    visiveis.forEach(d => {
      const cor = COR_PRIORIDADE[d.prioridade] || 'var(--text3)';
      const concluida = d.status === 'Concluída';
      const item = document.createElement('div');
      item.style.cssText = `
        font-size:11px;
        padding:2px 6px;
        border-radius:4px;
        margin-bottom:3px;
        background:${cor}22;
        border-left:2px solid ${cor};
        color:${concluida ? 'var(--text3)' : '#e0e2ea'};
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        text-decoration:${concluida ? 'line-through' : 'none'};
      `;
      item.textContent = d.titulo || d.atividade || '—';
      diaDiv.appendChild(item);
    });

    // "+X mais"
    if (demandas.length > 3) {
      const mais = document.createElement('div');
      mais.style.cssText = 'font-size:11px;color:var(--text3);margin-top:2px;padding:0 2px';
      mais.textContent = `+${demandas.length - 3} mais`;
      diaDiv.appendChild(mais);
    }

    grid.appendChild(diaDiv);
  }

  // Preenche o resto da última semana
  const totalCelulas = primeiroDia + ultimoDia;
  const resto = totalCelulas % 7 === 0 ? 0 : 7 - (totalCelulas % 7);
  for (let i = 0; i < resto; i++) {
    grid.innerHTML += `<div style="min-height:100px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg3);opacity:0.4"></div>`;
  }
}

function abrirCalModal(dia, demandas) {
  const dataFmt = new Intl.DateTimeFormat('pt-BR', {day:'2-digit',month:'long',year:'numeric'})
    .format(new Date(calAno, calMes, dia));
  
  document.getElementById('cal-modal-titulo').textContent = `Prazos — ${dataFmt}`;
  
  document.getElementById('cal-modal-lista').innerHTML = demandas.map(d => {
    const cor = COR_PRIORIDADE[d.prioridade] || 'var(--text3)';
    const concluida = d.status === 'Concluída';
    return `
      <div onclick="fecharCalModal();abrirDetalhe('${d.id}')"
        style="display:flex;gap:12px;align-items:flex-start;padding:12px;margin-bottom:8px;
               background:var(--bg3);border-radius:8px;cursor:pointer;border:1px solid var(--border);
               transition:border-color 0.15s"
        onmouseover="this.style.borderColor='${cor}'"
        onmouseout="this.style.borderColor='var(--border)'">
        <div style="width:3px;min-height:40px;border-radius:99px;background:${cor};flex-shrink:0;margin-top:2px"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500;color:${concluida ? 'var(--text3)' : '#ffffff'};
                      text-decoration:${concluida ? 'line-through' : 'none'};margin-bottom:4px">
            ${d.titulo || '—'}
          </div>
          ${d.atividade ? `<div style="font-size:12px;color:var(--text3);margin-bottom:4px">${d.atividade}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:11px;color:#a0a4b0">${d.responsavel || '—'}</span>
            ${d.prioridade ? `<span style="font-size:11px;color:${cor};font-weight:500">${d.prioridade}</span>` : ''}
            <span style="font-size:11px;color:${concluida ? 'var(--green)' : 'var(--text3)'}">${d.status || '—'}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  const modal = document.getElementById('cal-modal');
  modal.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:2000;align-items:center;justify-content:center;padding:20px';
  modal.onclick = e => { if (e.target === modal) fecharCalModal(); };
}

function fecharCalModal() {
  const modal = document.getElementById('cal-modal');
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:2000';
}
