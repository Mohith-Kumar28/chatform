import React from "react";
import { AbsoluteFill } from "remotion";
import { SoundTrack } from "./Audio";
import { Grain } from "./ui";
import { Intro, Logo, Chat, Extract, Answers } from "./scenes/A";
import { FollowUp, Describe, Website, Edit, Types } from "./scenes/B";
import { Logic, Verify, Share, Dropoff, Outro } from "./scenes/C";

// One bar per idea after the drop. Everything is framed on the centre; scenes
// stack in order and each paints its own background.
export const LaunchVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#FBF8F1" }}>
    <Intro />
    <Logo />
    <Chat />
    <Extract />
    <Answers />
    <FollowUp />
    <Describe />
    <Website />
    <Edit />
    <Types />
    <Logic />
    <Verify />
    <Share />
    <Dropoff />
    <Outro />
    <Grain opacity={0.035} />
    <SoundTrack />
  </AbsoluteFill>
);
