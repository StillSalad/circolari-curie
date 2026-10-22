// Invio delle notifiche push (Web Push con chiavi VAPID).
import webpush from 'web-push';
import { shouldNotify } from '../public/match.js';
import { allSubscriptions, deleteKey, loadConfig, saveConfig } from './store.mjs';

let keys = null;
/** Chiavi VAPID: dalle variabili d'ambiente se ci sono, altrimenti create al primo avvio e salvate. */
export async function vapidKeys() {
  if (keys) return keys;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) keys = { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };
  else {
    const cfg = await loadConfig();
    if (cfg.vapid?.publicKey) keys = cfg.vapid;
    else {
      keys = webpush.generateVAPIDKeys();
      await saveConfig({ ...cfg, vapid: keys });
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:circolari-curie@example.com', keys.publicKey, keys.privateKey);
  return keys;
}
async function setup() {
  try { await vapidKeys(); return true; } catch (e) { console.warn('Chiavi VAPID non disponibili:', e.message); return false; }
}

export function payloadFor(c) {
  const prefix = c.level === 'urgente' ? 'Urgente: ' : c.level === 'importante' ? 'Importante: ' : '';
  return {
    title: `${prefix}circolare n. ${c.n ?? ''}`.trim(),
    body: c.title,
    tag: c.id,
    url: `/?c=${encodeURIComponent(c.id)}`,
    level: c.level,
  };
}

export async function send(subscription, payload) {
  if (!(await setup())) return { ok: false, reason: 'vapid' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: payload.level === 'urgente' ? 'high' : 'normal' });
    return { ok: true };
  } catch (err) {
    return { ok: false, gone: err.statusCode === 404 || err.statusCode === 410, reason: err.message };
  }
}

/** Notifica le nuove circolari a chi è interessato. Più circolari nuove insieme -> un riepilogo. */
export async function notifyAll(newItems) {
  if (!newItems.length || !(await setup())) return { sent: 0 };
  const subs = await allSubscriptions();
  let sent = 0;
  for (const s of subs) {
    const mine = newItems.filter((c) => shouldNotify(c, s.profile));
    if (!mine.length) continue;
    const payload = mine.length <= 2
      ? null
      : {
          title: `${mine.length} nuove circolari per te`,
          body: mine.slice(0, 3).map((c) => `n. ${c.n}: ${c.title}`).join('\n'),
          tag: 'riepilogo',
          url: '/',
          level: mine.some((c) => c.level === 'urgente') ? 'urgente' : 'normale',
        };
    const batch = payload ? [payload] : mine.map(payloadFor);
    for (const p of batch) {
      const r = await send(s.subscription, p);
      if (r.ok) sent++;
      else if (r.gone) { await deleteKey(s.key); break; }
    }
  }
  return { sent, subscribers: subs.length };
}
