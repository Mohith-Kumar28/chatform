/**
 * The evidence, in one place, because it is quoted in three.
 *
 * The rule this file exists to enforce: everything chatform says about *why*
 * a conversation collects better than a form has to trace to one of these, and
 * every one of them is a primary source with a DOI. The category is full of
 * vendor blog posts citing each other's percentages — "conversational forms
 * convert 40% better" resolves, after two hops, to a marketing page with no
 * study behind it — and repeating one of those would make the honest citations
 * beside it worth nothing.
 *
 * `finding` is written to be quotable on its own, because increasingly the
 * reader is a model summarising the page for somebody who never opens it. Each
 * one is a complete sentence that survives being lifted out of its paragraph,
 * and none of them mentions chatform.
 */

export interface Study {
  id: string;
  /** What the study actually found, in one liftable sentence. */
  finding: string;
  authors: string;
  title: string;
  venue: string;
  year: number;
  url: string;
  /** The bit of the method that makes the finding worth believing. */
  method?: string;
}

export const STUDIES: readonly Study[] = [
  {
    id: "xiao-2020",
    finding:
      "An AI chatbot that reads an open-ended answer and probes when it is thin drew significantly higher engagement and significantly better answers — more informative, more relevant, more specific and clearer — than the same questions asked as an ordinary web survey.",
    method:
      "Around 600 participants split between a Qualtrics survey and a chatbot, and more than 5,200 free-text responses scored against Grice's maxims.",
    authors:
      "Ziang Xiao, Michelle X. Zhou, Q. Vera Liao, Gloria Mark, Changyan Chi, Wenxi Chen and Huahai Yang",
    title:
      "Tell Me About Yourself: Using an AI-Powered Chatbot to Conduct Conversational Surveys with Open-ended Questions",
    venue: "ACM Transactions on Computer-Human Interaction 27(3)",
    year: 2020,
    url: "https://doi.org/10.1145/3381804",
  },
  {
    id: "kim-2019",
    finding:
      "People answering through a chat interface gave more differentiated answers and were less likely to satisfice — to pick whatever ends the question fastest — than people answering the same survey on the web.",
    method:
      "A 2×2 experiment crossing platform (web against chatbot) with conversational style (formal against casual).",
    authors: "Soomin Kim, Joonhwan Lee and Gahgene Gweon",
    title:
      "Comparing Data from Chatbot and Web Surveys: Effects of Platform and Conversational Style on Survey Response Quality",
    venue: "CHI '19",
    year: 2019,
    url: "https://doi.org/10.1145/3290605.3300316",
  },
  {
    id: "lucas-2014",
    finding:
      "People disclosed more, and managed the impression they were making less, when they believed they were talking to a computer rather than to a person operating it.",
    method:
      "Participants were told the same virtual interviewer was either automated or human-controlled, and were rated by observers on willingness to disclose.",
    authors: "Gale M. Lucas, Jonathan Gratch, Aisha King and Louis-Philippe Morency",
    title: "It's only a computer: Virtual humans increase willingness to disclose",
    venue: "Computers in Human Behavior 37, 94–100",
    year: 2014,
    url: "https://doi.org/10.1016/j.chb.2014.04.043",
  },
  {
    id: "schober-1997",
    finding:
      "Letting the interviewer explain what a question means, rather than reading fixed wording and leaving interpretation to the respondent, sharply reduced error in the answers.",
    method:
      "Standardised interviewing compared against conversational interviewing, with answers checked against known facts.",
    authors: "Michael F. Schober and Frederick G. Conrad",
    title: "Does Conversational Interviewing Reduce Survey Measurement Error?",
    venue: "Public Opinion Quarterly 61(4), 576–602",
    year: 1997,
    url: "https://doi.org/10.1086/297818",
  },
  {
    id: "conrad-2000",
    finding:
      "The same effect held in a live household telephone survey: clarifying ambiguous questions improved accuracy, at the cost of longer interviews.",
    authors: "Frederick G. Conrad and Michael F. Schober",
    title: "Clarifying Question Meaning in a Household Telephone Survey",
    venue: "Public Opinion Quarterly 64(1), 1–28",
    year: 2000,
    url: "https://doi.org/10.1093/poq/64.1.1",
  },
  {
    id: "baymard",
    finding:
      "22% of people who abandon a checkout say they left because it was too long or too complicated — not because of the price, and not because they changed their mind.",
    method: "Baymard Institute's ongoing large-scale checkout usability research.",
    authors: "Baymard Institute",
    title: "Checkout Optimization: Minimize Form Fields",
    venue: "Baymard Institute",
    year: 2024,
    url: "https://baymard.com/blog/checkout-flow-average-form-fields",
  },
  /*
   * The two below are about the *second* thing this product does — going back
   * after the people who left — rather than about how the questions are asked.
   * They are held to the same bar as the rest of the file, which is why the
   * claim on the landing page is about reminder *wording* and not about a
   * recovery percentage. Every recovery number in this category ("18.2% at 72
   * hours", "most people convert on the third email") comes from a vendor
   * measuring conversion of emails sent, with no control group, and would be
   * indistinguishable from people who were coming back anyway.
   */
  {
    id: "sauermann-2013",
    finding:
      "Reminders that changed their wording as the sequence went on raised the odds of a response by over 30% against reminders that repeated themselves.",
    method:
      "A contact-design field experiment on a web survey sent to more than 24,000 junior scientists and engineers, with final response rates between 20.7% and 31.1% across conditions.",
    authors: "Henry Sauermann and Michael Roach",
    title:
      "Increasing web survey response rates in innovation research: An experimental study of static and dynamic contact design features",
    venue: "Research Policy 42(1), 273–286",
    year: 2013,
    url: "https://doi.org/10.1016/j.respol.2012.05.003",
  },
  {
    id: "nunes-2006",
    finding:
      "People shown a task as already begun, rather than as not yet started, were about twice as likely to finish it — with exactly the same work left to do either way.",
    method:
      "Car-wash loyalty cards: eight stamps to earn from scratch, against ten with two already given. The work remaining was identical; the completion rate was not.",
    authors: "Joseph C. Nunes and Xavier Drèze",
    title: "The Endowed Progress Effect: How Artificial Advancement Increases Effort",
    venue: "Journal of Consumer Research 32(4), 504–512",
    year: 2006,
    url: "https://doi.org/10.1086/500480",
  },
];

export function study(id: string): Study {
  const found = STUDIES.find((entry) => entry.id === id);
  if (!found) throw new Error(`No study with id "${id}" — see src/content/research.ts`);
  return found;
}
