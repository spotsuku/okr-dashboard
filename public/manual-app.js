/* ================================================================
   NEO福岡 業務マニュアル — Application Logic
   Expects: ALL_DATA, ALL_META, DEPT_ORDER from manual-data.js
================================================================ */
const STORAGE_PREFIX = 'neo_manual_v1_';
let currentTeamId = null;
let editMode = false;
let dirty = false;
let snapshot = '';
let teamData = null;

/* ================================================================
   ROUTING
================================================================ */
function showHome() {
  currentTeamId = null;
  editMode = false;
  document.body.classList.remove('edit-mode');
  updateEditToggle();
  renderHome();
  setBreadcrumb([]);
  document.querySelectorAll('.team-link').forEach(l => l.classList.remove('active'));
  document.getElementById('homeLink').classList.add('active');
  closeSidebarMobile();
}

function showTeam(id) {
  if (dirty && currentTeamId) {
    if (!confirm('保存されていない変更があります。破棄しますか？')) return;
  }
  dirty = false;
  document.getElementById('saveBanner').classList.remove('show');
  currentTeamId = id;
  const saved = localStorage.getItem(STORAGE_PREFIX + id);
  if (saved) { try { teamData = JSON.parse(saved); } catch(e) { teamData = JSON.parse(JSON.stringify(ALL_DATA[id])); } }
  else { teamData = JSON.parse(JSON.stringify(ALL_DATA[id])); }
  teamData.phases.forEach(ph => ph.steps.forEach(s => { if (!s.urls) s.urls = []; }));
  snapshot = JSON.stringify(teamData);
  const meta = ALL_META.find(m => m.id === id);
  renderTeamPage(meta);
  updateBreadcrumb(meta);
  document.querySelectorAll('.team-link').forEach(l => {
    l.classList.toggle('active', l.dataset.teamid === id);
  });
  document.getElementById('homeLink').classList.remove('active');
  const activeLink = document.querySelector(`.team-link[data-teamid="${id}"]`);
  if (activeLink) {
    const list = activeLink.closest('.team-list');
    if (list) { list.classList.add('open'); list.previousElementSibling.classList.add('open'); }
  }
  closeSidebarMobile();
  window.scrollTo(0,0);
}

function setBreadcrumb(parts) {
  const bc = document.getElementById('breadcrumb');
  if (!parts.length) { bc.innerHTML = '<span class="cur">トップ</span>'; return; }
  let html = '<span style="cursor:pointer;color:rgba(255,255,255,.45)" onclick="showHome()">トップ</span>';
  parts.forEach((p, i) => {
    html += '<span class="sep">›</span>';
    if (i < parts.length - 1) html += `<span>${esc(p)}</span>`;
    else html += `<span class="cur">${esc(p)}</span>`;
  });
  bc.innerHTML = html;
}

function updateBreadcrumb(meta) {
  setBreadcrumb([meta.dept, meta.name]);
}

/* ================================================================
   HOME PAGE
================================================================ */
function renderHome() {
  const wrap = document.getElementById('mainWrap');
  let html = `
    <div class="home-hero">
      <div class="home-hero-inner">
        <p class="home-eyebrow">Internal Business Manual · 2026年度版</p>
        <h1>NEO福岡<br>業務マニュアル</h1>
        <p>各事業部・チームの仕事の流れ・考え方・業務一覧をまとめたリファレンスです。左のサイドバー、または下のカードからチームを選んでください。</p>
      </div>
    </div>
  `;
  DEPT_ORDER.forEach(dept => {
    const teams = ALL_META.filter(m => m.color === dept.color);
    html += `<div class="dept-section-title">${esc(dept.name)}</div>`;
    html += `<div class="team-cards">`;
    teams.forEach(t => {
      html += `
        <div class="team-card" onclick="showTeam('${t.id}')" style="border-top:3px solid ${dept.accent}">
          <div class="team-card-top">
            <div class="team-card-icon" style="background:${dept.bg}">${t.icon}</div>
            <h3 style="color:${dept.accent}">${esc(t.name)}</h3>
          </div>
          <p>${esc(t.desc.substring(0,60))}...</p>
        </div>
      `;
    });
    html += `</div>`;
  });
  wrap.innerHTML = html;
}

