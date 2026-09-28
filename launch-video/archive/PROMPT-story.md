# The launch-video prompt

Copy everything below the line into Claude Code (Opus) or any coding agent that can run a terminal. It makes a story-driven, beat-synced launch video of about 60 seconds in code with Remotion. It shows the problem, the product, three reasons it gets better results, how easy it is to set up, and the before/after result. The product UI is real, a camera brings each new moment to the centre, the cuts land on a real music track, and every recorded sound effect peaks on its cut. The output is an MP4 mastered for X.

It works in three situations, and the agent sorts out which one it is in:

1. **Inside a product repo.** It reads the codebase and the live site.
2. **With only a link.** Give it a website URL, a GitHub repo or a docs page.
3. **With nothing.** It asks you what the video is about and offers you choices.

---

## PROMPT

You are a senior motion designer and a senior React engineer working as one person. Make a launch video for a product in Remotion and render it to MP4. It has to hold someone scrolling X for 40 seconds, which means:

- **A story.** Problem, product, the reasons it gets better results, how easy it is, the result. Results before features.
- **Paced to be read.** A new visual idea every 1 or 2 beats, key scenes 2 bars long.
- **Complete.** Every important feature appears, inside the story.
- **Centred.** The viewer's eye never has to travel. Everything happens at the centre, and every transition goes through the centre.
- **Always moving.** No frame is ever still except the final hold.
- **On the music.** Cuts, hits and camera bumps land on the beat of a real track.
- **Never repeating itself.** No two scenes share a layout, a transition or a text animation.

Work through the phases in order. Do not write scene code before Phase 3 is done.

### Phase 0: Find out what the video is about

Work out what context you have before you ask anything.

1. **Look for a codebase.** Check the working directory for a git repo, a `package.json`, an `apps/` or `src/` folder, a README, a design doc, or CSS with colour tokens. If you find a product, it is your primary source. Look for its live URL in the README, `package.json` `homepage`, env files, SEO config, sitemap or OG tags.
2. **Look for a live site.** If you have a URL and a browser or fetch tool, open it. Read the page text, screenshot the hero and each feature section, and note how the site itself moves and decorates: gradients, hand-drawn annotations, colour-coded chips. **The landing page's feature sections are your scene list.**
3. **If you found neither, or it is ambiguous, ask.** Use your question tool with selectable options if you have one; otherwise ask a numbered question. Ask exactly this and wait:

   > What should the video be about? Pick one:
   > 1. **This codebase.** Use the repo I am in (only offer this if one exists).
   > 2. **A website.** Paste the URL and I will read it and match its look.
   > 3. **A codebase or GitHub link.** Paste it and I will clone or read it.
   > 4. **I will describe it.** Tell me the product in a few sentences, and add screenshots, a logo and brand colours if you have them.
   >
   > Optional: a reference video whose style you like, the platform, and a music track you own.

   Once you have the answer, fetch that context yourself. Do not ask the user to paste things you can read.
4. **Defaults, stated in one line and not asked:** 1920×1080, 60fps, 55 to 65 seconds, music and SFX, no voiceover.

### Phase 1: Brand and truth research (write it to brief.md)

- **Colours:** the exact hex values from CSS tokens, the Tailwind config or the logo SVG, plus any semantic palette (per-category colours make great chips).
- **Type:** the real font families and weights, loaded with `@remotion/google-fonts` or `@remotion/fonts`.
- **Logo:** the SVG source. If the mark has separate parts, they can fly in and collide.
- **Real copy:** the tagline, the CTA, and the real demo content (sample conversations, data, prompts). Reuse it word for word.
- **Features:** list every feature section of the landing page, 12 to 16 items. Each becomes one scene.
- **Facts:** give every number and claim a source (file path or URL). Nothing marked "coming soon" or listed as a limitation goes in. Invent no metrics, logos or testimonials.
- **House rules:** check CLAUDE.md, design docs and memory for banned words, banned punctuation (some teams ban em dashes) and positioning, and follow them in every string.

### Phase 2: Music first, then the edit is cut to it

The picture is cut to the music, never the reverse. Synthesised oscillator music sounds cheap. Use a real track:

1. **Pick the source:**
   - a track the user owns, or
   - a generated one (Suno, ElevenLabs), or
   - a free commercial-licence library such as Mixkit (`https://mixkit.co/free-stock-music/tag/edm/`; files at `https://assets.mixkit.co/music/<id>/<id>.mp3`).

   Aim for energetic EDM or house at 120 to 130 BPM. Download 10 to 16 candidates.
