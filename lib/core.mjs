// Ciclo di controllo: legge l'elenco, analizza le nuove circolari, invia le notifiche.
import { listCircolari, listFromArchive, fetchDetail } from './source.mjs';
import { classify, excerpt, CLASSIFIER_VERSION } from './classify.mjs';
import { loadIndex, saveIndex, loadConfig, saveConfig } from './store.mjs';
import { notifyAdmin } from './admin.mjs';
import { notifyAll, flushNight } from './push.mjs';
import { summarize } from './summary.mjs';

const MAX_TENTATIVI = 3;

function analyse(item, text = '') {
  const res = classify({ title: item.title, text, tipologie: item.tipologie, date: item.date });
  return { ...item, ...res };
}

/**
 * @param {object} opt
 * @param {number} opt.detailLimit quante pagine di dettaglio leggere in questo giro
 * @param {boolean} opt.notify se inviare le notifiche
 */
// Inizio dell'anno scolastico in corso (1 settembre)
function schoolYearStart(now = new Date()) {
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-09-01`;
}

/** Controllo con gestione degli errori: dopo 3 controlli falliti di fila avvisa l'amministratore. */
export async function runCheck(opts = {}) {
  const cfg = await loadConfig();
  try {
    const result = await runCheckInner(opts);
    if (result.found === 0) throw new Error('nessuna circolare trovata nella pagina della scuola');
    if (cfg.failCount) {
      if (cfg.failAlerted) await notifyAdmin({ title: 'Circolari Curie funziona di nuovo', body: 'Il controllo delle circolari è tornato a funzionare.' });
      await saveConfig({ ...(await loadConfig()), failCount: 0, failAlerted: false, lastError: null });
    }
    return result;
  } catch (err) {
    const failCount = (cfg.failCount || 0) + 1;
    let failAlerted = cfg.failAlerted;
    if (failCount >= 3 && !failAlerted) {
      failAlerted = await notifyAdmin({
        title: 'Controllo circolari non riuscito',
        body: `Da circa un’ora non riesco a leggere le circolari: ${String(err.message).slice(0, 120)}`,
        level: 'urgente',
      });
    }
    await saveConfig({ ...(await loadConfig()), failCount, failAlerted, lastError: String(err.message).slice(0, 300), lastErrorAt: new Date().toISOString() });
    throw err;
  }
}

async function runCheckInner({ detailLimit = 5, notify = true } = {}) {
  const started = Date.now();
  const index = await loadIndex();
  const seeding = index.items.length === 0;

  // Regole migliorate: rileggiamo le circolari recenti (senza rimandare le notifiche)
  if (!seeding && index.classifierVersion !== CLASSIFIER_VERSION) {
    index.items
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .forEach((c) => { c.detailDone = false; c.attempts = 0; c.summary = c.summary || null; });
  }
  index.classifierVersion = CLASSIFIER_VERSION;
  const known = new Map(index.items.map((c) => [c.id, c]));

  const { source, items } = await listCircolari();
  let added = 0;
  for (const it of items) {
    if (known.has(it.id)) continue;
    const c = analyse(it, it.feedText || '');
    delete c.feedText;
    c.excerpt = it.feedText ? excerpt(it.feedText, 420, it.title) : '';
    c.detailDone = false;
    c.attempts = 0;
    // Al primo avvio non inviamo notifiche per circolari già vecchie
    c.notified = seeding;
    c.firstSeen = new Date().toISOString();
    index.items.push(c);
    known.set(c.id, c);
    added++;
  }

  // Archivio: una pagina in più a ogni giro, fino all'inizio dell'anno scolastico
  const archive = index.archive || { page: 1, done: false };
  if (!archive.done && Date.now() - started < 10000) {
    try {
      const page = archive.page + 1;
      const older = await listFromArchive(page);
      const start = schoolYearStart();
      const inYear = older.filter((it) => !it.date || it.date >= start);
      for (const it of inYear) {
        if (known.has(it.id)) continue;
        const c = { ...analyse(it), excerpt: '', detailDone: false, attempts: 0, notified: true, firstSeen: new Date().toISOString(), archived: true };
        index.items.push(c);
        known.set(c.id, c);
      }
      archive.page = page;
      if (!older.length || inYear.length < older.length || page >= 30) archive.done = true;
    } catch (err) {
      console.warn('Archivio, pagina non letta:', err.message);
      if (/404/.test(err.message)) archive.done = true;
    }
    index.archive = archive;
  }

  // Dettagli: prima le più recenti, senza superare il tempo disponibile
  const pending = index.items.filter((c) => !c.detailDone && c.attempts < MAX_TENTATIVI)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, detailLimit);
  for (const c of pending) {
    if (Date.now() - started > 20000) break;
    try {
      const d = await fetchDetail(c);
      const tipologie = d.tipologie.length ? d.tipologie : c.tipologie;
      Object.assign(c, analyse({ ...c, tipologie }, d.text), {
        tipologie,
        pdfs: d.pdfs,
        excerpt: excerpt(d.text, 420, c.title),
        detailDone: true,
      });
      if (!c.summary) c.summary = await summarize(c.title, d.text);
    } catch (err) {
      c.attempts++;
      console.warn(`Dettaglio non letto (${c.id}):`, err.message);
    }
  }

  // Notifiche: circolari analizzate (o con troppi tentativi falliti) non ancora notificate
  const toNotify = index.items.filter((c) => !c.notified && (c.detailDone || c.attempts >= MAX_TENTATIVI));
  let pushResult = { sent: 0 };
  if (notify && toNotify.length) pushResult = await notifyAll(toNotify);
  toNotify.forEach((c) => { c.notified = true; });

  // Mattina: consegna quello che è arrivato durante il "non disturbare"
  await flushNight(index.items).catch((e) => console.warn('Riepilogo notturno non inviato:', e.message));

  index.source = source;
  await saveIndex(index);
  return { source, found: items.length, added, details: pending.length, notified: toNotify.length, ...pushResult, ms: Date.now() - started };
}
