# api-verify

Walks every `/v1` operation against a live deployment, in the order a real
integration would, and reports what happened.

```bash
CHATFORM_SECRET_KEY=sk_live_… pnpm api:verify
```

Options: `--skip-ai` leaves the three `/v1/ai/*` endpoints alone, which is what
you want while changing the harness itself, because each full run spends two of
the organization's monthly AI generations.

Optional environment: `CHATFORM_BASE` (default `https://api.chatform.in`),
`CHATFORM_PUBLISHABLE_KEY` and `CHATFORM_PUBLISHABLE_ORIGIN` (default
`http://localhost:3000`) to cover the publishable-key origin rules.

## Why it is a script and not a test file

`@repo/tooling` already has `"test": "vitest run"` wired into `turbo run test`
and so into `pnpm check`. A suite that writes to production and spends AI credits
must not be reachable from the standing gate, so this is a script you run
deliberately.

The second reason is that vitest abandons a file at the first failed assertion,
which is the wrong shape for "attempt 69 operations and report all 69". The run
continues past a failure, and cleans up in a `finally` either way.

## Safety

It writes to a real organization. Three things keep that from being dangerous:

- Every object it creates is titled `zz-apitest <runId>` and its id is recorded.
  The cleanup pass deletes exactly the recorded set.
- It prints the forms that existed before it started and refuses to delete any
  of them, so the live event form cannot be caught up in a sweep.
- Afterwards it re-lists and asserts that every pre-existing form is still there
  and nothing of its own is left. Both are reported.

It cannot isolate itself in a workspace, because `POST /v1/forms` writes to the
organization's oldest workspace and takes no parameter. Isolation is by name and
by recorded id, which is why the refusal above matters.

## What it reports

`report.md`, and a copy per run under `results/`.

Coverage is counted against the `/v1` operations in `openapi.json`, so an
endpoint added without a step here shows up as "never reached" rather than
quietly going untested.

Three outcomes rather than two. `negative-only` is for the six respondent-auth
operations: Google and Firebase identity tokens cannot be minted from a script,
so only their refusal path is reachable, and calling that a failure would be a
lie in the direction of alarm.

Response checking is likewise three-valued — `schema-verified` where the spec
declares a response schema, `shape-asserted` against a hand-written expectation
where it does not, `unchecked` otherwise. Printing the split is deliberate: only
22 of the 69 operations declare a schema, and that number is a finding rather
than a detail of the harness.

## Probes

The last section checks promises rather than endpoints — the things a developer
hits after the endpoint has already returned 200 to somebody else. Every probe
names the page that makes the promise and fails loudly if it can no longer find
it, so a reworded doc surfaces as a broken probe instead of a silent pass.
