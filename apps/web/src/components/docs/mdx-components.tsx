import type { MDXComponents } from "mdx/types";
import defaultComponents from "fumadocs-ui/mdx";
import { Callout } from "fumadocs-ui/components/callout";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { ApiPage } from "@/components/docs/api-page";
import { CopyButton } from "@/components/ui/copy-button";
import { Kbd } from "@/components/ui/kbd";

/**
 * What MDX may use.
 *
 * Mostly Fumadocs' own, plus the product's primitives where a docs page should
 * look like the app rather than like a docs page — the copy button in
 * particular, because a reader copying a snippet should get the same affordance
 * they get everywhere else in the product.
 */
export const mdxComponents: MDXComponents = {
  ...defaultComponents,
  Callout,
  Step,
  Steps,
  Tab,
  Tabs,
  Accordion,
  Accordions,
  CopyButton,
  Kbd,
  /**
   * The generated reference pages render through this. They name the document
   * `chatform`, which resolves to the imported spec copy — no filesystem access,
   * and nothing machine-specific in the committed output.
   */
  OpenAPIPage: ApiPage,
  /** v10 called it APIPage, and the generated pages accept either. */
  APIPage: ApiPage,
};
