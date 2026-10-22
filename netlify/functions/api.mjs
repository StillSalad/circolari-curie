// API dell'app: elenco circolari, iscrizione alle notifiche, notifica di prova, aggiornamento manuale.
import { loadIndex, saveSubscription, deleteSubscription, getSubscription, addReport, loadReports, loadConfig } from '../../lib/store.mjs';
import { isAdmin, claimAdmin, releaseAdmin, notifyAdmin } from '../../lib/admin.mjs';
import { runCheck } from '../../lib/core.mjs';
import { send, vapidKeys } from '../../lib/push.mjs';
import { SITE } from '../../lib/source.mjs';
import { buildIcs } from '../../lib/ics.mjs';
import { eventDate, eventTime } from '../../public/match.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

const PUBLIC_FIELDS = ['id', 'url', 'n', 'title', 'date', 'tipologie', 'targets', 'level', 'score', 'reasons', 'deadline', 'when', 'tags', 'excerpt', 'summary', 'pdfs', 'detailDone', 'archived', 'whenTime', 'where', 'todo', 'classInfo', 'disruptive', 'action'];

const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.length < 120).slice(-150) : []);

function cleanProfile(p = {}) {
  const ok = (v, list) => (list.includes(v) ? v : undefined);
  return {
    classe: String(p.classe || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8),
    indirizzo: ok(p.indirizzo, ['scientifico', 'scienze_applicate', 'classico', 'linguistico']),
    soglia: ok(p.soglia, ['normale', 'importante', 'urgente']) || 'normale',
    interessi: Array.isArray(p.interessi) ? p.interessi.filter((x) => typeof x === 'string').slice(0, 12) : [],
    includiForse: p.includiForse !== false,
    mostraDocenti: Boolean(p.mostraDocenti),
    promemoria: Boolean(p.promemoria),
    riepilogo: Boolean(p.riepilogo),
    altreClassi: Array.isArray(p.altreClassi)
      ? p.altreClassi.map((k) => String(k).toUpperCase().replace(/[^0-9A-Z]/g, '')).filter((k) => /^[1-5][A-Z]{1,4}$/.test(k)).slice(0, 6)
      : [],
    perMe: ids(p.perMe),
    nonPerMe: ids(p.nonPerMe),
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');

  try {
    if (route === 'circolari' && req.method === 'GET') {
      let index = await loadIndex();
      if (!index.items.length) {
        // Primissimo avvio: leggiamo solo l'elenco (veloce); i dettagli arrivano col controllo programmato
        await runCheck({ detailLimit: 0, notify: false });
        index = await loadIndex();
      }
      const items = index.items.map((c) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, c[k]])));
      return json({ updatedAt: index.updatedAt, source: index.source, items }, 200, { 'cache-control': 'public, max-age=60' });
    }

    if (route === 'vapid' && req.method === 'GET') {
      const { publicKey } = await vapidKeys();
      return json({ publicKey });
    }

    if (route === 'subscribe' && req.method === 'POST') {
      const { subscription, profile } = await req.json();
      if (!subscription?.endpoint || !subscription?.keys?.p256dh) return json({ error: 'Iscrizione non valida.' }, 400);
      await saveSubscription(subscription, cleanProfile(profile));
      return json({ ok: true });
    }

    if (route === 'unsubscribe' && req.method === 'POST') {
      const { endpoint } = await req.json();
      if (endpoint) await deleteSubscription(endpoint);
      return json({ ok: true });
    }

    if (route === 'test-push' && req.method === 'POST') {
      const { endpoint } = await req.json();
      const s = endpoint && (await getSubscription(endpoint));
      if (!s) return json({ error: 'Questo dispositivo non è iscritto alle notifiche.' }, 404);
      const r = await send(s.subscription, {
        title: 'Notifiche attive',
        body: 'Da ora ti avviso quando esce una circolare per te.',
        tag: 'prova',
        url: '/',
      });
      return json(r, r.ok ? 200 : 502);
    }

    if (route === 'report' && req.method === 'POST') {
      // Segnalazione "Non è per me" / "È per me": va all'amministratore per migliorare le regole
      const { id, tipo, classe, endpoint } = await req.json();
      const index = await loadIndex();
      const c = index.items.find((x) => x.id === id);
      if (!c || !['non-per-me', 'per-me'].includes(tipo)) return json({ error: 'Segnalazione non valida.' }, 400);
      const cls = String(classe || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
      await addReport({ id, n: c.n, title: c.title, tipo, classe: cls, targets: c.targets });
      if (!(await isAdmin(endpoint))) {
        await notifyAdmin({
          title: tipo === 'non-per-me' ? 'Segnalazione: non è per questa classe' : 'Segnalazione: riguarda anche questa classe',
          body: `Circolare n. ${c.n} (${c.title.slice(0, 60)}), classe ${cls || '?'}`,
        });
      }
      return json({ ok: true });
    }

    if (route.startsWith('admin/') && req.method === 'POST') {
      const { endpoint } = await req.json();
      const action = route.slice(6);
      if (action === 'claim') {
        const r = await claimAdmin(endpoint);
        if (!r.ok) return json({ error: r.reason === 'taken' ? 'C’è già un amministratore su un altro dispositivo.' : 'Attiva prima le notifiche su questo dispositivo.' }, 403);
        return json({ ok: true });
      }
      if (!(await isAdmin(endpoint))) return json({ admin: false });
      if (action === 'status') {
        const cfg = await loadConfig();
        const index = await loadIndex();
        return json({
          admin: true,
          updatedAt: index.updatedAt,
          circolari: index.items.length,
          archivio: index.archive || null,
          errori: cfg.failCount || 0,
          ultimoErrore: cfg.lastError || null,
          ultimoErroreIl: cfg.lastErrorAt || null,
          segnalazioni: (await loadReports()).slice(0, 50),
        });
      }
      if (action === 'release') return json(await releaseAdmin(endpoint));
      return json({ error: 'Azione sconosciuta.' }, 404);
    }

    if (route === 'ics' && req.method === 'GET') {
      // Evento da aggiungere al calendario (iPhone lo apre direttamente)
      const index = await loadIndex();
      const c = index.items.find((x) => x.id === url.searchParams.get('id'));
      const tipo = url.searchParams.get('tipo') === 'scadenza' ? 'scadenza' : 'data';
      const prof = { classe: url.searchParams.get('classe') || '' };
      const ev = c && { ...c, when: eventDate(c, prof), whenTime: eventTime(c, prof) };
      if (!ev || !(tipo === 'scadenza' ? ev.deadline : ev.when)) return json({ error: 'Questa circolare non ha una data da aggiungere.' }, 404);
      return new Response(buildIcs(ev, tipo), {
        headers: {
          'content-type': 'text/calendar; charset=utf-8',
          'content-disposition': `inline; filename="circolare-${c.n}-${tipo}.ics"`,
        },
      });
    }

    if (route === 'pdf' && req.method === 'GET') {
      // Scarica un PDF dal sito della scuola, così l'app può allegarlo su WhatsApp
      let target;
      try { target = new URL(url.searchParams.get('u') || ''); } catch { return json({ error: 'Indirizzo non valido.' }, 400); }
      const school = new URL(SITE).hostname.replace(/^www\./, '');
      if (target.protocol !== 'https:' || !target.hostname.replace(/^www\./, '').endsWith(school)) {
        return json({ error: 'Posso scaricare solo PDF dal sito della scuola.' }, 403);
      }
      const res = await fetch(target, { headers: { 'User-Agent': 'CircolariCurie/1.0' }, signal: AbortSignal.timeout(9000) });
      if (!res.ok) return json({ error: 'Il sito della scuola non ha restituito il PDF.' }, 502);
      const buf = await res.arrayBuffer();
      const isPdf = (res.headers.get('content-type') || '').includes('pdf') || new TextDecoder().decode(buf.slice(0, 5)) === '%PDF-';
      if (!isPdf) return json({ error: 'Il file non è un PDF.' }, 415);
      if (buf.byteLength > 5.5 * 1024 * 1024) return json({ error: 'Il PDF è troppo grande da allegare.' }, 413);
      return new Response(buf, { headers: { 'content-type': 'application/pdf', 'cache-control': 'public, max-age=86400' } });
    }

    if (route === 'refresh') {
      if (!process.env.ADMIN_KEY || url.searchParams.get('key') !== process.env.ADMIN_KEY) return json({ error: 'Chiave non valida.' }, 401);
      return json(await runCheck({ detailLimit: 3, notify: url.searchParams.get('notify') !== '0' }));
    }

    return json({ error: 'Percorso non trovato.' }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: 'Il server non è riuscito a leggere le circolari. Riprova tra qualche minuto.' }, 500);
  }
};

export const config = { path: '/api/*' };
