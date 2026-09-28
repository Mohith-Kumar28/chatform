import React from "react";
import { Composition } from "remotion";
import { LaunchVideo } from "./Video";
import { FPS, TOTAL } from "./beat";

export const RemotionRoot = () => <Composition id="Launch" component={LaunchVideo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />;
