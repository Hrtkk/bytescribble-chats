/**
 * Answering, in two tiers.
 *
 * Tier 1 — grounded extract. Runs entirely in the browser from the retrieved
 *          passages. Always available, works offline after first load.
 * Tier 2 — LLM. If the Worker endpoint answers, its generated reply is used
 *          instead. Same citations either way.
 *
 * The client never invents facts: both tiers only surface retrieved notes.
 */

const API = 'https://api.bytescribble.com/chat';

const NOT_FOUND = {
  en: "I couldn't find that in the notes yet. The knowledge base currently covers CA Inter (Law, GST, Costing), Class 10 Science and Maths, and the MBBS and UPSC corners — try rephrasing, or ask about one of those.",
  hi: 'यह मुझे नोट्स में अभी नहीं मिला। फ़िलहाल CA Inter (Law, GST, Costing), कक्षा 10 विज्ञान और गणित, और MBBS व UPSC कॉर्नर उपलब्ध हैं — कृपया दूसरे शब्दों में पूछें।',
  hinglish:
    'Ye mujhe notes mein abhi nahi mila. Filhaal CA Inter (Law, GST, Costing), Class 10 Science aur Maths, aur MBBS/UPSC corners cover hote hain — thoda alag tarike se pooch kar dekhiye.'
};

const LEAD = {
  en: (doc) => `From the notes on ${doc}:`,
  hi: (doc) => `${doc} के नोट्स के अनुसार:`,
  hinglish: (doc) => `${doc} ke notes ke hisaab se:`
};

/** Trim a passage to whole sentences near the requested length. */
function tidy(text, max = 460) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('। '), cut.lastIndexOf('? '));
  return (stop > max * 0.55 ? cut.slice(0, stop + 1) : cut) + ' …';
}

/** Tier 1: readable answer assembled from the top passages. */
export function extractAnswer(hits, lang) {
  if (!hits.length) return NOT_FOUND[lang] || NOT_FOUND.en;
  const top = hits[0];
  const lead = (LEAD[lang] || LEAD.en)(top.doc);
  let body = tidy(top.text);
  // A second, different-document passage adds useful context when short.
  const second = hits.find((h) => h.doc !== top.doc);
  if (second && body.length < 320) body += `\n\n${tidy(second.text, 260)}`;
  return `${lead}\n\n${body}`;
}

/** Tier 2: ask the Worker to generate a grounded answer. */
export async function llmAnswer(question, hits, lang, signal) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      question,
      lang,
      passages: hits.map((h) => ({ doc: h.doc, section: h.section, text: h.text }))
    })
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const data = await res.json();
  if (!data.answer) throw new Error('empty answer');
  return data.answer.trim();
}

/** Distinct sources for the citation chips. */
export function citations(hits) {
  const seen = new Set();
  return hits.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true))).slice(0, 3);
}