/* ================================================================
   TEAM PAGE RENDER
================================================================ */
function renderTeamPage(meta) {
  applyAccentVars(meta);
  const wrap = document.getElementById('mainWrap');
  wrap.innerHTML = `
    <div class="edit-hint">✎ 編集モード中 — テキストをクリックして直接編集できます。URLは各ステップの詳細内で追加・編集できます。</div>
    <div class="hero" style="background:${meta.accent_bg};border-color:${meta.accent}">
      <div class="hero-tag" style="color:${meta.accent}" contenteditable="false">${esc(meta.dept)}</div>
      <h1 style="color:${meta.accent}" contenteditable="false">${meta.icon} ${esc(meta.name)}</h1>
      <p class="hero-desc" contenteditable="false" data-herofield="desc">${esc(meta.desc)}</p>
    </div>
    <div class="sec-label">全体の流れ（概念）</div>
    <div class="concept-flow"><div class="concept-row" id="conceptFlow"></div></div>
    <div id="phasesContainer"></div>
    <button class="add-phase-btn" onclick="addPhase()">＋ フェーズを追加</button>
    <div class="sec-label">考え方・マインドセット</div>
    <div class="mindset-grid" id="mindsetGrid"></div>
    <button class="edit-add-btn" onclick="addMindset()">＋ マインドセットを追加</button>
    <div class="sec-label" style="margin-top:8px;">業務一覧</div>
    <div class="task-list" id="taskList"></div>
    <button class="edit-add-btn" onclick="addTask()">＋ 業務を追加</button>
  `;
  renderConceptFlow(meta.accent);
  renderPhases(meta);
  renderMindsets(meta.accent);
  renderTasks(meta.accent);
  if (editMode) setEditable(true);
}

function applyAccentVars(meta) {
  document.documentElement.style.setProperty('--cur-accent', meta.accent);
  document.documentElement.style.setProperty('--cur-accent-bg', meta.accent_bg);
}

/* ================================================================
   CONCEPT FLOW
================================================================ */
function renderConceptFlow(accent) {
  const row = document.getElementById('conceptFlow');
  if (!row) return;
  row.innerHTML = '';
  teamData.conceptSteps.forEach((name, i) => {
    const s = document.createElement('div');
    s.className = 'c-step';
    s.innerHTML = `<div class="c-num" style="background:${accent}">${i+1}</div><div class="c-name" contenteditable="false" data-cfield="${i}">${esc(name).replace(/\n/g,'<br>')}</div>`;
    row.appendChild(s);
    if (i < teamData.conceptSteps.length - 1) {
      const a = document.createElement('div'); a.className = 'c-arrow'; a.textContent = '→'; row.appendChild(a);
    }
  });
}

/* ================================================================
   PHASES
================================================================ */
function renderPhases(meta) {
  const c = document.getElementById('phasesContainer');
  if (!c) return;
  c.innerHTML = '';
  teamData.phases.forEach((ph, pi) => c.appendChild(buildPhaseBlock(ph, pi, meta)));
}

function buildPhaseBlock(ph, pi, meta) {
  const block = document.createElement('div');
  block.className = 'phase-block';
  const hdr = document.createElement('div');
  hdr.className = 'phase-header';
  hdr.innerHTML = `
    <span class="phase-badge ${ph.badgeClass}" contenteditable="false" data-pfield="${pi}-badge">${esc(ph.badge)}</span>
    <span class="phase-title-text" contenteditable="false" data-pfield="${pi}-title">${esc(ph.title)}</span>
    <button class="phase-del-btn" onclick="deletePhase(${pi})">✕ フェーズを削除</button>
  `;
  block.appendChild(hdr);
  const sw = document.createElement('div'); sw.id = `steps-${pi}`;
  ph.steps.forEach((step, si) => sw.appendChild(buildStepCard(pi, si, step, ph.badgeClass, meta)));
  block.appendChild(sw);
  const ab = document.createElement('button'); ab.className = 'edit-add-btn'; ab.textContent = '＋ ステップを追加'; ab.onclick = () => addStep(pi);
  block.appendChild(ab);
  return block;
}

