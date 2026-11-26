import React from "react";
import { Composition } from "remotion";
import { Board } from "./Board";
export const Root: React.FC = () => (
  <Composition id="TitanBoard" component={Board} durationInFrames={30 * 22} fps={30} width={1280} height={720} />
);
