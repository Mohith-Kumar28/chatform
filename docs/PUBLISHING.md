# Publishing the SDKs

`@chatformhq/js` and `@chatformhq/react` are **published** — currently at
`0.1.1`. Everything below is verified against the real registry and a real
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

npm now requires a **granular access token with "bypass 2FA" enabled** for
publishing, and it requires it even with 2FA switched off on the account —
`npm login` alone gets a 403. Create one at npmjs.com under Access Tokens and
put it in `~/.npmrc` yourself; nothing here needs to see it.

## 3. Publish

```bash
pnpm --filter @chatformhq/js publish --access public
pnpm --filter @chatformhq/react publish --access public
```

`--access public` is required: scoped packages default to private, and publishing
a private package on the free tier fails.

Order matters — `@chatformhq/react` depends on `@chatformhq/js`, and pnpm rewrites
the `workspace:*` to the real version on publish, so the version it names must
already exist on the registry. Allow for propagation: `@chatformhq/js` has taken
around a minute to become installable after each publish, and publishing the
React package before then fails to resolve its own dependency.

```bash
# wait for it rather than guessing
until npm view @chatformhq/js@<version> version >/dev/null 2>&1; do sleep 5; done
```

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
@chatformhq/js      ~40 kB packed, 17 files, zero runtime dependencies
@chatformhq/react   ~8 kB packed, peer react >=18
```

Both export `./package.json`. Some bundlers and tooling read it, and an
`exports` map that omits it makes `require("@chatformhq/js/package.json")` throw
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

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

Both are at `0.1.1`, and the two are kept in lockstep. There is no changesets
setup and no `version` script, so edit `version` in both `package.json` files by
hand before publishing. A published version can never be reused, so a mistake
costs a patch bump rather than a fix.
