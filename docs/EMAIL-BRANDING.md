# Email branding

Two different things get called "the logo in the email", and only one of them is
code.

## 1. The logo inside the message — done

`apps/api/src/lib/mail-templates.ts` renders a lockup at the top of every
message: the mark as a 24px PNG next to the wordmark as live text. The PNG is
served by the web app from `apps/web/public/brand/email-mark.png`, and the
template links it absolutely at `https://chatform.in/brand/email-mark.png`.

Three constraints shaped that and are worth not re-litigating:

- **PNG, not SVG.** Gmail and every version of Outlook strip `<svg>`. The asset
  is 96px and served at 24 so it stays sharp on a retina screen.
- **Absolute, and pinned to production.** A relative URL has no meaning in an
  inbox, and threading `APP_ORIGIN` through would put `localhost` in mail sent
  from a dev machine — a broken image forever, in somebody's archive.
- **The wordmark stays text.** Most clients block remote images by default on
  first open. With images off the header still reads "chatform" instead of
  showing an empty box where the whole brand used to be.

A white-label auto-reply (`hidePoweredBy`) drops the header lockup along with
the footer — see `layout({ brand })`.

Regenerating the asset from the mark in `apps/web/src/components/brand/logo.tsx`:

```sh
magick -background none -density 600 mark-duo.svg -resize 96x96 \
  -depth 8 -define png:color-type=6 -strip apps/web/public/brand/email-mark.png
```

## 2. The sender's avatar in the inbox list — DNS, and a certificate

The circle next to the sender name in Gmail is **BIMI**, and it is not something
an application can set. It is a DNS record plus, at Gmail/Apple/Yahoo, a paid
certificate. Everything that can be done without spending money is done; the
last step is a purchase decision.

### Ready

- **The logo.** `apps/web/public/brand/bimi.svg` — SVG Tiny PS (`version="1.2"`,
  `baseProfile="tiny-ps"`, a `<title>`, a square viewBox, a solid background, no
  gradients or external references), which is the only format BIMI accepts.
  Served at `https://chatform.in/brand/bimi.svg`. The mono silhouette on solid
  `#FD6F29` rather than the two-plate mark on white: the avatar is rendered at
  about 26px inside a circle on a white inbox row, where a white logo is an
  invisible one.
- **DMARC.** `_dmarc.chatform.in` is already `p=quarantine`, which clears BIMI's
  enforcement bar. (`p=none` would not.)

### Not ready

- **SPF.** `chatform.in` publishes no `TXT` SPF record at all right now. BIMI
  requires DMARC to pass, which requires an aligned SPF *or* DKIM pass — DKIM
  from Cloudflare Email Sending may be carrying it today, but the apex having no
  SPF at all is worth fixing on deliverability grounds regardless.
- **The BIMI record**, once the certificate below exists:

  ```
  default._bimi.chatform.in.  TXT  "v=BIMI1; l=https://chatform.in/brand/bimi.svg; a=https://chatform.in/brand/vmc.pem"
  ```

- **The VMC.** Gmail, Apple Mail and Yahoo all refuse to display a BIMI logo
  without a Verified Mark Certificate (or a Common Mark Certificate) in `a=`.
  They are issued by DigiCert and Entrust, run roughly $1,000–1,500 a year, and
  a VMC requires a **registered** trademark on the mark. A CMC is cheaper and
  accepts a mark that has merely been in use, but is honoured by fewer
  providers. Publishing the record with `l=` and no `a=` is valid BIMI and
  displays nothing at any of the three, so it is not worth doing on its own.

`apps/web/public/brand/avatar.png` is the same artwork as a 512px raster, for
the places that want a square image rather than BIMI — Gravatar, a Google
Business profile, an app directory listing.

## 3. Square rasters, and which one is which

Three files in `apps/web/public/brand/` look interchangeable and are not. Picking the
wrong one is easy — it happened when setting the Dodo Payments brand logo, where the
mono-on-orange tile went in and had to be replaced.

| File | Artwork | Use it for |
|---|---|---|
| `email-mark.png` | duo mark, transparent, 96px | the lockup inside an email (§1) |
| `bimi.svg` | **mono silhouette on solid `#FD6F29`** | BIMI only (§2) |
| `avatar.png` | same mono-on-orange, 512px raster | Gravatar, Google Business, anywhere rendered small on a **white** ground |
| `mark-duo-512.png` | duo mark, transparent, 512px | every other square slot — Dodo's brand logo, app directories, OAuth consent screens |

The mono-on-orange pair exists for one reason, and it is not "the logo on a background":
BIMI renders at ~26px inside a circle on a white inbox row, where the duo mark's white
seam disappears and the shape reads as a blob. **On a dark surface that logic inverts** —
Dodo's checkout panel is near-black, the seam shows through, and the two-plate mark is the
right and only choice.

Regenerating `mark-duo-512.png` from `public/logo.svg`:

```sh
sed 's/width="32" height="32"/width="512" height="512"/' apps/web/public/logo.svg > /tmp/mark-duo.svg
magick -background none -density 1200 /tmp/mark-duo.svg -resize 512x512 \
  -depth 8 -define png:color-type=6 -strip apps/web/public/brand/mark-duo-512.png
```

No padding is added on purpose. The mark's furthest point from centre is a tail tip at
`(21.6, 3.9)` — a radius of 13.33 in a 16-unit half-box, so it already sits at 0.83 of a
circular mask and cannot clip. Padding it "to be safe" is what made the first upload
render visibly undersized next to the wordmark.
