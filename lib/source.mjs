// Legge le circolari dal sito del Liceo Marie Curie (WordPress, tema scuole Designers Italia).
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

export const SITE = process.env.SCHOOL_SITE || 'https://liceomeda.edu.it';
const ARCHIVE = `${SITE}/circolare/`;
const FEED = `${SITE}/circolare/feed/`;
const UA = 'CircolariCurie/1.0 (app studentesca non ufficiale; controlla le circolari ogni 20 minuti)';

const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
};

async function get(url, { timeout = 8000, as = 'text' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} su ${url}`);
    return as === 'buffer' ? new Uint8Array(await res.arrayBuffer()) : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function slugOf(url) {
  const m = String(url).match(/\/circolare\/([^/?#]+)\/?/);
  return m ? m[1] : null;
}

// "circolare-n-78-del-21-ottobre-2026" -> { n: 78, date: '2026-10-21' }
export function parseSlug(slug) {
  const out = {};
  const n = slug.match(/circolare-n-?(\d+)/);
  if (n) out.n = Number(n[1]);
  const d = slug.match(/del-(\d{1,2})-([a-z]+)-(\d{4})/);
  if (d && MESI[d[2]]) out.date = `${d[3]}-${String(MESI[d[2]]).padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  return out;
}

function splitTitle(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  const m = s.match(/Circolare\s+n\.?\s*(\d+)\s*[–—-]\s*(.+)$/i);
  return m ? { n: Number(m[1]), title: m[2].trim() } : { title: s };
}

const TIPOLOGIE = ['Circolari per alunni e famiglie', 'Circolari per docenti e personale ATA'];

/** Elenco dall'archivio HTML (pagina 1, circa 15 circolari). */
export async function listFromArchive() {
  const html = await get(ARCHIVE);
  return parseArchive(html);
}

export function parseArchive(html) {
  const $ = cheerio.load(html);
  const byUrl = new Map();
  $('a[href*="/circolare/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const slug = slugOf(href);
    if (!slug || slug === 'page' || /\/circolare\/page\//.test(href) || /\/circolare\/?$/.test(href)) return;
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const prev = byUrl.get(slug);
    if (!prev || text.length > prev.text.length) byUrl.set(slug, { href, text, el: a });
  });

  const items = [];
  for (const [slug, { href, text, el }] of byUrl) {
    // Titolo: preferisci un titolo dentro il link, altrimenti ricavalo dal testo
    const heading = $(el).find('h1,h2,h3,h4,h5,.card-title,strong').first().text().trim();
    let raw = heading || text;
    for (const t of TIPOLOGIE) raw = raw.split(t)[0];
    raw = raw.replace(/^\d{4}\s+\d{1,2}\s+\w{3}\s+circ\.\s*n\.\s*\d+\s*/i, '');
    const { n, title } = splitTitle(raw);
    const fromSlug = parseSlug(slug);
    items.push({
      id: slug,
      url: href.startsWith('http') ? href : SITE + href,
      n: n ?? fromSlug.n ?? null,
      title: title || slug.replace(/-/g, ' '),
      date: fromSlug.date || null,
      tipologie: TIPOLOGIE.filter((t) => text.includes(t)),
    });
  }
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.n || 0) - (a.n || 0));
}

/** Elenco dal feed RSS di WordPress (riserva se l'archivio cambia struttura). */
export async function listFromFeed() {
  const xml = await get(FEED);
  const data = new XMLParser({ ignoreAttributes: true }).parse(xml);
  const raw = data?.rss?.channel?.item || [];
  return (Array.isArray(raw) ? raw : [raw]).map((it) => {
    const slug = slugOf(it.link);
    const { n, title } = splitTitle(String(it.title || ''));
    const pub = it.pubDate ? new Date(it.pubDate) : null;
    const cats = [].concat(it.category || []).map(String);
    return {
      id: slug,
      url: it.link,
      n: n ?? parseSlug(slug || '').n ?? null,
      title,
      date: parseSlug(slug || '').date || (pub && !isNaN(pub) ? pub.toISOString().slice(0, 10) : null),
      tipologie: TIPOLOGIE.filter((t) => cats.some((c) => c.toLowerCase() === t.toLowerCase())),
      feedText: cheerio.load(String(it['content:encoded'] || it.description || '')).text(),
    };
  }).filter((x) => x.id);
}

export async function listCircolari() {
  try {
    const items = await listFromArchive();
    if (items.length) return { source: 'archivio', items };
  } catch (err) {
    console.warn('Archivio non leggibile:', err.message);
  }
  const items = await listFromFeed();
  return { source: 'feed', items };
}

/** Pagina della singola circolare: testo, tipologia, allegati PDF. */
export async function fetchDetail(item) {
  const html = await get(item.url);
  const $ = cheerio.load(html);
  $('script,style,noscript,header,footer,nav,form,.modal,#menu-principale,.breadcrumb').remove();

  const candidates = ['.article-wrapper', 'article', '.entry-content', '.post-content', 'main', '#main-container'];
  let root = null;
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 80) { root = el; break; }
  }
  root = root || $('body');

  const text = root.text().replace(/\s+/g, ' ').trim();
  const pageText = $('body').text();
  const tipologie = TIPOLOGIE.filter((t) => pageText.includes(t));

  const pdfs = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (/\.pdf(\?|$)/i.test(href) && !pdfs.includes(href)) pdfs.push(href.startsWith('http') ? href : SITE + href);
  });

  let fullText = text;
  // Se la pagina contiene solo il titolo e l'allegato, leggiamo il PDF
  if (text.length < 400 && pdfs[0]) {
    const pdfText = await pdfToText(pdfs[0]).catch((e) => (console.warn('PDF non leggibile:', e.message), ''));
    if (pdfText) fullText = text + ' ' + pdfText;
  }
  return { text: fullText, tipologie, pdfs: pdfs.slice(0, 5) };
}

async function pdfToText(url) {
  const buf = await get(url, { as: 'buffer', timeout: 10000 });
  if (buf.byteLength > 4 * 1024 * 1024) return '';
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text).replace(/\s+/g, ' ').slice(0, 12000);
}
