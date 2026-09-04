# @chatform/react

React bindings for [Chatform](https://chatform.in).

```bash
npm install @chatform/react
```

## Just put a form on the page

```tsx
import { ChatformEmbed } from "@chatform/react";

<ChatformEmbed slug="team-onboarding" hidden={{ plan: "trial" }} onComplete={(e) => track(e.responseId)} />;
```

No key needed. The frame talks to the API itself.

## Build your own interface

```tsx
import { useChatformSession } from "@chatform/react";

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
