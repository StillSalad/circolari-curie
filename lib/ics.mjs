// File .ics per "Aggiungi al calendario": evento di un giorno intero con promemoria.
const fold = (line) => line.match(/.{1,73}/g).join('\r\n ');
const escIcs = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (d) => d.replace(/-/g, '');

function nextDay(d) {
  const x = new Date(d + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

export function buildIcs(c, tipo) {
  const day = tipo === 'scadenza' ? c.deadline : c.when;
  const title = tipo === 'scadenza' ? `Scadenza: ${c.title}` : c.title;
  const desc = `Circolare n. ${c.n}\n${(c.summary || c.excerpt || '').slice(0, 600)}\n\n${c.url}`;
  // Scadenza: avviso alle 18 del giorno prima. Evento: alle 9 del giorno prima.
  const trigger = tipo === 'scadenza' ? '-PT6H' : '-PT15H';
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
    `DTSTART;VALUE=DATE:${ymd(day)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(day))}`,
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
