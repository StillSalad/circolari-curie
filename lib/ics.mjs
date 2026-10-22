// File .ics per "Aggiungi al calendario": evento di un giorno intero con promemoria.
const fold = (line) => line.match(/.{1,73}/g).join('\r\n ');
const escIcs = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (d) => d.replace(/-/g, '');

function addHour(t) { const [h, m] = t.split(':').map(Number); return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

function nextDay(d) {
  const x = new Date(d + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

// "2026-10-27" + "08:55" ora di Roma -> "20261027T075500Z"
export function romeToUtc(day, hhmm) {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asRome = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const utc = new Date(guess - (asRome - guess));
  return utc.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

export function buildIcs(c, tipo) {
  const day = tipo === 'scadenza' ? c.deadline : c.when;
  const title = tipo === 'scadenza' ? `Scadenza: ${c.title}` : c.title;
  const desc = `Circolare n. ${c.n}\n${(c.summary || c.excerpt || '').slice(0, 600)}\n\n${c.url}`;
  // Scadenza: avviso alle 18 del giorno prima. Evento: alle 9 del giorno prima.
  const trigger = tipo === 'scadenza' ? '-PT6H' : c.whenTime ? '-PT1H' : '-PT15H';
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Circolari Curie//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${c.id}-${tipo}@circolari-curie`,
    `DTSTAMP:${now}`,
    ...(tipo === 'data' && c.whenTime
      ? [`DTSTART:${romeToUtc(day, c.whenTime.start)}`, `DTEND:${romeToUtc(day, c.whenTime.end || addHour(c.whenTime.start))}`]
      : [`DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(nextDay(day))}`]),
    ...(c.where ? [`LOCATION:${escIcs(c.where)}`] : []),
    `SUMMARY:${escIcs(title)}`,
    `DESCRIPTION:${escIcs(desc)}`,
    `URL:${c.url}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escIcs(title)}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
