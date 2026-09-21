# @chatformhq/react

## 0.2.0

### Fixed

- **`act` refused actions the runtime accepts.** It was typed
  `"skip" | "stop" | "restart" | "submit"`, which left out `edit` — shipped
  since 0.1.0 — as well as every action added since. It is now
  `SessionAction`, imported from `@chatformhq/js/browser`, so it cannot drift
  from the client again.

### Added

- `screenedOut` and `requirements` on the hook. A screen-out is a terminal
  ending like any other, so a component that only checks `ending` renders
  "Thank you!" at somebody who was just told they do not qualify. Branch on
  `screenedOut`, and show `requirements` when the author wrote them down.
- `resendCode()`, `changeAnswer()` and `undoScreenOut()`, for the three actions
  that were unreachable through the typed `act`.
- The package has tests for the first time. Its `test` script ran
  `--passWithNoTests` and there were none.

### Unchanged, and worth saying

`ChatformEmbed` still sets no `sandbox` attribute. That is a decision recorded
in the source, not an oversight: a sandbox was driven against a real embed and
left off because the file uploader and the Google sign-in popup could not be
exercised through it. A test now asserts its absence, so revisiting it is a
deliberate act.