function buildStepCard(pi, si, step, cls, meta) {
  const accent = (meta || ALL_META.find(m=>m.id===currentTeamId)||{accent:'#888'}).accent;
  const card = document.createElement('div');
  card.className = 'step-card';
  const hasCaution = step.caution && step.caution.trim();
  const urls = step.urls || [];
  const chips = urls.filter(u=>u.href).map(u => `<div class="url-chip"><span class="url-icon">🔗</span><a href="${escAttr(u.href)}" target="_blank" rel="noopener">${esc(u.label||u.href)}</a></div>`).join('');
  const editRows = urls.map((u,ui) => `
    <div class="url-edit-row" data-url-idx="${ui}">
      <input class="url-edit-label-input" type="text" value="${escAttr(u.label)}" placeholder="表示名" data-urlfield="${pi}-${si}-${ui}-label" oninput="markDirty()">
      <span class="url-sep">→</span>
      <input class="url-edit-url-input" type="url" value="${escAttr(u.href)}" placeholder="https://..." data-urlfield="${pi}-${si}-${ui}-href" oninput="markDirty()">
      <button class="url-del-btn" onclick="deleteUrl(${pi},${si},${ui})" title="削除">✕</button>
    </div>`).join('');
  card.innerHTML = `
    <button class="del-btn" onclick="deleteStep(${pi},${si})">✕</button>
    <div class="step-head" onclick="toggleExpand(this)">
      <div class="step-num-badge" style="background:${accent}">${si+1}</div>
      <div class="step-title-wrap">
        <div class="step-title" contenteditable="false" data-sfield="${pi}-${si}-title">${esc(step.title)}</div>
      </div>
      <div class="step-expand-icon">▼</div>
    </div>
    <div class="step-detail">
      <div class="detail-grid">
        <div>
          <div class="detail-label">担当者</div>
          <div class="detail-value" contenteditable="false" data-sfield="${pi}-${si}-owner">${esc(step.owner)}</div>
        </div>
        <div class="tool-block">
          <div class="tool-name-row">
            <div class="detail-label">使用ツール・場所</div>
            <div class="detail-value" contenteditable="false" data-sfield="${pi}-${si}-tool">${esc(step.tool)}</div>
          </div>
          ${chips ? `<div class="url-list">${chips}</div>` : ''}
          <div class="url-edit-list">${editRows}</div>
          <button class="url-add-btn" onclick="addUrl(${pi},${si})">＋ URLを追加</button>
        </div>
      </div>
      <div class="condition-box">
        <div class="clabel">✅ 完了条件</div>
        <div class="cval" contenteditable="false" data-sfield="${pi}-${si}-condition">${esc(step.condition)}</div>
      </div>
      <div class="caution-box"${hasCaution ? '' : ' style="display:none"'}>
        <div class="clabel">⚠️ 注意点</div>
        <div class="cval" contenteditable="false" data-sfield="${pi}-${si}-caution">${esc(step.caution||'')}</div>
      </div>
    </div>
  `;
  return card;
}

function toggleExpand(head) { head.closest('.step-card').classList.toggle('expanded'); }

/* ================================================================
   MINDSETS & TASKS
================================================================ */
function renderMindsets(accent) {
  const grid = document.getElementById('mindsetGrid');
  if (!grid) return;
  grid.innerHTML = '';
  teamData.mindsets.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'mindset-card';
    card.innerHTML = `
      <button class="del-btn" onclick="deleteMindset(${i})">✕</button>
      <div class="m-icon" contenteditable="false" data-mfield="${i}-icon">${m.icon}</div>
      <div class="m-title" contenteditable="false" data-mfield="${i}-title">${esc(m.title)}</div>
      <div class="m-body" contenteditable="false" data-mfield="${i}-body">${esc(m.body)}</div>
    `;
    grid.appendChild(card);
  });
}

