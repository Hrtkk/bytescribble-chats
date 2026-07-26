/**
 * Client-side retrieval over the notes knowledge base.
 *
 * Deliberately not a vector database: for ~1,000 passages a scored keyword
 * match runs in single-digit milliseconds in the browser, needs no server,
 * and costs nothing. Vectorize can replace this later without the UI noticing.
 */

import { bridgeQuery } from './bridge.js';

let kb = null;
let loading = null;

const STOP = new Set(
  ('a an the is are was were be been being of in on at to for from by with as and or but if then than that this these those ' +
    'it its it\'s what which who whom whose when where why how do does did done can could should would may might will shall ' +
    'i me my we our you your he she they them their about into over under again further once here there all any both each ' +
    'few more most other some such no nor not only own same so too very s t just don now ' +
    'kya kaise kyu kyun hai hain ho tha the ka ki ke ko se me mein aur ya bhi nahi nahin kar karna karne bata batao mujhe ' +
    'ek do teen par bas lekin phir jab tab yeh ye vo woh iska uska')
    .split(' ')
);

/** Tokenise for both Latin and Devanagari text. */
export function tokenize(text) {
  // \p{M} matters: Devanagari vowel signs are combining marks, and without
  // them "मूल" tokenises as "म" + "ल" and never matches anything.
  return (text.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) || []).filter(
    (w) => w.length > 1 && !STOP.has(w)
  );
}

export function kbReady() {
  return Boolean(kb);
}

export function kbStats() {
  return kb ? { docs: kb.docs, passages: kb.passages.length } : null;
}

/** Fetch the index once; concurrent callers share the same promise. */
export function loadKB() {
  if (kb) return Promise.resolve(kb);
  if (loading) return loading;
  loading = fetch('/kb.json')
    .then((r) => {
      if (!r.ok) throw new Error(`kb ${r.status}`);
      return r.json();
    })
    .then((data) => {
      kb = data;
      // Precompute token sets and document frequencies for scoring.
      const df = new Map();
      for (const p of kb.passages) {
        p._t = new Set(tokenize(`${p.doc} ${p.section} ${p.text}`));
        for (const t of p._t) df.set(t, (df.get(t) || 0) + 1);
      }
      kb._df = df;
      return kb;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/**
 * Rank passages against a question.
 * Score = sum of IDF for matched terms, with bumps for title/section hits
 * and for the "In 30 seconds" summary, which is usually the cleanest answer.
 */
export function search(question, limit = 4) {
  if (!kb) return [];
  // Hindi/Hinglish questions are widened with English equivalents so they can
  // match the (English) notes — see bridge.js.
  const terms = tokenize(bridgeQuery(question));
  if (!terms.length) return [];
  const N = kb.passages.length;

  const scored = [];
  for (const p of kb.passages) {
    let score = 0;
    let hits = 0;
    for (const term of new Set(terms)) {
      if (!p._t.has(term)) continue;
      hits++;
      const idf = Math.log(1 + N / ((kb._df.get(term) || 1) + 1));
      score += idf;
      if (p.doc.toLowerCase().includes(term)) score += idf * 1.5;
      if (p.section.toLowerCase().includes(term)) score += idf * 0.6;
    }
    if (!hits) continue;
    score *= hits / terms.length; // reward covering more of the question
    if (p.section === 'In 30 seconds') score *= 1.35;
    scored.push({ p, score });
  }

  scored.sort((a, b) => b.score - a.score);

  // Keep at most two passages per document so answers draw on more sources.
  const perDoc = new Map();
  const out = [];
  for (const { p, score } of scored) {
    const n = perDoc.get(p.doc) || 0;
    if (n >= 2) continue;
    perDoc.set(p.doc, n + 1);
    out.push({ ...p, score });
    if (out.length >= limit) break;
  }
  return out;
}
