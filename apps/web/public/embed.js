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
 * Attributes:
 *   data-form        (required) the form's slug
 *   data-mode        popup | side-tab | inline | fullpage        default popup
 *   data-target      CSS selector for inline mode                default appends
 *   data-height      inline height in px, or "auto"              default auto
 *   data-app         the Chatform origin                         default this script's origin
 *   data-color       launcher colour                             default #f97316
 *   data-label       launcher text                               default "Questions?"
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
  var label = script.getAttribute("data-label") || "Questions?";
  var theme = script.getAttribute("data-theme") || "auto";
  var openOn = script.getAttribute("data-open-on") || "click";
  var lazy = script.getAttribute("data-lazy") !== "false";
  var nonce = script.getAttribute("data-nonce");
  var target = script.getAttribute("data-target");
  var heightAttr = script.getAttribute("data-height") || "auto";

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

  function injectStyles() {
    if (document.getElementById("chatform-embed-styles")) return;
    var style = document.createElement("style");
    style.id = "chatform-embed-styles";
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = [
      ".cf-launcher{position:fixed;z-index:2147483000;bottom:20px;right:20px;display:flex;align-items:center;gap:8px;",
      "padding:12px 18px;border:0;border-radius:999px;color:#fff;font:500 15px/1 system-ui,sans-serif;cursor:pointer;",
      "box-shadow:0 6px 24px rgba(0,0,0,.18);transition:transform .15s ease}",
      ".cf-launcher:hover{transform:translateY(-1px)}",
      ".cf-panel{position:fixed;z-index:2147483001;border:0;border-radius:16px;background:#fff;",
      "box-shadow:0 12px 48px rgba(0,0,0,.22);display:none}",
      ".cf-panel.cf-open{display:block}",
      ".cf-popup{bottom:88px;right:20px;width:400px;height:600px;max-height:calc(100vh - 120px)}",
      ".cf-side-tab{top:0;right:0;width:440px;height:100vh;border-radius:0}",
      ".cf-fullpage{inset:0;width:100vw;height:100vh;border-radius:0}",
      "@media (max-width:520px){.cf-popup,.cf-side-tab{inset:0;width:100vw;height:100dvh;max-height:none;border-radius:0}}",
      "@media (prefers-reduced-motion:reduce){.cf-launcher{transition:none}}",
    ].join("");
    document.head.appendChild(style);
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

  function mountInline() {
    injectStyles();
    var host = target ? document.querySelector(target) : null;
    var container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = heightAttr === "auto" ? "620px" : heightAttr + "px";
    container.appendChild(buildFrame());
    if (host) host.appendChild(container);
    else if (script.parentNode) script.parentNode.insertBefore(container, script);
    panel = container;
    isOpen = true;
  }

  function mountOverlay() {
    injectStyles();
    panel = document.createElement("div");
    panel.className = "cf-panel cf-" + mode;
    if (!lazy) panel.appendChild(buildFrame());
    document.body.appendChild(panel);

    if (mode !== "fullpage") {
      launcher = document.createElement("button");
      launcher.type = "button";
      launcher.className = "cf-launcher";
      launcher.style.background = color;
      launcher.textContent = label;
      launcher.setAttribute("aria-haspopup", "dialog");
      launcher.setAttribute("aria-expanded", "false");
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
