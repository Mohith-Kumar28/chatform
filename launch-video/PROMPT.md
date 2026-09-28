# The launch-video prompt

Paste everything below the line into a fresh Claude Code session (Opus). It works in three situations:
- inside your product's repo (best)
- with only a live URL
- with nothing at all (it interviews you)

The output is a premium, beat-synced product launch video of 40–75 seconds, built in Remotion. It has an original script, one idea per bar, everything framed dead-centre, a real music track, and sound effects on the grid.

---

## ROLE

You are a senior motion designer, a copywriter and a Remotion engineer in one person. You make the kind of launch video that goes viral on X: **premium, calm to look at, fast to watch, and cut to the music.** Every half second something new happens. Everything happens at the centre of the frame, so the eye never has to search.

The video sells what the viewer gets, in your own words. It is not a tour of the landing page. You do not stop at "it renders". You stop when it looks and sounds like a studio made it.

**What "bad" looks like. Never ship any of it:**
- **Copied copy.** The website's sections and headings pasted in order, as a feature list with no hook.
- **No problem statement.** Opening on the product before the viewer knows what's broken.
- **One layout for everything.** A small headline pinned to the top of every demo (nobody reads it), or a fade band behind it.
- **A recap of UI fragments** instead of the features' names.
- **Loud and cheap.**
  - a different saturated gradient every scene
  - giant heavy type everywhere
  - frosted pills behind every caption
  - text on the left and UI on the right
- **Motion that reads as broken.**
  - text revealed through a clipping mask (it reads as "cropped")
  - headlines that throb on the beat
  - a logo wordmark cut off by a width mask
- **Sound problems.** Synthesised music; sound effects that drift off the beat.
- **Weak frames.**
  - blank or background-only frames at a cut
  - UI too small to read on a phone
  - scenes that hold for 3 seconds or more

## STEP 0: GATHER CONTEXT. Do not invent the product.

**A. There is a codebase.** Read it first:
- **Pitch:** README, hero and landing copy, meta description, CTAs.
- **Brand tokens:** exact hex values from the CSS variables and the Tailwind theme (paper, ink, primary, muted, border, accents), plus the font families and weights.
- **Logo:** the SVG. Note whether the mark has parts that can fly in and join.
- **Every feature**, in the app as well as on the landing page. Make a numbered list of 10–15.
- **Real content:** seed data, demo conversations, real names and numbers.
- **Facts and limits:** anything marked "coming soon" or listed as a limitation stays out.
- **House rules** from CLAUDE.md or memory: banned words, banned punctuation (some teams ban em dashes), positioning.

**B. A live URL is known.** Open it in a browser. Screenshot the hero and each component, click things, and note how the site animates.

**C. There is no repo and no URL.** Ask with AskUserQuestion:
- "What should the video be about?"
    - *I'll describe it in chat*
    - *Here's my website URL*
    - *Here's a GitHub repo / codebase*
    - *I'll upload screenshots or a recording*
- "Any style reference?"
    - *A reference video / X post*
    - *A website whose look I want*
    - *No, you choose (clean, Apple-style)*
- Then follow up only for what's missing: name, pitch, features, brand colours and logo, the CTA URL.

**Output:** a Brand Brief at the top of `STORYBOARD.md`.

## STEP 1: WRITE YOUR OWN SCRIPT (this is what makes it engaging)

Before any code, write the film as a list of lines, one per bar. Read it aloud with no pictures. It must sell on its own.

- **The problem, told properly (a 16-beat build-up).** Assume the viewer has never heard of the product. Show the old way, name why it fails, and show the bad result. For example:
  - "This is a form." (typed), then a 25-field page scrolls past
  - "25 questions. One long page." (slammed over the dimmed page)
  - a cursor closes the tab, then "So people leave."
  - "The ones who stay write:" then "ok · idk · n/a · it was bad" slapping into a pile
  - then everything implodes into a dot in the brand colour
- **The drop:** the logo is born from that dot, with the positioning line as a pill.
- **Statement, then demo, for every idea.** The line that matters gets its own full frame, dead centre and big (120–150px), in its own style: typed with a caret, two slammed lines, a marker swipe, a stack of words one per beat, or a split with forking lines. Then the demo plays with no text on top of it. **Never put a small headline at the top of a demo: nobody reads it.** Two-part lines in your own voice, about the outcome:
  - "Loose words in. **Clean data out.**"
  - "Left halfway? **It brings them back.**"
  - "Stuck on something? **It answers.**"
  - "Describe it. **Get the whole form.**"
  - "It won't let you publish **a dead end.**"
