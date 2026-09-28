import React from "react";
import { AbsoluteFill } from "remotion";
import { SoundTrack } from "./Audio";
import { Grain } from "./ui";
import { Logo, Chat, Extract, Answers } from "./scenes/A";
import { Edit } from "./scenes/B";
import { Logic, Share } from "./scenes/C";
import { FollowA, AskAI, Stream, BlocksA, BlocksB, Branch } from "./scenes/D";
import { Hook, Statement, FollowResume, Recap, End } from "./scenes/E";
import { Icon } from "./ui";
import { C } from "./brand";

// v6: the problem, then for every idea one full-frame statement followed by
// the product doing it, with the camera on the thing that is happening.
export const LaunchVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#FBF8F1" }}>
    <Hook />
    <Logo />
    <Statement scene="sChat" kind="type" a="Your form, as a conversation." accent="conversation." />
    <Chat />
    <Statement scene="sExtract" kind="slam2" a="Messy answers in." bText="Clean data out." />
    <Extract />
    <Statement scene="sFollow" kind="slam2" a="Left halfway?" bText="It follows up." bg="orange" />
    <FollowA />
    <FollowResume />
    <Statement scene="sKB" kind="marker" a="Stuck on a question?" bText="It answers from your docs." />
    <Answers />
    <Statement scene="sAI" kind="type" a="Don't build forms. Just ask." accent="Just ask." bg="violet" icon={<div style={{ width: 120, height: 120, borderRadius: 34, background: "#fff", display: "grid", placeItems: "center" }}><Icon name="sparkles" size={64} color={C.violet} fill={C.violet} stroke={1} /></div>} />
    <AskAI />
    <Stream />
    <Edit />
    <Statement scene="sBlocks" kind="stack" a="" words={["Payments.", "Signatures.", "Consent.", "Bookings."]} bg="night" />
    <BlocksA />
    <BlocksB />
    <Statement scene="sBranch" kind="split" a="Different answers." bText="Different paths." />
    <Branch />
    <Logic />
    <Statement scene="sShare" kind="type" a="Then put it anywhere." accent="anywhere." bg="night" />
    <Share />
    <Recap />
    <End />
    <Grain opacity={0.035} />
    <SoundTrack />
  </AbsoluteFill>
);
