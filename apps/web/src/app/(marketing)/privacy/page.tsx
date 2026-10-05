import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { canonical, openGraphBase } from "@/lib/seo";

const TITLE = "Privacy policy";
const DESCRIPTION =
  "What chatform collects from people who build forms and people who answer them, what it is used for, who else handles it, and how to have it removed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/privacy"),
  openGraph: { ...openGraphBase("/privacy"), title: TITLE, description: DESCRIPTION },
};

/**
 * Every statement here describes something the code does. When the product changes what it
 * collects, who it sends it to or how long it keeps it, this page changes in the same commit.
 *
 * The "Information from Google" section is what Google's OAuth review reads. It has to name
 * each permission requested, say what it is used for, and carry the Limited Use sentence.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      lede="What we collect, why, who else handles it, and how to have it removed."
      updated="5 October 2026"
    >
      <p>
        chatform is a form builder at chatform.in. This policy covers two groups of people: those who
        create an account to build forms, and those who answer a form somebody else built.
      </p>

      <h2>If you answered a form</h2>
      <p>
        The person or business that built the form decides what it asks and what happens to your
        answers. We store and process those answers for them. To see, correct or delete what you
        submitted, ask the form&rsquo;s owner first. If you cannot reach them,{" "}
        <Link href="/contact">contact us</Link> and we will pass the request on.
      </p>

      <h2>What we collect</h2>
      <h3>From people with an account</h3>
      <ul>
        <li>Your name, email address and, if you set one, a password. We store the password as a hash, never as text.</li>
        <li>If you sign in with Google: your name, email address and profile picture.</li>
        <li>Your organization, its workspaces and the teammates you invite.</li>
        <li>What you make: forms, themes, images, and any files you add to a form&rsquo;s knowledge base.</li>
        <li>Your plan and billing status. Card details go to our payment provider and never reach our servers.</li>
      </ul>

      <h3>From people answering a form</h3>
      <ul>
        <li>The answers, any files uploaded, and the conversation the form had with you.</li>
        <li>When the response started and finished.</li>
        <li>The page the form was opened on, the page that linked to it, and any campaign tags in the link.</li>
        <li>Your country and your browser and device type.</li>
        <li>
          A device signal computed in your browser. It is used to hand a half-finished response back to
          you and to notice the same device answering twice. It is scrambled differently for every form.
        </li>
        <li>
          If the form asks you to sign in: your Google name, email address and picture, or the phone
          number or email address you verified.
        </li>
        <li>
          If the form takes a payment: the amount, its status and the payment reference. The payment
          itself happens on the form owner&rsquo;s own Stripe, Razorpay or Cashfree account. We never see
          card or bank details.
        </li>
      </ul>

      <h3>From everyone</h3>
      <ul>
        <li>
          Requests reach us with an IP address. We use it for short-lived rate limiting and to work out a
          country, and some records keep a hashed form of it.
        </li>
        <li>Page views on our own website, counted by us.</li>
        <li>
          On our website and dashboard we also load Google Tag Manager, the Google Ads tag and Microsoft
          Clarity, which records how pages are used. None of these load on the forms people answer.
        </li>
      </ul>

      <h2>What we use it for</h2>
      <ul>
        <li>Running the product: showing forms, storing responses, and showing results to the form&rsquo;s owner.</li>
        <li>Having the AI draft forms, ask questions and read answers.</li>
        <li>Sending email: sign-in codes, notifications, receipts, and the follow-ups a form owner sets up.</li>
        <li>Billing, enforcing plan limits and stopping abuse.</li>
        <li>Working out what to fix and what to build next.</li>
      </ul>
      <p>
        We do not sell personal data. We do not use your forms or your responses to train AI models.
      </p>

      <h2>How the AI handles your data</h2>
      <p>
        When a form is drafted or answered, the relevant text (the questions, the answers so far, and
        passages from the form&rsquo;s knowledge base) is sent to an AI model to produce the next reply.
        Requests go through OpenRouter to Google&rsquo;s Gemini models. Knowledge base files are indexed
        with Cloudflare&rsquo;s AI services. A record of each AI request is kept in Langfuse so we can
        watch cost and quality.
      </p>

      <h2>Information from Google</h2>
      <p>We ask Google for information in three situations, and only when you start them.</p>
      <ul>
        <li>
          <strong>Signing in to chatform with Google.</strong> We receive your name, email address and
          profile picture, and use them to create and show your account.
        </li>
        <li>
          <strong>Signing in to answer a form with Google.</strong> When a form requires it, we receive
          the same three things and show them to the form&rsquo;s owner beside your response.
        </li>
        <li>
          <strong>Connecting Google Sheets.</strong> When you press Connect Google Sheets on a form, we
          ask for permission to see, edit, create and delete only the specific Google Drive files you
          use with chatform. We use it to create one spreadsheet for that form and to write the
          form&rsquo;s responses into it. We cannot see any other file in your Drive.
        </li>
      </ul>
      <p>For the Google Sheets connection in particular:</p>
      <ul>
        <li>We store an access token, encrypted, so we can keep the sheet up to date. We store nothing from your Drive.</li>
        <li>We read only the header row and the first column of the sheet we created, to find where each response belongs.</li>
        <li>We do not use this access for advertising, and we do not use it to train AI models.</li>
        <li>We do not share it with anyone, except Google itself when writing to your sheet.</li>
        <li>
          Nobody at chatform reads your sheet, unless you ask us to for support, or it is needed for
          security or to comply with the law.
        </li>
        <li>
          To remove access, press Disconnect on the form, or remove chatform at{" "}
          <a href="https://myaccount.google.com/permissions" rel="noreferrer" target="_blank">
            myaccount.google.com/permissions
          </a>
          . The sheet stays in your Drive.
        </li>
      </ul>
      <p>
        chatform&rsquo;s use and transfer to any other app of information received from Google APIs will
        adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Who else handles it</h2>
      <p>These companies process data for us so the product can work:</p>
      <ul>
        <li><strong>Cloudflare:</strong> hosting, databases, file storage, email delivery and AI indexing.</li>
        <li><strong>OpenRouter and Google:</strong> the AI models.</li>
        <li><strong>Langfuse:</strong> records of AI requests.</li>
        <li><strong>Resend:</strong> email delivery.</li>
        <li><strong>Google Firebase:</strong> sending and checking the SMS code when a form verifies a phone number.</li>
        <li><strong>Dodo Payments:</strong> payment for chatform plans.</li>
        <li><strong>Google and Microsoft:</strong> Tag Manager, the Ads tag and Clarity on our website and dashboard.</li>
      </ul>
      <p>
        A form owner can also send responses elsewhere: to Google Sheets, to their own server through
        webhooks, to an AI assistant they connect, or to their own payment provider. Those are their
        choices, and those services handle the data under their own terms.
      </p>
      <p>
        We may disclose data when the law requires it. If chatform is ever sold or merged, data moves
        with it under this policy.
      </p>

      <h2>Where it is kept</h2>
      <p>
        On Cloudflare&rsquo;s network, and with the providers above, some of whom are in the United States
        and other countries. Your data may be processed outside the country you live in.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Forms and responses: until the form&rsquo;s owner deletes them or deletes their account.</li>
        <li>A deleted form: kept for 30 days so it can be restored, then erased with its responses.</li>
        <li>A deleted account: kept for 30 days so it can be recovered, then erased.</li>
        <li>Test responses made in the builder&rsquo;s preview: 30 days.</li>
        <li>Webhook delivery records: 30 days.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>See and export your responses from the results page of any form.</li>
        <li>Delete a response, a form, or your whole account from the dashboard.</li>
        <li>Stop follow-up emails with the unsubscribe link in each one.</li>
        <li>Disconnect Google Sheets or any other connection from the form&rsquo;s Integrate tab.</li>
      </ul>
      <p>
        Depending on where you live, you may have the right to access, correct, delete or move your
        personal data, or to object to how it is used. <Link href="/contact">Contact us</Link> and we
        will respond.
      </p>

      <h2>Cookies</h2>
      <p>
        We set a cookie to keep you signed in and remember your display preferences. The Google and
        Microsoft tools named above set their own cookies on our website and dashboard.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Credentials for services you connect, such as Google Sheets or a
        payment provider, are encrypted before they are stored. No system is perfectly secure, and we
        will tell you if a breach affects your data.
      </p>

      <h2>Children</h2>
      <p>
        chatform accounts are for adults. Form owners are responsible for who their forms are aimed at
        and for any consent that requires.
      </p>

      <h2>Changes</h2>
      <p>
        When this policy changes we update the date at the top. For a change that matters, we also email
        account holders.
      </p>

      <h2>Contact</h2>
      <p>
        Questions and requests go through the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
