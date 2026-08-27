#!/usr/bin/env python3
"""
Provisions everything this app needs inside a Dodo Payments business.

  · six subscription products (Pro/Business × monthly/yearly, plus the two seat add-ons)
  · one product collection, so tier changes work inside the customer portal
  · one webhook endpoint, with its signing key read back and written to .dev.vars
  · the product ids written into the local `plans` table

Idempotent: it lists what already exists and creates only what is missing, so running it
twice is safe and running it after a partial failure resumes where it stopped.

The API key is read out of `apps/api/.dev.vars` and is never printed, never passed as a
command-line argument (where `ps` would show it), and never written anywhere else.

    tooling/provision-dodo.py                                  # test mode, no webhook
    tooling/provision-dodo.py --webhook-url https://api.x.com  # test mode + webhook
    tooling/provision-dodo.py --push-secrets                   # …and upload to the worker
    tooling/provision-dodo.py --live --webhook-url https://…   # real money

Written in Python rather than bash because the bash version needed four here-docs to build
one JSON body, and a quote arriving from the API broke it.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEV_VARS = REPO_ROOT / "apps" / "api" / ".dev.vars"

TEST_BASE = "https://test.dodopayments.com"
LIVE_BASE = "https://live.dodopayments.com"

# Only the events the handler acts on. A narrower filter means fewer deliveries to verify,
# log and then ignore — and `dodo_events` stays readable when something goes wrong.
WEBHOOK_EVENTS = [
    "subscription.active",
    "subscription.renewed",
    "subscription.updated",
    "subscription.plan_changed",
    "subscription.on_hold",
    "subscription.paused",
    "subscription.unpaused",
    "subscription.failed",
    "subscription.cancelled",
    "subscription.expired",
    "payment.succeeded",
    "payment.failed",
    "refund.succeeded",
]

# (name, amount in cents, billing interval, key)
PRODUCTS = [
    ("chatform Pro (monthly)", 2_400, "Month", "pro:monthly"),
    ("chatform Pro (yearly)", 19_200, "Year", "pro:yearly"),
    ("chatform Business (monthly)", 8_400, "Month", "business:monthly"),
    ("chatform Business (yearly)", 66_000, "Year", "business:yearly"),
    ("chatform extra seat (monthly)", 1_000, "Month", "seat:monthly"),
    ("chatform extra seat (yearly)", 12_000, "Year", "seat:yearly"),
]

COLLECTION_NAME = "chatform plans"


def say(msg: str = "") -> None:
    print(msg, flush=True)


def die(msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"\n✗ {msg}", file=sys.stderr)
    raise SystemExit(1)


# ────────────────────────────── env file handling ──────────────────────────────


def read_dev_var(name: str) -> str | None:
    if not DEV_VARS.exists():
        return None
    for line in DEV_VARS.read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip("\"'")
    return None


def write_dev_var(name: str, value: str) -> None:
    """Set or replace one variable, leaving the rest of the file untouched."""
    lines = DEV_VARS.read_text().splitlines() if DEV_VARS.exists() else []
    for i, line in enumerate(lines):
        if line.startswith(f"{name}="):
            lines[i] = f"{name}={value}"
            break
    else:
        lines.append(f"{name}={value}")
    DEV_VARS.write_text("\n".join(lines) + "\n")


# ───────────────────────────────── the API ─────────────────────────────────────


class Dodo:
    def __init__(self, base: str, key: str) -> None:
        self.base = base
        self._key = key

    def call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict | str]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{self.base}{path}", data=data, method=method)
        req.add_header("authorization", f"Bearer {self._key}")
        if data is not None:
            req.add_header("content-type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                raw = res.read().decode()
                return res.status, (json.loads(raw) if raw.strip() else {})
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw)
            except Exception:
                return e.code, raw
        except urllib.error.URLError as e:
            die(f"could not reach {self.base}: {e.reason}")

    def list_all(self, path: str) -> list[dict]:
        """Page through a list endpoint. Dodo returns {items, ...} with page_number."""
        out: list[dict] = []
        page = 0
        while True:
            sep = "&" if "?" in path else "?"
            status, body = self.call("GET", f"{path}{sep}page_size=100&page_number={page}")
            if status != 200 or not isinstance(body, dict):
                if page == 0:
                    return []
                break
            items = body.get("items") or []
            out.extend(items)
            if len(items) < 100:
                break
            page += 1
        return out


# ──────────────────────────────── the D1 side ──────────────────────────────────


def push_worker_secret(name: str, value: str) -> bool:
    """
    Upload one secret to the deployed worker, reading it from memory rather than a file.

    The value goes in on stdin, so it never appears in the process list — the same reason
    the API key is never a command-line argument anywhere in this script.
    """
    try:
        subprocess.run(
            ["pnpm", "exec", "wrangler", "secret", "put", name],
            cwd=REPO_ROOT / "apps" / "api",
            input=value,
            text=True,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        return True
    except subprocess.CalledProcessError as e:
        say(f"  ! could not upload {name}: {(e.stderr or '').strip()[:200]}")
        return False


def d1(sql: str, remote: bool) -> None:
    subprocess.run(
        [
            "pnpm", "exec", "wrangler", "d1", "execute", "chatform",
            "--remote" if remote else "--local", "--command", sql,
        ],
        cwd=REPO_ROOT / "apps" / "api",
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


# ───────────────────────────────── the work ────────────────────────────────────


def ensure_products(dodo: Dodo) -> dict[str, str]:
    existing = dodo.list_all("/products")
    by_name = {
        (p.get("name") or "").strip(): p.get("product_id", "")
        for p in existing
        if not p.get("is_archived")
    }
    say(f"✓ key accepted · {len(existing)} product(s) already in this business")

    ids: dict[str, str] = {}
    for name, amount, interval, key in PRODUCTS:
        if name in by_name and by_name[name]:
            ids[key] = by_name[name]
            say(f"  = {name} → {ids[key]}")
            continue

        status, body = dodo.call(
            "POST",
            "/products",
            {
                "name": name,
                "description": "Recurring subscription for chatform.",
                "tax_category": "saas",
                "price": {
                    "type": "recurring_price",
                    "price": amount,
                    "currency": "USD",
                    "discount": 0,
                    "payment_frequency_count": 1,
                    "payment_frequency_interval": interval,
                    # The TERM, not the billing interval. Long on purpose: setting this
                    # equal to the payment frequency makes the subscription expire after a
                    # single cycle, which is the easiest way to misconfigure the whole thing.
                    "subscription_period_count": 10,
                    "subscription_period_interval": "Year",
                    "trial_period_days": 0,
                    "purchasing_power_parity": False,
                },
            },
        )
        if status not in (200, 201) or not isinstance(body, dict):
            die(f'creating "{name}" returned {status}: {str(body)[:400]}')
        ids[key] = body.get("product_id", "")
        say(f"  + {name} → {ids[key]}")
    return ids


def ensure_collection(dodo: Dodo, product_ids: dict[str, str]) -> str | None:
    """
    A Product Collection is what lets a customer switch tier inside the Dodo portal.

    Non-fatal if it fails: everything else works, they just cannot self-serve an upgrade
    from the portal (our own /billing page still can).
    """
    for c in dodo.list_all("/product-collections"):
        if (c.get("name") or "") == COLLECTION_NAME:
            cid = c.get("id") or c.get("product_collection_id") or ""
            say(f"  = product collection → {cid}")
            return cid or None

    status, body = dodo.call(
        "POST",
        "/product-collections",
        {"name": COLLECTION_NAME, "description": "Switch between chatform plans."},
    )
    if status not in (200, 201) or not isinstance(body, dict):
        say(f"  ! product collection not created (HTTP {status}) — portal tier switching")
        say("    will be unavailable; everything else still works")
        return None
    cid = body.get("id") or body.get("product_collection_id") or ""
    say(f"  + product collection → {cid}")

    plan_products = [
        product_ids[k] for k in ("pro:monthly", "pro:yearly", "business:monthly", "business:yearly") if product_ids.get(k)
    ]
    if cid and plan_products:
        s, b = dodo.call("POST", f"/product-collections/{cid}/items", {"product_ids": plan_products})
        if s in (200, 201):
            say(f"    + {len(plan_products)} products added to the collection")
        else:
            say(f"    ! could not add products to the collection (HTTP {s}) — add them in the dashboard")
    return cid or None


def ensure_webhook(dodo: Dodo, webhook_url: str) -> None:
    url = webhook_url.rstrip("/") + "/api/billing/webhook"

    hook_id = ""
    for w in dodo.list_all("/webhooks"):
        if (w.get("url") or "") == url:
            hook_id = w.get("id") or ""
            say(f"  = webhook {url} → {hook_id}")
            break

    if not hook_id:
        status, body = dodo.call(
            "POST",
            "/webhooks",
            {"url": url, "description": "chatform entitlements", "filter_types": WEBHOOK_EVENTS},
        )
        if status not in (200, 201) or not isinstance(body, dict):
            die(f"creating the webhook returned {status}: {str(body)[:400]}")
        hook_id = body.get("id") or ""
        say(f"  + webhook {url} → {hook_id}")

    # Read the signing key back so nobody has to copy it out of the dashboard by hand —
    # and so it never passes through a chat transcript.
    status, body = dodo.call("GET", f"/webhooks/{hook_id}/secret")
    if status == 200 and isinstance(body, dict):
        secret = body.get("secret") or body.get("key") or ""
        if secret:
            write_dev_var("DODO_WEBHOOK_SECRET", secret)
            say("  ✓ signing key written to apps/api/.dev.vars (not printed)")
            return
    say(f"  ! could not read the signing key (HTTP {status})")
    say("    copy it from Dashboard → Developer → Webhooks into DODO_WEBHOOK_SECRET")


def link_plans(product_ids: dict[str, str], remote: bool) -> None:
    say("")
    say(f"→ linking product ids into the plans table ({'remote' if remote else 'local'} D1)")
    seat = product_ids.get("seat:monthly", "")
    for plan in ("pro", "business"):
        monthly = product_ids.get(f"{plan}:monthly", "")
        yearly = product_ids.get(f"{plan}:yearly", "")
        if not monthly or not yearly:
            say(f"  ! {plan} is missing a product id, skipping")
            continue
        sets = [
            f"dodo_product_monthly_id='{monthly}'",
            f"dodo_product_yearly_id='{yearly}'",
        ]
        if plan == "business" and seat:
            sets.append(f"seat_addon_product_id='{seat}'")
        try:
            d1(f"UPDATE plans SET {', '.join(sets)} WHERE id='{plan}'", remote)
            say(f"  ✓ {plan}")
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or b"").decode()[:300]
            say(f"  ! {plan} not linked — is the plans table seeded? (pnpm seed:plans)")
            if detail:
                say(f"    {detail}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--live", action="store_true", help="use live mode — real money")
    ap.add_argument("--webhook-url", default="", help="public https origin of the API")
    ap.add_argument("--remote", action="store_true", help="write product ids to the deployed D1")
    ap.add_argument(
        "--push-secrets",
        action="store_true",
        help="also upload DODO_API_KEY / DODO_WEBHOOK_SECRET / DODO_ENVIRONMENT to the deployed worker",
    )
    args = ap.parse_args()

    mode = "live" if args.live else "test"
    base = LIVE_BASE if args.live else TEST_BASE

    if not DEV_VARS.exists():
        die(f"{DEV_VARS} does not exist.\n  Copy apps/api/.dev.vars.example to .dev.vars first.")

    key = read_dev_var("DODO_API_KEY")
    if not key:
        die(
            f"DODO_API_KEY is not set in {DEV_VARS}.\n"
            "  Add it as a line:  DODO_API_KEY=<your key>\n"
            "  The file is gitignored, and this script never prints the value."
        )

    say(f"→ {mode} mode · {base}")
    if args.live:
        say("  ⚠ LIVE MODE — products created here can take real payments.")

    dodo = Dodo(base, key)

    status, body = dodo.call("GET", "/products?page_size=1")
    if status in (401, 403):
        die(
            f"Dodo rejected the API key (HTTP {status}).\n"
            f"  A {mode}-mode key only works against {base}. Check which mode the key was\n"
            "  copied from in Dashboard → Developer → API Keys."
        )
    if status != 200:
        die(f"GET /products returned {status}: {str(body)[:300]}")

    product_ids = ensure_products(dodo)
    ensure_collection(dodo, product_ids)

    if args.webhook_url:
        ensure_webhook(dodo, args.webhook_url)
    else:
        say("")
        say("  ! no --webhook-url given, so no webhook endpoint was created.")
        say("    Dodo has to reach the endpoint over the public internet, so localhost")
        say("    will not do. Deploy the API or run a tunnel, then re-run with:")
        say("      tooling/provision-dodo.py --webhook-url https://<host>")

    link_plans(product_ids, args.remote)
    write_dev_var("DODO_ENVIRONMENT", mode)

    if args.push_secrets:
        say("")
        say("→ uploading secrets to the deployed worker")
        if push_worker_secret("DODO_API_KEY", key):
            say("  ✓ DODO_API_KEY")
        hook_secret = read_dev_var("DODO_WEBHOOK_SECRET")
        if hook_secret:
            if push_worker_secret("DODO_WEBHOOK_SECRET", hook_secret):
                say("  ✓ DODO_WEBHOOK_SECRET")
        else:
            say("  ! DODO_WEBHOOK_SECRET not in .dev.vars — run with --webhook-url first")
        if push_worker_secret("DODO_ENVIRONMENT", mode):
            say(f"  ✓ DODO_ENVIRONMENT={mode}")

    say("")
    say("Done. Next:")
    if args.push_secrets:
        say("  1. The worker picked the secrets up immediately — no redeploy needed")
    else:
        say("  1. Restart the local API so it picks up .dev.vars")
        say("     (add --push-secrets to send them to the deployed worker too)")
    say("  2. As an owner, open /api/billing/config-check — expect ok: true")
    if not args.live:
        say("  3. Test cards: https://docs.dodopayments.com/miscellaneous/testing-process")


if __name__ == "__main__":
    main()
