# Publishing the SDKs

`@chatformhq/js` and `@chatformhq/react` are **published**, both at `0.2.0`.
Everything below is verified against the real registry and a real `pnpm pack`,
and the timings are measured rather than estimated.

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

npm requires a **granular access token with read and write on the `@chatformhq`
scope**, and it requires one even with 2FA switched off on the account:
`npm login` alone gets a 403. Create it at npmjs.com under Access Tokens and put
it in `~/.npmrc` yourself; nothing here needs to see it.

Tokens expire, and the failure does not say so. An expired one still reads
public packages fine, answers **401** on `npm whoami`, and answers **404** on the
`PUT` that publishes — because npm returns 404 rather than 403 for a package you
are not allowed to write, so "not found" is what an auth problem looks like.
Check the token before blaming the package:

```bash
npm whoami     # prints the username, or the token is dead
```

The npm CLI now also warns that *"tokens that bypass 2FA are being restricted
for account changes and direct publishing"*. The bypass-2FA flag is on its way
out; a plain granular token with write access on the scope is what to create.

## 3. Publish

```bash
pnpm --filter @chatformhq/js publish --access public
pnpm --filter @chatformhq/react publish --access public
```

`--access public` is required: scoped packages default to private, and publishing
a private package on the free tier fails.

Order matters. `@chatformhq/react` depends on `@chatformhq/js`, and pnpm rewrites
the `workspace:*` to the real version on publish, so the version it names must
already be installable from the registry. Publishing React too early fails to
resolve its own dependency.

**Wait on the tarball, not on the version.** These are two different events and
the gap between them is not small. At the `0.2.0` publish the packument was
live immediately — `npm view @chatformhq/js@0.2.0 version` answered at once —
while `js-0.2.0.tgz` went on answering 404 for **four and a half minutes**. A
loop that waits on `npm view` therefore exits almost immediately and publishes
straight into the failure it was written to prevent.

```bash
# the tarball is what React actually has to fetch
until curl -sfIL -o /dev/null https://registry.npmjs.org/@chatformhq/js/-/js-<version>.tgz; do sleep 10; done
```

`npm view` is also served from a local cache, so it can report the *old* version
list well after a publish has landed. Read the registry directly when you want
the truth:

```bash
curl -s https://registry.npmjs.org/@chatformhq%2Fjs | python3 -c "import sys,json;print(json.load(sys.stdin)['dist-tags'])"
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

## Testing a tarball before you push it

The React package depends on `@chatformhq/js@workspace:*`, and pnpm rewrites
that to the real version on pack — a version that is not on the registry yet.
So install **both tarballs in the same command**, or the React one fails to
resolve its own dependency for a reason that has nothing to do with the package
being wrong:

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null && npm pkg set type=module
npm i /path/to/chatformhq-js-0.2.0.tgz /path/to/chatformhq-react-0.2.0.tgz
node --input-type=module -e "import('@chatformhq/js').then(m => console.log(Object.keys(m)))"
```

## Versioning

Both are at `0.2.0`, and the two are kept in lockstep. There is no changesets
setup and no `version` script, so edit `version` in both `package.json` files by
hand before publishing. A published version can never be reused, so a mistake
costs a patch bump rather than a fix.
