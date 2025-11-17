/* app.js - TradeTrackr PWA
   Adds: PIN login (4-digit), Add Material to Job, Logout
*/
(async () => {
  // ----- Utilities & constants -----
  const STORAGE_KEY = 'tt_data_v1';
  const PIN_HASH_KEY = 'tt_pin_hash_v1';
  const AUTH_SESSION_KEY = 'tt_auth_v1'; // stored in sessionStorage
  const appEl = document.getElementById('app');
  const view = document.getElementById('view');
  const pageTitle = document.getElementById('pageTitle');
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const addBtn = document.getElementById('addBtn');
  const fileInput = document.getElementById('fileInput');

  function uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2,9); }
  function nowISO(){ return (new Date()).toISOString(); }

  // ----- Crypto helper (SHA-256 to hex) -----
  async function sha256Hex(str){
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    // convert to hex
    const h = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    return h;
  }

  // ----- Default seed data -----
  function defaultData(){
    const c1 = { id: uid('client'), name: 'John Smith', phone: '07111 222333', email: '', address:'12 High St', createdAt: nowISO()};
    const m1 = { id: uid('mat'), name: 'Boiler', unitPrice: 450.0, createdAt: nowISO() };
    const j1 = {
      id: uid('job'),
      title: 'Kitchen Tap Replacement',
      clientId: c1.id,
      address: '12 High St, London',
      notes: 'Replace tap; check valves.',
      status: 'pending',
      quote: 150,
      hours: 1.5,
      materials: [{ id: m1.id, name: m1.name, qty: 1, price: m1.unitPrice}],
      photos: [],
      startDate: null,
      endDate: null,
      createdAt: nowISO()
    };
    return { clients: [c1], materials: [m1], jobs: [j1], settings: { bizName:'Your Business', vat:0, hourlyRate:0 } };
  }

  // ----- Storage helpers -----
  function loadData(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = defaultData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    try { return JSON.parse(raw); } catch(e){ const seed = defaultData(); localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); return seed; }
  }
  function saveData(data){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

  // ----- Auth helpers -----
  async function hasPin(){
    return !!localStorage.getItem(PIN_HASH_KEY);
  }
  async function setPin(pin){
    const h = await sha256Hex(pin);
    localStorage.setItem(PIN_HASH_KEY, h);
  }
  async function verifyPin(pin){
    const stored = localStorage.getItem(PIN_HASH_KEY);
    if (!stored) return false;
    const h = await sha256Hex(pin);
    return h === stored;
  }
  function isAuthenticated(){
    return sessionStorage.getItem(AUTH_SESSION_KEY) === '1';
  }
  function setAuthenticated(val){
    if (val) sessionStorage.setItem(AUTH_SESSION_KEY, '1');
    else sessionStorage.removeItem(AUTH_SESSION_KEY);
  }
  function logout(){
    setAuthenticated(false);
    location.hash = '#/login';
    route(); // force login screen
  }

  // ----- App state -----
  let state = loadData();

  // ----- Service worker registration -----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{ /* ignore */});
  }

  // ----- Router -----
  function route(){
    const hash = location.hash || '#/';
    // If not authenticated, always show login
    if (!isAuthenticated()) {
      renderLogin();
      return;
    }

    // hide sidebar on nav
    sidebar.classList.add('hidden');
    const parts = hash.replace(/^#/,'').split('/');
    if (hash === '#/' || hash === '') { renderDashboard(); return; }
    if (hash.startsWith('#/jobs/') && parts[2]) { renderJobDetail(parts[2]); return; }
    if (hash.startsWith('#/jobs')) { renderJobs(); return; }
    if (hash.startsWith('#/clients')) { renderClients(); return; }
    if (hash.startsWith('#/materials')) { renderMaterials(); return; }
    if (hash.startsWith('#/settings')) { renderSettings(); return; }
    renderDashboard();
  }

  // ----- Render helpers -----
  function clearView(){ view.innerHTML = ''; }

  function renderLogin(){
    pageTitle.textContent = 'Sign in';
    clearView();
    // build login UI from scratch (simple)
    const div = document.createElement('div');
    div.className = 'page';
    const has = localStorage.getItem(PIN_HASH_KEY) ? true : false;

    const html = has ? `
      <h2>Enter PIN</h2>
      <p>Enter your 4-digit PIN to unlock.</p>
      <input id="pinInput" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" />
      <div class="row" style="margin-top:12px">
        <button id="pinSubmit" class="btn primary">Unlock</button>
      </div>
      <p class="muted small" style="margin-top:12px">If you forgot your PIN, you can reset it (this will erase app data).</p>
      <div class="row" style="margin-top:8px">
        <button id="resetPinBtn" class="btn danger">Reset App</button>
      </div>
    ` : `
      <h2>Set a 4-digit PIN</h2>
      <p>Create a PIN to protect access to the app on this device.</p>
      <input id="pinNew" type="password" inputmode="numeric" maxlength="6" placeholder="New PIN" />
      <input id="pinConfirm" type="password" inputmode="numeric" maxlength="6" placeholder="Confirm PIN" style="margin-top:8px"/>
      <div class="row" style="margin-top:12px">
        <button id="pinCreate" class="btn primary">Set PIN</button>
      </div>
    `;
    div.innerHTML = html;
    view.appendChild(div);

    // Wire up
    if (has) {
      const pinInput = document.getElementById('pinInput');
      const submit = document.getElementById('pinSubmit');
      submit.addEventListener('click', async ()=>{
        const v = (pinInput.value||'').trim();
        if (!v) return alert('Enter PIN');
        const ok = await verifyPin(v);
        if (ok) { setAuthenticated(true); route(); } else { alert('Wrong PIN'); }
      });

      document.getElementById('resetPinBtn').addEventListener('click', ()=>{
        if (!confirm('Reset will erase ALL local app data and remove PIN. Continue?')) return;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PIN_HASH_KEY);
        state = loadData();
        setAuthenticated(false);
        alert('App reset. Please set a new PIN.');
        renderLogin();
      });

    } else {
      document.getElementById('pinCreate').addEventListener('click', async ()=>{
        const p1 = document.getElementById('pinNew').value.trim();
        const p2 = document.getElementById('pinConfirm').value.trim();
        if (!p1 || !p2) return alert('Enter and confirm PIN');
        if (p1 !== p2) return alert('PINs do not match');
        if (!/^[0-9]{4,6}$/.test(p1)) return alert('PIN should be 4-6 digits');
        await setPin(p1);
        alert('PIN saved. Please sign in.');
        renderLogin();
      });
    }
  }

  function renderDashboard(){
    pageTitle.textContent = 'Dashboard';
    clearView();
    const tpl = document.getElementById('tpl-dashboard').content.cloneNode(true);
    const todayList = tpl.getElementById('todayList');
    const upcomingList = tpl.getElementById('upcomingList');

    const todayISO = new Date().toISOString().slice(0,10);
    const jobsToday = state.jobs.filter(j => j.startDate && j.startDate.slice(0,10) === todayISO);
    const upcoming = state.jobs.filter(j => !j.startDate || (j.startDate && j.startDate.slice(0,10) >= todayISO)).slice(0,10);

    if (!jobsToday.length) todayList.innerHTML = '<div class="card muted">No jobs today</div>';
    jobsToday.forEach(j => todayList.appendChild(jobCardEl(j)));

    if (!upcoming.length) upcomingList.innerHTML = '<div class="card muted">No upcoming jobs</div>';
    upcoming.forEach(j => upcomingList.appendChild(jobCardEl(j)));

    view.appendChild(tpl);
  }

  function jobCardEl(job){
    const el = document.createElement('div');
    el.className = 'job-card';
    const left = document.createElement('div');
    const right = document.createElement('div');
    left.innerHTML = `<div><strong>${escapeHtml(job.title)}</strong></div>
                      <div class="meta">${escapeHtml(clientName(job.clientId))} • ${escapeHtml(job.address||'')}</div>
                      <div class="small">${job.status}</div>`;
    right.innerHTML = `<div><strong>£${Number(job.quote||0).toFixed(2)}</strong></div>`;
    el.appendChild(left); el.appendChild(right);
    el.addEventListener('click', ()=> location.hash = `#/jobs/${job.id}`);
    return el;
  }

  function clientName(id){
    const c = state.clients.find(x=>x.id===id);
    return c ? c.name : 'No client';
  }

  function renderJobs(){
    pageTitle.textContent = 'Jobs';
    clearView();
    const tpl = document.getElementById('tpl-jobs').content.cloneNode(true);
    const list = tpl.getElementById('jobsList');
    const filter = tpl.getElementById('jobFilter');
    const statusFilter = tpl.getElementById('jobStatusFilter');

    function refreshList(){
      list.innerHTML = '';
      const q = filter.value.toLowerCase();
      const status = statusFilter.value;
      state.jobs.filter(j=>{
        const matchesQ = !q || j.title.toLowerCase().includes(q) || (j.notes||'').toLowerCase().includes(q) || clientName(j.clientId).toLowerCase().includes(q);
        const matchesStatus = !status || j.status===status;
        return matchesQ && matchesStatus;
      }).forEach(j => list.appendChild(jobCardEl(j)));
    }
    filter.addEventListener('input', refreshList);
    statusFilter.addEventListener('change', refreshList);

    refreshList();
    view.appendChild(tpl);
  }

  function renderJobDetail(id){
    const job = state.jobs.find(j=>j.id===id);
    if (!job) return renderJobs();
    pageTitle.textContent = 'Job';
    clearView();
    const tpl = document.getElementById('tpl-job-detail').content.cloneNode(true);
    tpl.getElementById('jobTitle').textContent = job.title;
    tpl.getElementById('jobClient').textContent = clientName(job.clientId);
    tpl.getElementById('jobAddress').textContent = job.address || '';
    tpl.getElementById('jobNotes').textContent = job.notes || '';
    tpl.getElementById('jobQuote').textContent = `£${Number(job.quote||0).toFixed(2)}`;
    tpl.getElementById('jobHours').textContent = String(job.hours||0);
    tpl.getElementById('jobStatus').textContent = job.status || 'pending';

    const photosWrap = tpl.getElementById('photosWrap');
    job.photos.forEach(b64 => {
      const img = document.createElement('img'); img.src = b64; photosWrap.appendChild(img);
    });

    const jobMaterials = tpl.getElementById('jobMaterials');
    if (!job.materials || !job.materials.length) jobMaterials.innerHTML = '<div class="muted">No materials</div>';
    else job.materials.forEach(m=>{
      const div = document.createElement('div'); div.className='card';
      div.innerHTML = `<div><strong>${escapeHtml(m.name)}</strong></div>
                       <div class="small">qty: ${m.qty} • £${Number(m.price).toFixed(2)}</div>`;
      jobMaterials.appendChild(div);
    });

    // Actions
    tpl.getElementById('startStopBtn').addEventListener('click', ()=>{
      if (job.status === 'in_progress') {
        job.status = 'completed'; job.endDate = nowISO();
      } else {
        job.status = 'in_progress'; job.startDate = nowISO();
      }
      saveData(state); renderJobDetail(id);
    });

    tpl.getElementById('editJobBtn').addEventListener('click', ()=> renderEditJob(job));
    tpl.getElementById('deleteJobBtn').addEventListener('click', ()=>{
      if (confirm('Delete this job?')) {
        state.jobs = state.jobs.filter(x=>x.id!==job.id); saveData(state); location.hash = '#/jobs';
      }
    });

    // NEW: Add Material to Job (friendly picker)
    const addMatBtn = tpl.getElementById('addMaterialToJobBtn');
    if (addMatBtn) {
      addMatBtn.addEventListener('click', ()=> {
        if (!state.materials.length) {
          alert('No materials found. Add some in the Materials tab first.');
          return;
        }
        // show numbered list and ask for index
        let listText = 'Select material by number:\\n';
        state.materials.forEach((m,i)=> listText += `${i+1}. ${m.name} (£${Number(m.unitPrice||0).toFixed(2)})\\n`);
        const sel = prompt(listText + '\\nEnter number (e.g. 1):');
        if (!sel) return;
        const idx = parseInt(sel,10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= state.materials.length) { alert('Invalid selection'); return; }
        const mat = state.materials[idx];
        const qtyRaw = prompt(`Quantity for ${mat.name}?`, '1');
        const qty = parseFloat(qtyRaw || '0');
        if (!qty || qty <= 0) return;
        job.materials.push({ id: mat.id, name: mat.name, qty, price: mat.unitPrice });
        saveData(state);
        renderJobDetail(id);
      });
    }

    tpl.getElementById('addPhotoInput').addEventListener('click', ()=> {
      fileInput.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const maxBytes = 1024*1024*2; // 2MB recommended
        if (f.size > maxBytes && !confirm('Photo is large (>2MB). Continue?')) return;
        const b64 = await fileToBase64(f);
        job.photos.push(b64);
        saveData(state); renderJobDetail(id);
      };
      fileInput.click();
    });

    tpl.getElementById('printInvoiceBtn').addEventListener('click', ()=> {
      printInvoice(job);
    });

    view.appendChild(tpl);
  }

  function fileToBase64(file){
    return new Promise((res,rej)=>{
      const r = new FileReader();
      r.onload = ()=> res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function renderEditJob(job){
    pageTitle.textContent = job ? 'Edit Job' : 'New Job';
    clearView();
    const tpl = document.getElementById('tpl-edit-job').content.cloneNode(true);
    const form = tpl.getElementById('jobForm');
    const clientSelect = form.elements['client'];

    // populate clients
    clientSelect.innerHTML = '<option value="">— select —</option>' + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (job) {
      tpl.getElementById('editTitle').textContent = 'Edit Job';
      form.elements['title'].value = job.title;
      form.elements['client'].value = job.clientId || '';
      form.elements['address'].value = job.address || '';
      form.elements['quote'].value = job.quote || '';
      form.elements['hours'].value = job.hours || '';
      form.elements['notes'].value = job.notes || '';
    }

    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const data = {
        title: form.elements['title'].value.trim(),
        clientId: form.elements['client'].value || null,
        address: form.elements['address'].value.trim(),
        quote: parseFloat(form.elements['quote'].value) || 0,
        hours: parseFloat(form.elements['hours'].value) || 0,
        notes: form.elements['notes'].value.trim()
      };
      if (!data.title) { alert('Please add a title'); return; }
      if (job) {
        Object.assign(job, data);
      } else {
        const newJob = {
          id: uid('job'),
          ...data,
          status: 'pending',
          materials: [],
          photos: [],
          startDate: null,
          endDate: null,
          createdAt: nowISO()
        };
        state.jobs.unshift(newJob);
      }
      saveData(state);
      location.hash = '#/jobs';
    });

    tpl.getElementById('cancelEdit').addEventListener('click', ()=> location.hash = '#/jobs');

    view.appendChild(tpl);
  }

  function renderClients(){
    pageTitle.textContent = 'Clients';
    clearView();
    const tpl = document.getElementById('tpl-clients').content.cloneNode(true);
    const list = tpl.getElementById('clientsList');
    const addBtn = tpl.getElementById('addClientBtn');

    function refresh(){
      list.innerHTML = '';
      if (!state.clients.length) list.innerHTML = '<div class="muted card">No clients</div>';
      state.clients.forEach(c=>{
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<div><strong>${escapeHtml(c.name)}</strong></div>
                        <div class="small">${escapeHtml(c.phone||'')} ${escapeHtml(c.email||'')}</div>`;
        el.addEventListener('click', ()=> {
          const name = prompt('Edit name', c.name);
          if (name !== null) { c.name = name; saveData(state); refresh(); }
        });
        list.appendChild(el);
      });
    }

    addBtn.addEventListener('click', ()=>{
      const name = prompt('Client name');
      if (!name) return;
      const phone = prompt('Phone (optional)') || '';
      const email = prompt('Email (optional)') || '';
      state.clients.push({ id: uid('client'), name, phone, email, createdAt: nowISO()});
      saveData(state); refresh();
    });

    refresh();
    view.appendChild(tpl);
  }

  function renderMaterials(){
    pageTitle.textContent = 'Materials';
    clearView();
    const tpl = document.getElementById('tpl-materials').content.cloneNode(true);
    const list = tpl.getElementById('materialsList');
    const addBtn = tpl.getElementById('addMaterialBtn');

    function refresh(){
      list.innerHTML = '';
      if (!state.materials.length) list.innerHTML = '<div class="muted card">No materials</div>';
      state.materials.forEach(m=>{
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<div><strong>${escapeHtml(m.name)}</strong></div><div class="small">£${Number(m.unitPrice||0).toFixed(2)}</div>`;
        el.addEventListener('click', ()=> {
          const newPrice = prompt('Unit price', String(m.unitPrice||0));
          if (newPrice !== null) { m.unitPrice = parseFloat(newPrice)||0; saveData(state); refresh(); }
        });
        list.appendChild(el);
      });
    }

    addBtn.addEventListener('click', ()=>{
      const name = prompt('Material name'); if (!name) return;
      const price = parseFloat(prompt('Unit price','0')||'0');
      state.materials.push({ id: uid('mat'), name, unitPrice: price, createdAt: nowISO()});
      saveData(state); refresh();
    });

    refresh();
    view.appendChild(tpl);
  }

  function renderSettings(){
    pageTitle.textContent = 'Settings';
    clearView();
    const tpl = document.getElementById('tpl-settings').content.cloneNode(true);
    const biz = tpl.getElementById('bizName');
    const vat = tpl.getElementById('vat');
    biz.value = state.settings.bizName || '';
    vat.value = state.settings.vat || 0;

    // Logout button (if present in template)
    const logoutBtn = tpl.querySelector('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', ()=>{
        if (!confirm('Log out? You will need your PIN to sign back in.')) return;
        setAuthenticated(false);
        route();
      });
    }

    tpl.getElementById('exportBtn').addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'trade-trackr-export.json'; a.click();
      URL.revokeObjectURL(url);
    });
    tpl.getElementById('importBtn').addEventListener('click', ()=>{
      const input = document.createElement('input'); input.type='file'; input.accept='application/json';
      input.onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            const imported = JSON.parse(r.result);
            state = imported; saveData(state); alert('Imported'); route();
          } catch(err){ alert('Invalid JSON'); }
        };
        r.readAsText(f);
      };
      input.click();
    });

    biz.addEventListener('change', ()=> { state.settings.bizName = biz.value; saveData(state); });
    vat.addEventListener('change', ()=> { state.settings.vat = parseFloat(vat.value)||0; saveData(state); });

    view.appendChild(tpl);
  }

  // ---- Invoice print (simple)
  function printInvoice(job){
    const client = state.clients.find(c=>c.id===job.clientId) || {};
    const win = window.open('', '_blank', 'noopener');
    const totalMaterials = (job.materials||[]).reduce((s,m)=>s + (m.qty * (m.price||0)), 0);
    const labor = (job.hours || 0) * (state.settings.hourlyRate || 0);
    const subtotal = (job.quote || 0) + totalMaterials + labor;
    const vatPct = state.settings.vat || 0;
    const vat = subtotal * (vatPct/100);
    const total = subtotal + vat;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title>
      <style>body{font-family:Arial;padding:20px}h1{color:${'#0A62A8'}}</style></head>
      <body><h1>Invoice</h1>
      <p><strong>Job:</strong> ${escapeHtml(job.title)}</p>
      <p><strong>Client:</strong> ${escapeHtml(client.name||'')}</p>
      <p><strong>Address:</strong> ${escapeHtml(job.address||'')}</p>
      <hr />
      <p><strong>Quote:</strong> £${Number(job.quote||0).toFixed(2)}</p>
      <p><strong>Materials:</strong> £${totalMaterials.toFixed(2)}</p>
      <p><strong>Labor:</strong> £${labor.toFixed(2)}</p>
      <p><strong>Subtotal:</strong> £${subtotal.toFixed(2)}</p>
      <p><strong>VAT ${vatPct}%:</strong> £${vat.toFixed(2)}</p>
      <h2>Total: £${total.toFixed(2)}</h2>
      <p><button onclick="window.print()">Print / Save PDF</button></p>
      </body></html>`;
    win.document.write(html); win.document.close();
  }

  // ----- Small helpers -----
  function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

  // ----- Menu / UI wiring -----
  menuBtn.addEventListener('click', ()=> sidebar.classList.toggle('hidden'));
  addBtn.addEventListener('click', ()=>{
    if (!isAuthenticated()) { renderLogin(); return; }
    if (location.hash.startsWith('#/jobs')) {
      renderEditJob(null);
    } else {
      location.hash = '#/jobs';
      setTimeout(()=> renderEditJob(null), 200);
    }
  });

  window.addEventListener('hashchange', route);
  // initial route (if authenticated show app, else login)
  if (!isAuthenticated()) {
    renderLogin();
  } else {
    route();
  }

  // expose for debugging
  window.__trade = {
    state,
    save: ()=> saveData(state),
    reload: ()=> { state = loadData(); route(); },
    logout: ()=> { logout(); }
  };

  // Auto-save on unload (optional)
  window.addEventListener('beforeunload', () => saveData(state));

})();
