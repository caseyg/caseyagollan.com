# Voice notes on tables

Switch the microphone in a table's toolbar on and talk: the words are written onto the canvas as
they are heard, and each pause starts a new text block. This note says how it works and why it is
built this way. The code map is in `AGENTS.md`.

## How the words get there

| Step | Where | What happens |
| --- | --- | --- |
| Listen | `src/lib/voice-source.ts` | The microphone, as 16 kHz 16-bit PCM in 80 ms pieces, over a WebSocket to the site |
| Transcribe | `src/lib/server/voice.ts`, `worker.mjs` | The Worker hands the socket to a Workers AI speech model, which answers on it |
| Write | `src/lib/voice-session.svelte.ts` | Each message becomes `partial`, `final` or `break`; the block being written changes with them |
| Refine | `POST /api/tables/voice` | Optional: a model fixes what was misheard and says which block this one follows |
| Place | `tables/canvas/textBlocks.ts` | The block is drawn up under the one before it, or tied in and set out as a tree |

## Why Deepgram Flux on Workers AI

The table needs words while they are being said, and it needs to know when the speaker has paused.

- **Flux (`@cf/deepgram/flux`), the default.** It is a streaming model that reports each turn of
  speech as it grows and says when the turn has ended, judging by the words as well as the silence,
  so "a break" is the model's own decision and not a timer. It runs through the `AI` binding the
  Worker already has: no new account, key or secret, and previews have the binding too. Workers AI
  lists it at $0.0077 a minute of audio, about 46 cents an hour of talking. It hears English.
- **Nova-3 (`@cf/deepgram/nova-3`).** Also streaming on Workers AI, in many languages, at $0.0092 a
  minute. It marks pauses by silence alone. Setting the Worker variable `VOICE_MODEL` to it switches
  over; `sttEvents` reads both models' messages.
- **Whisper.** Cheaper, but it takes whole recordings, so nothing would appear until a passage was
  finished and sent.
- **The browser's own dictation (`SpeechRecognition`).** Free and immediate, but Firefox has none,
  Chrome sends the audio to Google, quality varies by browser, and none of them mark pauses. It is
  kept as the fallback for where the Worker has no speech model: a local run and the tables demo.

Audio goes from the browser to the model and is not stored. Only the signed-in owner can open the
socket, and only from the site's own pages.

## What a pause does

A pause closes the block being written. With Flux a turn ends when the model is at least 70% sure
the speaker is done (`eot_threshold`), or after three quiet seconds (`eot_timeout_ms`); both are set
in `listenOptions`. The browser fallback ends a block after 1.6 quiet seconds (`VOICE_PAUSE_MS`).
Listening switches itself off after three minutes of hearing nothing.

## The choices

They are off the main path: they act on a block after it has been written, so text never waits for
a model.

- **Correct the text.** The finished block and the one before it go to a model, which returns the
  passage with misheard words, punctuation and filler fixed. The answer is only used if it is still
  the same passage (`sameSpeech`: about as long, mostly the same words), and only if the block still
  reads as it was heard, so an edit made meanwhile is never overwritten.
- **Lay out and connect.** The model is also given the first words of what is on the table and
  names the one block this passage follows, or none for a new subject. The block is tied to it with
  an arrow and the tied blocks of this voice note are set out as a tree (`arrange`, growing down).
  A block that follows something already on the table is set beside it. With no model to ask, each
  block follows the one spoken before it.

The model is the chat's: `VOICE_TEXT_MODEL` if set (as the Model menu names it, for example
`anthropic:claude-haiku-5-5`), else the chat's own model, else any provider with a key.

## Spoken commands

With "Follow spoken commands" on (the default), a finished block is also read for a request to
change the table: "connect these two blocks with an arrow", "turn one, two, three into numbers",
"draw a circle next to that and call it ideas", "move the pricing post under this one", "delete
the last block". The request is carried out and left out of what is written down; whatever was
said besides it stays as a block. What was done shows over the microphone for a few seconds, and
undo takes it back.

How it works:

- The same one call that corrects a block (`POST /api/tables/voice`) is also sent the table: each
  item's id, kind, words, place and size, what is selected, and this voice note's blocks in the
  order they were spoken. One call keeps it quick: about a second with the chat's model.
- The model answers with `ops`: the chat's own table operations (`TableOp` in
  `src/lib/table-agent.ts`), limited to the ones a sentence can ask for: `connect`, `add_shape`,
  `add_note`, `edit`, `move`, `arrange`, `align`, `frame`, `group`, `remove`, `select`. The page
  carries them out through `TableApi.perform`, as it does for the chat, so they animate, save and
  undo like any edit.
- `cleanVoiceOps` keeps only those operations, only on ids that are on the table, with only the
  fields it knows, at most eight a passage. Anything else in an answer is dropped.
- "This", "these" and "that" mean what is selected, or else the blocks spoken most recently.
- The prompt holds that a thought is not a command ("we should connect with the design team" is
  written down) and that when unsure it is dictation. Words the model adds of its own are not
  taken (`partOfSpeech`).
- `add_shape` is new with this: tldraw's geo shapes (rectangle, ellipse, star, cloud…), with words
  inside if given.

Bigger asks (searching the site, adding posts, maps, looking at the table) stay with the chat,
which has the whole tool set and can take several steps.

## Text blocks as an outline

These work on every text block of a table the owner can change, spoken or typed.

- Dropping one text block on another makes them one: the dropped block's words follow the other's
  last line, arrows tied to it are tied to the other, and one undo divides them again.
- Enter divides a block at the caret; what follows the caret becomes a new block just below and
  takes the caret. Shift+Enter is a new line. Inside a list, Enter still makes the next item.

## Not tried from the development sandbox

The sandbox can't open WebSockets to Cloudflare, so the socket to Flux was written against
Workers AI's published message shapes and tested with a stand-in. It needs a first try on a branch
preview, which has the `AI` binding and owner sign-in.