- **Order the ideas as a journey:**
  1. What the respondent experiences
  2. What you get out of it
  3. How easy it is to make
  4. Where it goes
  5. Proof you can see
- **The end card:** logo, wordmark, one CTA with the URL, and one line of reassurance (e.g. "Free forever, no card").

## STEP 2: MUSIC FIRST. The track sets the clock.

1. **Use a real, licensed track, never synthesised music.** Good sources:
    - Pixabay Music (search "hype promo", "future bass", "energetic tech")
    - Mixkit (`mixkit.co/free-stock-music/tag/edm/`; files at `assets.mixkit.co/music/<id>/<id>.mp3`)
    - A track the user supplies
    - Download 5–15 candidates.
2. **Analyse them** with a small zero-dependency Node script. Decode with `ffmpeg -ac 1 -ar 22050 -f f32le -`, then compute:
    - an energy-flux onset envelope, with the kick band weighted
    - the BPM, by autocorrelation
    - the beat phase
    - loudness per bar, with the jumps marked as drops
3. **Pick a track at 120–140 BPM with a clear build and a hard drop.**
    - Check the grid by measuring the median kick offset every 32 beats. If it drifts, the BPM is wrong.
4. **Encode the grid.** `beat.ts` exports:
    - `DROP` (8 beats in)
    - `b(n)`, the frame of beat n (0 is the drop)
    - `MUSIC_START_SEC`, so the track is trimmed in with the drop landing on `b(0)`

## STEP 3: STORYBOARD. One idea per bar, no two scenes alike.

Write a table: bar · beats · script line · the one visual idea · transition in · beat-level actions · SFX.

| Section | Beats | Content |
|---|---|---|
| Hook | −8…0 | Words slam one per beat on a near-black background with a brand-colour glow. Bad outcomes slap down into a pile. Everything implodes into a dot. |
| Drop | 0 | White flash. The logo pops out of the dot, with shockwave rings, good outcomes exploding radially, the wordmark popping letter by letter, and a positioning pill. |
| Ideas | 1 bar each | 10–13 ideas. Something changes on every beat inside the bar: a message arrives, a cursor clicks, a chip flies, a count ticks, a stamp slams. |
| A break in the track | 1 bar | A different treatment: a full brand-colour field, an orbit that turns one notch per beat, then a collapse into the next drop. |
| Recap | 2 bars | A dense wall of **real feature names** (not UI fragments, 20+ of them) on a 3D tilt: columns scroll slowly and continuously in opposite directions, and the camera starts close on one highlighted card and slowly pulls out. No random cards flashing white; slow means weight. A centred line sums it up ("One form builder. All of it."), then the camera dives in. |
| End card | about 1.5 bars | An iris opens into the brand gradient: logo tile, wordmark, CTA pill, reassurance. Hold at least 1.5s. |

Visual ideas to pick from (never repeat one):
- a chat window whose messages pop on the beats
- a sentence whose phrases highlight and fly into a data table
- an orbit of sources turning one notch per beat, then collapsing into an answer
- a reminder toast, a cursor click, a progress bar filling, and a COMPLETED stamp with a screen shake
- a prompt bar typing on the 16ths, then cards fanning out like a hand
- a URL typing, page thumbnails popping on the 8ths, a scan line checking them
- a list with a row inserted by a typed command
- a flow graph where a walker hits a red dead end, which then gets fixed
- a one-time-code field filling on the 8ths
- a pill row where the cursor clicks one pill per beat and the tile below morphs
- a bar chart growing, with a hovered tooltip

## STEP 4: THE LOOK (premium restraint)

- **One base:** a warm or neutral paper background, with a soft radial glow of the brand colour behind the centre (about 12–16% alpha).
- **Contrast scenes, sparingly:** one near-black scene, one full brand-colour scene, and the gradient only on the end card.
- **UI rebuilt as real, small, crisp components:**
  - white cards with a 1px border
  - soft layered shadows (`0 2px 4px #0000000a, 0 30px 70px -26px <brand-dark>33`)
  - 20–26px radii
  - the real UI font
  - scaled 1.1–1.3× so the smallest text reads on a phone
- **Statements:** the display font at 120–150px, weight 800, tracking −0.045em, dead centre on their own frame. Demos carry no headline.
- **Film grain** at 3.5% (multiply).

## STEP 5: SETUP

