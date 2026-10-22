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
export function relevance(c, profile) {
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
  if (r === 'docenti' || r === 'altri') return Boolean(profile?.mostraDocenti && r === 'docenti' && c.level === 'urgente');
  if (r === 'forse' && profile?.includiForse === false) return false;

  const soglia = LIVELLI[profile?.soglia || 'normale'] ?? 0;
  if ((LIVELLI[c.level] ?? 0) >= soglia) return true;

  const interessi = profile?.interessi || [];
  return (c.tags || []).some((tag) => interessi.includes(tag));
}

export function targetLabel(c, profile) {
  const r = relevance(c, profile);
  const t = c.targets || {};
  if (r === 'docenti') return 'Docenti e personale';
  if (r === 'tua') {
    const mine = normClass(profile?.classe);
    if (mine && (t.classes || []).some((k) => k === mine || mine.startsWith(k))) return 'La tua classe';
    return 'Il tuo anno';
  }
  if (r === 'tutti') return 'Tutta la scuola';
  const parti = [];
  if (t.years?.length) parti.push('Classi ' + t.years.map((y) => y + '^').join(', '));
  if (t.classes?.length) parti.push(t.classes.slice(0, 4).join(', '));
  const s = parti.join(' e ') || 'Altre classi';
  return r === 'forse' ? s + ' (forse)' : s;
}
