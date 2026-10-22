import { relevance, isForMe, targetLabel, normClass, INTERESSI } from './match.js';

const $ = (s, el = document) => el.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = {
  profile: store.get('cc-profile', null),
  read: new Set(store.get('cc-letti', [])),
  items: [],
  updatedAt: null,
  filter: 'mine',
  q: '',
  error: null,
};

const fmtShort = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const asDate = (s) => (s ? new Date(s + 'T12:00:00') : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function daysFrom(dateStr) {
  const d = asDate(dateStr); if (!d) return null;
  const t = new Date(); t.setHours(12, 0, 0, 0);
  return Math.round((d - t) / 864e5);
}
function relDay(dateStr) {
  const n = daysFrom(dateStr);
  if (n === null) return '';
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n > 1 && n < 7) return fmtLong.format(asDate(dateStr)).split(' ')[0];
  return fmtShort.format(asDate(dateStr));
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- Dati ---------- */

async function load() {
  state.error = null;
  try {
    const res = await fetch('/api/circolari', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Errore del server');
    state.items = data.items || [];
    state.updatedAt = data.updatedAt;
    store.set('cc-cache', data);
  } catch (err) {
    const cached = store.get('cc-cache', null);
    if (cached) { state.items = cached.items; state.updatedAt = cached.updatedAt; }
    state.error = navigator.onLine ? 'Non riesco a raggiungere il server. Ti mostro le ultime circolari salvate.' : 'Sei offline. Ti mostro le ultime circolari salvate.';
  }
  render();
  openFromUrl();
}

function visibleItems() {
  const p = state.profile || {};
  const q = state.q.trim().toLowerCase();
  return state.items.filter((c) => {
    const r = relevance(c, p);
    if (state.filter === 'mine' && !isForMe(c, p) && !(p.mostraDocenti && r === 'docenti')) return false;
    if (state.filter === 'urgent' && (c.level === 'normale' || !(isForMe(c, p) || (p.mostraDocenti && r === 'docenti')))) return false;
    if (state.filter === 'all' && r === 'docenti' && !p.mostraDocenti && !q) return false;
    if (q) {
      const hay = [c.title, c.excerpt, c.summary, 'n. ' + c.n, c.n].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/* ---------- Render ---------- */

function renderToday() {
  const p = state.profile || {};
  const cls = normClass(p.classe);
  const mine = state.items.filter((c) => isForMe(c, p));
  const urgent = mine.filter((c) => c.level === 'urgente' && !state.read.has(c.id));
  const unread = mine.filter((c) => !state.read.has(c.id));
  const hello = p.nome ? `Ciao ${esc(p.nome)}. ` : '';

  let h1;
  if (!state.items.length && !state.error) h1 = 'Sto leggendo le circolari…';
  else if (urgent.length) h1 = urgent.length === 1 ? `Una circolare urgente per ${cls ? 'la ' + esc(cls) : 'te'}` : `${urgent.length} circolari urgenti per ${cls ? 'la ' + esc(cls) : 'te'}`;
  else if (unread.length) h1 = unread.length === 1 ? 'Una circolare nuova da leggere' : `${unread.length} circolari da leggere`;
  else h1 = 'Sei in pari con le circolari';

  const last = state.items[0];
  const sub = last ? `${hello}L’ultima è la n. ${esc(last.n)} del ${fmtShort.format(asDate(last.date))}.` : hello;

  const alerts = urgent.slice(0, 2).map((c) => `
    <div class="alert"><button data-open="${esc(c.id)}">n. ${esc(c.n)}: ${esc(c.title)}</button></div>`).join('');

  $('#today').innerHTML = `<h1>${h1}</h1><p>${sub}</p>${state.error ? `<p>${esc(state.error)}</p>` : ''}${alerts}`;
  $('#class-pill').textContent = cls || 'Classe';
}

function groupName(dateStr) {
  const n = daysFrom(dateStr);
  if (n === null) return 'Senza data';
  if (n >= 0) return 'Oggi';
  if (n === -1) return 'Ieri';
  if (n > -7) return 'Questa settimana';
  if (n > -31) return 'Questo mese';
  return 'Prima';
}

function renderList() {
  const list = $('#list');
  const p = state.profile || {};
  list.innerHTML = '';

  if (!state.items.length && !state.error) {
    list.innerHTML = '<li class="skeleton"></li>'.repeat(5);
    return;
  }

  const items = visibleItems();
  if (!items.length) {
    const msg = state.q
      ? ['Nessun risultato', `Nessuna circolare contiene “${esc(state.q)}”.`, 'Cerca in tutte', 'all']
      : state.filter === 'urgent'
        ? ['Niente di importante', 'Al momento nessuna circolare importante ti riguarda.', 'Vedi tutte le tue', 'mine']
        : ['Nessuna circolare per te', 'Non ci sono circolari per la tua classe. Prova a vederle tutte.', 'Vedi tutte', 'all'];
    list.innerHTML = `<li class="empty"><img src="/img/empty.svg" alt=""><strong>${msg[0]}</strong>${msg[1]}<br><button class="secondary" data-filter-go="${msg[3]}">${msg[2]}</button></li>`;
    return;
  }

  const tpl = $('#tpl-item');
  let lastGroup = '';
  for (const c of items) {
    const g = groupName(c.date);
    if (g !== lastGroup) {
      const h = document.createElement('li');
      h.className = 'group'; h.textContent = g; h.setAttribute('aria-hidden', 'true');
      list.append(h); lastGroup = g;
    }
    const li = tpl.content.firstElementChild.cloneNode(true);
    const r = relevance(c, p);
    li.dataset.id = c.id;
    if (state.read.has(c.id)) li.classList.add('read');
    if (c.level === 'urgente' && r !== 'docenti') li.classList.add('urgente');
    $('.n', li).textContent = c.n ?? '–';
    $('.d', li).textContent = c.date ? fmtShort.format(asDate(c.date)) : '';
    if (c.date) $('.d', li).dateTime = c.date;
    $('.title', li).textContent = c.title;

    const tags = [];
    if (c.level === 'urgente') tags.push(['urgente', 'Urgente']);
    else if (c.level === 'importante') tags.push(['importante', 'Importante']);
    if (c.deadline && daysFrom(c.deadline) >= 0) tags.push(['due', 'Entro ' + relDay(c.deadline)]);
    else if (c.when && daysFrom(c.when) >= 0 && daysFrom(c.when) < 14) tags.push(['due', relDay(c.when).replace(/^./, (x) => x.toUpperCase())]);
    tags.push([r === 'tua' ? 'mine' : r === 'tutti' ? '' : 'dim', targetLabel(c, p)]);
    $('.meta', li).innerHTML = tags.map(([cls, txt]) => `<span class="tag ${cls}">${esc(txt)}</span>`).join('');

    const label = `Circolare n. ${c.n}, ${c.title}. ${tags.map((t) => t[1]).join(', ')}${state.read.has(c.id) ? '' : ', da leggere'}`;
    $('.item-btn', li).setAttribute('aria-label', label);
    list.append(li);
  }
}

function renderFoot() {
  const t = state.updatedAt ? new Date(state.updatedAt) : null;
  $('#foot').textContent = t
    ? `Aggiornato ${daysFrom(t.toISOString().slice(0, 10)) === 0 ? 'oggi' : fmtShort.format(t)} alle ${fmtTime.format(t)}. Controllo il sito della scuola ogni 20 minuti.`
    : '';
}

function render() {
  renderToday();
  renderList();
  renderFoot();
}

/* ---------- Dettaglio ---------- */

function openDetail(id) {
  const c = state.items.find((x) => x.id === id);
  if (!c) return;
  state.read.add(id);
  store.set('cc-letti', [...state.read].slice(-600));

  const p = state.profile || {};
  const levelTxt = { urgente: 'Perché è urgente', importante: 'Perché è importante' }[c.level];
  const dates = [];
  if (c.deadline) dates.push(['Scadenza', fmtLong.format(asDate(c.deadline))]);
  if (c.when) dates.push(['Data indicata', fmtLong.format(asDate(c.when))]);
  dates.push(['Per chi', targetLabel(c, p)]);

  const pdfs = (c.pdfs || []).map((u, i) => `<a class="secondary" href="${esc(u)}" target="_blank" rel="noopener">Apri l’allegato PDF${c.pdfs.length > 1 ? ' ' + (i + 1) : ''}</a>`).join('');

  $('#d-body').innerHTML = `
    <p class="d-num"><b>n. ${esc(c.n)}</b> pubblicata ${c.date ? fmtLong.format(asDate(c.date)) : ''}</p>
    <h2 id="d-title">${esc(c.title)}</h2>
    ${levelTxt && c.reasons?.length ? `<div class="why ${c.level}"><h3>${levelTxt}</h3><ul>${c.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    <div class="dates">${dates.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
    ${c.summary ? `<p class="summary">${esc(c.summary)}</p>` : ''}
    ${c.excerpt ? `<p class="text-label">Dal testo della circolare</p><p class="text">${esc(c.excerpt)}</p>` : (!c.detailDone ? '<p class="text">Il testo completo arriva al prossimo controllo. Intanto puoi aprirla sul sito.</p>' : '')}
    <div class="actions">
      <a class="primary" href="${esc(c.url)}" target="_blank" rel="noopener">Leggi sul sito della scuola</a>
      ${pdfs}
      <button class="secondary" id="share">Condividi</button>
    </div>`;

  $('#share').onclick = async () => {
    const data = { title: `Circolare n. ${c.n}`, text: c.title, url: c.url };
    if (navigator.share) { try { await navigator.share(data); } catch {} }
    else { await navigator.clipboard?.writeText(c.url); toast('Link copiato'); }
  };

  const dlg = $('#detail');
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  history.replaceState(null, '', '?c=' + encodeURIComponent(id));
  render();
}

function openFromUrl(href = location.href) {
  const id = new URL(href).searchParams.get('c');
  if (id && state.items.some((c) => c.id === id)) openDetail(id);
}

/* ---------- Profilo ---------- */

function buildInteressi() {
  $('#interessi').innerHTML = Object.entries(INTERESSI).map(([k, v]) =>
    `<label><input type="checkbox" name="interessi" value="${k}"><span>${v}</span></label>`).join('');
}

function fillProfileForm() {
  const p = state.profile || {};
  const f = $('#profile-form');
  const cls = normClass(p.classe);
  f.querySelectorAll('[name=anno]').forEach((r) => { r.checked = r.value === cls[0]; });
  f.sezione.value = cls.slice(1);
  f.indirizzo.value = p.indirizzo || '';
  f.nome.value = p.nome || '';
  f.querySelectorAll('[name=soglia]').forEach((r) => { r.checked = r.value === (p.soglia || 'normale'); });
  f.querySelectorAll('[name=interessi]').forEach((c) => { c.checked = (p.interessi || []).includes(c.value); });
  f.includiForse.checked = p.includiForse !== false;
  f.mostraDocenti.checked = Boolean(p.mostraDocenti);
  $('#p-title').textContent = state.profile ? 'La tua classe' : 'Benvenuto in Circolari Curie';
  renderNotifyBox();
}

function readProfileForm() {
  const f = $('#profile-form');
  const anno = f.querySelector('[name=anno]:checked')?.value || '';
  return {
    classe: normClass(anno + f.sezione.value),
    indirizzo: f.indirizzo.value || undefined,
    nome: f.nome.value.trim().slice(0, 30),
    soglia: f.querySelector('[name=soglia]:checked')?.value || 'normale',
    interessi: [...f.querySelectorAll('[name=interessi]:checked')].map((c) => c.value),
    includiForse: f.includiForse.checked,
    mostraDocenti: f.mostraDocenti.checked,
  };
}

function serverProfile(p) {
  const { nome, ...rest } = p || {};
  return rest;
}

/* ---------- Notifiche ---------- */

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function currentSub() {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function renderNotifyBox() {
  const box = $('#notify-box');
  if (isIOS && !isStandalone) {
    box.innerHTML = `<p>Su iPhone le notifiche funzionano solo dopo aver aggiunto l’app alla schermata Home:</p>
      <ol><li>Tocca il pulsante Condividi di Safari.</li><li>Scegli “Aggiungi alla schermata Home”.</li><li>Apri Circolari dalla Home e torna qui.</li></ol>`;
    return;
  }
  if (!pushSupported) { box.innerHTML = '<p>Questo browser non supporta le notifiche push. Prova con Chrome o con l’app aggiunta alla schermata Home.</p>'; return; }
  if (Notification.permission === 'denied') {
    box.innerHTML = '<p>Le notifiche sono bloccate. Riattivale dalle impostazioni del browser per questo sito, poi torna qui.</p>';
    return;
  }
  const sub = await currentSub().catch(() => null);
  if (sub) {
    box.innerHTML = `<p class="status">Notifiche attive su questo dispositivo.</p>
      <p><button type="button" class="secondary" id="push-test">Invia una notifica di prova</button></p>
      <p><button type="button" class="secondary" id="push-off">Disattiva notifiche</button></p>`;
    $('#push-test').onclick = testPush;
    $('#push-off').onclick = disablePush;
  } else {
    box.innerHTML = `<p>Ricevi un avviso quando esce una circolare per la tua classe.</p>
      <p><button type="button" class="primary" id="push-on">Attiva notifiche</button></p>`;
    $('#push-on').onclick = enablePush;
  }
}

async function syncSubscription(sub) {
  const s = sub || (await currentSub());
  if (!s) return;
  await fetch('/api/subscribe', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: s.toJSON(), profile: serverProfile(state.profile || readProfileForm()) }),
  });
}

async function enablePush() {
  const btn = $('#push-on'); if (btn) { btn.disabled = true; btn.textContent = 'Attivazione…'; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permesso non concesso: senza permesso non posso inviarti avvisi.');
    const res = await fetch('/api/vapid');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) });
    if (!state.profile) { state.profile = readProfileForm(); store.set('cc-profile', state.profile); }
    await syncSubscription(sub);
    toast('Notifiche attivate');
  } catch (err) {
    toast(err.message || 'Attivazione non riuscita. Riprova.');
  }
  renderNotifyBox();
}

async function disablePush() {
  const sub = await currentSub();
  if (sub) {
    await fetch('/api/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  }
  toast('Notifiche disattivate');
  renderNotifyBox();
}

async function testPush() {
  const sub = await currentSub();
  if (!sub) return;
  const res = await fetch('/api/test-push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  if (res.ok) toast('Notifica di prova inviata');
  else {
    // Il server non conosce questo dispositivo: lo registriamo di nuovo
    await syncSubscription(sub);
    toast('Ho ricollegato il dispositivo. Riprova la prova.');
  }
}

/* ---------- Eventi ---------- */

function setFilter(f) {
  state.filter = f;
  document.querySelectorAll('.seg [data-filter]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === f)));
  renderList();
}

document.addEventListener('click', (e) => {
  const item = e.target.closest('.item');
  if (item) return openDetail(item.dataset.id);
  const open = e.target.closest('[data-open]');
  if (open) return openDetail(open.dataset.open);
  const seg = e.target.closest('.seg [data-filter]');
  if (seg) return setFilter(seg.dataset.filter);
  const go = e.target.closest('[data-filter-go]');
  if (go) { if (state.q && go.dataset.filterGo === 'all') { /* mantiene la ricerca */ } return setFilter(go.dataset.filterGo); }
  const close = e.target.closest('[data-close]');
  if (close) close.closest('dialog').close();
});

$('#detail').addEventListener('close', () => history.replaceState(null, '', location.pathname));

$('#btn-profile').addEventListener('click', () => { fillProfileForm(); $('#profile').showModal(); });

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = readProfileForm();
  if (!/^[1-5][A-Z]{1,4}$/.test(p.classe)) { toast('Scegli l’anno e scrivi la sezione, es. 4 e ASA'); return; }
  state.profile = p;
  store.set('cc-profile', p);
  $('#profile').close();
  render();
  toast('Profilo salvato');
  syncSubscription().catch(() => {});
});

let qTimer;
$('#q').addEventListener('input', (e) => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value; renderList(); }, 120);
});

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open') { load().then(() => openFromUrl(e.data.url)); }
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });

/* ---------- Avvio ---------- */

buildInteressi();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
const cached = store.get('cc-cache', null);
if (cached) { state.items = cached.items; state.updatedAt = cached.updatedAt; }
render();
load();
if (!state.profile) { fillProfileForm(); $('#profile').showModal(); }
