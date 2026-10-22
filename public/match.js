// Logica condivisa tra app (browser) e server (funzioni Netlify).
// Decide se una circolare riguarda il profilo dell'utente e se va notificata.

export const INDIRIZZI = {
  scientifico: 'Scientifico',
  scienze_applicate: 'Scienze applicate',
  classico: 'Classico',
  linguistico: 'Linguistico',
};

export const INTERESSI = {
  olimpiadi: 'Olimpiadi e gare',
  lingue: 'Lingue e certificazioni',
  sport: 'Sport',
  orientamento: 'Orientamento e università',
  scuola_lavoro: 'Scuola-lavoro',
  viaggi: 'Viaggi e uscite',
  cultura: 'Teatro, mostre, eventi',
  corsi: 'Corsi extracurricolari',
};

const LIVELLI = { normale: 0, importante: 1, urgente: 2 };

// "4^ A sa", "4asa", "4 A" -> "4ASA"
export function normClass(s) {
  return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function profileYear(profile) {
  const m = normClass(profile?.classe).match(/^([1-5])/);
  return m ? Number(m[1]) : null;
}

/**
 * Restituisce la rilevanza della circolare per il profilo:
 *  'tua'      -> nomina la tua classe o il tuo anno
 *  'tutti'    -> rivolta a tutti gli studenti
 *  'forse'    -> nomina il tuo anno ma un altro indirizzo, o è ambigua
 *  'altri'    -> nomina solo altre classi
 *  'docenti'  -> solo per docenti e personale
 */
const RANK = { tua: 4, tutti: 3, forse: 2, altri: 1, docenti: 0 };

/** Tutte le classi del profilo: la principale più quelle aggiunte (genitori, rappresentanti). */
export function profileClasses(profile) {
  const main = profile ? [profile] : [];
  const extra = (profile?.altreClassi || []).map((k) => ({ ...profile, classe: k, indirizzo: undefined, altreClassi: [] }));
  return [...main, ...extra];
}

export function relevance(c, profile) {
  // Correzioni manuali dell'utente ("Non è per me" / "È per me")
  if (profile?.nonPerMe?.includes(c.id)) return 'altri';
  if (profile?.perMe?.includes(c.id)) return 'tua';
  let best = null;
  for (const p of profileClasses(profile)) {
    const r = relevanceOne(c, p);
    if (!best || RANK[r] > RANK[best]) best = r;
  }
  return best || relevanceOne(c, profile);
}

/** Per quale classe del profilo è "tua" (serve per l'etichetta). */
export function matchingClass(c, profile) {
  return profileClasses(profile).find((p) => relevanceOne(c, p) === 'tua')?.classe || null;
}

function relevanceOne(c, profile) {
  const t = c.targets || {};
  if (t.docentiOnly) return 'docenti';

  const mine = normClass(profile?.classe);
  const year = profileYear(profile);
  const classes = t.classes || [];
  const years = t.years || [];
  const indirizzi = t.indirizzi || [];

  if (mine && classes.some((k) => k === mine || (mine.startsWith(k) && k.length >= 2))) return 'tua';

  if (year && years.includes(year)) {
    if (indirizzi.length && profile?.indirizzo && !indirizzi.includes(profile.indirizzo)) return 'forse';
    return 'tua';
  }

  if (classes.length || years.length) return t.all ? 'tutti' : 'altri';
  return 'tutti';
}

export function isForMe(c, profile) {
  const r = relevance(c, profile);
  return r === 'tua' || r === 'tutti' || (r === 'forse' && profile?.includiForse !== false);
}

/** Decide se inviare una notifica push per questa circolare. */
export function shouldNotify(c, profile) {
  const r = relevance(c, profile);
  if (r === 'docenti' || r === 'altri') return Boolean(profile?.mostraDocenti && r === 'docenti' && effectiveLevel(c, profile) === 'urgente');
  if (r === 'forse' && profile?.includiForse === false) return false;

  if (isConcluded(c, profile)) return false;
  const soglia = LIVELLI[profile?.soglia || 'normale'] ?? 0;
  if ((LIVELLI[effectiveLevel(c, profile)] ?? 0) >= soglia) return true;

  const interessi = profile?.interessi || [];
  return (c.tags || []).some((tag) => interessi.includes(tag));
}

export function targetLabel(c, profile) {
  const r = relevance(c, profile);
  const t = c.targets || {};
  if (r === 'docenti') return 'Docenti e personale';
  if (r === 'tua') {
    const k = normClass(matchingClass(c, profile) || profile?.classe);
    const main = normClass(profile?.classe);
    if (profile?.perMe?.includes(c.id)) return 'Segnata come tua';
    if (k && k !== main) return 'Classe ' + k;
    if (k && (t.classes || []).some((x) => x === k || k.startsWith(x))) return 'La tua classe';
    return 'Il tuo anno';
  }
  if (r === 'tutti') return 'Tutta la scuola';
  const parti = [];
  if (t.years?.length) parti.push('Classi ' + t.years.map((y) => y + '^').join(', '));
  if (t.classes?.length) parti.push(t.classes.slice(0, 4).join(', '));
  const s = parti.join(' e ') || 'Altre classi';
  return r === 'forse' ? s + ' (forse)' : s;
}

/* ---------- Tempo: urgenza che cambia con i giorni ---------- */

/** Data di oggi a Roma, "AAAA-MM-GG" (uguale su telefono e server). */
export function todayRome(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);

/** Informazioni specifiche per la classe dell'utente (es. il suo consiglio di classe). */
export function classInfoFor(c, profile) {
  if (!c.classInfo) return null;
  for (const p of profileClasses(profile)) {
    const k = normClass(p.classe);
    const hit = c.classInfo[k] || Object.entries(c.classInfo).find(([code]) => k.startsWith(code) && code.length >= 2)?.[1];
    if (hit) return { classe: k, ...hit };
  }
  return null;
}

/** Quando succede per questo utente: la data della sua classe se c'è, altrimenti quella generale. */
export function eventDate(c, profile) {
  return classInfoFor(c, profile)?.d || c.when || null;
}

export function eventTime(c, profile) {
  const info = classInfoFor(c, profile);
  return (info?.d ? info.t : null) || c.whenTime || null;
}

const DISRUPTIVE_RE = /sciopero|sospensione|uscita anticipata|entrata posticipata|chiusura|cambio di orario|emergenza/i;
const ACTION_RE = /firma|modulo|pagamento|scadenza/i;
const isDisruptive = (c) => c.disruptive ?? (c.reasons || []).some((r) => DISRUPTIVE_RE.test(r));
const isAction = (c) => c.action ?? (c.reasons || []).some((r) => ACTION_RE.test(r));

/** Conclusa: tutte le date (evento e scadenza) sono passate. */
export function isConcluded(c, profile, today = todayRome()) {
  const dates = [eventDate(c, profile), c.deadline].filter(Boolean);
  return dates.length > 0 && dates.every((d) => d < today);
}

/**
 * Livello di oggi. Urgente: cambia la giornata (sciopero, uscite...) nei prossimi 3 giorni,
 * oppure una scadenza entro 2 giorni. Importante: cose da fare o eventi rilevanti entro 10 giorni.
 * Quando la data è passata torna normale.
 */
export function effectiveLevel(c, profile, today = todayRome()) {
  if (isConcluded(c, profile, today)) return 'normale';
  const ev = eventDate(c, profile);
  const future = [ev, c.deadline].filter((d) => d && d >= today).sort();
  const next = future.length ? dayDiff(future[0], today) : null;
  const age = c.date ? dayDiff(c.date, today) : 0; // negativo: giorni fa
  const dl = c.deadline && c.deadline >= today ? dayDiff(c.deadline, today) : null;

  if (isDisruptive(c)) {
    if (next !== null) return next <= 3 ? 'urgente' : 'importante';
    return age >= -3 ? 'urgente' : age >= -10 ? 'importante' : 'normale';
  }
  if (isAction(c) && dl !== null && dl <= 2) return 'urgente';
  if ((c.score ?? 0) >= 4 || isAction(c)) {
    if (next !== null) return next <= 10 ? 'importante' : 'normale';
    return age >= -7 ? 'importante' : 'normale';
  }
  return 'normale';
}
