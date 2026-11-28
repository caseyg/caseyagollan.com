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

- **Tidy into notes** (was "Correct the text"). The finished block and the one before it go to a model, which returns the
  passage with misheard words, punctuation and filler fixed. The answer is only used if it is still
  the same passage (`sameSpeech`: about as long, mostly the same words), and only if the block still
  reads as it was heard, so an edit made meanwhile is never overwritten.
- **Lay out and connect.** The model is also given the first words of what is on the table and
  names the one block this passage follows, or none for a new subject. The block is tied to it with
  an arrow and the tied blocks of this voice note are set out as a tree (`arrange`, growing down).
  A block that follows something already on the table is set beside it. With no model to ask, each
  block follows the one spoken before it.

The model is the chat's: `VOICE_TEXT_MODEL` if set (as the Model menu names it, for example
`anthropic:claude-haiku-5-5`), else Qwen on Cerebras where its key is set (`VOICE_FAST_MODEL`),
else the chat's own model, else any provider with a key.

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

"Select the pricing note" and "focus on the last one" don't wait for a model or for the pause.
`quickCommand` matches the words against what is on the table as they arrive (the last word may
still be half said), so the selection shows at once and follows the words. Focus also zooms to it
when the passage ends. A block can be named by its words or by its order among those spoken
("the first block"). When nothing on the table answers, the passage goes to the model as usual.

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

### How long a command takes

Three waits add up between the last word and the change: Flux deciding the turn is over, the
model's answer, and the change itself. What is done about each:

- Flux is asked for its early signal (`eager_eot_threshold` 0.5: `EagerEndOfTurn`, here a
  `likely` event). The model is asked then, while Flux is still making sure; if the pause confirms
  the same words the answer is already on its way, and if the speaker carries on it is dropped.
- A block's question no longer waits for the blocks before it to settle: every finished block is
  asked about at once, and answers are applied in the order spoken.
- While a block is being considered it is drawn faint on the table and the microphone says
  "Thinking…", so a command that is on its way doesn't look like one that was missed.
- The model is the slowest part. Measured from the sandbox with the same seven commands: the
  chat's default (GLM on inference.coop) answers in 1 to 2.5 seconds; Qwen 3.8 on Cerebras in 0.3
  to 0.5 seconds, at about ten times the price per ask (about 0.17¢ against 0.016¢).
  Casey chose the fast one (2026-11-28): where `CEREBRAS_API_KEY` is set it is the default
  (`VOICE_FAST_MODEL`), and the chat's model answers where it isn't. `VOICE_TEXT_MODEL` overrides both.

A command can make something and use it in the same breath: a new note or shape may be given a
name (`"as":"new1"`) that later operations of that command use as its id, which is how "add a
sticky for work connected by an arrow" gets its arrow (`resolveRefs`).

## Like Ramble

Casey likes Todoist's Ramble, and the voice note follows its way of working where a canvas can:

| Ramble | Here |
| --- | --- |
| Items appear as you talk, not a transcript | Words arrive faint, as a draft; at the pause they become clean notes, drawn plainly |
| One ramble can hold several tasks | A passage that lists several things is a note for each (`notes` in the answer, `more` after the first) |
| Filler is dropped | "Okay so", "um", "let me think" are taken out with "Tidy into notes" on |
| "Actually, make that…", "scratch that" | The same words reword or remove the note spoken last (spoken commands) |
| "That's all" ends it | The same (`endsSession`), or the microphone button |
| A preview you confirm | What the voice note added is selected when it ends, to be moved or removed as one; undo steps back through it |

Splitting into notes is asked for by the table alone (`split` in the request). The chat's dictation
uses the same correction call without it, so a dictated message stays one text.

Not taken up: Ramble holds everything in a preview and saves nothing until the end. Here notes
land on the table as they are spoken, because seeing them there is the point of a canvas.

## What it costs

The voice menu ends with a usage list: a line per service with how much of it was used and about
what that cost, a total since the page opened, and a total for the calendar month kept in this
browser (`tables-voice-usage`). "Show the running cost" puts the page's total beside the
microphone.

- Speech: seconds listened through the Worker's socket, priced per minute from
  `VOICE_SPEECH_PRICES` (Flux $0.0077, Nova 3 $0.0092). The browser's own dictation is counted and
  shown as free.
- Text: each answer from `POST /api/tables/voice` carries `usage` (provider, model, tokens in and
  out, dollars), priced by pi-ai from the provider's rates in the chat's model registry.

It is an estimate from listed prices, counted in the browser: another device's use is not in it,
and the services' own bills are the record.

