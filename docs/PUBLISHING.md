# Publishing the SDKs

`@chatform/js` and `@chatform/react` are built and tested but unpublished — the
npm scope has not been claimed yet. Everything below is verified against the real
registry and a real `pnpm pack`.

## 1. Claim the scope

As of this writing the scope is completely free: no packages under `@chatform`,
and even the unscoped `chatform` name is unregistered.

1. Sign in at [npmjs.com](https://www.npmjs.com).
2. Avatar menu → **Add an Organization**.
3. Name it **`chatform`**. That reserves `@chatform` as a package scope.
4. Choose the **free** tier — it allows unlimited *public* packages, which is all
   these are. (The paid tier is only for private ones.)
5. Turn on 2FA if it is not already; npm requires it for publishing from a new
   account, and you want it regardless for a package other people install.

A scope is not the same as a username. `@yourusername` exists automatically; an
organization scope has to be created, and creating it is what stops someone else
taking `@chatform`.

## 2. Log in locally

```bash
npm login          # writes the token pnpm also reads
npm whoami         # should print your username
```

## 3. Publish

```bash
pnpm --filter @chatform/js publish --access public
pnpm --filter @chatform/react publish --access public
```

`--access public` is required: scoped packages default to private, and publishing
a private package on the free tier fails.

Order matters — `@chatform/react` depends on `@chatform/js`, and pnpm rewrites
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
@chatform/js      ~30 kB packed, 17 files, zero runtime dependencies
@chatform/react   ~8 kB packed, peer react >=18
```

Zero dependencies in the JS client is a product claim, not an accident: Web
Crypto for webhook verification, `fetch` for transport, and an injectable storage
adapter. Keep it that way.

## Verify after publishing

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null
npm i @chatform/js
node -e "import('@chatform/js').then(m => console.log(Object.keys(m)))"
```

That import is the check that matters — it is exactly what the npm-published
version would have failed.

## Versioning

Both are at `0.1.0`. Bump with `pnpm --filter <pkg> version <patch|minor>` before
publishing; there is no changesets setup, so versions are manual for now.
