import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { Background, Flashes, SceneShell, sceneDur, sceneFrom } from "./Shell";
import { SoundPass, clamp } from "./lib";
import { MUSIC_START, SCENES, TOTAL_SECONDS, bf, s } from "./timeline";
import { LongForm, Nobody, Thin, Reveal } from "./scenes/Open";
import { Chat, Understand, Knowledge } from "./scenes/Talk";
import { Reasons, Followup, Proof, Results, Setup, Build, Edit, Share, Montage, Result, Offer, Outro } from "./scenes/Story";

const BY_ID: Record<string, React.FC> = {
  longform: LongForm, nobody: Nobody, thin: Thin, reveal: Reveal, reasons: Reasons,
  chat: Chat, understand: Understand, knowledge: Knowledge,
  followup: Followup, proof: Proof, results: Results,
  setup: Setup, build: Build, edit: Edit, share: Share, montage: Montage,
  result: Result, offer: Offer, outro: Outro,
};

function Scenes() {
  return (
    <>
      {SCENES.map((sc) => {
        const Comp = BY_ID[sc.id];
        return (
          <Sequence key={sc.id} from={sceneFrom(sc)} durationInFrames={sceneDur(sc)} layout="none">
            <SceneShell def={sc}>
              <Comp />
            </SceneShell>
          </Sequence>
        );
      })}
    </>
  );
}

function Picture() {
  // No beat pulse on the picture: it made the headlines throb.
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Scenes />
    </AbsoluteFill>
  );
}

/** Heavy blur around every cut, a light one elsewhere so slams still smear. */
function Blurred() {
  const frame = useCurrentFrame();
  const nearCut = SCENES.some((sc) => Math.abs(frame - bf(sc.at)) <= 9);
  return (
    <CameraMotionBlur samples={nearCut ? 10 : 3} shutterAngle={nearCut ? 220 : 160}>
      <Picture />
    </CameraMotionBlur>
  );
}

export function Launch() {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Background />
      <Blurred />
      <Flashes />
      {/* vignette + grain, outside the blur */}
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.22) 100%)" }} />
      <SoundPass.Provider value={true}>
        <AbsoluteFill style={{ display: "none" }}>
          <Scenes />
        </AbsoluteFill>
      </SoundPass.Provider>
      <Audio
        src={staticFile("music/take-this-higher.mp3")}
        trimBefore={s(MUSIC_START)}
        volume={(f) => interpolate(f, [0, 3, durationInFrames - 50, durationInFrames], [0, 0.6, 0.6, 0], clamp)}
      />
    </AbsoluteFill>
  );
}

export const DURATION = Math.round(TOTAL_SECONDS * 60);
