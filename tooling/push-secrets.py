#!/usr/bin/env python3
"""
Upload the deployed worker's entire configuration from apps/api/.prod.vars.

One file holds it all — origins, mode flags and secrets alike. wrangler.jsonc deliberately
declares no `vars` block, so there is no second place to keep in sync and no way for the
two to disagree. Workers resolve `env.X` from secrets and vars identically, so a value
being a "secret" here costs nothing even when it is not sensitive.

    pnpm secrets:push               upload everything
    pnpm secrets:push -- --dry-run  list the names, change nothing
    pnpm secrets:push -- --file X   read a different file

Push BEFORE `wrangler deploy` on a fresh worker: deploy does not read this file, and the
API reads APP_ORIGIN on every request.

Values are never printed, only names.
"""

import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = ROOT / "apps" / "api"
DEFAULT_FILE = API / ".prod.vars"


def read_vars(path: pathlib.Path) -> dict[str, str]:
    """
    Parse a `.vars` file the way wrangler parses `.dev.vars`.

    Including the quote stripping, which is the whole point. `.dev.vars` and
    `.prod.vars` share a format but not a reader: wrangler loads the first and
    removes surrounding quotes, while this loaded the second and kept them. A
    quoted line therefore meant one value locally and a different value in
    production — and nothing anywhere said so, because a secret is write-only
    once deployed.

    That shipped a `PLATFORM_ADMIN_EMAILS` whose list split into
    `"first@example.com` and `last@example.com"`, so the platform console worked
    perfectly on localhost and answered 404 to its own admins in production.
    """
    out: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        value = value.strip()
        # Only a *matching* pair, so a value that legitimately contains a quote
        # is left alone.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[name.strip()] = value
    return out


def main() -> int:
    argv = sys.argv[1:]
    dry_run = "--dry-run" in argv
    path = DEFAULT_FILE
    if "--file" in argv:
        path = pathlib.Path(argv[argv.index("--file") + 1])
        if not path.is_absolute():
            path = ROOT / path

    if not path.exists():
        print(f"! {path} does not exist.")
        print("  Copy apps/api/.prod.vars.example to apps/api/.prod.vars and fill it in.")
        return 1

    everything = read_vars(path)
    values = {k: v for k, v in everything.items() if v}
    empty = sorted(k for k, v in everything.items() if not v)

    if not values:
        print(f"! {path.name} has no non-empty values.")
        return 1

    # A localhost origin in the file destined for production is always a mistake — it would
    # point Better Auth's baseURL and the CORS allow-list at a machine that is not there.
    # WEB_ORIGINS is exempt: it is a list, and a local dev app in it is deliberate.
    for name in ("APP_ORIGIN", "ENVIRONMENT"):
        if "localhost" in values.get(name, ""):
            print(f"! {name} is {values[name]!r} in {path.name} — that is a local value.")
            print("  Refusing to push it to the deployed worker.")
            return 1

    print(f"{path.relative_to(ROOT)} → deployed worker ({len(values)} values):")
    for name in sorted(values):
        print(f"  → {name}")
    if empty:
        print("skipped (empty):")
        for name in empty:
            print(f"  · {name}")

    if dry_run:
        print("\n--dry-run: nothing was uploaded.")
        return 0

    # Written to a temp file rather than piped, so no value ever appears in a process
    # argument list, and removed whether or not wrangler succeeds.
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(values, fh)
        tmp = pathlib.Path(fh.name)
    try:
        proc = subprocess.run(["pnpm", "exec", "wrangler", "secret", "bulk", str(tmp)], cwd=API)
    finally:
        tmp.unlink(missing_ok=True)

    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
