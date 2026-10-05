/**
 * The Chatform embed loader.
 *
 * Dependency-free and ES5-safe on purpose: it runs on someone else's page, on
 * whatever browsers they support, alongside whatever else they have loaded. It
 * adds no inline script and evaluates nothing, so it works under a strict
 * Content Security Policy.
 *
 *   <script src="https://chatform.in/embed.js" data-form="my-form" defer></script>
 *
 * How it looks and when it opens are published with the form and fetched from
 * `/p/forms/:slug/embed` before anything is drawn, so a change made in the
 * builder reaches this page on Publish. Every attribute below still works and
 * overrides the published value on this page. The one thing that does not wait
 * for them is a click: see `early`.
 *
 * There is no API key here and there never will be. A published form is public
 * — the loader points a frame at its URL, and the frame talks to the API on its
 * own behalf. Anything that asked you to install a package or paste a secret to
 * put a public form on a page was asking for something it did not need.
 *
 * Attributes:
 *   data-form        (required) the form's slug
 *   data-mode        popup | side-tab | inline | fullpage        default popup
 *   data-position    bottom-right | bottom-left | top-right |
 *                    top-left                                    default bottom-right
 *   data-offset      px between the launcher and the edges, 0-200 default 20
 *   data-width       panel width in px (popup, side tab), 240-1200 default 400 / 440
 *   data-height      panel height in px, 240-2000; inline takes "auto" default 600 / auto
 *   data-target      CSS selector for inline mode                default appends
 *   data-app         the Chatform origin                         default this script's origin
 *   data-button-color launcher colour (data-color still works)  default #FD6F29
 *   data-label       launcher text; "" for an icon-only bubble   default "Fill this form"
 *   data-icon        chat | none                                 default chat
 *   data-button-text-color launcher text and icon colour        default #fff
 *   data-button-shape round | rounded | square                  default round
 *   data-button-size small | medium | large                     default medium
 *   data-launcher    "none" hides the corner button; open it from
 *                    your own element instead (see below)
 *   data-theme       light | dark | auto                         default auto
 *   data-open-on     click | load | exit-intent | scroll:<1-100> default click
 *                    (on a phone, the automatic ones shake the launcher
 *                    instead of covering the page)
 *                    (the automatic ones never fire again once this
 *                    visitor has submitted the form on this site)
 *   data-lazy        when the frame loads: "false" at once, "true"
 *                    only on hover or click                     default once the page is idle
 *   data-nonce       CSP nonce, copied onto injected styles
 *   data-hidden-*    prefilled hidden fields (data-hidden-plan="pro")
 *
 * Your own button:
 *   <button data-chatform-open>Join the waitlist</button>
 *   Any element with data-chatform-open opens the form when clicked. Give it
 *   the slug (data-chatform-open="my-form") when a page has two forms.
 *
 * Programmatic:
 *   window.Chatform.open() / .close() / .toggle() / .prefill({}) / .on(event, fn) / .destroy()
 *   window.Chatform.settings()         { dashboard, overrides, current }; the
 *                                      "settings" event fires when they arrive
 *   window.Chatform.get(slug)          two forms on one page
 *   window.ChatformQueue = [["open"]]  calls made before this loads are replayed
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute("data-form");
  if (!slug) {
    // Loud, because a silent no-op here looks like the product is broken.
    console.error("[chatform] Missing data-form on the embed script tag.");
    return;
  }

  var scriptOrigin = new URL(script.src, window.location.href).origin;
  var app = script.getAttribute("data-app") || scriptOrigin;
  var lazyAttr = script.getAttribute("data-lazy");
  var lazy = lazyAttr !== "false";
  var nonce = script.getAttribute("data-nonce");
  var target = script.getAttribute("data-target");

  /**
   * The settings, decided once the published ones have arrived.
   *
   * They are published with the form: the builder's embed studio edits the
   * draft and `/p/forms/:slug/embed` serves the live version, so a site that
   * carries this script picks up a change on Publish with nobody re-pasting
   * anything. An attribute on the tag still wins over the published value.
   * That is what keeps every snippet pasted before this existed, each of which
   * spelled its settings out as attributes, behaving exactly as it did.
   */
  var mode, color, textColor, label, showIcon, showLauncher, theme, openOn, heightAttr, buttonShape, buttonSize;
  var position, vertical, horizontal, offset, panelWidth, panelHeight;
  var POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"];
  /** How much room each launcher size takes: its circle plus a 12px gap. */
  var BUTTON_SIZES = { small: 56, medium: 68, large: 80 };

  /** `Chatform.settings()`: what the dashboard says, what the tag overrode, and what is in use. */
  var settings = null;

  function configure(published) {
    var r = published || {};
    var overridden = {};
    /**
     * Say so when the tag overrides a published setting.
     *
     * The tag wins, on purpose: it is the more specific of the two. But from
     * the studio it looks like Publish did nothing, so the page's console
     * names the attribute that is holding the old value.
     */
    function overrides(name, key, own, theirs) {
      if (r[key] === undefined || r[key] === null || own === theirs) return;
      console.info(
        "[chatform] " + name + '="' + script.getAttribute(name) + '" on the script tag overrides the published ' +
          key + ' ("' + r[key] + '"). Remove the attribute to use the published setting.',
      );
    }
    function pick(name, key) {
      if (script.hasAttribute(name)) {
        overridden[name] = script.getAttribute(name);
        overrides(name, key, script.getAttribute(name), String(r[key]));
        return script.getAttribute(name);
      }
      return r[key] === undefined || r[key] === null ? null : String(r[key]);
    }
    function flag(name, key) {
      if (script.hasAttribute(name)) {
        overridden[name] = script.getAttribute(name);
        overrides(name, key, script.getAttribute(name) !== "none", r[key] !== false);
        return script.getAttribute(name) !== "none";
      }
      return r[key] !== false;
    }

    mode = pick("data-mode", "mode") || "popup";
    var colorAttr = script.hasAttribute("data-button-color") ? "data-button-color" : script.hasAttribute("data-color") ? "data-color" : null;
    if (colorAttr) overridden[colorAttr] = script.getAttribute(colorAttr);
    if (colorAttr) overrides(colorAttr, "color", script.getAttribute(colorAttr).toLowerCase(), String(r.color).toLowerCase());
    color = (colorAttr && script.getAttribute(colorAttr)) || r.color || "#FD6F29";
    textColor = pick("data-button-text-color", "textColor") || "#fff";
    // Only a plain colour; anything else keeps the default light background.
    skinBackground = typeof r.background === "string" && /^#[0-9a-f]{3,8}$/i.test(r.background) ? r.background : null;
    // A family name only: it goes into a stylesheet URL and a font-family.
    launcherFont = typeof r.font === "string" && /^[a-z0-9 ]{1,60}$/i.test(r.font) ? r.font : null;
    var labelValue = pick("data-label", "label");
    label = labelValue === null ? "Fill this form" : labelValue;
    showIcon = flag("data-icon", "icon");
    showLauncher = flag("data-launcher", "launcher");
    buttonShape = pick("data-button-shape", "buttonShape");
    if (["round", "rounded", "square"].indexOf(buttonShape) === -1) buttonShape = "round";
    buttonSize = pick("data-button-size", "buttonSize");
    if (!BUTTON_SIZES[buttonSize]) buttonSize = "medium";
    theme = pick("data-theme", "theme") || "auto";
    openOn = pick("data-open-on", "openOn") || "click";
    if (script.hasAttribute("data-height")) {
      heightAttr = script.getAttribute("data-height");
      overridden["data-height"] = heightAttr;
      overrides("data-height", "height", heightAttr, String(r.height));
    }
    else if (mode === "inline") heightAttr = r.autoHeight === false && r.height ? String(r.height) : "auto";
    else heightAttr = r.height ? String(r.height) : "auto";

    /**
     * Which corner the launcher lives in.
     *
     * It was hardcoded to the bottom right, which is the right default and the
     * wrong only option: plenty of sites already have a support widget, a cookie
     * banner or a back-to-top button parked there, and two overlapping bubbles is
     * a worse first impression than no bubble at all.
     */
    position = pick("data-position", "position") || "bottom-right";
    if (POSITIONS.indexOf(position) === -1) {
      console.warn('[chatform] Unknown data-position "' + position + '" — using bottom-right.');
      position = "bottom-right";
    }
    vertical = position.indexOf("top") === 0 ? "top" : "bottom";
    horizontal = position.indexOf("left") > -1 ? "left" : "right";

    // The same ranges the studio allows: 0 to 200, 240 to 1200, 240 to 2000.
    offset = parseInt(pick("data-offset", "offset"), 10);
    if (isNaN(offset) || offset < 0) offset = 20;
    offset = Math.min(offset, 200);

    panelWidth = parseInt(pick("data-width", "width"), 10);
    if (isNaN(panelWidth) || panelWidth < 240) panelWidth = mode === "side-tab" ? 440 : 400;
    panelWidth = Math.min(panelWidth, 1200);

    panelHeight = parseInt(heightAttr, 10);
    if (isNaN(panelHeight) || panelHeight < 240) panelHeight = 600;
    panelHeight = Math.min(panelHeight, 2000);

    /**
     * Readable from code, so a page that wants to differ from the dashboard
     * can see what it is differing from. `dashboard` is what the form
     * publishes (empty when unpublished or unreachable), `overrides` is the
     * attributes on this tag, `current` is what this tag is actually using.
     */
    settings = {
      dashboard: {
        mode: r.mode, position: r.position, offset: r.offset, width: r.width, height: r.height,
        autoHeight: r.autoHeight, buttonColor: r.color, buttonTextColor: r.textColor, label: r.label,
        icon: r.icon, launcher: r.launcher, buttonShape: r.buttonShape, buttonSize: r.buttonSize,
        theme: r.theme, openOn: r.openOn,
      },
      overrides: overridden,
      current: {
        mode: mode, position: position, offset: offset, width: panelWidth,
        height: heightAttr === "auto" ? "auto" : panelHeight, buttonColor: color, buttonTextColor: textColor,
        label: label, icon: showIcon, launcher: showLauncher, buttonShape: buttonShape,
        buttonSize: buttonSize, theme: theme, openOn: openOn,
      },
    };
  }

  /**
   * Where the public API lives. The script is served by the app, and the API
   * sits on its own host beside it.
   */
  function apiOrigin() {
    var explicit = script.getAttribute("data-api");
    if (explicit) return explicit.replace(/\/$/, "");
    if (/^https:\/\/(www\.)?chatform\.in$/.test(app)) return "https://api.chatform.in";
    if (/^http:\/\/localhost:\d+$/.test(app)) return "http://localhost:8787";
    return app;
  }

  /**
   * The published settings as this browser last saw them, kept in the host
   * page's storage. Never used in place of a fetch that answers in time: they
   * are what a click that will not wait is drawn with (see `early`), and what
   * a fetch that is slow or fails falls back to.
   */
  var settingsKey = "chatform:settings:" + slug;
  function remembered() {
    try {
      var value = JSON.parse(window.localStorage.getItem(settingsKey));
      return value && typeof value === "object" ? value : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * The published settings. After 2.5s or a failed request, the remembered
   * ones, or `{}`: the attributes and defaults take over.
   */
  function loadPublished(done) {
    var settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      done(value && typeof value === "object" ? value : {});
    }
    function fallback() {
      finish(remembered() || {});
    }
    setTimeout(fallback, 2500);
    try {
      fetch(apiOrigin() + "/p/forms/" + encodeURIComponent(slug) + "/embed", { credentials: "omit" })
        .then(function (res) {
          return res.ok ? res.json() : {};
        })
        .then(function (value) {
          // Kept even when it arrives after the timeout or an early click.
          try {
            if (value && typeof value === "object") window.localStorage.setItem(settingsKey, JSON.stringify(value));
          } catch (e) {
            /* storage blocked: the next early click draws with the defaults */
          }
          finish(value);
        }, fallback);
    } catch (e) {
      fallback();
    }
  }

  /** Scopes this instance's placement rules, so two forms can sit in two corners. */
  var uid = "cf" + Math.random().toString(36).slice(2, 8);

  /** data-hidden-plan="pro" becomes ?plan=pro. */
  var hidden = {};
  for (var i = 0; i < script.attributes.length; i++) {
    var attr = script.attributes[i];
    if (attr.name.indexOf("data-hidden-") === 0) {
      hidden[attr.name.slice("data-hidden-".length)] = attr.value;
    }
  }

  var listeners = {};
  var frame = null;
  var launcher = null;
  var panel = null;
  var isOpen = false;
  var destroyed = false;

  /**
   * The frame's own close button is the one the respondent should use, so the
   * loader waits for the handshake before drawing a worse one of its own.
   * Nothing arriving means a blank or broken panel — and since the launcher is
   * hidden while open, that would otherwise be a form with no way out.
   */
  var frameReady = false;
  var fallbackClose = null;
  var fallbackTimer = 0;
  var READY_GRACE_MS = 3500;

  /**
   * Whether the frame should leave the X out of its header. True inline, where
   * the form is part of the page and there is nothing to close, and on a popup
   * wide enough that the launcher is the close. Must match the 520px in
   * `injectPlacement` and the `.cf-x` rules.
   */
  var narrow = window.matchMedia ? window.matchMedia("(max-width:520px)") : null;
  function hostCloses() {
    if (mode === "inline") return true;
    return mode === "popup" && showLauncher && !(narrow && narrow.matches);
  }

  function emit(name, payload) {
    var handlers = listeners[name] || [];
    for (var i = 0; i < handlers.length; i++) {
      try {
        handlers[i](payload);
      } catch (err) {
        console.error("[chatform] listener for " + name + " threw", err);
      }
    }
  }

  function frameUrl() {
    var url = new URL(app + "/f/" + encodeURIComponent(slug));
    url.searchParams.set("embed", "1");
    // The frame posts only to this origin, and only if the form allows it.
    url.searchParams.set("parentOrigin", window.location.origin);
    if (theme !== "auto") url.searchParams.set("theme", theme);
    // The first answer rides in the URL so the header X never flashes; later
    // changes (a window resized across 520px) arrive as a "host" message.
    if (hostCloses()) url.searchParams.set("hostClose", "1");
    // Loaded ahead of the click: the frame holds its session (a response row)
    // until `open` arrives. See `preload`.
    if (!isOpen && mode !== "inline") url.searchParams.set("cf_defer", "1");
    // Where the form sits, recorded on the response. Inside the frame the
    // referrer is only this origin, so the page and its own referrer ride here.
    url.searchParams.set("cf_mode", mode);
    try {
      url.searchParams.set("cf_page", window.location.href.split("#")[0].slice(0, 1000));
      if (document.referrer) url.searchParams.set("cf_ref", document.referrer.slice(0, 1000));
    } catch (err) {
      /* An unreadable location is not worth a form that will not open. */
    }
    for (var key in hidden) {
      if (Object.prototype.hasOwnProperty.call(hidden, key)) url.searchParams.set(key, hidden[key]);
    }
    return url.toString();
  }

  function addStyle(id, css) {
    if (id && document.getElementById(id)) return null;
    var style = document.createElement("style");
    if (id) style.id = id;
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }

  /** Shared look. Placement is deliberately not here — see `injectPlacement`. */
  function injectStyles() {
    addStyle(
      "chatform-embed-styles",
      [
        ".cf-launcher{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;",
        "padding:12px 18px;border:0;border-radius:999px;color:#fff;font:500 15px/1 system-ui,sans-serif;cursor:pointer;",
        "box-shadow:0 6px 24px rgba(0,0,0,.18);transition:transform .15s ease}",
        ".cf-launcher:hover{transform:translateY(-1px)}",
        ".cf-launcher svg{width:18px;height:18px;flex:none;display:block}",
        // An empty data-label asks for the bare circle every messenger widget uses.
        ".cf-launcher.cf-bare{width:56px;height:56px;padding:0;justify-content:center;border-radius:50%}",
        // Size and shape. After the rules above, and one class more specific,
        // so they also reach the bare circle and the close state (`.cf-x`).
        ".cf-launcher.cf-sz-small{padding:9px 14px;gap:6px;font-size:13px}",
        ".cf-launcher.cf-sz-small svg{width:16px;height:16px}",
        ".cf-launcher.cf-sz-small.cf-bare{width:44px;height:44px;padding:0}",
        ".cf-launcher.cf-sz-large{padding:15px 22px;gap:10px;font-size:17px}",
        ".cf-launcher.cf-sz-large svg{width:20px;height:20px}",
        ".cf-launcher.cf-sz-large.cf-bare{width:64px;height:64px;padding:0}",
        /*
         * Shown and hidden by opacity and transform rather than display, so it
         * can animate both ways. visibility waits for the fade before hiding,
         * so a closed panel still takes no clicks and no focus.
         */
        ".cf-panel{position:fixed;z-index:2147483001;border:0;border-radius:16px;background:var(--cf-skel-bg);",
        "box-shadow:0 12px 48px rgba(0,0,0,.22);overflow:hidden;visibility:hidden;opacity:0;pointer-events:none;",
        "transform:translateY(12px) scale(.97);",
        "transition:opacity .16s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s linear .22s}",
        ".cf-panel.cf-open{visibility:visible;opacity:1;transform:none;pointer-events:auto;",
        "transition:opacity .16s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s}",
        /*
         * Until the form says it is ready: the form's own background and a
         * typing indicator, so a click gets an answer at once instead of a white
         * box for the second the form takes to arrive. Always light, whatever
         * the host page's scheme, because the form is: a dark placeholder
         * followed by a light form was a flash, not a loading state. The exact
         * colour comes from the published theme (see `skin`), so the frame
         * fades in over its own colour and the swap has no seam.
         */
        ".cf-host{--cf-skel-bg:#faf7f2;--cf-skel-dot:rgba(0,0,0,.26)}",
        ".cf-inline{position:relative;overflow:hidden;border-radius:16px;background:var(--cf-skel-bg)}",
        ".cf-skel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:6px;",
        "transition:opacity .3s ease .1s}",
        ".cf-skel i{width:7px;height:7px;border-radius:50%;background:var(--cf-skel-dot);animation:cf-dot 1s ease-in-out infinite}",
        ".cf-skel i:nth-child(2){animation-delay:.15s}.cf-skel i:nth-child(3){animation-delay:.3s}",
        "@keyframes cf-dot{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}",
        ".cf-frame{position:relative;opacity:0;transition:opacity .45s cubic-bezier(.2,.8,.2,1)}",
        ".cf-ready .cf-frame{opacity:1}",
        ".cf-ready .cf-skel{opacity:0}",
        ".cf-fullpage{inset:0;width:100vw;height:100vh;border-radius:0}",
        /*
         * The launcher stands down while the panel is up, except on a desktop popup.
         *
         * A side tab runs the full height of the launcher's edge, and under 520px
         * the panel goes edge-to-edge, so a launcher left there sits on top of
         * the sheet it just opened. Those two use the panel's own close.
         *
         * A desktop popup opens beside the launcher instead, so the launcher
         * becomes the close: a circle with an X, the way every messenger widget
         * does it, and the frame drops the X from its header (see `hostCloses`).
         */
        ".cf-launcher.cf-away{display:none}",
        ".cf-launcher .cf-x-icon{display:none}",
        ".cf-launcher.cf-x{width:48px;height:48px;padding:0;justify-content:center;border-radius:50%}",
        ".cf-launcher.cf-bare.cf-x{width:56px;height:56px}",
        ".cf-launcher.cf-sz-small.cf-x{width:40px;height:40px;padding:0}",
        ".cf-launcher.cf-sz-small.cf-bare.cf-x{width:44px;height:44px}",
        ".cf-launcher.cf-sz-large.cf-x{width:56px;height:56px;padding:0}",
        ".cf-launcher.cf-sz-large.cf-bare.cf-x{width:64px;height:64px}",
        ".cf-launcher.cf-r-rounded,.cf-launcher.cf-r-rounded.cf-bare,.cf-launcher.cf-r-rounded.cf-x{border-radius:12px}",
        ".cf-launcher.cf-r-square,.cf-launcher.cf-r-square.cf-bare,.cf-launcher.cf-r-square.cf-x{border-radius:4px}",
        ".cf-launcher.cf-x>*{display:none}",
        ".cf-launcher.cf-x>.cf-x-icon{display:block;width:20px;height:20px;animation:cf-spin .2s ease-out}",
        "@keyframes cf-spin{from{opacity:0;transform:rotate(-90deg)}to{opacity:1;transform:none}}",
        "@media (max-width:520px){.cf-launcher.cf-x{display:none}}",
        ".cf-close{position:absolute;top:10px;right:10px;z-index:1;width:32px;height:32px;padding:0;",
        "border:0;border-radius:50%;background:rgba(15,15,15,.55);color:#fff;cursor:pointer;",
        "display:grid;place-items:center}",
        ".cf-close:hover{background:rgba(15,15,15,.75)}",
        ".cf-close svg{width:16px;height:16px;display:block}",
        /*
         * Attention, for the phone that was not opened on (see `autoOpen`): two
         * small shakes and two rings in the button's own colour, then a faint
         * shine for about ten seconds, then nothing. Once, not forever: a
         * button that never stops moving reads as a nag.
         */
        ".cf-launcher.cf-attn{overflow:hidden;animation:cf-shake .8s ease-in-out .2s 2,cf-ring 1.6s ease-out .2s 2}",
        ".cf-launcher.cf-attn::after{content:'';position:absolute;top:0;bottom:0;left:0;width:50%;pointer-events:none;",
        "background:linear-gradient(105deg,transparent 0%,rgba(255,255,255,.3) 50%,transparent 100%);",
        "transform:translateX(-120%) skewX(-12deg);animation:cf-shine 2.5s ease-in-out .6s 4 both}",
        "@keyframes cf-shake{0%,100%{transform:none}15%{transform:rotate(-5deg)}35%{transform:rotate(4deg)}",
        "55%{transform:rotate(-3deg)}75%{transform:rotate(2deg)}}",
        "@keyframes cf-shine{0%{transform:translateX(-120%) skewX(-12deg)}50%,100%{transform:translateX(280%) skewX(-12deg)}}",
        "@keyframes cf-ring{0%{box-shadow:0 6px 24px rgba(0,0,0,.18),0 0 0 0 var(--cf-c)}",
        "100%{box-shadow:0 6px 24px rgba(0,0,0,.18),0 0 0 12px transparent}}",
        "@media (prefers-reduced-motion:reduce){.cf-launcher{transition:none}",
        ".cf-launcher.cf-attn{animation:cf-ring 1.6s ease-out .2s 2}.cf-launcher.cf-attn::after{display:none}",
        ".cf-panel,.cf-panel.cf-open{transform:none}.cf-skel i,.cf-x-icon{animation:none!important}}",
      ].join(""),
    );
  }

  /**
   * Per-instance placement, as a stylesheet rather than inline styles.
   *
   * Inline styles would win over the small-screen rules below, and a 400px panel
   * pinned 20px from the corner of a phone is a form nobody can fill in. A rule
   * can be overridden by a media query; `style.bottom` cannot.
   */
  var placement = null;
  function injectPlacement() {
    // Drawn twice when a click came before the settings: the second replaces the first.
    if (placement && placement.parentNode) placement.parentNode.removeChild(placement);
    var launcherRule =
      ".cf-l-" + uid + "{" + vertical + ":" + offset + "px;" + horizontal + ":" + offset + "px}";

    var panelRule;
    if (mode === "side-tab") {
      panelRule =
        ".cf-p-" + uid + "{top:0;bottom:0;" + horizontal + ":0;width:" + panelWidth +
        "px;height:100vh;border-radius:0}";
    } else {
      // Clear of the launcher, by its size. With no launcher the panel takes
      // the corner itself.
      var clearance = showLauncher ? offset + BUTTON_SIZES[buttonSize] : offset;
      panelRule =
        ".cf-p-" + uid + "{" + vertical + ":" + clearance + "px;" + horizontal + ":" + offset +
        "px;width:" + panelWidth + "px;height:" + panelHeight +
        "px;max-height:calc(100vh - " + (clearance + offset) + "px)}";
    }

    // The panel grows out of its corner, and a side tab slides in from its edge.
    var motionRule =
      mode === "side-tab"
        ? ".cf-p-" + uid + ":not(.cf-open){transform:translateX(" + (horizontal === "right" ? "" : "-") + "32px)}"
        : ".cf-p-" + uid + "{transform-origin:" + vertical + " " + horizontal + "}";

    var mobileRule =
      "@media (max-width:520px){.cf-p-" + uid +
      "{inset:0;width:100vw;height:100dvh;max-height:none;border-radius:0}" +
      ".cf-p-" + uid + ":not(.cf-open){transform:translateY(24px)}}";

    // A desktop popup closes from the launcher, so the fallback X is only for
    // the layouts where the launcher is hidden.
    var fallbackRule =
      mode === "popup" && showLauncher ? "@media (min-width:521px){.cf-p-" + uid + ">.cf-close{display:none}}" : "";

    placement = addStyle(null, launcherRule + panelRule + motionRule + mobileRule + fallbackRule);
  }

  function buildFrame() {
    if (frame) return frame;
    frame = document.createElement("iframe");
    frame.src = frameUrl();
    frame.title = "Form";
    frame.setAttribute("allow", "clipboard-write; camera; microphone; geolocation");
    // See the note in packages/sdk-react/src/chatform-embed.tsx: the origin,
    // never the embedder's full URL. A `sandbox` attribute is deliberately not
    // set — that needs a browser pass, not reasoning.
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.className = "cf-frame";
    frame.style.border = "0";
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.display = "block";
    // "ready" is the signal to show the form. A frame that loads but never
    // says it (a blocked origin, an error page) is shown anyway, a moment later.
    frame.addEventListener("load", function () {
      setTimeout(reveal, 1200);
    });
    return frame;
  }

  function reveal() {
    if (panel) panel.classList.add("cf-ready");
  }

  /** The panel's colour and three typing dots, until the form arrives. */
  function skeleton() {
    var el = document.createElement("div");
    el.className = "cf-skel";
    el.setAttribute("aria-hidden", "true");
    for (var d = 0; d < 3; d++) el.appendChild(document.createElement("i"));
    return el;
  }

  function hostClass() {
    return " cf-host";
  }

  /** The published background, on the placeholder, so loading and loaded are one colour. */
  var skinBackground = null;
  var launcherFont = null;

  /**
   * The launcher in the form's own body font, so the button reads as part of
   * the form it opens rather than of the page it sits on.
   *
   * Only the glyphs of the button's text are fetched (`text=`), a few hundred
   * bytes on someone else's page. A family Google does not serve, or a page
   * whose CSP refuses the stylesheet, falls back to the system face as before.
   */
  function fontLauncher(el) {
    if (!launcherFont) return;
    el.style.fontFamily = '"' + launcherFont + '", system-ui, sans-serif';
    if (!label) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=" + launcherFont.replace(/ /g, "+") +
      ":wght@500&text=" + encodeURIComponent(label) + "&display=swap";
    // No weight 500 in this family: ask again for its regular cut.
    link.onerror = function () {
      link.onerror = null;
      link.href = link.href.replace(":wght@500", "");
    };
    if (nonce) link.setAttribute("nonce", nonce);
    document.head.appendChild(link);
  }
  function skin(el) {
    if (skinBackground) el.style.setProperty("--cf-skel-bg", skinBackground);
    return el;
  }

  /**
   * Warm the connection now, so the first open does not also pay for DNS and
   * TLS, even before `preload` builds the frame.
   */
  function preconnect(href) {
    var link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    document.head.appendChild(link);
  }

  /** Inlined rather than fetched: one more network request for 300 bytes. */
  function icon(d, strokeWidth) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", strokeWidth);
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  function chatIcon() {
    return icon("M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z", "2");
  }

  function closeIcon() {
    return icon("M18 6 6 18M6 6l12 12", "2.5");
  }

  function mountInline() {
    injectStyles();
    var host = target ? document.querySelector(target) : null;
    var container = document.createElement("div");
    container.className = "cf-inline" + hostClass();
    skin(container);
    container.style.width = "100%";
    container.style.height = heightAttr === "auto" ? "620px" : panelHeight + "px";
    container.appendChild(skeleton());
    container.appendChild(buildFrame());
    if (host) host.appendChild(container);
    else if (script.parentNode) script.parentNode.insertBefore(container, script);
    panel = container;
    isOpen = true;
  }

  /** The panel and its loading dots. Kept, and restyled, when `early` already drew it. */
  function drawPanel() {
    var fresh = !panel;
    if (fresh) {
      panel = document.createElement("div");
      panel.appendChild(skeleton());
    }
    panel.className =
      "cf-panel cf-p-" + uid + hostClass() + (mode === "fullpage" ? " cf-fullpage" : "") + (shell ? " cf-open" : "");
    skin(panel);
    if (fresh) document.body.appendChild(panel);
  }

  /**
   * Asked to open before the settings have arrived.
   *
   * A click is answered on the click. The loader used to hold it until the
   * settings request came back, which on a slow connection was a button that
   * did nothing for a second or two, and a page that only adds this script
   * when its own button is pressed paid that wait on every first open.
   *
   * So with settings remembered from an earlier visit it mounts on them at
   * once, frame and all. With none, it draws the panel and its loading dots
   * from the tag's attributes and the defaults, and the real settings restyle
   * it and start the frame when they land.
   */
  var shell = false;
  function early() {
    if (mounted || destroyed || shell || !document.body) return;
    var known = remembered();
    if (known) {
      settle(known);
      return;
    }
    configure({});
    // Not the published settings yet, so not what `Chatform.settings()` reports.
    settings = null;
    if (mode === "inline") return;
    shell = true;
    injectStyles();
    injectPlacement();
    drawPanel();
  }

  function mountOverlay() {
    injectStyles();
    injectPlacement();
    drawPanel();
    if (!lazy) panel.appendChild(buildFrame());

    if (mode !== "fullpage" && showLauncher) {
      launcher = document.createElement("button");
      launcher.type = "button";
      launcher.className =
        "cf-launcher cf-l-" + uid + (label ? "" : " cf-bare") + " cf-sz-" + buttonSize + " cf-r-" + buttonShape;
      launcher.style.background = color;
      launcher.style.color = textColor;
      fontLauncher(launcher);
      // The attention ring pulses in the button's own colour.
      launcher.style.setProperty("--cf-c", color);
      if (showIcon) launcher.appendChild(chatIcon());
      if (label) {
        // In a span so `.cf-x` can hide it while the launcher is the close.
        var text = document.createElement("span");
        text.textContent = label;
        launcher.appendChild(text);
      }
      var x = closeIcon();
      x.setAttribute("class", "cf-x-icon");
      launcher.appendChild(x);
      launcher.setAttribute("aria-haspopup", "dialog");
      launcher.setAttribute("aria-expanded", "false");
      // A circle with no text needs a name for anyone not looking at it.
      launcher.setAttribute("aria-label", label || "Open the form");
      launcher.addEventListener("click", toggle);
      document.body.appendChild(launcher);

      /**
       * Build the frame on intent, if `preload` has not already.
       *
       * Hovering the launcher is a head start of a few hundred ms. With
       * data-lazy="true" it is the only one.
       */
      if (lazy) {
        // Hover on a desktop, the first touch on a phone, focus from a keyboard:
        // each is a head start of a few hundred ms before the click lands.
        var warm = function () {
          if (!frame) panel.appendChild(buildFrame());
        };
        launcher.addEventListener("mouseenter", warm, { once: true });
        launcher.addEventListener("pointerdown", warm, { once: true });
        launcher.addEventListener("focus", warm, { once: true });
      }
    }
  }

  /** The X the loader draws only when the frame never offered one of its own. */
  function showFallbackClose() {
    if (fallbackClose || !panel || frameReady) return;
    fallbackClose = document.createElement("button");
    fallbackClose.type = "button";
    fallbackClose.className = "cf-close";
    fallbackClose.setAttribute("aria-label", "Close the form");
    fallbackClose.appendChild(closeIcon());
    fallbackClose.addEventListener("click", close);
    panel.appendChild(fallbackClose);
  }

  function hideFallbackClose() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    if (fallbackClose && fallbackClose.parentNode) {
      fallbackClose.parentNode.removeChild(fallbackClose);
    }
    fallbackClose = null;
  }

  function open() {
    // Opened by hand counts too: they have seen it, so nothing opens it for them again.
    markPrompted();
    if (destroyed || isOpen) return;
    if (launcher) launcher.classList.remove("cf-attn");
    isOpen = true;
    if (!frame && panel) panel.appendChild(buildFrame());
    // A preloaded frame is waiting for this to open its session. One that has
    // not said hello yet hears it again on `ready`.
    post({ type: "open" });
    if (panel) panel.classList.add("cf-open");
    if (launcher) {
      launcher.setAttribute("aria-expanded", "true");
      launcher.setAttribute("aria-label", "Close the form");
      // A popup's launcher turns into the close (and CSS hides it on a phone).
      launcher.classList.add(mode === "popup" ? "cf-x" : "cf-away");
    }
    // Nothing to escape through until the frame says hello, so give it a moment
    // and then draw an exit anyway.
    if (!frameReady && !fallbackTimer) fallbackTimer = setTimeout(showFallbackClose, READY_GRACE_MS);
    emit("open", {});
  }

  function close() {
    if (destroyed || !isOpen || mode === "inline") return;
    if (panel) panel.classList.remove("cf-open");
    if (launcher) {
      launcher.setAttribute("aria-expanded", "false");
      launcher.setAttribute("aria-label", label || "Open the form");
      launcher.classList.remove("cf-away");
      launcher.classList.remove("cf-x");
    }
    hideFallbackClose();
    isOpen = false;
    emit("close", {});
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function post(message) {
    if (!frame || !frame.contentWindow) return;
    // Targeted, never "*": the frame's origin is known, and a wildcard would
    // broadcast to whatever happened to be loaded there.
    frame.contentWindow.postMessage(Object.assign({ source: "chatform", v: 1 }, message), app);
  }

  function prefill(values) {
    for (var key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) hidden[key] = values[key];
    }
    // Before the frame exists the values go into its URL; after, they are sent.
    if (frame) post({ type: "prefill", fields: values });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== app) return;
    var message = event.data;
    if (!message || message.source !== "chatform") return;

    switch (message.type) {
      case "ready":
        if (checking) checking(false);
        // The frame draws its own close from here on, so retire ours.
        frameReady = true;
        hideFallbackClose();
        reveal();
        post({ type: "host", closes: hostCloses() });
        // Anything posted before the frame was listening was dropped.
        post({ type: "prefill", fields: hidden });
        if (isOpen) post({ type: "open" });
        emit("ready", message);
        break;
      case "resize":
        if (mode === "inline" && heightAttr === "auto" && panel && message.height) {
          panel.style.height = message.height + "px";
        }
        break;
      case "question":
        emit("question", message);
        break;
      case "answer":
        emit("answer", message);
        break;
      case "complete":
        markSubmitted();
        emit("complete", message);
        break;
      case "answered":
        // A return visit to a form this device already answered.
        markSubmitted();
        if (launcher) launcher.classList.remove("cf-attn");
        if (checking) checking(true);
        break;
      case "close":
        close();
        break;
    }
  });

  // Crossing 520px swaps which X is the close, so the frame has to hear about it.
  function onNarrowChange() {
    if (frameReady) post({ type: "host", closes: hostCloses() });
  }

  /**
   * `data-chatform-open` on any element of the page opens this form.
   *
   * Delegated from the document, so it covers buttons rendered after this
   * script ran (a React page, a menu opened later). A bare attribute belongs to
   * the first form on the page; one with a slug belongs to that form. React
   * writes a bare `data-chatform-open` in JSX as "true", so that reads as bare.
   */
  function claims(el) {
    var which = el.getAttribute("data-chatform-open");
    return which && which !== "true" ? which === slug : window.Chatform === api;
  }
  function onPageClick(event) {
    if (destroyed || !event.target || !event.target.closest) return;
    var el = event.target.closest("[data-chatform-open]");
    if (!el || !claims(el)) return;
    event.preventDefault();
    // Before the settings: answer the click now, and open properly on mount.
    if (!mounted) early();
    if (!mounted) {
      pending.push(open);
      return;
    }
    // Inline is already open, so the most a button can do is bring it into view.
    if (mode === "inline" && panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    else open();
  }
  document.addEventListener("click", onPageClick);

  // Hovering or touching your own button starts the frame early, as on the launcher.
  function onPageWarm(event) {
    if (frame || destroyed || !mounted || mode === "inline" || !panel || !event.target || !event.target.closest) return;
    var el = event.target.closest("[data-chatform-open]");
    if (!el || !claims(el)) return;
    panel.appendChild(buildFrame());
  }
  document.addEventListener("pointerover", onPageWarm);
  document.addEventListener("pointerdown", onPageWarm);

  /**
   * Whether this visitor has already submitted this form, on this site.
   *
   * Remembered in the host page's own storage, so it holds across every page
   * of the site that carries the form. Only the automatic opens read it: a
   * form that pops up on scroll again after someone answered it is nagging
   * them, while a click on a button is them asking.
   */
  var submittedKey = "chatform:submitted:" + slug;
  function markSubmitted() {
    try {
      window.localStorage.setItem(submittedKey, String(Date.now()));
    } catch (e) {
      /* storage blocked: the form just auto-opens as before */
    }
  }
  function hasSubmitted() {
    try {
      return !!window.localStorage.getItem(submittedKey);
    } catch (e) {
      return false;
    }
  }

  /**
   * Whether the form has already opened itself (or shaken the launcher) for
   * this visitor, on this site.
   *
   * An automatic open is an invitation at most once a day. Without this it
   * fired again on every page of the site and every visit, so a reader who
   * closed it once got it back on the next scroll. After 24 hours it may
   * invite them again. Kept in the host page's storage, like
   * `submittedKey`, because this script runs on the host page, not in the
   * frame: one key covers every page of the site with no network call. A
   * click on the launcher still always opens it.
   */
  var promptedKey = "chatform:prompted:" + slug;
  var PROMPT_EVERY_MS = 24 * 60 * 60 * 1000;
  function markPrompted() {
    try {
      window.localStorage.setItem(promptedKey, String(Date.now()));
    } catch (e) {
      /* storage blocked: it prompts once per page view, as before */
    }
  }
  function hasPrompted() {
    try {
      var at = Number(window.localStorage.getItem(promptedKey));
      return at > 0 && Date.now() - at < PROMPT_EVERY_MS;
    } catch (e) {
      return false;
    }
  }

  /**
   * An open the visitor did not ask for: on load, on exit intent, on scroll.
   *
   * On a phone the panel is the whole screen, and a sheet that covers the
   * article someone is halfway through reading is a sheet they close without
   * looking at. So under 520px it does not open; the launcher shakes and a
   * shine runs across it instead, and the visitor opens it when they choose.
   * With no launcher there is nothing to draw attention to, so nothing happens.
   */
  function autoOpen() {
    // They may have opened it from a button and answered on this visit.
    if (hasSubmitted() || hasPrompted() || isOpen) return;
    if (narrow && narrow.matches && mode !== "fullpage") {
      if (launcher) attention();
      return;
    }
    askFirst(function () {
      markPrompted();
      open();
    });
  }

  /**
   * Load the form out of sight and let it say whether this visitor already
   * answered before showing it.
   *
   * This page only learns about a submission that happens inside it, so
   * someone who answered before it started listening, or on another page of
   * a different site, looked new here and got the popup on every visit. The
   * form knows, from its own storage and the server, and sends `answered`.
   * The popup was about to load the form anyway, so this costs nothing but a
   * moment's wait. It opens after the form has been up briefly with nothing
   * said, or after 4s whatever happens.
   */
  var checking = null;
  function askFirst(then) {
    if (frameReady && !checking) {
      if (!hasSubmitted()) then();
      return;
    }
    if (checking) return;
    var decided = false;
    var quiet = 0;
    var cap = 0;
    function decide(answeredAlready) {
      if (decided) return;
      decided = true;
      checking = null;
      clearTimeout(quiet);
      clearTimeout(cap);
      if (!answeredAlready && !hasSubmitted()) then();
    }
    // `ready` starts a short quiet window: "already answered" is known one
    // network check after the form is up.
    checking = function (answeredAlready) {
      if (answeredAlready) return decide(true);
      clearTimeout(quiet);
      quiet = setTimeout(function () {
        decide(false);
      }, 1500);
    };
    cap = setTimeout(function () {
      decide(false);
    }, 4000);
    if (!frame && panel) panel.appendChild(buildFrame());
  }

  var attended = false;
  function attention() {
    // Once a day per visitor on this site; see `promptedKey`.
    if (!launcher || attended) return;
    attended = true;
    markPrompted();
    launcher.classList.add("cf-attn");
    // Past the last shine: take the class off so nothing lingers.
    setTimeout(function () {
      if (launcher) launcher.classList.remove("cf-attn");
    }, 11000);
    emit("attention", {});
  }

  function setupTriggers() {
    if (hasSubmitted() || hasPrompted()) return;
    if (openOn === "load") {
      autoOpen();
      return;
    }
    if (openOn === "exit-intent") {
      document.addEventListener("mouseout", function onOut(e) {
        if (e.clientY <= 0) {
          document.removeEventListener("mouseout", onOut);
          autoOpen();
        }
      });
      return;
    }
    if (openOn.indexOf("scroll:") === 0) {
      var pct = Math.min(100, Math.max(1, parseInt(openOn.slice(7), 10) || 50));
      // How far down this page the visitor is, as a share of how far it can
      // scroll. A page too short to scroll counts as read to the end. The 2px
      // slack lets 100% fire on a zoomed page that stops a fraction short.
      var check = function () {
        var room = document.documentElement.scrollHeight - window.innerHeight;
        if (room <= 0 || window.scrollY + 2 >= (room * pct) / 100) {
          window.removeEventListener("scroll", onScroll);
          autoOpen();
          return true;
        }
        return false;
      };
      var onScroll = function () {
        check();
      };
      if (check()) return;
      window.addEventListener("scroll", onScroll, { passive: true });
      // Load the form now, not after the page's `load` and an idle moment. The
      // popup waits for the form's "already answered?" check, and a frame
      // still loading at the mark held it back for seconds: someone still
      // scrolling was at the bottom by the time it showed, so halfway opened
      // at the end.
      if (!frame && panel && !destroyed && lazyAttr !== "true") panel.appendChild(buildFrame());
    }
  }

  function destroy() {
    destroyed = true;
    hideFallbackClose();
    document.removeEventListener("click", onPageClick);
    document.removeEventListener("pointerover", onPageWarm);
    document.removeEventListener("pointerdown", onPageWarm);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (launcher && launcher.parentNode) launcher.parentNode.removeChild(launcher);
    frame = null;
    panel = null;
    launcher = null;
  }

  var mounted = false;
  /** Calls to open/close/toggle made before the settings arrived, replayed on mount. */
  var pending = [];

  function mount() {
    // Warm the connections while the settings are fetched. The frame's API
    // calls run in this page's connection partition, so a preconnect from
    // here is one the frame gets to use too.
    preconnect(app);
    preconnect(apiOrigin());
    loadPublished(settle);
  }

  /** Mounts on the settings, once: the fetched ones, or the remembered ones `early` could not wait for. */
  function settle(published) {
    if (destroyed || mounted) return;
    configure(published);
    emit("settings", api.settings());
    build();
    mounted = true;
    for (var p = 0; p < pending.length; p++) pending[p]();
    pending = [];
  }

  /**
   * Load a popup's frame once the page has finished its own work.
   *
   * Built on the click, the form was a server render, a bundle and a boot
   * screen, one after another, a few seconds of loading in front of someone
   * who had just asked for it. Built now, hidden, it is already on screen when
   * they click. It waits for the page's `load` and an idle moment so it never
   * competes with the host's first paint, and it opens no session until it is
   * opened (`cf_defer`), so a page view is still not a response.
   */
  function preload() {
    if (lazyAttr === "true" || mode === "inline" || mode === "fullpage") return;
    function go() {
      var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1500); };
      idle(function () {
        if (!frame && panel && !destroyed) panel.appendChild(buildFrame());
      }, { timeout: 4000 });
    }
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }

  function build() {
    if (narrow && mode === "popup") {
      if (narrow.addEventListener) narrow.addEventListener("change", onNarrowChange);
      else if (narrow.addListener) narrow.addListener(onNarrowChange);
    }
    if (mode === "inline") {
      // A panel `early` drew for a form that turned out to be inline.
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      mountInline();
    } else {
      mountOverlay();
      if (mode === "fullpage") open();
      else {
        setupTriggers();
        preload();
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  /** Runs now if mounted, or once the settings have arrived. An open draws the panel meanwhile; see `early`. */
  function whenMounted(fn, opens) {
    return function () {
      if (!mounted && opens) early();
      if (mounted) fn();
      else pending.push(fn);
    };
  }

  var api = {
    slug: slug,
    open: whenMounted(open, true),
    close: whenMounted(close),
    toggle: whenMounted(toggle, true),
    prefill: prefill,
    destroy: destroy,
    /** A copy, or null until the settings have arrived; `on("settings")` fires then. */
    settings: function () {
      return settings ? JSON.parse(JSON.stringify(settings)) : null;
    },
    on: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return api;
    },
    off: function (name, fn) {
      listeners[name] = (listeners[name] || []).filter(function (h) {
        return h !== fn;
      });
      return api;
    },
  };

  // Several forms can share a page, so each registers itself by slug while the
  // bare `window.Chatform` stays the first one for the common single-form case.
  var registry = (window.__chatformInstances = window.__chatformInstances || {});
  registry[slug] = api;
  if (!window.Chatform) {
    window.Chatform = api;
    window.Chatform.get = function (which) {
      return registry[which];
    };
  }

  // Calls made before this script loaded are replayed rather than lost.
  var queued = window.ChatformQueue;
  if (queued && queued.length) {
    for (var q = 0; q < queued.length; q++) {
      var call = queued[q];
      if (api[call[0]]) api[call[0]].apply(api, call.slice(1));
    }
    window.ChatformQueue = [];
  }
})();