```bash
npx create-video@latest --yes --blank launch-video && cd launch-video && npm i
npx remotion add @remotion/media @remotion/fonts @remotion/layout-utils @remotion/google-fonts
```

- **In a product repo:** put the video in its own folder and gitignore it.
- **Sound effects:** use a real CC0 library, never generated blips. Kenney's Interface Sounds, UI Audio and Impact Sounds (kenney.nl, CC0) give you click, select, pop, toggle, switch, drop, land, glitch, stamp, glass, rise, fall, tick, confirm and key clicks. Convert them to WAV, and add whoosh and whip from `https://remotion.media/`.

Architecture:

| File | Contents |
|------|----------|
| `beat.ts` | The grid. |
| `brand.ts` | Tokens, fonts, easings. |
| `kit.tsx` | `useBeatScene(startBeat, endBeat)` (returns `lf` and `bt(n)`), `popSpring`, a centred `Stage`, an `At(x, y)` positioner, `Title` (two-tone, word pops), `Paper`. |
| `ui.tsx` | Icons, cursor, ripple, particle burst, shockwave ring, SVG directional motion blur, the logo mark, product components. |
| `scenes/*.tsx` | One scene per bar. Each exports the beats of its actions. |
| `Audio.tsx` | A cue list of `[beat, file, volume, rate]`, built from those exports. |
| `Video.tsx` | Stacks the scenes in order. |

## STEP 6: MOTION RULES

**Pace**
- Each scene lasts one bar.
- Inside it, something changes on every beat, and small things on the 8ths.

**Cuts land on the beat**
- The exit accelerates into the beat (6–10 frames).
- The incoming subject is already about 80% in on the beat frame.
- **A scene never paints its background before its content is visible.**

**Transitions:** at least 6 kinds, all moves about the centre:
- zoom-through into the element the next scene continues from
- whip pan with SVG `feGaussianBlur stdDeviation="x 0"`
- iris
- spin-collapse
- slide-up
- collapse to a point on the break

**Springs**
- Pops: `spring({damping 11–15, stiffness 200–320, mass 0.6–0.8})`.
- Moves: `bezier(0.16, 1, 0.3, 1)`.
- Exits: `bezier(0.55, 0, 0.75, 0.2)`.

**Interactions**
- The cursor travels on an expo-out path.
- It presses on the beat.
- A ripple and the state change follow within 2 frames.

**Pace for comprehension, not just energy.**
- A feature the viewer must understand gets **2 bars (about 4s)**. The hero moment gets 3 bars. A gallery of many small things (question types, integrations) is a **3D wall with an accelerating tour** (see below), never tabs and never one scene per item.
- Write each scene in 4 beats, then stretch its timing (`useBeatScene(start, start + 4, pre, post, STRETCH)`), so every event, exit and sound cue scales together.
- One bar per feature is only for a quick recap.

**A focus camera in every scene.**
- Wrap each scene's content in `<Cam keys={[[beat, x, y, zoom], ...]}>`. It eases (bezier 0.65, 0, 0.35, 1 over about 26 frames) so the element that is acting sits at the centre at 1.3–1.5×:
  - the input while someone types
  - each new chat message
  - the button as it's clicked
  - the row being inserted
  - the dot walking a path
- Pull back to about 1.0× when the point is made, so the viewer sees the whole screen once.
- Never move the camera without a reason. Every move goes to the thing that just changed.

**Depth, not flat layouts.**
- Tilt most demo scenes a little in 3D: `perspective(2600px) rotateX(6–24deg) rotateY(±6–10deg)` on the camera. A flat, front-on screen reads as a screenshot.
- Keep text flat and centred. Tilt the UI, not the words.

**The wall with an accelerating tour** (for "we have lots of X").
- Lay out 20–30 real cards (real type names from the code, each with a tiny live answer: stars fill, a signature draws, a payment turns into "Paid").
- Put the wall on a high-angle plane: `rotateX(35–55deg) rotateZ(-10–-16deg)`. Add extra rows and columns so no edge ever shows.
- The camera visits one card at a time, and each gap gets shorter (e.g. 1.7, 1.4, 1.2, 1.0 … 0.15 beats). A tick sound on each stop, rising in pitch.
- End by zooming out to about 0.4× so the viewer sees the whole wall drifting.

**Show logic as people, not as a flowchart.**
- Two phones side by side, each named (Maya, Arjun), get the same question and give different answers. Each then gets a *different* next question. The camera goes back and forth.
- Then blur the phones back and type the takeaway, centred, on top.

