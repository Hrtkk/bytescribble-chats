# Bolo — chats.bytescribble.com

A voice and text study companion for [ByteScribble Notes](https://notes.bytescribble.com).
Ask a question in English, हिन्दी or Hinglish; get the answer as text and speech,
grounded in the notes with a citation back to the chapter.

## How it works

1. **Knowledge base** — `npm run kb` reads the notes repo and writes `public/kb.json`
   (passage-level index). Re-run it whenever notes change.
2. **Retrieval** runs in the browser (`src/scripts/retrieval.js`) — IDF-scored keyword
   match over ~1,000 passages. No vector DB; fast and free.
3. **Hindi bridge** (`src/scripts/bridge.js`) expands Devanagari/romanised-Hindi queries
   with English equivalents so they can match the English notes. Add terms freely.
4. **Answer** (`src/scripts/answer.js`) — posts the retrieved passages to
   `api.bytescribble.com/chat` (Workers AI, grounded prompt). If that is unreachable it
   falls back to a readable extract of the top passage, so the app always answers.
5. **Voice** (`src/scripts/voice.js`) — Web Speech API for STT, `speechSynthesis` for TTS,
   Web Audio for the level meter and silence-based VAD in hands-free mode.

Nothing but the question text leaves the device.

## Develop

```sh
npm install
npm run kb      # rebuild the knowledge base from ../bytescribble-notes
npm run dev
npm run build
```

## Browser support

Speech recognition needs Chrome, Edge or Safari. Everything else — typing, retrieval,
answers, text-to-speech — works everywhere.
