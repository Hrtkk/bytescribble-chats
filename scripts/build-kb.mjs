/**
 * Builds the chat knowledge base from the ByteScribble Notes content.
 *
 * Reads every chapter MDX file, strips frontmatter/imports/JSX, and splits the
 * prose into passages at `##` boundaries. Output is a single JSON file the
 * browser downloads once and searches locally — no vector database, no server
 * round-trip for retrieval.
 *
 * Run: npm run kb
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// Local dev reads the sibling checkout; CI passes NOTES_DIR for the notes
// repo it checked out alongside.
const NOTES =
  process.env.NOTES_DIR || '/Users/khritik/my_website/bytescribble-notes/src/content/chapters';
const OUT = new URL('../public/kb.json', import.meta.url).pathname;
const SITE = 'https://notes.bytescribble.com';

const TRACK_LABEL = {
  'ca-inter': 'CA Inter',
  school: 'School',
  mbbs: 'MBBS',
  upsc: 'UPSC'
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.mdx') || name.endsWith('.md')) out.push(p);
  }
  return out;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return [{}, raw];
  const data = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const v = kv[2].trim();
      data[key] = v === '' ? [] : v.replace(/^["']|["']$/g, '');
    } else if (key && /^\s+-\s/.test(line)) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(line.replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, ''));
    }
  }
  return [data, raw.slice(m[0].length)];
}

/** Turn MDX into readable plain text. */
function clean(body) {
  return body
    .replace(/^import\s.+$/gm, '')
    .replace(/<Flashcard\s+q="([^"]*)"\s*>([\s\S]*?)<\/Flashcard>/g, '$1 — $2')
    .replace(/<Definition\s+term="([^"]*)"\s*>/g, '$1: ')
    .replace(/<Formula[^>]*label="([^"]*)"[^>]*>/g, '$1: ')
    .replace(/<Solved[^>]*problem="([^"]*)"[^>]*answer="([^"]*)"[^>]*>/g, 'Problem: $1 Answer: $2. ')
    .replace(/<\/?(KeyPoints|Mistakes|Flashcards|Definition|Formula|Solved|div|ul|ol|li|strong|em|p|br)[^>]*>/g, ' ')
    .replace(/\$\$/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/^\s*[-–—]{3,}\s*$/gm, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function urlFor(relPath, fm) {
  const parts = relPath.replace(/\.mdx?$/, '').split('/');
  const slug = parts[parts.length - 1];
  const track = fm.track || 'school';
  if (track === 'ca-inter') return `${SITE}/ca-inter/${fm.subject}/${slug}/`;
  if (track === 'school') return `${SITE}/class-${fm.grade}/${fm.subject}/${slug}/`;
  return `${SITE}/${track}/${fm.subject}/${slug}/`;
}

const passages = [];
let docs = 0;

for (const file of walk(NOTES)) {
  const raw = readFileSync(file, 'utf8');
  const [fm, body] = parseFrontmatter(raw);
  if (!fm.title) continue;
  docs++;

  const url = urlFor(relative(NOTES, file), fm);
  const scope = TRACK_LABEL[fm.track || 'school'] || 'Notes';
  const base = { doc: fm.title, url, scope, subject: fm.subject || '' };

  // The 5-bullet summary is the single best answer source — index it first.
  if (Array.isArray(fm.summary) && fm.summary.length) {
    passages.push({ ...base, section: 'In 30 seconds', text: fm.summary.join(' ') });
  }

  const text = clean(body);
  const chunks = text.split(/\n##\s+/);
  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n');
    const heading = nl === -1 ? '' : chunk.slice(0, nl).replace(/^##\s*/, '').trim();
    const content = (nl === -1 ? chunk : chunk.slice(nl)).replace(/\s+/g, ' ').trim();
    if (content.length < 120) continue;
    // Keep passages small enough to fit several into an LLM prompt.
    for (let i = 0; i < content.length; i += 900) {
      const slice = content.slice(i, i + 900);
      if (slice.length < 120) continue;
      passages.push({ ...base, section: heading || 'Notes', text: slice });
    }
  }
}

mkdirSync(new URL('../public/', import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, JSON.stringify({ built: '2026-07-25', docs, passages }));
const kb = statSync(OUT).size;
console.log(`kb.json — ${docs} documents, ${passages.length} passages, ${(kb / 1024).toFixed(0)} KB`);
