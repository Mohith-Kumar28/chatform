/** The authored copy on one template hub page: the gallery, a type, a category, a goal or a role. */
export interface HubCopy {
  /** The `<title>`, without the brand. */
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  faqs: { q: string; a: string }[];
}
