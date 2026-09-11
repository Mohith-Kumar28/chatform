"use client";

// TEMPORARY visual harness for the form-card thumbnail seam. Delete when done.
import { FormCard, type FormRow } from "@/components/forms/form-card";

const base = {
  responses: 1,
  partials: 37,
  updatedAt: Date.now() - 4 * 3600_000,
  questionCount: 9,
  preview: ["What is your Team Name?", "Which college?"],
};

const rows: FormRow[] = [
  {
    ...base,
    id: "1",
    slug: "campus-catalyst-2026",
    title: "Campus Catalyst 2026 - Internal SIH Hackathon",
    status: "published",
    theme: {
      background: "#f3efff",
      botBubble: "#ffffff",
      userBubble: "#c9b6f7",
      userBubbleText: "#241a3a",
      accent: "#7c5cf0",
      logoUrl: null,
    },
  },
  {
    ...base,
    id: "2",
    slug: "memorie-waitlist",
    title: "Memorie VIP Waitlist & Beta Access",
    status: "published",
    hasUnpublishedChanges: true,
    questionCount: 15,
    theme: {
      background: "#faf6f0",
      botBubble: "#ffffff",
      userBubble: "#f08a3c",
      userBubbleText: "#ffffff",
      accent: "#f08a3c",
      logoUrl: null,
    },
  },
  {
    ...base,
    id: "3",
    slug: "membership-application",
    title: "Membership application",
    status: "draft",
    questionCount: 16,
    theme: {
      background: "#eef7f0",
      botBubble: "#ffffff",
      userBubble: "#a8e0bb",
      userBubbleText: "#12331f",
      accent: "#2e9e5b",
      logoUrl: null,
    },
  },
  {
    ...base,
    id: "4",
    slug: "dark-themed-form",
    title: "Dark themed form",
    status: "published",
    questionCount: 7,
    theme: {
      background: "#1b2333",
      botBubble: "#2b3purple".replace("purple", "649"),
      userBubble: "#5b8cff",
      userBubbleText: "#0b1020",
      accent: "#5b8cff",
      logoUrl: null,
    },
  },
  { ...base, id: "5", slug: "appointment-booking", title: "Appointment booking (brand band)", status: "draft", questionCount: 15, theme: null },
];

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((f) => (
          <FormCard
            key={f.id}
            form={f}
            onDelete={() => {}}
            onSelectedChange={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
