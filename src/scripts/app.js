/**
 * Bolo — orchestration.
 *
 * Turn lifecycle: listen → transcribe → retrieve → answer → speak.
 * Everything degrades: no mic keeps text working, no LLM falls back to the
 * grounded extract, no speech synthesis just leaves the text.
 */
import { loadKB, search, kbStats } from './retrieval.js';
import { MicMeter, Listener, Speaker, sttSupported } from './voice.js';
import { extractAnswer, llmAnswer, citations } from './answer.js';
import { Orb } from './orb.js';

const $ = (id) => document.getElementById(id);
const thread = $('thread');
const stateLine = $('state-line');
const micBtn = $('mic');
const micLabel = $('mic-label');
const handsFreeBtn = $('hands-free');
const input = $('input');
const sendBtn = $('send');
const banner = $('banner');
const kbPill = $('kb-pill');

const orb = new Orb($('orb'));
const meter = new MicMeter();
const listener = new Listener();

let lang = 'en';
let voiceOn = true;
let handsFree = false;
let busy = false;
let interimEl = null;

const COPY = {
  idle: {
    en: 'Hold the button, or just type.',
    hi: 'बटन दबाए रखें, या टाइप करें।',
    hinglish: 'Button dabaye rakhiye, ya type kijiye.'
  },
  listening: { en: 'Listening…', hi: 'सुन रहा हूँ…', hinglish: 'Sun raha hoon…' },
  thinking: { en: 'Looking through the notes…', hi: 'नोट्स देख रहा हूँ…', hinglish: 'Notes check kar raha hoon…' },
  speaking: { en: 'Answering…', hi: 'उत्तर दे रहा हूँ…', hinglish: 'Jawab de raha hoon…' },
  handsFree: { en: 'Hands-free on — just start talking.', hi: 'हैंड्स-फ्री चालू — बोलना शुरू करें।', hinglish: 'Hands-free on — bas bolna shuru kijiye.' }
};

const say = (key) => {
  stateLine.innerHTML = COPY[key]?.[lang] ?? COPY[key]?.en ?? '';
};

function setState(s) {
  orb.set(s);
  if (s === 'idle') say(handsFree ? 'handsFree' : 'idle');
  else say(s);
}

function showBanner(msg) {
  banner.textContent = msg;
  banner.hidden = false;
  setTimeout(() => (banner.hidden = true), 6000);
}

/* ---------------- Transcript rendering ---------------- */

function clearEmpty() {
  $('empty')?.remove();
}