## Thinking aloud as a mind map

With "Lay out and connect" on, the note is set out as a mind map (`arrange` `mindmap`), not a line:

- What is selected is the topic. While one thing is selected, each new thought branches from it,
  side by side. "Select the pricing note" moves to another branch; nothing selected leaves it to
  the model, which is told that points about one topic hang from the topic and not from each other.
- "Add a sticky", "add a note", "new branch off pricing" make an empty sticky (joined to what it
  branches from), and the next thing said is written in it. An empty sticky or shape that is
  selected takes the next thing said in the same way.

Both came from the first voice note read back from the log (2026-11-28): "Add a new sticky" had
been written down as a sentence, because the model's empty sticky was refused, and every thought
followed the one before it.

## Reading what happened

A voice note that went badly can be read back from the Worker's log (Workers observability, on
for this Worker). Two kinds of line are written, both JSON:

- `voice_refine`, by the Worker, once for every answer from the model (tables and the chat's
  dictation alike): `heard`, the `text` and `more` notes it became, `ops`, how long the model took
  (`ms`), the model and its tokens, and what was `asked` of it. Where the answer was not taken (the
  text fell back to what was heard, or operations were refused) the line says `not_taken` and
  keeps the model's own `reply`.
- `voice_client`, sent by the browser to `POST /api/tables/voice/log` (`voiceLogger`), from a
  table's voice note: `kind: "start"` (which source is listening and the three choices), a
  `"passage"` for each pause, a `"stop"` with why it ended and counts, and `"odd"` for anything the
  speech socket said that wasn't words, or how it closed.

A `passage` line carries the timings that explain a slow or missed command:

| Field | Means |
| --- | --- |
| `spoke_ms` | From the first word to the pause Flux called the end of the turn |
| `head_start_ms` | How long before that pause the model was asked (the early signal); absent when there was none |
| `early` | The early question was the one used (the words didn't change after it) |
| `ask_ms` | The model's answer, as the browser saw it (compare `ms` on the `voice_refine` line with the same `trace`) |
| `wait_ms` | From the pause to the change being on the table, queueing behind earlier passages included |
| `was` | What it was taken as: a note, a command, both, "select"/"focus" without a model, "that's all" |

`note` names one voice note on every line of it, and `trace` (`note.n`) joins a passage to its
`voice_refine` line. The words spoken and the model's answers are in these lines, so the log holds
what was dictated; what is on the table is only counted. The log is Casey's own Cloudflare
account's and keeps lines for a few days.

To read it: the telemetry query API (`POST /accounts/<id>/workers/observability/telemetry/query`,
filter key `event` includes `voice`), or the Worker's Logs tab in the dashboard.

## The same listening in the chat

The chat's composer has the same microphone, for Casey (`ChatPromptInput`, so the chat's own page,
the docked panel and the bottom sheet all have it). The parts are shared, not copied:

| Part | Where | Shared with tables |
| --- | --- | --- |
| Microphone, sources, switching on and off, the three quiet minutes | `src/lib/voice-listening.svelte.ts` (`VoiceListening`) | The base of both `VoiceNotes` and `VoiceDictation` |
| The socket to Flux and the browser fallback | `src/lib/voice-source.ts`, `/api/tables/voice/listen` | The same socket |
| Correction | `voiceRefiner` in `voice-source.ts`, `POST /api/tables/voice` with `correct` alone | The same call, without the table |
| The button and its menu of choices | `ui/MicButton`, `ui/VoiceMenu` | `tables/VoiceControl` is built on them, and puts its usage list in the menu (`children`) |
| What the words do | `src/lib/voice-dictation.svelte.ts` (`VoiceDictation`) | The chat's own |

What is heard is written into the message box as it arrives, after whatever the box already holds.
At a pause (Flux's end of turn) the passage is corrected, if "Correct the text" is on, and then, if
"Send when I pause" is on, the message is sent and listening carries on, so a conversation can be
had by talking. Both are on by default and kept in `localStorage` under `chat-voice`. With sending
off, passages gather in the box to be sent by hand.

A few rules keep it from surprising:

- Switching the microphone off keeps what was being said and never sends it.
- Talking on while a passage is with the model holds the send: both passages go at the next pause,
  the first one corrected in place.
- A correction is only written where the box still reads as it was heard, so typing meanwhile wins.
- A message sent by hand mid-sentence takes the rest of that sentence with it; it is not written
  into the next message.
- A message that didn't go (offline) stays in the box.

Answers are not read aloud; the chat listens but does not speak.
