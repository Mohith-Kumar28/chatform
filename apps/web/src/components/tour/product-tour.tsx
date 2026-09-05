"use client";

import { useEffect } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Guided product tour (driver.js).
 * Auto-runs once per surface; replayable via the help button.
 */

const KEY = "chatform_tour_v1";
const done = (surface: string) => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}")[surface] === true;
  } catch {
    return false;
  }
};
const markDone = (surface: string) => {
  try {
    const state = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    state[surface] = true;
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
};

const base: Parameters<typeof driver>[0] = {
  showProgress: true,
  progressText: "{{current}} / {{total}}",
  nextBtnText: "Next →",
  prevBtnText: "← Back",
  doneBtnText: "Got it",
  popoverClass: "chatform-tour",
};

let instance: Driver | null = null;

export function startTour(surface: "dashboard" | "builder", onFinish?: () => void) {
  instance?.destroy();

  const dashboardSteps = [
    { element: "[data-tour='nav']", popover: { title: "Welcome to chatform 👋", description: "This bar is home base: Forms, Templates, API keys, Usage and your Team live here." } },
    { element: "[data-tour='new-form']", popover: { title: "Create forms", description: "One screen, three ways in: describe what you need and let AI draft the whole form, start from a template, or open a blank page." } },
    { element: "[data-tour='form-grid']", popover: { title: "Your forms", description: "Every form is a conversational interview. Edit, preview, or check results right from these cards." } },
    { element: "[data-tour='help-tour']", popover: { title: "Take the tour anytime", description: "Stuck? Click the ? button to replay this tour. Enjoy building!" } },
  ];

  const builderSteps = [
    { element: "[data-tour='builder-tabs']", popover: { title: "The builder", description: "Everything lives under these tabs: Build questions, wire the Workflow, style the Design, connect Integrate, tweak Settings, Share, and watch Results." } },
    { element: "[data-tour='builder-blocks']", popover: { title: "Blocks list", description: "Your questions in order. Drag to reorder, click to edit. The first block is where every respondent starts." } },
    { element: "[data-tour='builder-add']", popover: { title: "Add any question type", description: "Text, email, ratings, NPS, multiple choice, file uploads, payments and more — one click to add." } },
    { element: "[data-tour='builder-ask']", popover: { title: "Build with AI", description: "Describe extra questions in plain language and AI appends them to your form." } },
    { element: "[data-tour='builder-preview']", popover: { title: "Live preview", description: "This is your real form running on the working draft. It's a real conversation — ask it questions, it answers and keeps context." } },
    { element: "[data-tour='builder-workflow-tab']", popover: { title: "Workflow canvas", description: "The Workflow tab is an n8n-style canvas: drag nodes from the library, wire connections, and drop If / Else nodes for conditional branches. Click any wire to edit its rule." } },
    { element: "[data-tour='builder-publish']", popover: { title: "Publish & share", description: "Happy with it? Publish to get a shareable link. You can keep editing and republish anytime." } },
  ];

  const steps = surface === "dashboard" ? dashboardSteps : builderSteps;
  instance = driver({
    ...base,
    steps: steps as never,
    onDestroyed: () => {
      markDone(surface);
      onFinish?.();
    },
  });
  instance.drive();
}

/** Auto-run helper: fires the tour once per browser (per surface). */
export function useAutoTour(surface: "dashboard" | "builder", ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    if (done(surface)) return;
    const t = setTimeout(() => startTour(surface), 700);
    return () => clearTimeout(t);
  }, [surface, ready]);
}
