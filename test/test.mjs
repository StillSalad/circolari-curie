// Test rapidi senza rete: npm test
import assert from 'node:assert/strict';
import { classify, findClasses, findYears, excerpt } from '../lib/classify.mjs';
import { parseArchive, parseSlug } from '../lib/source.mjs';
import { relevance, shouldNotify, targetLabel } from '../public/match.js';

const ARCHIVIO = `
<ul><li><a href="https://liceomeda.edu.it/circolare/circolare-n-78-del-21-ottobre-2026/">Circolare n. 78 – Assemblea studentesca d’Istituto</a></li></ul>
<div class="card"><a href="https://liceomeda.edu.it/circolare/circolare-n-78-del-21-ottobre-2026/"><span>2026</span><span>21 Ott</span><span>circ. n.78</span><h3>Circolare n. 78 – Assemblea studentesca d’Istituto</h3><span>Circolari per alunni e famiglie</span><span>Circolari per docenti e personale ATA</span></a></div>
<div class="card"><a href="https://liceomeda.edu.it/circolare/circolare-n-77-del-20-ottobre-2026/">2026 20 Ott circ. n.77 Circolare n. 77 – Corso ORIENTAMETODO per gli alunni delle classi PRIME Circolari per alunni e famiglie Circolari per docenti e personale ATA</a></div>
<div class="card"><a href="https://liceomeda.edu.it/circolare/circolare-n-76-del-20-ottobre-2026/">2026 20 Ott circ. n.76 Circolare n. 76 – Convocazione Dipartimento Disciplinare Lettere Circolari per docenti e personale ATA</a></div>
<div class="card"><a href="https://liceomeda.edu.it/circolare/circolare-n-74-del-19-ottobre-2026/">2026 19 Ott circ. n.74 Circolare n. 74 – Convocazione Consiglio di Classe straordinario per comunicazioni urgenti 2^CSA Circolari per docenti e personale ATA</a></div>
<div class="card"><a href="https://liceomeda.edu.it/circolare/circolare-n-68-del-16-ottobre-2026/">2026 16 Ott circ. n.68 Circolare n. 68 – Viaggio di istruzione ad ATENE – ulteriori informazioni Circolari per alunni e famiglie Circolari per docenti e personale ATA</a></div>
<a href="https://liceomeda.edu.it/circolare/page/2/">2</a><a href="https://liceomeda.edu.it/circolare/">Le circolari</a>`;

const list = parseArchive(ARCHIVIO);
assert.equal(list.length, 5);
assert.deepEqual(list[0], {
  id: 'circolare-n-78-del-21-ottobre-2026', url: 'https://liceomeda.edu.it/circolare/circolare-n-78-del-21-ottobre-2026/',
  n: 78, title: 'Assemblea studentesca d’Istituto', date: '2026-10-21',
  tipologie: ['Circolari per alunni e famiglie', 'Circolari per docenti e personale ATA'],
});
assert.equal(list[1].title, 'Corso ORIENTAMETODO per gli alunni delle classi PRIME');
assert.deepEqual(list.find((x) => x.n === 76).tipologie, ['Circolari per docenti e personale ATA']);
assert.deepEqual(parseSlug('circolare-n-5-del-3-settembre-2026'), { n: 5, date: '2026-09-03' });
console.log('✓ archivio');

assert.deepEqual(findClasses('Consiglio di classe 2^CSA e 4A, ore 5 ORE, classi 4^ E 5^'), ['2CSA', '4A']);
assert.deepEqual(findYears('corso per gli alunni delle classi prime e seconde'), [1, 2]);
assert.deepEqual(findYears('incontro per il triennio'), [3, 4, 5]);
assert.deepEqual(findYears('nelle prime ore di lezione'), []);
assert.deepEqual(findYears('alle classi 4^ e 5^'), [4, 5]);
console.log('✓ classi e anni');

const date = '2026-10-21';
const sciopero = classify({ title: 'Sciopero del 23 ottobre 2026', text: 'A tutti gli studenti. Si comunica che il giorno 23/10/2026 è indetto uno sciopero. Non è garantito il regolare svolgimento delle lezioni; possibile uscita anticipata.', tipologie: ['Circolari per alunni e famiglie'], date });
assert.equal(sciopero.level, 'urgente');
assert.equal(sciopero.targets.all, true);
assert.equal(sciopero.when, '2026-10-23');

