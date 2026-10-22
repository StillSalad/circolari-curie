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

export const CLASSIFIER_VERSION = 5;

export function clean(text) {
  // Apostrofi tipografici (d’Istituto) -> apostrofo semplice, così le regole li riconoscono
  let t = String(text || '').replace(/[’‘`´]/g, "'").replace(/[“”«»]/g, '"');
  for (const r of RUMORE) t = t.replace(r, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** Menzioni di classi con la loro posizione nel testo. */
export function findClassMentions(text, { strict = true } = {}) {
  // Codici classe scritti in maiuscolo: 2^CSA, 4A, 3^ B, 5°C
  const re = /(?<![\w/.,:-])([1-5])\s?([\^°ª]?)\s?([A-Z]{1,4})(?![\w])(?!\s?[\^°ª]?\s?[1-5]\b)/g;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    if (PAROLE_NON_CLASSE.has(m[3])) continue;
    found.push({ code: m[1] + m[3], marker: Boolean(m[2]), index: m.index, end: m.index + m[0].length });
  }
  return found.filter((f) => {
    // Nel testo lungo un "2D" isolato può essere qualsiasi cosa: lo accettiamo solo se
    // ha il segno ^/°, se è vicino a parole come "classe", o se è in un elenco di classi.
    const before = text.slice(Math.max(0, f.index - 30), f.index).toLowerCase();
    const context = /(class[ei]|sezion[ei]|della|delle|alla|alle|nella|nelle|per la|per le)\s*[:,]?\s*$/.test(before);
    const inList = found.some((g) => g !== f && g.code !== f.code && Math.abs(g.index - f.index) < 80);
    return !strict || f.marker || context || inList;
  });
}

export function findClasses(text, opts) {
  return [...new Set(findClassMentions(text, opts).map((f) => f.code))];
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
  // "classi I e II", "classi III, IV e V"
  for (const m4 of lower.matchAll(/\bclassi\s+((?:(?:i{1,3}|iv|v)\b(?:\s*,\s*|\s+e\s+)?)+)/g)) {
    for (const r of m4[1].match(/\b(?:iv|v|i{1,3})\b/g) || []) years.add({ i: 1, ii: 2, iii: 3, iv: 4, v: 5 }[r]);
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

const pad = (n) => String(n).padStart(2, '0');

/** "dalle ore 8.55 alle ore 10.45" -> { start: '08:55', end: '10:45' } */
export function findTime(text) {
  const re = /\b(?:dalle\s+|alle\s+|dalle\s+h\.?\s*)?ore\s*(\d{1,2})(?:[.:,](\d{2}))?(?:\s*(?:alle(?:\s+ore)?|-|–|e\s+(?:le\s+)?ore)\s*(\d{1,2})(?:[.:,](\d{2}))?)?/i;
  const m = text.match(re);
  if (!m) return null;
  const h1 = Number(m[1]); const h2 = m[3] ? Number(m[3]) : null;
  if (h1 < 7 || h1 > 22 || (h2 !== null && (h2 < h1 || h2 > 23))) return null;
  return { start: `${pad(h1)}:${m[2] || '00'}`, end: h2 !== null ? `${pad(h2)}:${m[4] || '00'}` : null };
}

/** Luogo: "in Auditorium", "presso l'Aula Magna", "in palestra" */
export function findPlace(text) {
  const m = text.match(/\b(?:in|presso|nell'|nella|nel)\s*(?:l'\s*|la\s+|il\s+)?(auditorium|aula magna|palestra(?: \w+)?|biblioteca|cortile|laboratorio(?: di)? [a-zàèéìòù]+|aula \d{1,3}[a-z]?|teatro [A-Z][\w']*(?: [A-Z][\w']*){0,3}|oratorio [\w ]{3,30}?(?=[,.;]|$))/i);
  if (!m) return null;
  const p = m[1].trim().slice(0, 40);
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** La frase che dice cosa deve fare lo studente o la famiglia. */
export function findTodo(body) {
  const sentences = body.split(/(?<=[.;!?])\s+(?=[A-ZÀ-Ú])/);
  const re = /\b(dovranno|devono|dovrà|è necessario|occorre|si invitano|sono invitat[ie]|sono tenut[ie]|consegnare|compilare|firmare|versare|effettuare il versamento|iscriversi|prenotarsi|restituire|caricare)\b/i;
  const skip = /^(i|ai|le) (docenti|coordinatori|referenti|collaboratori)|personale ata|il dsga/i;
  const s = sentences.find((x) => re.test(x) && !skip.test(x.trim()) && x.length >= 30 && x.length <= 320);
  return s ? s.trim().replace(/\s+/g, ' ') : null;
}

export function classify({ title = '', text = '', tipologie = [], date }) {
  const ref = date ? new Date(date) : new Date();
  const body = clean(text);
  const full = clean(title) + ' . ' + body;
  const lower = full.toLowerCase();

  const tip = tipologie.map((t) => t.toLowerCase());
  const perAlunni = tip.some((t) => t.includes('alunni') || t.includes('famiglie') || t.includes('student'));
  const perDocenti = tip.some((t) => t.includes('docenti') || t.includes('ata'));
  const docentiOnly = (perDocenti && !perAlunni) || (!tip.length && REGOLE_BASSA.some((r) => r.test(lower)));

  // "Per tutti" forte: lo dice esplicitamente. Debole: l'intestazione "Agli studenti",
  // che compare anche nelle circolari rivolte solo ad alcune classi.
  const allStrong = /tutte le classi|tutti gli (studenti|alunni)|a tutte le studentesse|tutto l'istituto|assemblea (studentesca|d'istituto|di istituto)/.test(lower);
  const allWeak = /\bagli (studenti|alunni)(?!\s+(delle|della|dei|di|del)\b)|alle studentesse(?!\s+(delle|della|dei|di|del)\b)|alle studentesse e agli studenti|agli studenti e alle studentesse/.test(lower);

  const titleLower = clean(title).toLowerCase();
  const titleYears = findYears(titleLower);
  const titleClasses = findClasses(clean(title), { strict: false });
  const years = [...new Set([...titleYears, ...findYears(lower)])].sort();
  const classes = [...new Set([...titleClasses, ...findClasses(body)])];

  let all;
  if (titleYears.length || titleClasses.length) all = /tutte le classi|tutti gli/.test(titleLower); // il titolo è la cosa più precisa
  else if (years.length || classes.length) all = allStrong;
  else all = allStrong || allWeak;

  const targets = {
    all,
    docentiOnly,
    years: titleYears.length || titleClasses.length ? titleYears : years,
    classes: titleYears.length || titleClasses.length ? titleClasses : classes,
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
  // Urgente davvero solo ciò che cambia la giornata; le scadenze contano solo quando si avvicinano (vedi match.js)
  const disruptive = /\bsciopero|\bsciopera|sospension[ei] (delle |dell'|di )?(attivit|lezion)|uscita anticipata|uscite anticipate|termine anticipato|entrata posticipata|ingresso posticipato|variazion[ei] (di |dell')?orario|modifica (dell')?orario|cambio (di )?orario|chiusura (della scuola|dell'istituto|dei locali)|scuola chiusa|allerta|evacuazione/.test(lower);
  const action = /\bentro (il |e non oltre)|scadenza|termine ultimo|autorizzazion|consenso|liberatoria|modulo da (compilare|consegnare)|versamento|pagamento|iscrizion/.test(lower);

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
  // "dal 12/10", "a partire dal 5 novembre": è una data di inizio, non un evento che finisce
  const isStart = (d) => /\b(dal|dall'|a partire da[l']?|a decorrere da[l']?|da)\s*(?:giorno\s+)?(?:luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)?\s*$/i.test(full.slice(Math.max(0, d.index - 30), d.index));
  const whenObj = dates.find((d) => d.date - today >= 864e5 && (!deadline || +d.date !== +deadline) && !isStart(d)) || null;
  const when = whenObj?.date || null;
  // Orario e luogo vicino alla data dell'evento
  const around = whenObj ? full.slice(Math.max(0, whenObj.index - 60), whenObj.index + 160) : full.slice(0, 400);
  const whenTime = whenObj ? findTime(around) : null;
  const where = findPlace(around) || findPlace(body.slice(0, 1500));

  // Calendari per classe (es. consigli di classe): data e orario accanto a ogni classe
  const mentions = findClassMentions(body);
  const classInfo = {};
  mentions.forEach((m, i) => {
    if (classInfo[m.code] || Object.keys(classInfo).length >= 40) return;
    const next = mentions.slice(i + 1).find((x) => x.code !== m.code);
    const snippet = body.slice(m.index, Math.min(m.index + 150, next ? next.index : Infinity)).trim();
    const d = findDates(snippet, ref)[0];
    const t = findTime(snippet) || (snippet.match(/\b(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/) ? (() => { const q = snippet.match(/\b(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/); return { start: `${pad(q[1])}:${q[2]}`, end: `${pad(q[3])}:${q[4]}` }; })() : null);
    if (d || t) classInfo[m.code] = { d: iso(d?.date), t, s: snippet.slice(0, 120) };
  });

  const tags = Object.entries(TAGS).filter(([, re]) => re.test(lower)).map(([k]) => k);

  return {
    targets,
    score,
    level,
    reasons: [...new Set(reasons)].slice(0, 3),
    deadline: iso(deadline),
    when: iso(when),
    whenTime,
    where,
    todo: findTodo(body),
    classInfo: Object.keys(classInfo).length ? classInfo : null,
    disruptive,
    action,
    tags,
  };
}

const INTESTAZIONI = [
  /ministero dell'istruzione(?: e del merito)?/gi,
  /circolare n\.?\s*\d+\s*(?:del\s+\d{1,2}[\s/.-]+(?:\w+|\d{1,2})[\s/.-]+\d{2,4})?/gi,
  /\b(?:agli|alle|ai|al)\s+(?:studenti|studentesse|alunni|genitori|famiglie|docenti|personale ata|dsga|sito web|atti)\b[ ,e]*/gi,
  /\bp\.?\s*c\.?\b/gi,
  /\bmeda,?\s+\d{1,2}[\s/.-]+(?:\w+|\d{1,2})[\s/.-]+\d{2,4}/gi,
];

export function excerpt(text, max = 420, title = '') {
  let base = clean(text);
  const ogg = base.search(/oggetto\s*:/i);
  if (ogg > 0) base = base.slice(ogg);
  else for (const r of INTESTAZIONI) base = base.replace(r, ' ');
  base = base.replace(/^oggetto\s*:\s*/i, '');
  // Togli l'oggetto se ripete il titolo
  const tt = clean(title).toLowerCase().slice(0, 40);
  if (tt && base.toLowerCase().startsWith(tt)) base = base.slice(base.search(/[.;:]\s/) + 1 || 0);
  const t = base
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:–-]+/, '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const dot = cut.lastIndexOf('. ');
  return (dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s\S*$/, '') + '…');
}
