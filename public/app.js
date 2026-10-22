import { relevance, isForMe, targetLabel, normClass, INTERESSI, effectiveLevel, isConcluded, eventDate, eventTime, classInfoFor } from './match.js';

const $ = (s, el = document) => el.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = {
  profile: store.get('cc-profile', null),
  read: new Set(store.get('cc-letti', [])),
  done: new Set(store.get('cc-fatti', [])),
  items: [],
  updatedAt: null,
  filter: 'mine',
  q: '',
  error: null,
  openId: null,
};

const desktop = matchMedia('(min-width: 1000px)');

const fmtShort = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const asDate = (s) => (s ? new Date(s + 'T12:00:00') : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Da leggere: solo le circolari recenti, non quelle recuperate dall'archivio
const isUnread = (c) => !state.read.has(c.id) && !c.archived && (daysFrom(c.date) ?? 0) >= -14;
// Da fare: ha una scadenza o chiede firme, moduli, pagamenti
const needsAction = (c) => Boolean(c.deadline) || (c.reasons || []).some((r) => /firma|modulo|pagamento/i.test(r));
// Livello e date "di oggi", calcolati per il profilo (stessa logica del server)
const lvl = (c) => effectiveLevel(c, state.profile || {});
const ended = (c) => isConcluded(c, state.profile || {});
const evDate = (c) => eventDate(c, state.profile || {});
const evTime = (c) => eventTime(c, state.profile || {});
const hhmm = (t) => t.replace(/^0/, '');
const timeLabel = (t) => (t ? (t.end ? `${hhmm(t.start)}–${hhmm(t.end)}` : `ore ${hhmm(t.start)}`) : '');
const isTodo = (c) => needsAction(c) && !state.done.has(c.id) && !ended(c) && (!c.deadline || daysFrom(c.deadline) >= 0);

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
    if (state.filter === 'urgent' && (lvl(c) === 'normale' || !(isForMe(c, p) || (p.mostraDocenti && r === 'docenti')))) return false;
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
  const urgent = mine.filter((c) => lvl(c) === 'urgente' && (isUnread(c) || !state.read.has(c.id)));
  const unread = mine.filter(isUnread);
  const todo = mine.filter(isTodo);
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

  const todoLine = todo.length
    ? `<p class="todo-line"><button data-open="${esc(todo[0].id)}">${todo.length === 1 ? 'Hai 1 cosa da fare' : `Hai ${todo.length} cose da fare`}: ${esc(todo[0].title)}${todo.length > 1 ? ' e altre' : ''}</button></p>`
    : '';
  $('#today').innerHTML = `<h1>${h1}</h1><p>${sub}</p>${state.error ? `<p>${esc(state.error)}</p>` : ''}${alerts}${todoLine}`;
  const extra = (p.altreClassi || []).length;
  $('#class-pill').textContent = (cls || 'Classe') + (extra ? ` +${extra}` : '');
  updateBadge(unread.length);
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
    if (c.id === state.openId) { li.classList.add('active'); $('.item-btn', li).setAttribute('aria-current', 'true'); }
    if (!isUnread(c)) li.classList.add('read');
    const L = lvl(c);
    if (L === 'urgente' && r !== 'docenti') li.classList.add('urgente');
    if (ended(c)) li.classList.add('concluded');
    $('.n', li).textContent = c.n ?? '–';
    $('.d', li).textContent = c.date ? fmtShort.format(asDate(c.date)) : '';
    if (c.date) $('.d', li).dateTime = c.date;
    $('.title', li).textContent = c.title;

    const tags = [];
    const ev = evDate(c);
    if (ended(c)) tags.push(['dim', 'Conclusa']);
    else if (L === 'urgente') tags.push(['urgente', 'Urgente']);
    else if (L === 'importante') tags.push(['importante', 'Importante']);
    if (!ended(c)) {
      if (c.deadline && daysFrom(c.deadline) >= 0) tags.push(['due', 'Entro ' + relDay(c.deadline)]);
      else if (ev && daysFrom(ev) >= 0 && daysFrom(ev) < 14) {
        const t = evTime(c);
        tags.push(['due', relDay(ev).replace(/^./, (x) => x.toUpperCase()) + (t ? ', ' + hhmm(t.start) : '')]);
      }
    }
    if (needsAction(c) && state.done.has(c.id)) tags.push(['dim', 'Fatto ✓']);
    else if (isTodo(c)) tags.push(['todo', 'Da fare']);
    tags.push([r === 'tua' ? 'mine' : r === 'tutti' ? '' : 'dim', targetLabel(c, p)]);
    $('.meta', li).innerHTML = tags.map(([cls, txt]) => `<span class="tag ${cls}">${esc(txt)}</span>`).join('');

    const label = `Circolare n. ${c.n}, ${c.title}. ${tags.map((t) => t[1]).join(', ')}${isUnread(c) ? ', da leggere' : ''}`;
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
  const L = lvl(c);
  const finished = ended(c);
  const levelTxt = finished ? null : { urgente: 'Perché è urgente', importante: 'Perché è importante' }[L];
  const ev = evDate(c);
  const info = classInfoFor(c, p);
  const dates = [];
  if (ev) dates.push(['Quando', fmtLong.format(asDate(ev)) + (evTime(c) ? `, ${timeLabel(evTime(c))}` : '')]);
  if (c.where) dates.push(['Dove', c.where]);
  if (c.deadline) dates.push(['Scadenza', fmtLong.format(asDate(c.deadline))]);
  dates.push(['Per chi', targetLabel(c, p)]);
  const countdown = (() => {
    if (finished) return '';
    const next = [ev, c.deadline].filter((d) => d && daysFrom(d) >= 0).sort()[0];
    if (!next) return '';
    const n = daysFrom(next);
    const what = next === c.deadline ? 'alla scadenza' : '';
    return n === 0 ? `<p class="countdown now">È oggi${what ? ' la scadenza' : ''}</p>`
      : `<p class="countdown"><b>${n === 1 ? 'Domani' : `Tra ${n} giorni`}</b>${what ? ' ' + what : ''}</p>`;
  })();

  const pdfs = (c.pdfs || []).map((u, i) => `<a class="secondary" href="${esc(u)}" target="_blank" rel="noopener">Apri l’allegato PDF${c.pdfs.length > 1 ? ' ' + (i + 1) : ''}</a>`).join('');

  $('#d-body').innerHTML = `
    <p class="d-num"><b>n. ${esc(c.n)}</b> pubblicata ${c.date ? fmtLong.format(asDate(c.date)) : ''}</p>
    <h2 id="d-title">${esc(c.title)}</h2>
    ${finished ? `<p class="ended-banner">Conclusa: la data indicata è passata. La trovi qui per consultarla.</p>` : countdown}
    ${levelTxt && c.reasons?.length ? `<div class="why ${L}"><h3>${levelTxt}</h3><ul>${c.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${info ? `<div class="for-class"><h3>Per la ${esc(info.classe)}</h3><p>${esc(info.s)}</p></div>` : ''}
    ${c.todo && !finished ? `<div class="todo-box"><h3>Cosa devi fare</h3><p>${esc(c.todo)}</p></div>` : ''}
    <div class="dates">${dates.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
    ${calendarButtons(c)}
    ${needsAction(c) && (!finished || state.done.has(c.id)) ? `<button class="done-btn ${state.done.has(c.id) ? 'is-done' : ''}" data-done="${esc(c.id)}" aria-pressed="${state.done.has(c.id)}">${state.done.has(c.id) ? 'Fatto ✓ Tocca per annullare' : 'Segna come fatto'}</button>` : ''}
    ${c.summary ? `<p class="summary">${esc(c.summary)}</p>` : ''}
    ${c.excerpt ? `<p class="text-label">Dal testo della circolare</p><p class="text">${esc(c.excerpt)}</p>` : (!c.detailDone ? '<p class="text">Il testo completo arriva al prossimo controllo. Intanto puoi aprirla sul sito.</p>' : '')}
    <section class="wa" aria-labelledby="wa-title">
      <h3 id="wa-title">Inoltra alla classe</h3>
      <button class="wa-btn" id="wa-send" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"/></svg>
        <span id="wa-label">Preparo il PDF…</span>
      </button>
      <details class="wa-preview">
        <summary>Vedi il messaggio</summary>
        <pre id="wa-text"></pre>
      </details>
      <button class="link-btn" id="wa-copy">Copia solo il messaggio</button>
    </section>
    <div class="actions">
      <a class="primary" href="${esc(c.url)}" target="_blank" rel="noopener">Leggi sul sito della scuola</a>
      ${pdfs}
    </div>
    ${reportLink(c)}`;

  setupForward(c);

  const dlg = $('#detail');
  state.openId = id;
  // Su computer il dettaglio sta a destra e l'elenco resta cliccabile
  if (dlg.open && dlg.matches(':modal') === desktop.matches) dlg.close();
  if (!dlg.open) desktop.matches ? dlg.show() : dlg.showModal();
  document.body.classList.toggle('reading', desktop.matches);
  dlg.scrollTop = 0;
  history.replaceState(null, '', '?c=' + encodeURIComponent(id));
  render();
}

/* ---------- Inoltro su WhatsApp ---------- */

const ANNI = ['', 'prime', 'seconde', 'terze', 'quarte', 'quinte'];

// Destinatari scritti per il gruppo, non per il singolo utente
function groupTarget(c) {
  const t = c.targets || {};
  if (t.docentiOnly) return 'Docenti e personale';
  if (t.all) return 'Tutti gli studenti';
  const parti = [];
  if (t.years?.length) parti.push('classi ' + t.years.map((y) => ANNI[y]).join(', ').replace(/, ([^,]*)$/, ' e $1'));
  if (t.classes?.length) parti.push(t.classes.join(', '));
  if (parti.length) return parti.join(', ').replace(/^./, (x) => x.toUpperCase());
  return 'Tutti gli studenti';
}

function shortText(c, max = 320) {
  const t = (c.summary || c.excerpt || '').replace(/^oggetto\s*:\s*/i, '').replace(/^[\s.,;:–-]+/, '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const dot = cut.lastIndexOf('. ');
  return dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s\S*$/, '') + '…';
}

function mainReason(c) {
  // Le scadenze e le date hanno già una riga loro: scegli il motivo più informativo
  const r = (c.reasons || []).find((x) => !/scadenza|prossimi giorni/i.test(x)) || c.reasons?.[0];
  return r ? ': ' + r.charAt(0).toLowerCase() + r.slice(1) : '';
}

export function buildMessage(c) {
  const righe = [`📄 *Circolare n. ${c.n}: ${c.title}*`];
  if (c.date) righe.push(`🗓️ Pubblicata ${fmtLong.format(asDate(c.date))}`);
  const L = effectiveLevel(c, {});
  if (!isConcluded(c, {})) {
    if (L === 'urgente') righe.push(`🚨 *Urgente*${mainReason(c)}`);
    else if (L === 'importante') righe.push(`⚠️ *Importante*${mainReason(c)}`);
  }
  righe.push(`👥 Per: ${groupTarget(c)}`);
  if (c.when) righe.push(`📌 Quando: ${fmtLong.format(asDate(c.when))}${c.whenTime ? ', ' + timeLabel(c.whenTime) : ''}`);
  if (c.where) righe.push(`📍 Dove: ${c.where}`);
  if (c.deadline) righe.push(`⏰ *Scadenza: ${fmtLong.format(asDate(c.deadline))}*`);
  const breve = shortText(c);
  if (breve) righe.push('', `*In breve:* ${breve}`);
  if (c.todo && c.todo !== breve) righe.push('', `✅ *Cosa fare:* ${c.todo}`);
  righe.push('', `🔗 ${c.url}`);
  return righe.join('\n');
}

function pdfSource(c) {
  // Prima l'allegato; se manca, il PDF che il sito genera dalla pagina della circolare
  return c.pdfs?.[0] || c.url.replace(/\/?$/, '/') + '?pdf=true';
}

function pdfName(c) {
  const slug = c.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return `Circolare-${c.n}-${slug}.pdf`;
}

const pdfCache = new Map();
async function loadPdf(c) {
  if (pdfCache.has(c.id)) return pdfCache.get(c.id);
  const p = fetch('/api/pdf?u=' + encodeURIComponent(pdfSource(c)))
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => (b && b.size ? new File([b], pdfName(c), { type: 'application/pdf' }) : null))
    .catch(() => null);
  pdfCache.set(c.id, p);
  return p;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function openWhatsAppText(text) {
  location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
}

function setupForward(c) {
  const text = buildMessage(c);
  const btn = $('#wa-send');
  const label = $('#wa-label');
  $('#wa-text').textContent = text;
  $('#wa-copy').onclick = async () => toast((await copyText(text)) ? 'Messaggio copiato' : 'Non riesco a copiare: tieni premuto sul testo');

  let file = null;
  const canShareFiles = (f) => { try { return Boolean(navigator.canShare?.({ files: [f] })); } catch { return false; } };

  loadPdf(c).then((f) => {
    if ($('#wa-send') !== btn) return; // l'utente ha aperto un'altra circolare
    file = f && canShareFiles(f) ? f : null;
    label.textContent = file ? 'Inoltra PDF e messaggio' : 'Inoltra messaggio con link';
    btn.disabled = false;
  });

  btn.onclick = async () => {
    if (!file) return openWhatsAppText(text);
    // Su iPhone WhatsApp a volte scarta il testo che accompagna un file: lo copiamo prima
    const copied = copyText(text); // senza attendere: share() va chiamato subito dopo il tocco
    try {
      await navigator.share({ files: [file], text });
      if (isIOS && (await copied)) toast('Se il messaggio non compare, incollalo: è già copiato');
    } catch (err) {
      if (err?.name !== 'AbortError') openWhatsAppText(text);
    }
  };
}

function openFromUrl(href = location.href) {
  const id = new URL(href).searchParams.get('c');
  if (id && state.items.some((c) => c.id === id)) openDetail(id);
}

/* ---------- Fatto e segnalazioni ---------- */

function toggleDone(id) {
  state.done.has(id) ? state.done.delete(id) : state.done.add(id);
  store.set('cc-fatti', [...state.done].slice(-400));
  toast(state.done.has(id) ? 'Segnata come fatta' : 'Tolta da “fatto”');
  openDetail(id);
}

function reportLink(c) {
  const r = relevance(c, state.profile || {});
  if (r === 'docenti') return '';
  const mine = r === 'tua' || r === 'tutti' || r === 'forse';
  return `<p class="report"><button class="link-btn" data-report="${esc(c.id)}" data-tipo="${mine ? 'non-per-me' : 'per-me'}">${mine ? 'Non riguarda la mia classe?' : 'Riguarda anche la mia classe?'}</button></p>`;
}

async function sendReport(id, tipo) {
  const p = state.profile || {};
  const key = tipo === 'non-per-me' ? 'nonPerMe' : 'perMe';
  const other = key === 'perMe' ? 'nonPerMe' : 'perMe';
  state.profile = {
    ...p,
    [key]: [...new Set([...(p[key] || []), id])].slice(-150),
    [other]: (p[other] || []).filter((x) => x !== id),
  };
  store.set('cc-profile', state.profile);
  const sub = await currentSub().catch(() => null);
  fetch('/api/report', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, tipo, classe: p.classe, endpoint: sub?.endpoint }),
  }).catch(() => {});
  syncSubscription().catch(() => {});
  toast(tipo === 'non-per-me' ? 'Grazie: non la vedrai più tra le tue' : 'Grazie: ora la vedi tra le tue');
  openDetail(id);
}

/* ---------- Numero sull'icona ---------- */

function updateBadge(n) {
  try {
    if (!('setAppBadge' in navigator)) return;
    n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
    // Il service worker parte da qui quando arriva una nuova notifica
    caches.open('cc-badge').then((c) => c.put('/badge', new Response(String(n))));
  } catch {}
}

/* ---------- Installa l'app ---------- */

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
window.addEventListener('appinstalled', () => { installEvent = null; store.set('cc-installata', true); renderInstall(); toast('App installata'); });

function canOfferInstall() {
  if (isStandalone || store.get('cc-installata', false)) return false;
  const later = store.get('cc-install-dopo', 0);
  if (Date.now() < later) return false;
  return Boolean(installEvent) || isIOS;
}

function renderInstall() {
  const box = $('#install');
  if (!box) return;
  box.hidden = !canOfferInstall();
  if (box.hidden) return;
  box.innerHTML = `<div><strong>Installa Circolari Curie</strong><span>Si apre come un’app e ti avvisa delle nuove circolari.</span></div>
    <div class="install-actions"><button class="primary" data-install="go">Installa</button><button class="link-btn" data-install="later">Non ora</button></div>`;
}

async function doInstall() {
  if (installEvent) {
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice.catch(() => ({}));
    installEvent = null;
    if (outcome !== 'accepted') store.set('cc-install-dopo', Date.now() + 3 * 864e5);
    renderInstall();
  } else if (isIOS) {
    $('#ios-install').showModal();
  }
}

/* ---------- Amministratore ---------- */

async function adminCall(action) {
  const sub = await currentSub().catch(() => null);
  if (!sub) return { error: 'Attiva prima le notifiche su questo dispositivo.' };
  const res = await fetch('/api/admin/' + action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  return res.json().catch(() => ({ error: 'Risposta non valida dal server.' }));
}

async function renderAdmin() {
  const box = $('#admin-box');
  const st = await adminCall('status');
  if (!st.admin) {
    box.innerHTML = `<button type="button" class="link-btn" data-admin="claim">Gestisci l’app (solo per chi l’ha creata)</button>`;
    return;
  }
  const fmt = (d) => (d ? `${fmtShort.format(new Date(d))} alle ${fmtTime.format(new Date(d))}` : 'mai');
  const reports = st.segnalazioni.map((r) => `<li><b>n. ${esc(r.n)}</b> ${esc(r.title)}<br><span>${r.tipo === 'non-per-me' ? 'Non è per' : 'È anche per'} la ${esc(r.classe || '?')}, ${fmt(r.at)}</span></li>`).join('');
  box.innerHTML = `<h3 class="sub">Gestione</h3>
    <div class="admin">
      <p>Ultimo controllo: <b>${fmt(st.updatedAt)}</b>. Circolari salvate: <b>${st.circolari}</b>${st.archivio && !st.archivio.done ? ` (sto recuperando l’archivio, pagina ${st.archivio.page})` : ''}.</p>
      <p>${st.errori ? `Controlli falliti di fila: <b>${st.errori}</b>. Ultimo errore: ${esc(st.ultimoErrore)}` : 'Nessun errore: il controllo funziona.'}</p>
      <p>Se il controllo fallisce per circa un’ora, ti arriva una notifica.</p>
      <h4>Segnalazioni (${st.segnalazioni.length})</h4>
      ${reports ? `<ul class="reports">${reports}</ul>` : '<p>Nessuna segnalazione.</p>'}
      <button type="button" class="link-btn" data-admin="release">Smetti di gestire l’app da questo dispositivo</button>
    </div>`;
}

async function adminAction(action) {
  if (action === 'claim' && !confirm('Diventi l’amministratore: riceverai gli avvisi se il controllo si blocca e le segnalazioni degli utenti. Solo un dispositivo può esserlo. Continuare?')) return;
  if (action === 'release' && !confirm('Questo dispositivo smetterà di ricevere avvisi e segnalazioni. Continuare?')) return;
  const r = await adminCall(action);
  if (r.error) toast(r.error);
  else toast(action === 'claim' ? 'Ora gestisci l’app da questo dispositivo' : 'Fatto');
  renderAdmin();
}

/* ---------- Aggiungi al calendario ---------- */

const ymd = (d) => d.replace(/-/g, '');
function nextDay(d) { const x = asDate(d); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); }

function calendarButtons(c) {
  const rows = [];
  if (evDate(c) && !ended(c)) rows.push(['data', c.deadline ? 'Aggiungi la data al calendario' : 'Aggiungi al calendario']);
  if (c.deadline && daysFrom(c.deadline) >= 0) rows.push(['scadenza', 'Aggiungi la scadenza al calendario']);
  if (!rows.length) return '';
  const extra = !isIOS ? `<a class="link-btn" href="/api/ics?id=${encodeURIComponent(c.id)}&tipo=${rows[0][0]}&classe=${encodeURIComponent(normClass(state.profile?.classe))}">Scarica il file per Outlook o Samsung Calendar</a>` : '';
  return `<div class="cal">${rows.map(([kind, label]) =>
    `<button class="secondary cal-btn" data-cal="${esc(c.id)}" data-kind="${kind}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>${esc(label)}</button>`).join('')}${extra}</div>`;
}

function addToCalendar(id, kind) {
  const c = state.items.find((x) => x.id === id);
  if (!c) return;
  const classe = encodeURIComponent(normClass(classInfoFor(c, state.profile || {})?.classe || state.profile?.classe));
  if (isIOS) { location.href = `/api/ics?id=${encodeURIComponent(id)}&tipo=${kind}&classe=${classe}`; return; }
  const day = kind === 'scadenza' ? c.deadline : evDate(c);
  const t = kind === 'data' ? evTime(c) : null;
  const end1h = (x) => { const [h, m] = x.split(':').map(Number); return `${String(Math.min(h + 1, 23)).padStart(2, '0')}${String(m).padStart(2, '0')}`; };
  const dates = t ? `${ymd(day)}T${t.start.replace(':', '')}00/${ymd(day)}T${(t.end ? t.end.replace(':', '') : end1h(t.start))}00` : `${ymd(day)}/${ymd(nextDay(day))}`;
  const text = kind === 'scadenza' ? `Scadenza: ${c.title}` : c.title;
  const details = `Circolare n. ${c.n}\n${shortText(c, 500)}\n\n${c.url}`;
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(text)}&dates=${dates}&ctz=Europe/Rome&details=${encodeURIComponent(details)}`
    + (c.where && kind === 'data' ? `&location=${encodeURIComponent(c.where)}` : '');
  window.open(url, '_blank', 'noopener');
}

/* ---------- Tutorial iniziale ---------- */

let tourStep = 0;
const tourSteps = () => [...document.querySelectorAll('#tour .step')];

function openTour() {
  const p = state.profile || {};
  const f = $('#tour-form');
  const cls = normClass(p.classe);
  f.querySelectorAll('[name=t-anno]').forEach((r) => { r.checked = r.value === cls[0]; });
  f['t-sezione'].value = cls.slice(1);
  f['t-indirizzo'].value = p.indirizzo || '';
  f['t-promemoria'].checked = Boolean(p.promemoria);
  f['t-riepilogo'].checked = Boolean(p.riepilogo);
  tourStep = 0;
  showTourStep();
  renderNotifyBox();
  if (!$('#tour').open) $('#tour').showModal();
}

function showTourStep() {
  const steps = tourSteps();
  steps.forEach((el, i) => { el.hidden = i !== tourStep; });
  $('#tour-progress').textContent = `${tourStep + 1} di ${steps.length}`;
  $('#tour-back').hidden = tourStep === 0;
  $('#tour-next').textContent = tourStep === steps.length - 1 ? 'Inizia' : 'Avanti';
  $('#tour-skip').hidden = !state.profile;
  steps[tourStep].querySelector('h2')?.focus();
}

function saveTourClass() {
  const f = $('#tour-form');
  const anno = f.querySelector('[name=t-anno]:checked')?.value || '';
  const classe = normClass(anno + f['t-sezione'].value);
  if (!/^[1-5][A-Z]{1,4}$/.test(classe)) { toast('Scegli l’anno e scrivi la sezione, es. 2 e ASA'); return false; }
  state.profile = { soglia: 'normale', interessi: [], includiForse: true, ...(state.profile || {}), classe, indirizzo: f['t-indirizzo'].value || undefined };
  store.set('cc-profile', state.profile);
  return true;
}

function saveTourExtras() {
  const f = $('#tour-form');
  state.profile = { ...state.profile, promemoria: f['t-promemoria'].checked, riepilogo: f['t-riepilogo'].checked };
  store.set('cc-profile', state.profile);
  syncSubscription().catch(() => {});
}

function finishTour() {
  store.set('cc-tour', true);
  $('#tour').close();
  render();
  openFromUrl();
}

$('#tour-next').addEventListener('click', () => {
  const step = tourSteps()[tourStep];
  if (step.dataset.step === 'classe' && !saveTourClass()) return;
  if (step.dataset.step === 'notifiche') saveTourExtras();
  if (tourStep === tourSteps().length - 1) return finishTour();
  tourStep++;
  showTourStep();
});
$('#tour-back').addEventListener('click', () => { tourStep = Math.max(0, tourStep - 1); showTourStep(); });
$('#tour-skip').addEventListener('click', finishTour);
$('#tour-form').addEventListener('change', (e) => { if (/t-(promemoria|riepilogo)/.test(e.target.name)) saveTourExtras(); });
// Senza classe il tutorial non si può chiudere con Esc
$('#tour').addEventListener('cancel', (e) => { if (!state.profile) e.preventDefault(); });

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
  f.promemoria.checked = Boolean(p.promemoria);
  f.altreClassi.value = (p.altreClassi || []).join(', ');
  f.riepilogo.checked = Boolean(p.riepilogo);
  renderNotifyBox();
  renderAdmin();
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
    promemoria: f.promemoria.checked,
    riepilogo: f.riepilogo.checked,
    altreClassi: [...new Set(f.altreClassi.value.split(/[\s,;]+/).map(normClass).filter((k) => /^[1-5][A-Z]{1,4}$/.test(k)))].slice(0, 6),
    perMe: state.profile?.perMe || [],
    nonPerMe: state.profile?.nonPerMe || [],
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
  let html;
  if (isIOS && !isStandalone) {
    html = `<p>Su iPhone le notifiche funzionano solo dopo aver aggiunto l’app alla schermata Home:</p>
      <ol><li>Tocca il pulsante Condividi di Safari.</li><li>Scegli “Aggiungi alla schermata Home”.</li><li>Apri Circolari dalla Home e torna qui.</li></ol>`;
  } else if (!pushSupported) {
    html = '<p>Questo browser non supporta le notifiche push. Prova con Chrome o con l’app aggiunta alla schermata Home.</p>';
  } else if (Notification.permission === 'denied') {
    html = '<p>Le notifiche sono bloccate. Riattivale dalle impostazioni del browser per questo sito, poi torna qui.</p>';
  } else if (await currentSub().catch(() => null)) {
    html = `<p class="status">Notifiche attive su questo dispositivo.</p>
      <p><button type="button" class="secondary" data-push="test">Invia una notifica di prova</button></p>
      <p><button type="button" class="secondary" data-push="off">Disattiva notifiche</button></p>`;
  } else {
    html = `<p>Ricevi un avviso quando esce una circolare per la tua classe.</p>
      <p><button type="button" class="primary" data-push="on">Attiva notifiche</button></p>`;
  }
  document.querySelectorAll('.notify-box').forEach((box) => {
    // Nel tutorial i pulsanti di prova e disattivazione non servono
    box.innerHTML = box.dataset.compact ? html.replace(/<p><button[^>]*data-push="(test|off)"[\s\S]*?<\/p>/g, '') : html;
  });
}

async function syncSubscription(sub) {
  const s = sub || (await currentSub());
  if (!s) return;
  await fetch('/api/subscribe', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: s.toJSON(), profile: serverProfile(state.profile || {}) }),
  });
}