const prime = classify({ title: 'Corso ORIENTAMETODO per gli alunni delle classi PRIME', text: '', tipologie: ['Circolari per alunni e famiglie'], date });
assert.deepEqual(prime.targets.years, [1]);
assert.ok(prime.tags.includes('orientamento'));

const cdc = classify({ title: 'Convocazione Consiglio di Classe straordinario per comunicazioni urgenti 2^CSA', tipologie: ['Circolari per docenti e personale ATA'], date });
assert.equal(cdc.targets.docentiOnly, true);
assert.deepEqual(cdc.targets.classes, ['2CSA']);

const gita = classify({ title: 'Viaggio di istruzione ad ATENE', text: 'Gli studenti delle classi quarte dovranno consegnare l’autorizzazione e il versamento della quota entro il 30 ottobre.', tipologie: ['Circolari per alunni e famiglie'], date });
assert.equal(gita.deadline, '2026-10-30');
assert.equal(gita.level, 'urgente');
assert.deepEqual(gita.targets.years, [4]);

const intest = classify({ title: 'Corso di spagnolo', text: 'Liceo Statale Scientifico Classico Linguistico "Marie Curie" Meda. Iscrizione corsi extracurricolari di lingua spagnola.', tipologie: ['Circolari per alunni e famiglie'], date });
assert.deepEqual(intest.targets.indirizzi, []);
assert.ok(intest.tags.includes('lingue') && intest.tags.includes('corsi'));
console.log('✓ priorità, scadenze, tag');

const io = { classe: '4ASA', indirizzo: 'scienze_applicate', soglia: 'importante', interessi: ['lingue'] };
assert.equal(relevance(gita, io), 'tua');
assert.equal(relevance(prime, io), 'altri');
assert.equal(relevance(cdc, io), 'docenti');
assert.equal(relevance(sciopero, io), 'tutti');
assert.equal(relevance({ targets: { classes: ['4A'], years: [] } }, io), 'tua');
assert.equal(shouldNotify(sciopero, io), true);
assert.equal(shouldNotify(prime, io), false);
assert.equal(shouldNotify({ ...intest, level: 'normale' }, io), true, 'interesse lingue');
assert.equal(targetLabel(gita, io), 'Il tuo anno');
assert.equal(targetLabel(prime, io), 'Classi 1^');
console.log('✓ filtro per profilo\nTutti i test superati.');
import { findIndirizzi } from '../lib/classify.mjs';
assert.deepEqual(findIndirizzi('classi terze del liceo scientifico opzione scienze applicate'), ['scienze_applicate']);
assert.deepEqual(findIndirizzi('classi quarte scientifico e linguistico'), ['scientifico', 'linguistico']);
console.log('✓ indirizzi');

// Caso reale: circolare n. 78 (assemblea), apostrofo tipografico, data di pubblicazione nel testo, orari
const assemblea = classify({
  title: 'Assemblea studentesca d’Istituto',
  text: 'Ministero dell’Istruzione e del Merito Liceo Statale “Marie Curie” Circolare n. 78 del 21 ottobre 2026 Agli studenti Ai Docenti Oggetto: Assemblea studentesca d’Istituto. Martedì 27 ottobre 2026, dalle ore 8.55 alle ore 10.45 si terrà in Auditorium l’Assemblea aperta ai rappresentanti di classe; gli altri studenti parteciperanno in collegamento dalle proprie classi. Rif. aula 2D.',
  tipologie: ['Circolari per alunni e famiglie', 'Circolari per docenti e personale ATA'],
  date: '2026-10-21',
});
assert.equal(assemblea.targets.all, true);
assert.deepEqual(assemblea.targets.classes, []);
assert.equal(assemblea.when, '2026-10-27');
assert.equal(relevance(assemblea, io), 'tutti');
assert.deepEqual(findClasses('Rif. aula 2D e altro'), []);
assert.deepEqual(findClasses('per gli alunni della 2D'), ['2D']);
assert.deepEqual(findClasses('classi 3A, 3B e 4C'), ['3A', '3B', '4C']);
const quarte = classify({ title: 'Uscita', text: 'Agli studenti delle classi quarte', tipologie: ['Circolari per alunni e famiglie'], date });
assert.equal(quarte.targets.all, false);
console.log('✓ caso reale circolare 78');

