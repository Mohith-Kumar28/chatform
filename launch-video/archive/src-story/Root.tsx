import React from "react";
import { Composition } from "remotion";
import { Launch, DURATION } from "./Launch";
import { FPS, HEIGHT, WIDTH } from "./timeline";

export const RemotionRoot = () => (
  <Composition id="Launch" component={Launch} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
);