function addMessage(who, text, { interim = false } = {}) {
  clearEmpty();
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  const label = who === 'user' ? 'You' : 'Bolo';
  el.innerHTML = `<div class="msg-who">${label}</div><div class="msg-bubble"></div>`;
  const bubble = el.querySelector('.msg-bubble');
  if (interim) bubble.innerHTML = `<em class="interim"></em>`;
  bubble.firstChild ? (bubble.firstChild.textContent = text) : (bubble.textContent = text);
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function addThinking() {
  clearEmpty();
  const el = document.createElement('div');
  el.className = 'msg bot';
  el.innerHTML = `<div class="msg-who">Bolo</div><div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function fillAnswer(el, text, hits) {
  const bubble = el.querySelector('.msg-bubble');
  bubble.textContent = text;

  const cites = citations(hits);
  if (cites.length) {
    const row = document.createElement('div');
    row.className = 'cites';
    for (const c of cites) {
      const a = document.createElement('a');
      a.className = 'cite';
      a.href = c.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `<span class="cite-dot"></span>${c.doc}`;
      row.appendChild(a);
    }
    el.appendChild(row);
  }

  const replay = document.createElement('button');
  replay.className = 'replay';
  replay.textContent = '↻ Read aloud';
  replay.addEventListener('click', () => speakAnswer(el, text));
  el.appendChild(replay);

  thread.scrollTop = thread.scrollHeight;
}

/* ---------------- Speaking ---------------- */

async function speakAnswer(el, text) {
  if (!voiceOn) return;
  el.classList.add('speaking');
  setState('speaking');
  await Speaker.speak(text, lang, {});
  el.classList.remove('speaking');
  setState('idle');
  if (handsFree && !busy) armHandsFree();
}

/* ---------------- The turn ---------------- */

async function ask(question) {
  const q = question.trim();
  if (!q || busy) return;
  busy = true;
  Speaker.stop();

  addMessage('user', q);
  const pending = addThinking();
  setState('thinking');

  try {
    await loadKB();
    const hits = search(q, 4);

    let text;
    if (!hits.length) {
      text = extractAnswer([], lang);
    } else {
      try {
        // Give the LLM a short window; fall back rather than leave them waiting.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        text = await llmAnswer(q, hits, lang, ctrl.signal);
        clearTimeout(timer);
      } catch {
        text = extractAnswer(hits, lang);
      }
    }

    fillAnswer(pending, text, hits);
    busy = false;
    await speakAnswer(pending, text);
    if (!voiceOn) {
      setState('idle');
      if (handsFree) armHandsFree();
    }
  } catch (err) {
    pending.querySelector('.msg-bubble').textContent =
      'Something went wrong reaching the notes. Please try again.';
    setState('idle');
    busy = false;
  }
}

/* ---------------- Microphone ---------------- */

async function ensureMic() {
  try {
    await meter.start();
    return true;
  } catch {
    showBanner('Microphone permission is needed for voice. You can still type your question.');
    return false;
  }
}

function startListening() {
  if (!sttSupported) {
    showBanner('This browser has no speech recognition. Chrome, Edge or Safari work best — typing still works everywhere.');
    return;
  }
  Speaker.stop();
  setState('listening');
  micBtn.classList.add('live');
  micLabel.textContent = 'Listening…';
  micBtn.setAttribute('aria-pressed', 'true');
  interimEl = null;
  listener.start(lang);
}

function stopListening() {
  listener.stop();
  micBtn.classList.remove('live');
  micLabel.textContent = handsFree ? 'Tap to speak' : 'Hold to speak';
  micBtn.setAttribute('aria-pressed', 'false');
}

listener.onInterim = (text) => {
  if (!interimEl) interimEl = addMessage('user', text, { interim: true });
  else interimEl.querySelector('.interim').textContent = text;
  thread.scrollTop = thread.scrollHeight;
};

listener.onFinal = (text) => {
  interimEl?.remove();
  interimEl = null;
  ask(text);
};

listener.onEnd = () => {
  micBtn.classList.remove('live');
  micLabel.textContent = handsFree ? 'Tap to speak' : 'Hold to speak';
  micBtn.setAttribute('aria-pressed', 'false');
  if (!busy) setState('idle');
};

listener.onError = (err) => {
  interimEl?.remove();
  interimEl = null;
  if (err === 'not-allowed' || err === 'service-not-allowed') {
    showBanner('Microphone blocked. Allow it in the address bar, or type instead.');
    handsFree = false;
    handsFreeBtn.setAttribute('aria-pressed', 'false');
  }
  setState('idle');
};

/* Hands-free: VAD watches for the end of your sentence and submits it. */
function armHandsFree() {
  if (!handsFree) return;
  meter.armVAD(true);
  startListening();
}

meter.onSpeechEnd = () => {
  if (!handsFree || busy) return;
  meter.armVAD(false);
  stopListening();
};

/* ---------------- Wiring ---------------- */

// Push-to-talk (pointer + keyboard)
micBtn.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  if (handsFree) {
    listener.active ? stopListening() : armHandsFree();
    return;
  }
  if (!(await ensureMic())) return;
  startListening();
});
micBtn.addEventListener('pointerup', () => {
  if (!handsFree) stopListening();
});
micBtn.addEventListener('pointerleave', () => {
  if (!handsFree && listener.active) stopListening();
});

handsFreeBtn.addEventListener('click', async () => {
  handsFree = !handsFree;
  handsFreeBtn.setAttribute('aria-pressed', String(handsFree));
  handsFreeBtn.classList.toggle('ghost', !handsFree);
  if (handsFree) {
    if (!(await ensureMic())) {
      handsFree = false;
      handsFreeBtn.setAttribute('aria-pressed', 'false');
      handsFreeBtn.classList.add('ghost');
      return;
    }
    micLabel.textContent = 'Tap to speak';
    armHandsFree();
  } else {
    meter.armVAD(false);
    stopListening();
    micLabel.textContent = 'Hold to speak';
    setState('idle');
  }
});

// Language
document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    Speaker.stop();
    if (!busy) setState('idle');
  });
});

// Voice on/off
$('voice-toggle').addEventListener('click', (e) => {
  voiceOn = !voiceOn;
  e.currentTarget.setAttribute('aria-pressed', String(voiceOn));
  e.currentTarget.style.color = voiceOn ? '' : 'var(--fg-3)';
  if (!voiceOn) Speaker.stop();
});

// Composer
input.addEventListener('input', () => {
  sendBtn.disabled = !input.value.trim();
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('composer').requestSubmit();
  }
});
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;
  ask(q);
});

$('clear').addEventListener('click', () => {
  Speaker.stop();
  thread.innerHTML =
    '<div class="empty-state" id="empty"><h2>Ask anything from the notes.</h2><p>Speak or type — in English, हिन्दी or Hinglish.<br />Answers are grounded in notes.bytescribble.com and cite their source.</p></div>';
  setState('idle');
});

document.getElementById('starters').addEventListener('click', (e) => {
  const btn = e.target.closest('.starter');
  if (btn) ask(btn.textContent.trim());
});

// Keyboard: space to talk, escape to stop
document.addEventListener('keydown', async (e) => {
  if (e.code === 'Escape') {
    Speaker.stop();
    setState('idle');
    return;
  }
  if (e.code === 'Space' && !e.repeat && document.activeElement !== input) {
    e.preventDefault();
    if (!listener.active && !handsFree) {
      if (await ensureMic()) startListening();
    }
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !handsFree && listener.active && document.activeElement !== input) {
    e.preventDefault();
    stopListening();
  }
});

// Feed mic level into the orb
setInterval(() => orb.setLevel(meter.level), 33);

/* ---------------- Boot ---------------- */

loadKB()
  .then(() => {
    const s = kbStats();
    kbPill.textContent = `${s.docs} chapters indexed`;
    kbPill.classList.add('ready');
    setState('idle');
  })
  .catch(() => {
    kbPill.textContent = 'knowledge base offline';
    showBanner('Could not load the notes index. Reload to try again.');
    setState('idle');
  });
