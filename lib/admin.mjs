// Amministratore: il dispositivo di chi gestisce l'app riceve gli avvisi di malfunzionamento e le segnalazioni.
import { loadConfig, saveConfig, getSubscription } from './store.mjs';
import { send } from './push.mjs';

export async function isAdmin(endpoint) {
  const cfg = await loadConfig();
  return Boolean(endpoint && cfg.adminEndpoint === endpoint);
}

/** Il primo dispositivo che lo chiede diventa amministratore; poi nessun altro può. */
export async function claimAdmin(endpoint) {
  const cfg = await loadConfig();
  if (cfg.adminEndpoint && cfg.adminEndpoint !== endpoint) return { ok: false, reason: 'taken' };
  if (!(await getSubscription(endpoint))) return { ok: false, reason: 'not-subscribed' };
  await saveConfig({ ...cfg, adminEndpoint: endpoint });
  return { ok: true };
}

export async function releaseAdmin(endpoint) {
  const cfg = await loadConfig();
  if (cfg.adminEndpoint !== endpoint) return { ok: false };
  delete cfg.adminEndpoint;
  await saveConfig(cfg);
  return { ok: true };
}

export async function notifyAdmin(payload) {
  const cfg = await loadConfig();
  if (!cfg.adminEndpoint) return false;
  const sub = await getSubscription(cfg.adminEndpoint);
  if (!sub) return false;
  const r = await send(sub.subscription, { tag: 'admin', url: '/?admin=1', ...payload });
  return r.ok;
}
