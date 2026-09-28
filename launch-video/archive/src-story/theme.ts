import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Straight from apps/web/src/app/globals.css and the live site.
export const C = {
  cream: "#FBF8F1",
  sand: "#F3EFE6",
  border: "#E6E0D4",
  ink: "#2A2521",
  inkSoft: "#6F675E",
  night: "#1B1714", // dark sections
  card: "#211C19", // chat window
  bubble: "#2E2824",
  bubbleLine: "#3A332E",
  orange: "#FD6F29",
  orangeSoft: "#FFE6D6",
  violet: "#9769DC",
  violetLight: "#B393EC",
  pink: "#E48DBE",
  white: "#FFFFFF",
  // Question-type families: colour says what a question collects.
  content: "#E77AA6",
  text: "#5B8FE6",
  contact: "#2CA6B0",
  number: "#E0A92E",
  choice: "#4CB86A",
  scale: "#9A6BE0",
  file: "#E9785F",
};

export const { fontFamily: DISPLAY } = loadBricolage("normal", { weights: ["500", "700", "800"], subsets: ["latin"] });
export const { fontFamily: SANS } = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
export const { fontFamily: HAND } = loadCaveat("normal", { weights: ["600", "700"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "600"], subsets: ["latin"] });

// The hero gradient: orange bleeding through pink into violet.
export const heroGradient = (drift: number) => `
  radial-gradient(60% 80% at ${12 + drift * 6}% ${30 + drift * 4}%, #FF8A3D 0%, rgba(255,138,61,0) 70%),
  radial-gradient(55% 70% at ${55 - drift * 5}% ${45 + drift * 6}%, #EE8FA0 0%, rgba(238,143,160,0) 70%),
  radial-gradient(60% 90% at ${92 - drift * 4}% ${25 - drift * 3}%, #A57BE6 0%, rgba(165,123,230,0) 70%),
  linear-gradient(115deg, #F7843F 0%, #E98E9C 50%, #A983E4 100%)`;
