import React from "react";
import { AbsoluteFill } from "remotion";
import { SoundTrack } from "./Audio";
import { Grain } from "./ui";
import { Intro, Logo, Chat, Extract, Answers } from "./scenes/A";
import { Edit, Types } from "./scenes/B";
import { Logic, Verify, Share, Dropoff, Outro } from "./scenes/C";
import { FollowA, FollowB, AskAI, Stream, BlocksA, BlocksB, Branch } from "./scenes/D";

// v4: one bar per idea after the drop (two bars for follow-ups, AI and
// branching). Everything is framed on the centre; scenes stack in order.
export const LaunchVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#FBF8F1" }}>
    <Intro />
    <Logo />
    <Chat />
    <Extract />
    <Answers />
    <FollowA />
    <FollowB />
    <AskAI />
    <Stream />
    <Types />
    <BlocksA />
    <BlocksB />
    <Branch />
    <Edit />
    <Logic />
    <Verify />
    <Share />
    <Dropoff />
    <Outro />
    <Grain opacity={0.035} />
    <SoundTrack />
  </AbsoluteFill>
);
