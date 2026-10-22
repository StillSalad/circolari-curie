// Ciclo di controllo: legge l'elenco, analizza le nuove circolari, invia le notifiche.
import { listCircolari, fetchDetail } from './source.mjs';
import { classify, excerpt, CLASSIFIER_VERSION } from './classify.mjs';
import { loadIndex, saveIndex } from './store.mjs';
import { notifyAll } from './push.mjs';
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
export async function runCheck({ detailLimit = 5, notify = true } = {}) {
  const started = Date.now();
  const index = await loadIndex();
  const seeding = index.items.length === 0;

  // Regole migliorate: rileggiamo le circolari recenti (senza rimandare le notifiche)
  if (!seeding && index.classifierVersion !== CLASSIFIER_VERSION) {
    index.items
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 60)
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
    c.excerpt = it.feedText ? excerpt(it.feedText) : '';
    c.detailDone = false;
    c.attempts = 0;
    // Al primo avvio non inviamo notifiche per circolari già vecchie
    c.notified = seeding;
    c.firstSeen = new Date().toISOString();
    index.items.push(c);
    known.set(c.id, c);
    added++;
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
        excerpt: excerpt(d.text.replace(c.title, '')),
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

  index.source = source;
  await saveIndex(index);
  return { source, found: items.length, added, details: pending.length, notified: toNotify.length, ...pushResult, ms: Date.now() - started };
}