2. **Measure them.** Write `scripts/analyze-music.mjs`, a Node script that decodes with ffmpeg, builds an onset envelope (the rise in log energy, with the kick band weighted), finds the tempo by autocorrelation, and finds the phase. It prints BPM, the first-beat time, a steadiness score, and loudness per bar with the jumps marked as drops. Pick a track with a steady grid and a clear shape: build, drop, a one-bar break, a harder drop, a breakdown.
3. **Check for drift.** Measure the median offset of kick peaks from the grid every 32 beats. If it drifts, the BPM is wrong (try one decimal either side). A constant offset just moves the first-beat time.
4. **Choose the window.** Pick the stretch of the track the film uses:
   - the build under the hook
   - the first drop on the logo or product reveal
   - the break under a counter or tension moment
   - the second drop on the next feature run
   - the breakdown under the end card

   Store BPM, `MUSIC_START`, the beats, the scenes and the total in `timeline.ts`, all in **beats**.

### Phase 3: The story, then the storyboard (write both to storyboard.md)

**Sell the result, not the feature list.** A string of features with no story loses people, however well each one animates. Write the script first, in five acts, and make every scene answer "what does the viewer get?":

1. **The problem** (the build): the viewer's pain, shown and not told. Example: "Ever filled out a long Google Form?" over an endless form, a pull-back to the whole wall, "Nobody finishes them.", then the thin, half-empty spreadsheet they actually get back.
2. **Meet the product** (first drop): the logo, and the promise in one line (the site's tagline).
3. **Why you get better results: "Three reasons..."** Take the reasons from how the landing page argues its case (its pillars). Show them as a card of three, then one chapter each, with a chapter marker ("1 of 3 · Better questions") on every scene of that chapter. Each chapter shows the outcome happening. For example, someone who left comes back and their card turns to "Completed".
4. **How little it takes** (a calmer part of the track): "Setting it up? One sentence." Then the workflow in order: describe it, get it, change it by asking, put it anywhere. After that, one quick burst for everything else the product has.
5. **The result and the offer:** a before/after of the output (the thin sheet next to the complete one), the offer slammed one line per beat, and the end card.

Write the voice-over-style script (one headline per scene) and read it top to bottom on its own. It should sell the product without any pictures. Only then storyboard it in beats.

### Phase 3b: Storyboard in beats

This is the shape used for a 64-second film at 124 BPM (1 bar is about 1.94s), with the track's structure mapped onto the acts:

| Beats | Act | Scenes |
|---|---|---|
| 0 to 16 (the build) | Problem | the long form scrolling (2 bars), the pull-back to the whole wall with "Nobody finishes them." (1 bar), the thin spreadsheet (1 bar) |
| 16 (first drop) | Product | logo collision and tagline (1 bar), "Three reasons you get better answers" card (2 bars) |
| 20 to 56 | Reason 1 | the hero UI (3 bars), then 2 supporting scenes of 2 bars each; land a key moment on the second drop |
| 56 to 80 | Reasons 2 and 3 | 2 bars each: the outcome shown happening |
| 80 to 100 (breakdown) | How easy | "Setting it up? One sentence." (1 bar), describe it (2 bars), change it by asking (2 bars) |
| 100 (last drop) | How easy | put it anywhere (2 bars), everything else in one burst (1 bar) |
| 112 to 132 | Result, offer, end | before/after (2 bars), the offer (1 bar), end card (2 bars) |

Rules:

- Every scene answers "what do I get" in **one headline of 3 to 7 words** and **one piece of moving UI**. No paragraphs.
- Each scene has 2 or 3 internal events on beats or half-beats: typing, a pop, a chip flying, a line drawing. A scene that only fades in and waits is a failure.
- List every scene's layout, enter transition, exit transition and text animation in a table, and check that no two neighbours match.

### Phase 4: Set up the project

Create it as its own folder. In a repo, make `launch-video/` at the root and gitignore it.

```bash
npm i remotion @remotion/cli @remotion/google-fonts @remotion/motion-blur @remotion/sfx react react-dom
npm i -D typescript @types/react   # tsconfig: "resolveJsonModule": true
```

Pin all `@remotion/*` packages to one exact version. Files:

- `timeline.ts`: FPS, BPM, BEAT, `MUSIC_START`, and a `SCENES` array of `{ id, at, len, enter, exit, bg, pulse, flash }`, all counted in beats.
- `theme.ts`: brand colours and fonts.
- `lib.tsx`: springs, easings, `useB()` (beats since the scene's beat), `<Sfx>`, `<Typing>`, text animation components, and `<Stage scale>`.
- `ui.tsx`: product UI rebuilt from the real components.
- `Shell.tsx`: transitions, backgrounds, beat pulse, flashes.
- `scenes/*.tsx`
- `Launch.tsx`

### Phase 5: The motion system

**A camera follows the action.** Build each scene as a world (absolute coordinates, bigger than the frame), wrapped in a `<Cam keys={[[beat, x, y, zoom], ...]}>` that eases (bezier 0.65,0,0.35,1 over about 0.9 beats) so the element that just changed is at the frame centre. Examples:
- zoom onto each chat message as it arrives
- move down to the input while someone types
- walk row by row
- follow a dot along a path
- pull back to show the whole screen when the point is made

Dim what the camera has moved past. The viewer's focus sits in one place while dozens of things move around it.

**Composition is centre-locked.** Build every scene around the frame centre (960, 540): the headline top centre at y about 80, the product UI filling the middle 60 to 75% of the frame height. Scale UI up (1.2 to 1.4×) until the smallest UI text is at least 24px at 1080p. **Never split the frame into text on the left and UI on the right.** Every transition moves through the centre, so the eye stays locked on one point.

**Transitions straddle the beat.** Each scene's `Sequence` starts 7 frames before its beat and ends 7 frames after its last. The outgoing scene leaves over the last 7 frames. The incoming one lands in the first 8 to 10. Keep a library of about 10 and rotate them:

- **zoom:** out scales `1 + 5p²` and blurs; in scales up from 0.25.
- **punch:** in from 1.6× with heavy blur; use it on drops.
- **whip L/R/up/down:** ±1900px with skew.
- **spin:** ±80° with scale.
- **flip:** `perspective(1600px) rotateY(90deg)`.
- **iris:** a circle clip from the centre.
- **glitch:** jitter plus RGB-split drop-shadows.
- **implode:** everything is sucked into the centre and scales to 0 just before a drop.

**Backgrounds change every bar,** each opening as a `clip-path: circle()` from the centre 3 frames before the beat. Cycle cream, brand gradient, near-black, accent colour. Put a slowly drifting dot grid over them so no frame is ever flat. **Keep the background outside the motion blur,** or the circle wipes band into rings.

**Hit the drops, don't pulse the text.** A white flash (0.8, about 12 frames) on each drop, and scene cuts on beats, carry the rhythm. Do not scale the whole picture on every beat: it makes headlines throb, which looks broken.

**Motion blur:** wrap the scene layer in `CameraMotionBlur` with 10 samples at a 220° shutter within ±9 frames of a cut, and 3 samples elsewhere so slams still smear. It replays children through `Freeze`, so **audio inside it plays several times over**. Render the scenes a second time inside a hidden `display:none` layer with a `SoundPass` context set to true, and have `<Sfx>` return null unless that context is set.

**Springs:** `snappy {damping:16, stiffness:260, mass:0.6}`, `pop {10, 240, 0.6}` (it overshoots, for chips and icons), `smooth {24, 150, 0.9}`. Easing: `bezier(0.16,1,0.3,1)` out, `bezier(0.7,0,0.84,0)` in for exits.

**Text: a different animation per scene, and never a masked "crop" reveal** (sliding words out of an overflow-hidden box looks cheap). Rotate these:

- **Slam:** scale from 2.6 to 1, blur from 24 to 0.
- **Rise:** each letter springs up with a tilt and overshoot.
- **Pop:** words scale from 0 with an alternating tilt.
- **Track:** letter-spacing collapses from 0.5em while the text sharpens.
- **Marker:** a coloured bar swipes behind, then the text lifts in.
- **Typewriter:** with a caret.

Accent one word in the brand colour.

**Scene devices that work:**

- UI that types and sends in real time.
- Chips that arc out of a sentence into a data panel.
- A hand of cards fanning out from a prompt box.
- A scan line checking pages.
- A row inserting and pushing the others down.
- A flow graph with a red "dead end" that gets fixed.
- A number counting up while pills burst radially, then imploding.
- Envelopes flying off a timeline.
- A card splitting into transcript and fields.
- One tile flipping through four uses on four beats.
- Feature chips bursting into a ring around the logo.
- A terminal typing a real API call.
- An echo trail behind slammed words.

### Phase 6: Sound design with real recordings

- **Library:**
  - Mixkit free SFX (`https://mixkit.co/free-sound-effects/whoosh/`, `/transition/`, `/impact/`, `/pop/`, `/click/`, `/typing/`, `/interface/`; files at `https://assets.mixkit.co/active_storage/sfx/<id>/<id>-preview.mp3`)
  - Remotion's `@remotion/sfx`: whoosh, whip, switch, mouse-click, shutter, ding
  - ElevenLabs SFX if available

  Download about 40: whooshes of several lengths, sweeps, impacts, pops, clicks, dings, a typing recording and a bass pulse.
- **Measure every file.** Write `scripts/sfx-manifest.mjs`, which writes each file's onset, peak and end time to `sfx-manifest.json`. Use `<Sfx name at={beat} align="peak">` for whooshes and impacts, so the **loudest moment lands on the cut**. Use `align="onset"` for clicks, pops and keys. Unaligned SFX land 100 to 300ms late and feel out of sync.
- **Typing:** play a slice of the real typing recording (`trimBefore` into it) for exactly as long as the text types.
- **One sound per visible event:**
  - every transition: a whoosh, whip or vacuum peaking on the beat
  - a pop per chip or card
  - a click per send
  - a switch per tile flip
  - a tick per counter step
  - a shutter for the QR code
  - a ding for a success
  - an impact on each drop and on the logo
- **Levels:** music about 0.85 before mastering, SFX 0.4 to 0.9. The master pass sets loudness.

### Phase 7: Review like an editor (do not skip)

1. Render a **half-size preview** once: `npx remotion render <bundle> Launch out/preview.mp4 --scale=0.5`. Parallel `remotion still` calls collide, so don't use them.
2. Make contact sheets **every half beat** with `ffmpeg -vf "fps=<BPM/30>,scale=320:-1,tile=6x8"`, then read them. Check:
   - a new thing every sheet cell
   - UI big enough to read on a phone
   - nothing clipped at the frame edge
   - no empty cells
   - no two neighbouring scenes that look alike
   - every landing-page feature present
3. Pull **full-resolution frames at every cut**: 6 frames before, on the beat, and 6 after. Look for ghosting, backgrounds opening behind content that is still visible, and text clipped mid-reveal.
4. Check the facts and house rules again.
5. Fix, re-render, look again. Count the features shown and say the number in your report.

### Phase 8: Render, master and verify sync

```bash
npx remotion render src/index.ts Launch out/launch.mp4 --codec h264 --pixel-format yuv420p --crf 16 --audio-bitrate 320k
ffmpeg -y -i out/launch.mp4 \
  -af "loudnorm=I=-14:TP=-1.5:LRA=7,alimiter=limit=0.84:level=false" \
  -vf "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p" \
  -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:v libx264 -preset slow -crf 17 -profile:v high -c:a aac -b:a 256k -ar 48000 \
  -movflags +faststart out/launch-x.mp4
```

Then **measure sync on the master**. Run the drift check on `launch-x.mp4` at the track's BPM with first beat 0. The kick peaks should sit 0 to 25ms after the picture's grid. AAC priming and the frame rounding of `trimBefore` usually push the music 30 to 60ms late, so move `MUSIC_START` by whole frames until it does. Loudness should be about -14 LUFS with the peak under -1 dB. `alimiter` must have `level=false`, otherwise it pushes the peak back to 0 dB.

### Deliverables

- `out/launch-x.mp4` (the upload) and the source, which re-renders with one command
- `brief.md` and `storyboard.md`
- a short report: the feature count, the scene list with beats, the music's source and licence, the claims shown with their sources, and anything left out and why

### Things that make these videos look cheap (avoid all of them)

- Text on one side and UI on the other; small UI floating in empty space
- A scene where nothing happens for a whole beat
- Masked "crop" text reveals; the same text animation twice
- Synthesised music; music not cut to its own structure; whooshes that peak after the cut
- Crossfades; exits still visible when the next scene lands; background wipes opening behind old content
- A feature list with no story; features instead of results
- Too fast to read: give a key feature 2 bars, and keep any line on screen long enough to read twice
- Headlines that throb on the beat; a logo wordmark revealed by a width mask (it crops)
- Invented UI, labels, metrics or testimonials
- Shipping without contact sheets and a sync measurement

Now start with Phase 0.
