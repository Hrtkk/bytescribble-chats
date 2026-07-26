/**
 * Hindi / Hinglish → English query bridge.
 *
 * The notes are written in English, so a Devanagari or romanised-Hindi
 * question would never match on keywords alone. Before retrieval we expand
 * the query with English equivalents for common study vocabulary. Cheap,
 * transparent, and easy to extend — add a line and the term starts working.
 *
 * This only widens the search; it never changes the answer text.
 */

const MAP = {
  // --- question words / study verbs (help intent, harmless if unmatched) ---
  'अधिकार': 'rights',
  'मूल': 'fundamental basic',
  'मौलिक': 'fundamental',
  'कर्तव्य': 'duties',
  'संविधान': 'constitution',
  'अनुच्छेद': 'article',
  'न्यायालय': 'court',
  'सर्वोच्च': 'supreme',
  'याचिका': 'writ petition',
  'संशोधन': 'amendment',
  'सरकार': 'government state',
  'कानून': 'law act',
  'धारा': 'section',
  'नियम': 'rule',
  'कंपनी': 'company',
  'लाभांश': 'dividend',
  'अंश': 'share',
  'पूंजी': 'capital',
  'लेखा': 'accounts',
  'लेखापरीक्षा': 'audit',
  'जमा': 'deposits',
  'कर': 'tax',
  'आपूर्ति': 'supply',
  'पंजीकरण': 'registration',
  'चालान': 'invoice',
  'छूट': 'exemption',
  'वापसी': 'returns refund',
  'भुगतान': 'payment',
  'लागत': 'cost',
  'सामग्री': 'material',
  'श्रम': 'labour employee',
  'उपरिव्यय': 'overheads',
  'बजट': 'budget',
  'विचरण': 'variance',
  'प्रकाश': 'light',
  'दर्पण': 'mirror',
  'लेंस': 'lens',
  'अपवर्तन': 'refraction',
  'परावर्तन': 'reflection',
  'सूत्र': 'formula',
  'संख्या': 'numbers',
  'वास्तविक': 'real',
  'अभाज्य': 'prime',
  'गुणनखंड': 'factorisation factors',
  'परिमेय': 'rational',
  'अपरिमेय': 'irrational',
  'हृदय': 'cardiac heart',
  'चक्र': 'cycle',
  'रक्त': 'blood',
  'शरीर': 'body',
  'कोशिका': 'cell',
  'अर्थव्यवस्था': 'economy',
  'इतिहास': 'history',
  'भूगोल': 'geography',
  'पर्यावरण': 'environment',
  'राजनीति': 'polity politics',
  'परिभाषा': 'definition',
  'अंतर': 'difference',
  'उदाहरण': 'example',
  'शर्तें': 'conditions',
  'शर्त': 'condition',
  'प्रकार': 'types kinds',
  'सीमा': 'limit',
  'समय': 'time',

  // --- romanised Hindi / Hinglish ---
  adhikar: 'rights',
  mool: 'fundamental basic',
  maulik: 'fundamental',
  kartavya: 'duties',
  samvidhan: 'constitution',
  anuchhed: 'article',
  nyayalay: 'court',
  sarvocch: 'supreme',
  yachika: 'writ petition',
  sanshodhan: 'amendment',
  sarkar: 'government state',
  kanoon: 'law act',
  kanun: 'law act',
  dhara: 'section',
  niyam: 'rule',
  company: 'company',
  labhansh: 'dividend',
  ansh: 'share',
  punji: 'capital',
  lekha: 'accounts',
  lekhapariksha: 'audit',
  jama: 'deposits',
  kar: 'tax',
  aapurti: 'supply',
  panjikaran: 'registration',
  chalan: 'invoice',
  chhoot: 'exemption',
  vapsi: 'returns refund',
  bhugtan: 'payment',
  lagat: 'cost',
  samagri: 'material',
  shram: 'labour employee',
  budget: 'budget',
  vicharan: 'variance',
  prakash: 'light',
  darpan: 'mirror',
  lens: 'lens',
  apvartan: 'refraction',
  paravartan: 'reflection',
  sutra: 'formula',
  sankhya: 'numbers',
  vastavik: 'real',
  abhajya: 'prime',
  parimey: 'rational',
  aparimey: 'irrational',
  hriday: 'cardiac heart',
  chakra: 'cycle',
  rakt: 'blood',
  koshika: 'cell',
  arthvyavastha: 'economy',
  itihas: 'history',
  bhugol: 'geography',
  paryavaran: 'environment',
  rajniti: 'polity politics',
  paribhasha: 'definition',
  antar: 'difference',
  udaharan: 'example',
  shart: 'condition conditions',
  sharte: 'conditions',
  prakar: 'types kinds',
  seema: 'limit',
  samay: 'time',
  dil: 'cardiac heart',
  paise: 'money cash',
  byaj: 'interest',
  hisab: 'accounts calculation'
};

/**
 * Return the original query plus English equivalents for any recognised
 * Hindi/Hinglish terms. Retrieval tokenises the combined string.
 */
export function bridgeQuery(question) {
  const words = question.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) || [];
  const extra = [];
  for (const w of words) {
    const hit = MAP[w];
    if (hit) extra.push(hit);
  }
  return extra.length ? `${question} ${extra.join(' ')}` : question;
}

/** True if the text contains Devanagari — used to pick a reply language. */
export function isDevanagari(text) {
  return /[ऀ-ॿ]/.test(text);
}
