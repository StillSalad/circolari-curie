// Archivio su Netlify Blobs: indice delle circolari e iscrizioni alle notifiche.
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

const circolari = () => getStore({ name: 'circolari', consistency: 'strong' });
const iscrizioni = () => getStore({ name: 'iscrizioni', consistency: 'strong' });

export async function loadIndex() {
  return (await circolari().get('index', { type: 'json' })) || { updatedAt: null, items: [] };
}

export async function saveIndex(index) {
  index.items = index.items
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.n || 0) - (a.n || 0))
    .slice(0, 300);
  index.updatedAt = new Date().toISOString();
  await circolari().setJSON('index', index);
}

export const subKey = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

export async function saveSubscription(subscription, profile) {
  const key = subKey(subscription.endpoint);
  const prev = await iscrizioni().get(key, { type: 'json' }).catch(() => null);
  // Le notifiche messe da parte di notte restano anche se l'utente cambia il profilo
  await iscrizioni().setJSON(key, { subscription, profile, updatedAt: new Date().toISOString(), ...(prev?.pending?.length ? { pending: prev.pending } : {}) });
  return key;
}

export async function deleteSubscription(endpoint) {
  await iscrizioni().delete(subKey(endpoint));
}

export async function getSubscription(endpoint) {
  return iscrizioni().get(subKey(endpoint), { type: 'json' });
}

export async function allSubscriptions() {
  const store = iscrizioni();
  const { blobs } = await store.list();
  const out = [];
  for (const b of blobs) {
    const v = await store.get(b.key, { type: 'json' });
    if (v?.subscription) out.push({ key: b.key, ...v });
  }
  return out;
}

export async function deleteKey(key) {
  await iscrizioni().delete(key);
}

export async function loadConfig() {
  return (await circolari().get('config', { type: 'json' })) || {};
}

export async function saveConfig(cfg) {
  await circolari().setJSON('config', cfg);
}

export async function addReport(report) {
  const list = (await circolari().get('reports', { type: 'json' })) || [];
  list.unshift({ ...report, at: new Date().toISOString() });
  await circolari().setJSON('reports', list.slice(0, 200));
  return list.length;
}

export async function loadReports() {
  return (await circolari().get('reports', { type: 'json' })) || [];
}

export async function updateSubscription(key, record) {
  await iscrizioni().setJSON(key, record);
}
