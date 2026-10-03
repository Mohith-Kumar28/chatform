import type { SettingSection } from "@repo/form-schema";

/**
 * Builder requests labelled with the settings sections each one needs.
 *
 * Written the way authors type into the AI bar: short, lower case, often two
 * asks in one, sometimes a question. An empty `sections` is a request about
 * the questions alone.
 */
export const ROUTE_CASES: {
  request: string;
  sections: SettingSection[];
  howTo?: boolean;
  knowledge?: boolean;
  previous?: string;
}[] = [
  // questions only
  { request: "add a phone number question after email", sections: [] },
  { request: "make the company question optional", sections: [] },
  { request: "remove the budget question", sections: [] },
  { request: "if they pick enterprise, ask about team size", sections: [] },
  { request: "add options for small, medium and large", sections: [] },
  { request: "reorder so name comes first", sections: [] },
  { request: "add a rating question about our support", sections: [] },
  { request: "send people who say no to a different ending", sections: [] },

  // design
  { request: "make it navy blue", sections: ["design"] },
  { request: "change the colours to match our brand, #0F766E", sections: ["design"] },
  { request: "use a serif font for headings", sections: ["design"] },
  { request: "make the corners square", sections: ["design"] },
  { request: "turn off the background pattern", sections: ["design"] },
  { request: "dark theme please", sections: ["design"] },
  { request: "the button text is hard to read", sections: ["design"] },

  // display
  { request: "hide the progress bar", sections: ["display"] },
  { request: "remove the powered by chatform badge", sections: ["display"] },
  { request: "show steps instead of a percentage", sections: ["display"] },

  // agent
  { request: "sound more professional", sections: ["agent_persona"] },
  { request: "call the interviewer Maya", sections: ["agent_persona"] },
  { request: "ask the questions exactly as written, don't reword them", sections: ["agent_persona"] },
  { request: "make it more playful and fun", sections: ["agent_persona"] },
  { request: "the goal is to qualify leads for a sales call", sections: ["agent_goal"] },
  { request: "a good response tells us their budget and timeline", sections: ["agent_goal"] },
  { request: "never talk about pricing or competitors", sections: ["guardrails"] },
  { request: "don't answer questions that aren't about the event", sections: ["guardrails"] },

  // access and closing
  { request: "make people sign in with google first", sections: ["access"] },
  { request: "only one response per person", sections: ["access"] },
  { request: "turn off captcha", sections: ["access"] },
  { request: "close it on october 30", sections: ["closing"] },
  { request: "stop accepting after 200 responses", sections: ["closing"] },
  { request: "show how many spots are left", sections: ["closing"] },
  { request: "change the message people see when it's closed", sections: ["closing"] },

  // completion and sharing
  { request: "email me at sam@acme.com when someone responds", sections: ["completion"] },
  { request: "reply to the notification should go to ops@acme.com", sections: ["completion"] },
  { request: "don't send the confirmation email", sections: ["completion"] },
  { request: "don't include their answers in the receipt", sections: ["completion"] },
  { request: "change the link preview title for whatsapp", sections: ["sharing"] },
  { request: "hide it from google search", sections: ["sharing"] },

  // embed and form
  { request: "make the embed a popup in the bottom left", sections: ["embed"] },
  { request: "open the form when they're about to leave the page", sections: ["embed"] },
  { request: "rename the form to Summer Camp Signup", sections: ["form"] },
  { request: "make the whole form in hindi", sections: ["form"] },

  // mixed
  { request: "add an email question and make the form green", sections: ["design"] },
  { request: "friendlier tone and close it after 100 responses", sections: ["agent_persona", "closing"] },
  { request: "require sign in and notify ops@acme.com of each response", sections: ["access", "completion"] },
  { request: "make it look like our site: dark background, orange buttons, rounded corners", sections: ["design"] },

  { request: "use Lora for the headings and make it more professional", sections: ["design", "agent_persona"] },
  { request: "hide the progress bar, sound friendlier and email me at ana@acme.com for each response", sections: ["display", "agent_persona", "completion"] },
  { request: "add a rating question and never discuss competitors", sections: ["guardrails"] },

  // how-to
  { request: "where do I upload my logo?", sections: ["design"], howTo: true },
  { request: "how do I see the responses?", sections: [], howTo: true },
  { request: "how can I put this on my website?", sections: ["embed"], howTo: true },
  { request: "can I change the font?", sections: ["design"], howTo: true },
  { request: "where's the setting for the closing date", sections: ["closing"], howTo: true },
  { request: "how do I add a knowledge base", sections: [], howTo: true, knowledge: true },

  // knowledge
  { request: "add acme.com/faq to the knowledge base", sections: [], knowledge: true },
  { request: "the agent should know our refund policy: 30 days, no questions asked", sections: [], knowledge: true },
  { request: "read our pricing page so it can answer questions about plans", sections: [], knowledge: true },
  { request: "copy the questions from this google form https://forms.gle/abc", sections: [] },

  // short follow-ups
  { request: "yes do that", sections: ["design"], previous: "I can make the page dark and keep your orange buttons. Want that?" },
  { request: "go ahead", sections: ["closing"], previous: "Should I close the form after 200 responses?" },
];