function renderTasks(accent) {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';
  teamData.tasks.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.innerHTML = `
      <button class="del-btn" onclick="deleteTask(${i})">✕</button>
      <div class="task-idx" style="background:${accent}">${i+1}</div>
      <div>
        <div class="task-text" contenteditable="false" data-tfield="${i}-text">${esc(t.text)}</div>
        <div class="task-meta" contenteditable="false" data-tfield="${i}-meta">${esc(t.meta)}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

/* ================================================================
   URL OPS
================================================================ */
function addUrl(pi, si) {
  collectEdits();
  teamData.phases[pi].steps[si].urls.push({label:'', href:''});
  reRender(); markDirty();
}
function deleteUrl(pi, si, ui) {
  collectEdits();
  teamData.phases[pi].steps[si].urls.splice(ui, 1);
  reRender(); markDirty();
}

/* ================================================================
   EDIT MODE
================================================================ */
function toggleEditMode() {
  if (!currentTeamId) return;
  editMode = !editMode;
  updateEditToggle();
  document.body.classList.toggle('edit-mode', editMode);
  setEditable(editMode);
}
function updateEditToggle() {
  const toggle = document.getElementById('editToggle');
  toggle.classList.toggle('active', editMode);
  toggle.querySelector('span:last-child').textContent = editMode ? '編集中...' : '編集モード';
}
function setEditable(on) {
  document.querySelectorAll('[contenteditable]').forEach(el => {
    el.contentEditable = on ? 'true' : 'false';
    el.removeEventListener('input', markDirty);
    if (on) el.addEventListener('input', markDirty);
  });
}
function markDirty() {
  dirty = true;
  document.getElementById('saveBanner').classList.add('show');
}

/* ================================================================
   COLLECT EDITS
================================================================ */
function collectEdits() {
  if (!teamData) return;
  document.querySelectorAll('[data-cfield]').forEach(el => {
    const i = +el.dataset.cfield;
    if (!isNaN(i) && teamData.conceptSteps[i] !== undefined) teamData.conceptSteps[i] = el.innerText.trim();
  });
  document.querySelectorAll('[data-pfield]').forEach(el => {
    const [pi, field] = el.dataset.pfield.split('-');
    if (teamData.phases[+pi]) teamData.phases[+pi][field] = el.innerText.trim();
  });
  document.querySelectorAll('[data-sfield]').forEach(el => {
    const parts = el.dataset.sfield.split('-');
    const pi=+parts[0],si=+parts[1],field=parts[2];
    if (teamData.phases[pi]?.steps[si]) teamData.phases[pi].steps[si][field] = el.innerText.trim();
  });
  document.querySelectorAll('[data-urlfield]').forEach(el => {
    const parts = el.dataset.urlfield.split('-');
    const pi=+parts[0],si=+parts[1],ui=+parts[2],field=parts[3];
    const step = teamData.phases[pi]?.steps[si];
    if (step?.urls[ui] !== undefined) step.urls[ui][field] = el.value.trim();
  });
  document.querySelectorAll('[data-mfield]').forEach(el => {
    const [i, field] = el.dataset.mfield.split('-');
    if (teamData.mindsets[+i]) teamData.mindsets[+i][field] = el.innerText.trim();
  });
  document.querySelectorAll('[data-tfield]').forEach(el => {
    const [i, field] = el.dataset.tfield.split('-');
    if (teamData.tasks[+i]) teamData.tasks[+i][field] = el.innerText.trim();
  });
}

function saveData() {
  if (!currentTeamId) return;
  collectEdits();
  localStorage.setItem(STORAGE_PREFIX + currentTeamId, JSON.stringify(teamData));
  snapshot = JSON.stringify(teamData);
  dirty = false;
  document.getElementById('saveBanner').classList.remove('show');
  const flash = document.getElementById('savedFlash');
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 2000);
}

function discardChanges() {
  if (!confirm('変更を破棄して元に戻しますか？')) return;
  teamData = JSON.parse(snapshot);
  dirty = false;
  document.getElementById('saveBanner').classList.remove('show');
  const meta = ALL_META.find(m => m.id === currentTeamId);
  if (meta) renderTeamPage(meta);
}

/* ================================================================
   ADD / DELETE
================================================================ */
function reRender() {
  const meta = ALL_META.find(m => m.id === currentTeamId);
  if (!meta) return;
  renderConceptFlow(meta.accent);
  renderPhases(meta);
  renderMindsets(meta.accent);
  renderTasks(meta.accent);
  if (editMode) setEditable(true);
}
function mut(fn) { collectEdits(); fn(); reRender(); markDirty(); }

function addPhase()        { mut(() => teamData.phases.push({badge:'新フェーズ',badgeClass:'operate',title:'フェーズ名を入力',steps:[{title:'ステップ1',owner:'担当者',tool:'ツール',urls:[],condition:'完了条件',caution:''}]})); }
function deletePhase(pi)   { if (!confirm(`「${teamData.phases[pi].badge}」を削除しますか？`)) return; mut(() => teamData.phases.splice(pi,1)); }
function addStep(pi)       { mut(() => teamData.phases[pi].steps.push({title:'新しいステップ',owner:'担当者',tool:'ツール',urls:[],condition:'完了条件を記入',caution:''})); }
function deleteStep(pi,si) { if (!confirm(`「${teamData.phases[pi].steps[si].title}」を削除しますか？`)) return; mut(() => teamData.phases[pi].steps.splice(si,1)); }
function addMindset()      { mut(() => teamData.mindsets.push({icon:'💡',title:'新しいマインドセット',body:'ここに内容を入力'})); }
function deleteMindset(i)  { if (!confirm(`「${teamData.mindsets[i].title}」を削除しますか？`)) return; mut(() => teamData.mindsets.splice(i,1)); }
function addTask()         { mut(() => teamData.tasks.push({text:'新しい業務',meta:'実責：担当者名'})); }
function deleteTask(i)     { if (!confirm('この業務を削除しますか？')) return; mut(() => teamData.tasks.splice(i,1)); }

/* ================================================================
   SIDEBAR
================================================================ */
function toggleDept(btn) {
  const list = btn.nextElementSibling;
  const isOpen = list.classList.contains('open');
  document.querySelectorAll('.team-list').forEach(l => l.classList.remove('open'));
  document.querySelectorAll('.dept-btn').forEach(b => b.classList.remove('open'));
  if (!isOpen) { list.classList.add('open'); btn.classList.add('open'); }
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}
function closeSidebarMobile() {
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
  }
}

/* ================================================================
   UTILS
================================================================ */
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }

/* ================================================================
   BOOT
================================================================ */
showHome();
