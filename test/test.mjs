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
