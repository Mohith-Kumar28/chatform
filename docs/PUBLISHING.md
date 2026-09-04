# Publishing the SDKs

`@chatformhq/js` and `@chatformhq/react` are built and tested but not yet
published. Everything below is verified against the real registry and a real
`pnpm pack`.

## 1. The scope

**Done.** The `chatformhq` organization exists, so `@chatformhq` is ours.
`chatform` itself was already taken by someone else.

Two things about the npm UI that are more confusing than they need to be:

- The **`developers` team is created automatically** with the organization, and
  whoever created it is already an owner. The "Create a team" form on that tab is
  for *additional* teams — splitting write access between people — and is not a
  step toward publishing anything.
- **Packages are not created on the website.** They come into existence when you
  publish from the CLI, so an empty Packages tab before the first publish is
  correct, not a missing step.

Worth knowing: the unscoped name `chatform` is still unregistered. If the scope
ever feels awkward, `npm i chatform` remains available as a second front door.

## 2. Log in locally

```bash
npm login          # writes the token pnpm also reads
npm whoami         # should print your username
```

## 3. Publish

```bash
pnpm --filter @chatformhq/js publish --access public
pnpm --filter @chatformhq/react publish --access public
```

`--access public` is required: scoped packages default to private, and publishing
a private package on the free tier fails.

Order matters — `@chatformhq/react` depends on `@chatformhq/js`, and pnpm rewrites
the `workspace:*` to the real version on publish, so the version it names must
already exist on the registry.

## Publish with pnpm, not npm

**`npm publish` would ship a broken package.** Both packages export source inside
the workspace and `dist` when published, and that swap lives in
`publishConfig.exports`. pnpm applies it; npm ignores it.

Verified, not assumed:

| | resulting `exports` |
| --- | --- |
| `npm pack` | `"." → "./src/index.ts"` — not even in `files` |
| `pnpm pack` | `"." → { types: "./dist/index.d.ts", import: "./dist/index.js" }` |

The npm version installs cleanly and throws on import, which is the worst way for
this to fail. `tooling/guard-publish.mjs` runs in `prepublishOnly` and refuses the
npm path outright, so this cannot happen by accident.

## What gets published

Both are ESM-only. That is deliberate for the stateful parts: `ChatformSession`
keeps resume state in browser storage, and a dual-loaded package would mean two
copies writing the same keys — a bug that looks like random session loss.

```
@chatformhq/js      ~30 kB packed, 17 files, zero runtime dependencies
@chatformhq/react   ~8 kB packed, peer react >=18
```

Zero dependencies in the JS client is a product claim, not an accident: Web
Crypto for webhook verification, `fetch` for transport, and an injectable storage
adapter. Keep it that way.

## Verify after publishing

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null
npm i @chatformhq/js
node -e "import('@chatformhq/js').then(m => console.log(Object.keys(m)))"
```

That import is the check that matters — it is exactly what the npm-published
version would have failed.

## Versioning

Both are at `0.1.0`. Bump with `pnpm --filter <pkg> version <patch|minor>` before
publishing; there is no changesets setup, so versions are manual for now.