async function enablePush(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Attivazione…'; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permesso non concesso: senza permesso non posso inviarti avvisi.');
    const res = await fetch('/api/vapid');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) });
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
  const push = e.target.closest('[data-push]');
  if (push) {
    if (push.dataset.push === 'on') return enablePush(push);
    if (push.dataset.push === 'off') return disablePush();
    if (push.dataset.push === 'test') return testPush();
  }
  const done = e.target.closest('[data-done]');
  if (done) return toggleDone(done.dataset.done);
  const rep = e.target.closest('[data-report]');
  if (rep) return sendReport(rep.dataset.report, rep.dataset.tipo);
  const inst = e.target.closest('[data-install]');
  if (inst) {
    if (inst.dataset.install === 'go') return doInstall();
    store.set('cc-install-dopo', Date.now() + 7 * 864e5);
    return renderInstall();
  }
  const adm = e.target.closest('[data-admin]');
  if (adm) return adminAction(adm.dataset.admin);
  const cal = e.target.closest('[data-cal]');
  if (cal) return addToCalendar(cal.dataset.cal, cal.dataset.kind, cal.dataset.how);
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

$('#detail').addEventListener('close', () => {
  history.replaceState(null, '', location.pathname);
  state.openId = null;
  document.body.classList.remove('reading');
  renderList();
});

// Passando da telefono a computer (o ruotando il tablet) il dettaglio cambia forma
desktop.addEventListener('change', () => {
  const dlg = $('#detail');
  if (!dlg.open || !state.openId) { document.body.classList.remove('reading'); return; }
  const id = state.openId;
  dlg.close();
  openDetail(id);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && desktop.matches && $('#detail').open && !$('#profile').open) $('#detail').close();
});

$('#tour-again').addEventListener('click', () => { $('#profile').close(); openTour(); });

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
renderInstall();
if (!state.profile || !store.get('cc-tour', false)) openTour();
else if (new URL(location.href).searchParams.get('admin')) { fillProfileForm(); $('#profile').showModal(); }
