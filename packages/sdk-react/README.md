# @chatformhq/react

React bindings for [Chatform](https://chatform.in).

```bash
npm install @chatformhq/react
```

## Just put a form on the page

```tsx
import { ChatformEmbed } from "@chatformhq/react";

<ChatformEmbed slug="team-onboarding" hidden={{ plan: "trial" }} onComplete={(e) => track(e.responseId)} />;
```

No key needed. The frame talks to the API itself.

## Build your own interface

```tsx
import { useChatformSession } from "@chatformhq/react";

function Interview() {
  const { messages, question, send, status } = useChatformSession({
    formId: "frm_…",
    publishableKey: "pk_live_…",
  });

  return (
    <div>
      {messages.map((m) => <p key={m.id}>{m.content}</p>)}
      {question && <YourInput block={question} onSubmit={send} />}
    </div>
  );
}
```

The engine decides what to ask, what is valid and where a branch goes. You own
every pixel and none of the flow logic.

Full documentation: https://chatform.in/docs
