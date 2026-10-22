// Avvisi della sera: promemoria delle scadenze di domani e riepilogo di cosa cambia domani.
import { isForMe } from '../public/match.js';
import { loadIndex, allSubscriptions, deleteKey, loadConfig, saveConfig } from './store.mjs';
import { send } from './push.mjs';

const romeDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
const romeHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(d));

function tomorrowRome() {
  const x = new Date(romeDate() + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

const short = (t, n = 60) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/** Crea le notifiche della sera per un profilo. Esportata per i test. */
export function eveningPayloads(items, profile, tomorrow) {
  const mine = items.filter((c) => isForMe(c, profile));
  const scadenze = mine.filter((c) => c.deadline === tomorrow);
  const eventi = mine.filter((c) => c.when === tomorrow && c.deadline !== tomorrow);
  const out = [];

  if (profile.riepilogo && (scadenze.length || eventi.length)) {
    const righe = [
      ...eventi.map((c) => `${c.level === 'urgente' ? '⚠️ ' : ''}${short(c.title)} (n. ${c.n})`),
      ...scadenze.map((c) => `Scade: ${short(c.title)} (n. ${c.n})`),
    ];
    const una = righe.length === 1 ? [...eventi, ...scadenze][0] : null;
    out.push({
      title: 'Domani a scuola',
      body: righe.slice(0, 4).join('\n') + (righe.length > 4 ? `\n e altre ${righe.length - 4}` : ''),
      tag: 'riepilogo-' + tomorrow,
      url: una ? `/?c=${encodeURIComponent(una.id)}` : '/',
      level: [...eventi, ...scadenze].some((c) => c.level === 'urgente') ? 'urgente' : 'normale',
    });
  } else if (profile.promemoria) {
    // Senza riepilogo: un promemoria per ogni scadenza (il riepilogo le include già)
    for (const c of scadenze.slice(0, 3)) {
      out.push({ title: 'Domani scade', body: `${c.title} (circolare n. ${c.n})`, tag: 'scadenza-' + c.id, url: `/?c=${encodeURIComponent(c.id)}`, level: 'importante' });
    }
  }
  return out;
}

export async function runEvening({ force = false } = {}) {
  // Gira alle 17 e alle 18 UTC: parte solo quando a Roma sono le 19 (vale con ora legale e solare)
  if (!force && romeHour() !== 19) return { skipped: 'non sono le 19 a Roma' };
  const today = romeDate();
  const cfg = await loadConfig();
  if (!force && cfg.lastEvening === today) return { skipped: 'già inviato oggi' };

  const tomorrow = tomorrowRome();
  const { items } = await loadIndex();
  const subs = await allSubscriptions();
  let sent = 0;
  for (const s of subs) {
    if (!s.profile?.promemoria && !s.profile?.riepilogo) continue;
    for (const p of eveningPayloads(items, s.profile, tomorrow)) {
      const r = await send(s.subscription, p);
      if (r.ok) sent++;
      else if (r.gone) { await deleteKey(s.key); break; }
    }
  }
  await saveConfig({ ...(await loadConfig()), lastEvening: today });
  return { tomorrow, subscribers: subs.length, sent };
}