// Caso reale: circolare 77, intestazione generica "Agli studenti" ma titolo per le prime
const orient = classify({
  title: 'Corso ORIENTAMETODO per gli alunni delle classi PRIME',
  text: 'Circolare n. 77 del 20 ottobre 2026 Agli studenti Ai docenti Oggetto: corso di metodo di studio. Il corso si terrà il 27 ottobre.',
  tipologie: ['Circolari per alunni e famiglie'], date: '2026-10-20',
});
assert.equal(orient.targets.all, false);
assert.deepEqual(orient.targets.years, [1]);
assert.equal(relevance(orient, { classe: '2ASA' }), 'altri');
assert.equal(relevance(orient, { classe: '1B' }), 'tua');
const acc = classify({ title: 'Attività di accoglienza classi PRIME', text: 'Agli studenti', tipologie: ['Circolari per alunni e famiglie'], date: '2026-10-16' });
assert.equal(relevance(acc, { classe: '2ASA' }), 'altri');
const generica = classify({ title: 'AscoltaMI servizio psicologico', text: 'Agli studenti e alle famiglie', tipologie: ['Circolari per alunni e famiglie'], date: '2026-10-16' });
assert.equal(generica.targets.all, true);
console.log('✓ caso reale circolare 77');

// Avvisi della sera e calendario
import { eveningPayloads } from '../lib/evening.mjs';
import { buildIcs } from '../lib/ics.mjs';
const sera = [
  { id: 'a', n: 68, title: 'Viaggio ad Atene', deadline: '2026-10-30', when: null, targets: { years: [4] }, level: 'urgente' },
  { id: 'b', n: 79, title: 'Sciopero', deadline: null, when: '2026-10-30', targets: { all: true }, level: 'urgente' },
  { id: 'c', n: 77, title: 'Corso prime', deadline: '2026-10-30', when: null, targets: { years: [1] }, level: 'normale' },
];
const solo = eveningPayloads(sera, { classe: '4ASA', promemoria: true }, '2026-10-30');
assert.equal(solo.length, 1);
assert.equal(solo[0].title, 'Domani scade');
const riep = eveningPayloads(sera, { classe: '4ASA', riepilogo: true, promemoria: true }, '2026-10-30');
assert.equal(riep.length, 1);
assert.ok(riep[0].body.includes('Sciopero') && riep[0].body.includes('Scade: Viaggio ad Atene'));
assert.equal(eveningPayloads(sera, { classe: '2ASA', riepilogo: true }, '2026-10-29').length, 0);
assert.equal(eveningPayloads(sera, { classe: '4ASA' }, '2026-10-30').length, 0, 'nessun avviso se non richiesto');
const ics = buildIcs({ id: 'a', n: 68, title: 'Viaggio ad Atene, info', deadline: '2026-10-30', url: 'https://x' }, 'scadenza');
assert.ok(ics.includes('DTSTART;VALUE=DATE:20261030') && ics.includes('DTEND;VALUE=DATE:20261031') && ics.includes('Atene\\, info'));
console.log('✓ avvisi della sera e calendario');

// Più classi e correzioni manuali
const genitore = { classe: '4ASA', altreClassi: ['1B'] };
assert.equal(relevance(orient, genitore), 'tua');
assert.equal(targetLabel(orient, genitore), 'Classe 1B');
assert.equal(relevance(gita, genitore), 'tua');
const conId = { ...orient, id: 'c77' };
assert.equal(relevance(conId, { classe: '2ASA', perMe: ['c77'] }), 'tua');
assert.equal(relevance(conId, { classe: '1B', nonPerMe: ['c77'] }), 'altri');
assert.equal(shouldNotify({ ...conId, level: 'importante' }, { classe: '4A', altreClassi: ['1C'] }), true);
console.log('✓ più classi e correzioni');