**Never reuse an animation.** If a click-a-pill interaction already appeared, the next "many options" scene must use a different device, such as a 3D carousel that turns on its own.

**Long typed lines must fit.** Size a typed statement from its length (`min(128, 1640 / (chars × 0.48))`) so it never runs off the frame.

**No global beat pulse on text.** The white flash on each drop and the cuts carry the rhythm.

## STEP 7: SOUND

- Music at about 0.8, fading out over the last 60 frames.
- One sound for every visible action, each placed at `<Sequence from={b(n)}>`, with `playbackRate` varied 0.9–1.4 across repeats.

| Action | Sound |
|--------|-------|
| Word slams | select |
| Pile slaps | drop |
| Drops | stamp + glass |
| Messages and pops | pop |
| Clicks | click |
| Typing | key clicks on the 16ths |
| Success | confirm |
| Stamps | stamp |
| Zoom-throughs | rise |
| Collapses | fall |
| Whips | whip |
| Errors | glitch |

## STEP 8: QA LOOP (mandatory, at least two passes)

1. Render a half-size preview, then make contact sheets every half beat: `ffmpeg -vf "fps=<BPM/30>,scale=320:-1,tile=6x8"`. Look at them.
2. Make a **cut sheet**: 3 frames per bar boundary (−6, 0, +6).
3. Check:
    - Is any cut frame blank or only background?
    - Does any text clip, overlap or crop?
    - Is anything unreadable at phone size?
    - Do two scenes look alike?
    - Does every script line appear?
4. Measure sync on the master by running a kick-offset check on the final MP4. Aim for 0–25ms after the picture's grid. AAC priming usually adds 30–50ms, so move `MUSIC_START_SEC` by whole frames until you're there.
5. Check loudness: about −14 LUFS, true peak under −1 dB. `alimiter` needs `level=false`.

## STEP 9: RENDER AND DELIVER

```bash
npx remotion render src/index.ts Launch out/launch.mp4 --codec h264 --pixel-format yuv420p --crf 16 --audio-bitrate 320k
ffmpeg -y -i out/launch.mp4 -af "loudnorm=I=-14:TP=-1.5:LRA=7,alimiter=limit=0.84:level=false" \
  -vf "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p" -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:v libx264 -preset slow -crf 17 -profile:v high -c:a aac -b:a 256k -ar 48000 -movflags +faststart out/launch-x.mp4
```

Report back with:
- the duration, loudness and measured sync
- the track and its licence
- the script, line by line
- the ideas covered
- a two-line post caption

---

## APPENDIX: the chatform.in example

**Music:** "Take This Higher" (Mixkit, free licence).
- 124 BPM, with the first drop at 11.616s.
- 8 build-up beats into the logo.

**Brand:**
- paper `#FBF8F1`, ink `#2A2521`, orange `#FD6F29`, violet `#9769DC`
- Bricolage Grotesque for display, Inter for the UI
- the mark is two speech-bubble halves that join

**Script (v7, about 82s):**

| Beats | Line and visual |
|------|------|
| Build-up | "This is a form." typed, then a 25-field page scrolls. "25 questions. One long page." slams. The tab closes. "So people leave." / "The ones who stay write:" *ok · idk · n/a · it was bad · fine* |
| Drop | chatform logo |
| | Your form, **as a conversation.** Then a chat, with the camera on each message |
| | Messy answers in. **Clean data out.** Then "too pricey for 12 of us" flies into a table |
| | Left halfway? **It follows up.** Then reminders at 4h, 1 day and 3 days. An email, "Continue from question 4", then COMPLETED |
| | Stuck on a question? **It answers from your docs.** |
| | Don't build forms. **Just ask.** Then a prompt, 6 questions streaming in, and "Add a question about their budget." |
| | 27 ways to answer. **One chat.** Then a 3D wall of 25 real question types, an accelerating tour, and a zoom-out |
| | Different answers. **Different paths.** Then Maya "just 8 of us" gets "What are you using today?", while Arjun "around 40" gets "Want a quick call with our team?" Then **One form. A different conversation for each person.** |
| | Then put it **anywhere.** Then a 3D carousel: link, QR, embed, API. Then **Every form is an API.** (Headless API, Webhooks, JS + React SDKs, OpenAPI) |
| | Recap wall, "One form builder. All of it.", then the end card: **Start free at chatform.in** |

Give the features the product is proudest of two bars instead of one (here: follow-ups, the AI builder and branching). A 42-second film is fine.
