/**
 * Voice I/O: microphone level + VAD, speech recognition, speech synthesis.
 * All browser-native — no keys, no upload, nothing leaves the device except
 * the text of the question.
 */

/* ---------------- Mic level + voice activity detection ---------------- */

export class MicMeter {
  constructor() {
    this.level = 0;
    this.ctx = null;
    this.stream = null;
    this.raf = null;
    this.onSpeechEnd = null;
    this.vad = false;
    this._quietFrames = 0;
    this._loudFrames = 0;
  }

  async start() {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;
    src.connect(this.analyser);
    this.buf = new Uint8Array(this.analyser.frequencyBinCount);
    this._tick();
  }

  _tick = () => {
    this.analyser.getByteFrequencyData(this.buf);
    // Speech energy sits mostly in the low-mid bins; ignore the hiss up top.
    let sum = 0;
    const bins = Math.floor(this.buf.length * 0.55);
    for (let i = 0; i < bins; i++) sum += this.buf[i];
    const level = Math.min(1, sum / bins / 110);
    this.level += (level - this.level) * 0.35;

    if (this.vad) {
      if (this.level > 0.18) {
        this._loudFrames++;
        this._quietFrames = 0;
      } else {
        this._quietFrames++;
        // ~55 frames ≈ 0.9 s of silence after real speech ends a turn.
        if (this._loudFrames > 8 && this._quietFrames > 55) {
          this._loudFrames = 0;
          this._quietFrames = 0;
          this.onSpeechEnd?.();
        }
      }
    }
    this.raf = requestAnimationFrame(this._tick);
  };

  armVAD(on) {
    this.vad = on;
    this._quietFrames = 0;
    this._loudFrames = 0;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.level = 0;
  }
}

/* ---------------- Speech recognition (STT) ---------------- */

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const sttSupported = Boolean(SR);

/** Recognition locale per UI language. Hinglish rides on en-IN, which
 *  handles code-mixed speech better than hi-IN and returns Latin script. */
export const STT_LOCALE = { en: 'en-IN', hi: 'hi-IN', hinglish: 'en-IN' };

export class Listener {
  constructor() {
    this.rec = null;
    this.active = false;
    this.onInterim = null;
    this.onFinal = null;
    this.onError = null;
    this.onEnd = null;
  }

  start(lang) {
    if (!SR || this.active) return;
    const rec = new SR();
    rec.lang = STT_LOCALE[lang] || 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) this.onInterim?.(interim);
      if (finalText) this.onInterim?.(finalText);
    };
    rec.onerror = (e) => {
      // "aborted" and "no-speech" are routine, not worth alarming the user.
      if (e.error !== 'aborted' && e.error !== 'no-speech') this.onError?.(e.error);
    };
    rec.onend = () => {
      this.active = false;
      const text = finalText.trim();
      if (text) this.onFinal?.(text);
      this.onEnd?.();
    };

    this.rec = rec;
    this.active = true;
    try {
      rec.start();
    } catch {
      this.active = false;
    }
  }

  stop() {
    if (this.rec && this.active) {
      try {
        this.rec.stop();
      } catch {
        /* already stopping */
      }
    }
  }

  abort() {
    if (this.rec) {
      try {
        this.rec.abort();
      } catch {
        /* noop */
      }
    }
    this.active = false;
  }
}

/* ---------------- Speech synthesis (TTS) ---------------- */

export const TTS_LOCALE = { en: 'en-IN', hi: 'hi-IN', hinglish: 'hi-IN' };

let voices = [];
function refreshVoices() {
  voices = window.speechSynthesis?.getVoices?.() || [];
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickVoice(locale) {
  if (!voices.length) refreshVoices();
  const lang = locale.split('-')[0];
  return (
    voices.find((v) => v.lang === locale) ||
    voices.find((v) => v.lang?.startsWith(lang)) ||
    voices.find((v) => v.lang?.startsWith('en')) ||
    null
  );
}

export const Speaker = {
  speaking: false,

  /** Speak text; resolves when finished or interrupted. */
  speak(text, lang, { onStart, onEnd } = {}) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return Promise.resolve();
    synth.cancel();

    const locale = TTS_LOCALE[lang] || 'en-IN';
    // Long answers are chunked: some engines truncate a single long utterance.
    const chunks = text
      .replace(/\s+/g, ' ')
      .match(/[^.!?।]+[.!?।]*/g)
      ?.reduce((acc, s) => {
        if (acc.length && (acc[acc.length - 1] + s).length < 190) acc[acc.length - 1] += s;
        else acc.push(s);
        return acc;
      }, []) || [text];

    return new Promise((resolve) => {
      let i = 0;
      const voice = pickVoice(locale);
      const next = () => {
        if (i >= chunks.length || !this.speaking) {
          this.speaking = false;
          onEnd?.();
          resolve();
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[i++].trim());
        u.lang = locale;
        if (voice) u.voice = voice;
        u.rate = lang === 'hi' ? 0.95 : 1.02;
        u.pitch = 1;
        u.onend = next;
        u.onerror = next;
        synth.speak(u);
      };
      this.speaking = true;
      onStart?.();
      next();
    });
  },

  stop() {
    this.speaking = false;
    window.speechSynthesis?.cancel();
  }
};
