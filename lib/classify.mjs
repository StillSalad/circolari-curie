// Analizza titolo + testo di una circolare e ricava destinatari, priorità, scadenze e tag.

const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
};

const ANNI_PAROLE = { prime: 1, seconde: 2, terze: 3, quarte: 4, quinte: 5 };

// [regex, punti, motivo mostrato all'utente]
const REGOLE_PRIORITA = [
  [/\bsciopero|\bsciopera/, 6, 'Sciopero: possibili variazioni di orario'],
  [/sospension[ei] (delle |dell'|di )?(attivit|lezion)/, 7, 'Sospensione delle lezioni'],
  [/uscita anticipata|uscite anticipate|termine anticipato/, 6, 'Uscita anticipata'],
  [/entrata (posticipata|alle ore|alla \d)|ingresso posticipato/, 6, 'Entrata posticipata'],
  [/variazion[ei] (di |dell')?orario|modifica (dell')?orario|cambio (di )?orario/, 5, 'Cambio di orario'],
  [/chiusura (della scuola|dell'istituto|dei locali)|scuola chiusa/, 7, 'Chiusura della scuola'],
  [/allerta|evacuazione|emergenza/, 5, 'Sicurezza o emergenza'],
  [/\burgent[ei]\b|comunicazioni urgenti/, 4, 'Segnata come urgente'],
  [/annullat|rinviat|rinvio|posticipat/, 3, 'Qualcosa è stato annullato o spostato'],
  [/assemblea (studentesca|d'istituto|di istituto)/, 4, "Assemblea d'istituto"],
  [/\bentro (il |e non oltre)|scadenza|termine ultimo/, 3, 'Ha una scadenza'],
  [/autorizzazion|consenso|liberatoria|modulo da (compilare|consegnare)/, 3, 'Serve una firma o un modulo'],
  [/versamento|pagamento|quota|contributo/, 3, 'Riguarda un pagamento'],
  [/viaggio d'istruzione|viaggio di istruzione|uscita didattica|visita d'istruzione/, 2, 'Viaggio o uscita didattica'],
  [/\binvalsi\b|simulazion[ei] (della |di )?prova|prove comuni/, 3, 'Prove o verifiche comuni'],
  [/elezion[ei]|rappresentanti/, 2, 'Elezioni dei rappresentanti'],
  [/ricevimento (parenti|genitori)|colloqui/, 2, 'Colloqui con i docenti'],
  [/rettifica|errata corrige/, 2, 'Corregge una circolare precedente'],
  [/consigli di classe aperti/, 1, ''],
];

const REGOLE_BASSA = [
  /convocazione (del )?(dipartimento|collegio)/,
  /collegio (dei )?docenti/,
  /permessi per il diritto allo studio/,
  /formazione (dei |del )?(docenti|personale)/,
  /programmazione (singolo docente|disciplinare)/,
];

const TAGS = {
  olimpiadi: /olimpiad|gare? di (matematica|fisica|chimica)|giochi (di archimede|matematici)|kangourou|certamen/,
  lingue: /cambridge|\bdelf\b|\bdele\b|goethe|ielts|certificazion[ei] linguistic|lingua (spagnola|inglese|francese|tedesca|russa)|\bfirst\b|\bpet\b/,
  sport: /sportiv|torneo|campionati studenteschi|\bsci\b|corsa campestre|pallavolo|calcio|basket/,
  orientamento: /orientament|orientametodo|universit|open day|salone dello studente|test d'ingresso/,
  scuola_lavoro: /scuola-lavoro|scuola lavoro|\bpcto\b|stage|tirocini/,
  viaggi: /viaggio d'istruzione|viaggio di istruzione|uscita didattica|uscita di socializzazione|gita|visita d'istruzione/,
  cultura: /teatro|mostra|concerto|cinema|museo|\bscala\b|conferenza|spettacolo/,
  corsi: /corso|corsi|extracurricolar|iscrizion[ei] (ai |al )?(corsi|gruppo)/,
};

// Intestazioni ripetute in ogni circolare che falserebbero il rilevamento degli indirizzi.
const RUMORE = [
  /liceo\s+statale\s+scientifico\s+classico\s+linguistico/gi,
  /scientifico\s*[-–,]?\s*classico\s*[-–,]?\s*linguistico/gi,
  /liceo\s+statale\s+["“]?marie\s+curie["”]?/gi,
];

const PAROLE_NON_CLASSE = new Set(['ORE', 'ORA', 'IL', 'LA', 'LE', 'DI', 'DA', 'AL', 'ALLE', 'DEL', 'PER', 'CON', 'E', 'OPPURE', 'N', 'NR', 'CM', 'KM', 'MB', 'H']);

export const CLASSIFIER_VERSION = 2;

export function clean(text) {
  // Apostrofi tipografici (d’Istituto) -> apostrofo semplice, così le regole li riconoscono
  let t = String(text || '').replace(/[’‘`´]/g, "'").replace(/[“”«»]/g, '"');
  for (const r of RUMORE) t = t.replace(r, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export function findClasses(text, { strict = true } = {}) {
  const out = new Set();
  // Codici classe scritti in maiuscolo: 2^CSA, 4A, 3^ B, 5°C
  const re = /(?<![\w/.,:-])([1-5])\s?([\^°ª]?)\s?([A-Z]{1,4})(?![\w])(?!\s?[\^°ª]?\s?[1-5]\b)/g;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    if (PAROLE_NON_CLASSE.has(m[3])) continue;
    found.push({ code: m[1] + m[3], marker: Boolean(m[2]), index: m.index });
  }
  for (const f of found) {
    // Nel testo lungo un "2D" isolato può essere qualsiasi cosa: lo accettiamo solo se
    // ha il segno ^/°, se è vicino a parole come "classe", o se è in un elenco di classi.
    const before = text.slice(Math.max(0, f.index - 30), f.index).toLowerCase();
    const context = /(class[ei]|sezion[ei]|della|delle|alla|alle|nella|nelle|per la|per le)\s*[:,]?\s*$/.test(before);
    const inList = found.some((g) => g !== f && Math.abs(g.index - f.index) < 25);
    if (!strict || f.marker || context || inList) out.add(f.code);
  }
  return [...out];
}

export function findYears(lower) {
  const years = new Set();
  // "classi prime e seconde", "studenti delle quinte", "alunni delle classi terze"
  const reParole = /\b(?:class[ei]|alunn[ie]|student[ie]|studentesse|ragazz[ie])\s+(?:delle\s+|dell[ae]\s+|dei\s+)?(?:classi\s+)?((?:(?:prime|seconde|terze|quarte|quinte)(?:\s*,\s*|\s+e\s+|\s+ed\s+)?)+)/g;
  let m;
  while ((m = reParole.exec(lower))) {
    for (const w of m[1].match(/prime|seconde|terze|quarte|quinte/g) || []) years.add(ANNI_PAROLE[w]);
  }
  // "le quinte", "per le prime"
  for (const m2 of lower.matchAll(/\b(?:per le|alle|le|delle|nelle)\s+(prime|seconde|terze|quarte|quinte)\b(?!\s+ore)/g)) years.add(ANNI_PAROLE[m2[1]]);
  // "classi 4^ e 5^", "classi 3°"
  for (const m3 of lower.matchAll(/\bclassi\s+((?:[1-5]\s*[\^°ª](?:\s*,\s*|\s+e\s+)?)+)/g)) {
    for (const d of m3[1].match(/[1-5]/g) || []) years.add(Number(d));
  }
  if (/primo biennio/.test(lower)) { years.add(1); years.add(2); }
  else if (/secondo biennio/.test(lower)) { years.add(3); years.add(4); }
  else if (/\bbiennio\b/.test(lower)) { years.add(1); years.add(2); }
  if (/\btriennio\b/.test(lower)) { years.add(3); years.add(4); years.add(5); }
  if (/quinto anno|ultimo anno|maturand|esame di stato/.test(lower)) years.add(5);
  return [...years].sort();
}

export function findIndirizzi(lower) {
  const out = new Set();
  let t = lower;
  if (/scienze applicate|opzione sa\b/.test(t)) {
    out.add('scienze_applicate');
    t = t.replace(/(liceo\s+)?scientifico\s*[-–,(]?\s*(opzione\s+)?scienze applicate\)?/g, ' ').replace(/scienze applicate/g, ' ');
  }
  if (/\bscientific[oi]\b/.test(t)) out.add('scientifico');
  if (/\bclassic[oi]\b/.test(t)) out.add('classico');
  if (/\blinguistic[oi]\b/.test(t)) out.add('linguistico');
  return [...out];
}

function parseDate(d, mese, anno, ref) {
  const day = Number(d);
  const month = isNaN(Number(mese)) ? MESI[String(mese).toLowerCase()] : Number(mese);
  if (!day || !month || day > 31 || month > 12) return null;
  let year;
  if (anno) year = Number(anno) < 100 ? 2000 + Number(anno) : Number(anno);
  else {
    year = ref.getFullYear();
    // Anno scolastico: una data di gennaio citata a ottobre è dell'anno dopo
    if (month < ref.getMonth() + 1 - 3) year += 1;
  }
  const dt = new Date(Date.UTC(year, month - 1, day, 12));
  return isNaN(dt) ? null : dt;
}

const RE_DATA = /(\d{1,2})\s*(?:\/|-|\.)\s*(\d{1,2})(?:\s*(?:\/|-|\.)\s*(\d{2,4}))?|(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?/gi;

export function findDates(text, ref) {
  const out = [];
  let m;
  RE_DATA.lastIndex = 0;
  while ((m = RE_DATA.exec(text))) {
    // "ore 10.45" è un orario, non il 10 di un mese
    if (m[1] && /\bore\s*$|\balle\s*$|\bdalle\s*$|h\s*$/i.test(text.slice(Math.max(0, m.index - 8), m.index))) continue;
    const dt = m[1] ? parseDate(m[1], m[2], m[3], ref) : parseDate(m[4], m[5], m[6], ref);
    if (dt) out.push({ date: dt, index: m.index });
  }
  return out;
}

function iso(d) { return d ? d.toISOString().slice(0, 10) : null; }

export function classify({ title = '', text = '', tipologie = [], date }) {
  const ref = date ? new Date(date) : new Date();
  const body = clean(text);
  const full = clean(title) + ' . ' + body;
  const lower = full.toLowerCase();

  const tip = tipologie.map((t) => t.toLowerCase());
  const perAlunni = tip.some((t) => t.includes('alunni') || t.includes('famiglie') || t.includes('student'));
  const perDocenti = tip.some((t) => t.includes('docenti') || t.includes('ata'));
  const docentiOnly = (perDocenti && !perAlunni) || (!tip.length && REGOLE_BASSA.some((r) => r.test(lower)));

  const all = /tutte le classi|tutti gli (studenti|alunni)|\bagli (studenti|alunni)(?!\s+(delle|della|dei|di|del)\b)|alle studentesse(?!\s+(delle|della|dei|di|del)\b)|a tutte le studentesse|alle studentesse e agli studenti|agli studenti e alle studentesse|tutto l'istituto|assemblea (studentesca|d'istituto|di istituto)/.test(lower);

  const targets = {
    all,
    docentiOnly,
    years: findYears(lower),
    classes: [...new Set([...findClasses(clean(title), { strict: false }), ...findClasses(body)])],
    indirizzi: findIndirizzi(lower),
  };

  let score = 0;
  const reasons = [];
  for (const [re, pts, why] of REGOLE_PRIORITA) {
    if (re.test(lower)) { score += pts; if (why) reasons.push(why); }
  }
  if (REGOLE_BASSA.some((r) => r.test(lower))) score -= 4;
  if (docentiOnly) score -= 2;
  // Le circolari pubblicate nel weekend o la sera per il giorno dopo sono spesso urgenti
  const dates = findDates(full, ref);
  const today = new Date(ref); today.setUTCHours(0, 0, 0, 0);
  const soon = dates.find((d) => d.date - today >= 864e5 && d.date - today <= 3 * 864e5);
  if (soon && score >= 3) { score += 2; reasons.push('Succede nei prossimi giorni'); }

  const level = score >= 7 ? 'urgente' : score >= 4 ? 'importante' : 'normale';

  // Scadenza: la prima data preceduta da "entro"
  let deadline = null;
  const reEntro = /\bentro\s+(?:e non oltre\s+)?(?:il\s+|le ore [\d.:]+ del\s+)?(?:giorno\s+)?(?:luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)?\s*/gi;
  let e;
  while ((e = reEntro.exec(full))) {
    const after = full.slice(e.index + e[0].length, e.index + e[0].length + 30);
    const d = findDates(after, ref)[0];
    if (d && d.index === 0) { deadline = d.date; break; }
  }
  // "Quando": la prima data DOPO la pubblicazione (la data della circolare stessa non conta)
  const when = dates.map((d) => d.date).find((d) => d - today >= 864e5 && (!deadline || +d !== +deadline)) || null;

  const tags = Object.entries(TAGS).filter(([, re]) => re.test(lower)).map(([k]) => k);

  return {
    targets,
    score,
    level,
    reasons: [...new Set(reasons)].slice(0, 3),
    deadline: iso(deadline),
    when: iso(when),
    tags,
  };
}

export function excerpt(text, max = 420) {
  const t = clean(text)
    .replace(/^.*?(oggetto\s*:)/i, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:–-]+/, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const dot = cut.lastIndexOf('. ');
  return (dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s\S*$/, '') + '…');
}
