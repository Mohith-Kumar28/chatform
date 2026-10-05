import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { canonical, openGraphBase } from "@/lib/seo";

const TITLE = "Terms of service";
const DESCRIPTION =
  "The terms for using chatform: your account, your content, what is not allowed, paid plans, and what we are and are not responsible for.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/terms"),
  openGraph: { ...openGraphBase("/terms"), title: TITLE, description: DESCRIPTION },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      lede="The agreement between you and chatform when you use the product."
      updated="5 October 2026"
    >
      <p>
        By creating an account or using chatform, you agree to these terms and to the{" "}
        <Link href="/privacy">privacy policy</Link>. If you use chatform for a business, you agree on
        its behalf.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be an adult, and the details you give must be true.</li>
        <li>Keep your sign-in details and API keys secret. What happens under your account is your responsibility.</li>
        <li>You are responsible for the teammates you invite and what they do.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        Your forms, your files and the responses you collect are yours. You give us permission to store,
        process and display them only as needed to run chatform for you, which includes sending text to
        the AI models that draft and run your forms.
      </p>
      <p>
        You decide what your forms ask, so you are responsible for it. That means telling the people who
        answer what you collect and why, having a lawful reason to collect it, and handling their
        requests about their data. We process responses on your behalf.
      </p>

      <h2>What is not allowed</h2>
      <ul>
        <li>Breaking the law, or helping anyone else to.</li>
        <li>Phishing, or pretending to be a person or organization you are not.</li>
        <li>Asking for passwords, card numbers or bank login details in a form.</li>
        <li>Collecting health records that need HIPAA protection. chatform does not offer that.</li>
        <li>Sending spam, including through follow-up emails.</li>
        <li>Uploading malware, or content that is abusive, hateful or sexually exploits anyone.</li>
        <li>Attacking the service, getting around plan limits, or scraping it.</li>
        <li>Reselling chatform without our written agreement.</li>
      </ul>
      <p>We may remove a form or suspend an account that breaks these rules.</p>

      <h2>The AI</h2>
      <p>
        chatform uses AI to draft forms, ask questions and read answers. It can be wrong. Check a form
        before you publish it, and check anything important the AI tells you or your respondents.
      </p>

      <h2>Plans and payment</h2>
      <ul>
        <li>The free plan is free. Paid plans are billed in advance, monthly or yearly, through our payment provider.</li>
        <li>A paid plan renews until you cancel. When you cancel, it runs to the end of the period you paid for.</li>
        <li>Each plan has limits, listed on the <Link href="/pricing">pricing page</Link>. Plans described as unlimited have a fair-use ceiling, shown there.</li>
        <li>If we change a price, we tell you before your next renewal.</li>
      </ul>

      <h2>Payments your forms collect</h2>
      <p>
        When a form takes a payment, the payment is between you and your respondent, on your own account
        with your payment provider. chatform does not hold the money and takes no cut. Refunds, disputes
        and taxes on those payments are yours to handle.
      </p>

      <h2>Services you connect</h2>
      <p>
        You can connect chatform to other services, such as Google Sheets, payment providers, AI
        assistants and your own servers. Your use of each is under that service&rsquo;s own terms. We are
        not responsible for what they do with data you send them.
      </p>

      <h2>The API</h2>
      <p>
        You may use the API and SDKs to build on chatform within your plan&rsquo;s limits. We may limit or
        block use that harms the service for others.
      </p>

      <h2>Our product</h2>
      <p>
        chatform, its code, design and name belong to us. These terms give you the right to use the
        product, not to copy it. If you send us feedback, we may use it without owing you anything.
      </p>

      <h2>Ending things</h2>
      <p>
        You can delete your account at any time from the dashboard. We may suspend or close an account
        that breaks these terms or stays unpaid. What happens to your data afterwards is described in the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>No warranty</h2>
      <p>
        chatform is provided as it is. We work to keep it running and correct, but we do not promise it
        will be uninterrupted, error-free or fit for a particular purpose.
      </p>

      <h2>Limit of liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential losses, lost
        profits or lost data. Our total liability to you is limited to what you paid us in the twelve
        months before the claim.
      </p>

      <h2>Changes</h2>
      <p>
        When these terms change we update the date at the top. For a change that matters, we also email
        account holders. Continuing to use chatform after a change means you accept it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions go through the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
