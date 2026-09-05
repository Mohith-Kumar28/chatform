/**
 * The Chatform embed loader.
 *
 * Dependency-free and ES5-safe on purpose: it runs on someone else's page, on
 * whatever browsers they support, alongside whatever else they have loaded. It
 * adds no inline script and evaluates nothing, so it works under a strict
 * Content Security Policy.
 *
 *   <script src="https://chatform.in/embed.js" data-form="my-form" data-mode="popup" defer></script>
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
 *   data-offset      px between the launcher and the edges       default 20
 *   data-width       panel width in px (popup, side tab)         default 400 / 440
 *   data-height      panel height in px; inline takes "auto"     default 600 / auto
 *   data-target      CSS selector for inline mode                default appends
 *   data-app         the Chatform origin                         default this script's origin
 *   data-color       launcher colour                             default #f97316
 *   data-label       launcher text; "" for an icon-only bubble   default "Questions?"
 *   data-icon        chat | none                                 default chat
 *   data-theme       light | dark | auto                         default auto
 *   data-open-on     click | load | exit-intent | scroll:<pct>   default click
 *   data-lazy        "false" to build the frame immediately      default lazy
 *   data-nonce       CSP nonce, copied onto injected styles
 *   data-hidden-*    prefilled hidden fields (data-hidden-plan="pro")
 *
 * Programmatic:
 *   window.Chatform.open() / .close() / .toggle() / .prefill({}) / .on(event, fn) / .destroy()
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
  var mode = script.getAttribute("data-mode") || "popup";
  var color = script.getAttribute("data-color") || "#f97316";
  var labelAttr = script.getAttribute("data-label");
  var label = labelAttr === null ? "Questions?" : labelAttr;
  var showIcon = script.getAttribute("data-icon") !== "none";
  var theme = script.getAttribute("data-theme") || "auto";
  var openOn = script.getAttribute("data-open-on") || "click";
  var lazy = script.getAttribute("data-lazy") !== "false";
  var nonce = script.getAttribute("data-nonce");
  var target = script.getAttribute("data-target");
  var heightAttr = script.getAttribute("data-height") || "auto";

  /**
   * Which corner the launcher lives in.
   *
   * It was hardcoded to the bottom right, which is the right default and the
   * wrong only option: plenty of sites already have a support widget, a cookie
   * banner or a back-to-top button parked there, and two overlapping bubbles is
   * a worse first impression than no bubble at all.
   */
  var POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"];
  var position = script.getAttribute("data-position") || "bottom-right";
  if (POSITIONS.indexOf(position) === -1) {
    console.warn('[chatform] Unknown data-position "' + position + '" — using bottom-right.');
    position = "bottom-right";
  }
  var vertical = position.indexOf("top") === 0 ? "top" : "bottom";
  var horizontal = position.indexOf("left") > -1 ? "left" : "right";

  var offset = parseInt(script.getAttribute("data-offset"), 10);
  if (isNaN(offset) || offset < 0) offset = 20;

  var panelWidth = parseInt(script.getAttribute("data-width"), 10);
  if (isNaN(panelWidth) || panelWidth < 240) panelWidth = mode === "side-tab" ? 440 : 400;

  var panelHeight = parseInt(heightAttr, 10);
  if (isNaN(panelHeight) || panelHeight < 240) panelHeight = 600;

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
    for (var key in hidden) {
      if (Object.prototype.hasOwnProperty.call(hidden, key)) url.searchParams.set(key, hidden[key]);
    }
    return url.toString();
  }

  function addStyle(id, css) {
    if (id && document.getElementById(id)) return;
    var style = document.createElement("style");
    if (id) style.id = id;
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = css;
    document.head.appendChild(style);
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
        ".cf-panel{position:fixed;z-index:2147483001;border:0;border-radius:16px;background:#fff;",
        "box-shadow:0 12px 48px rgba(0,0,0,.22);display:none;overflow:hidden}",
        ".cf-panel.cf-open{display:block}",
        ".cf-fullpage{inset:0;width:100vw;height:100vh;border-radius:0}",
        "@media (prefers-reduced-motion:reduce){.cf-launcher{transition:none}}",
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
  function injectPlacement() {
    var launcherRule =
      ".cf-l-" + uid + "{" + vertical + ":" + offset + "px;" + horizontal + ":" + offset + "px}";

    var panelRule;
    if (mode === "side-tab") {
      panelRule =
        ".cf-p-" + uid + "{top:0;bottom:0;" + horizontal + ":0;width:" + panelWidth +
        "px;height:100vh;border-radius:0}";
    } else {
      // Clear of the launcher, which is about 48px tall plus its own gap.
      var clearance = offset + 68;
      panelRule =
        ".cf-p-" + uid + "{" + vertical + ":" + clearance + "px;" + horizontal + ":" + offset +
        "px;width:" + panelWidth + "px;height:" + panelHeight +
        "px;max-height:calc(100vh - " + (clearance + offset) + "px)}";
    }

    var mobileRule =
      "@media (max-width:520px){.cf-p-" + uid +
      "{inset:0;width:100vw;height:100dvh;max-height:none;border-radius:0}}";

    addStyle(null, launcherRule + panelRule + mobileRule);
  }

  function buildFrame() {
    if (frame) return frame;
    frame = document.createElement("iframe");
    frame.src = frameUrl();
    frame.title = "Form";
    frame.setAttribute("allow", "clipboard-write; camera; microphone");
    frame.style.border = "0";
    frame.style.width = "100%";
    frame.style.height = "100%";
    return frame;
  }

  /** Inlined rather than fetched: one more network request for 300 bytes. */
  function chatIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z");
    svg.appendChild(path);
    return svg;
  }

  function mountInline() {
    injectStyles();
    var host = target ? document.querySelector(target) : null;
    var container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = heightAttr === "auto" ? "620px" : panelHeight + "px";
    container.appendChild(buildFrame());
    if (host) host.appendChild(container);
    else if (script.parentNode) script.parentNode.insertBefore(container, script);
    panel = container;
    isOpen = true;
  }

  function mountOverlay() {
    injectStyles();
    injectPlacement();
    panel = document.createElement("div");
    panel.className = "cf-panel cf-p-" + uid + (mode === "fullpage" ? " cf-fullpage" : "");
    if (!lazy) panel.appendChild(buildFrame());
    document.body.appendChild(panel);

    if (mode !== "fullpage") {
      launcher = document.createElement("button");
      launcher.type = "button";
      launcher.className = "cf-launcher cf-l-" + uid + (label ? "" : " cf-bare");
      launcher.style.background = color;
      if (showIcon) launcher.appendChild(chatIcon());
      if (label) launcher.appendChild(document.createTextNode(label));
      launcher.setAttribute("aria-haspopup", "dialog");
      launcher.setAttribute("aria-expanded", "false");
      // A circle with no text needs a name for anyone not looking at it.
      launcher.setAttribute("aria-label", label || "Open the form");
      launcher.addEventListener("click", toggle);
      document.body.appendChild(launcher);

      /**
       * Build the frame on intent rather than on load.
       *
       * A hidden iframe still costs a document, a stylesheet and a connection —
       * on someone else's page, competing with their own first paint. Hovering
       * the launcher is enough warning to have it ready by the time it opens.
       */
      if (lazy) {
        launcher.addEventListener(
          "mouseenter",
          function () {
            if (!frame) panel.appendChild(buildFrame());
          },
          { once: true },
        );
      }
    }
  }

  function open() {
    if (destroyed || isOpen) return;
    if (!frame && panel) panel.appendChild(buildFrame());
    if (panel) panel.classList.add("cf-open");
    if (launcher) launcher.setAttribute("aria-expanded", "true");
    isOpen = true;
    emit("open", {});
  }

  function close() {
    if (destroyed || !isOpen || mode === "inline") return;
    if (panel) panel.classList.remove("cf-open");
    if (launcher) launcher.setAttribute("aria-expanded", "false");
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
        emit("complete", message);
        break;
      case "close":
        close();
        break;
    }
  });

  function setupTriggers() {
    if (openOn === "load") {
      open();
      return;
    }
    if (openOn === "exit-intent") {
      document.addEventListener("mouseout", function onOut(e) {
        if (e.clientY <= 0) {
          document.removeEventListener("mouseout", onOut);
          open();
        }
      });
      return;
    }
    if (openOn.indexOf("scroll:") === 0) {
      var pct = parseInt(openOn.slice(7), 10) || 50;
      window.addEventListener("scroll", function onScroll() {
        var scrolled =
          (window.scrollY / (document.body.scrollHeight - window.innerHeight || 1)) * 100;
        if (scrolled >= pct) {
          window.removeEventListener("scroll", onScroll);
          open();
        }
      });
    }
  }

  function destroy() {
    destroyed = true;
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (launcher && launcher.parentNode) launcher.parentNode.removeChild(launcher);
    frame = null;
    panel = null;
    launcher = null;
  }

  function mount() {
    if (mode === "inline") mountInline();
    else {
      mountOverlay();
      if (mode === "fullpage") open();
      else setupTriggers();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  var api = {
    slug: slug,
    open: open,
    close: close,
    toggle: toggle,
    prefill: prefill,
    destroy: destroy,
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
