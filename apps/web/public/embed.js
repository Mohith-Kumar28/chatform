/**
 * chatform embed loader — <script src="https://app.chatform.dev/embed.js" data-form="slug"></script>
 * Opens the chat form in an iframe panel from a launcher.
 * Zero dependencies, ~2KB.
 *
 * data-mode="popup" (default) puts the launcher bottom-right; "side-tab" pins
 * it vertically to the right edge. The Share tab has offered both since it was
 * written and this file read no mode at all, so a side-tab snippet quietly
 * produced a popup.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-form");
  if (!slug) { console.error("[chatform] missing data-form attribute"); return; }
  var origin = new URL(script.src).origin;
  var API_ORIGIN = script.getAttribute("data-api") || "https://api.chatform.dev";
  var primary = script.getAttribute("data-color") || "#f97316";
  var label = script.getAttribute("data-label") || "Chat with us";
  var mode = script.getAttribute("data-mode") === "side-tab" ? "side-tab" : "popup";

  var css = [
    ".cf-launcher{position:fixed;bottom:20px;right:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;",
    "background:", primary, ";color:#fff;border:none;border-radius:999px;padding:12px 18px;font:600 14px/1 system-ui,sans-serif;",
    "cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);transition:transform .15s ease}",
    ".cf-launcher:hover{transform:scale(1.04)}",
    ".cf-panel{position:fixed;bottom:84px;right:20px;z-index:2147483000;width:400px;max-width:calc(100vw - 32px);",
    "height:600px;max-height:calc(100vh - 120px);border:none;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.22);",
    "opacity:0;pointer-events:none;transform:translateY(12px);transition:opacity .18s ease,transform .18s ease;background:#fff}",
    ".cf-panel.cf-open{opacity:1;pointer-events:auto;transform:translateY(0)}",
    "@media (max-width:480px){.cf-panel{width:calc(100vw - 24px);height:calc(100vh - 100px);bottom:80px;right:12px}}",
    // Side tab: same launcher, rotated onto the right edge and vertically
    // centred. On a narrow screen it falls back to the popup placement, where
    // a rotated tab would eat the viewport.
    ".cf-launcher.cf-side{bottom:auto;top:50%;right:0;transform:translateY(-50%) rotate(180deg);",
    "writing-mode:vertical-rl;border-radius:12px 0 0 12px;padding:18px 12px;box-shadow:-4px 0 16px rgba(0,0,0,.18)}",
    ".cf-launcher.cf-side:hover{transform:translateY(-50%) rotate(180deg) scale(1.04)}",
    ".cf-panel.cf-side{top:50%;bottom:auto;right:56px;transform:translateY(-50%) translateX(12px)}",
    ".cf-panel.cf-side.cf-open{transform:translateY(-50%) translateX(0)}",
    "@media (max-width:480px){.cf-launcher.cf-side{writing-mode:horizontal-tb;transform:none;top:auto;bottom:20px;",
    "right:20px;border-radius:999px;padding:12px 18px}.cf-launcher.cf-side:hover{transform:scale(1.04)}",
    ".cf-panel.cf-side{top:auto;bottom:80px;right:12px;transform:translateY(12px)}",
    ".cf-panel.cf-side.cf-open{transform:translateY(0)}}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var sideClass = mode === "side-tab" ? " cf-side" : "";

  var panel = document.createElement("iframe");
  panel.className = "cf-panel" + sideClass;
  panel.title = label;
  panel.allow = "clipboard-write";
  panel.src = origin + "/f/" + encodeURIComponent(slug) + "?embed=1&api=" + encodeURIComponent(API_ORIGIN);

  var launcher = document.createElement("button");
  launcher.className = "cf-launcher" + sideClass;
  launcher.type = "button";
  launcher.innerHTML = "&#128172; " + label;

  var open = false;
  launcher.addEventListener("click", function () {
    open = !open;
    panel.classList.toggle("cf-open", open);
    launcher.innerHTML = open ? "&#10005; Close" : "&#128172; " + label;
  });

  window.addEventListener("message", function (e) {
    if (e.origin !== origin) return;
    if (e.data === "chatform:close") {
      open = false;
      panel.classList.remove("cf-open");
      launcher.innerHTML = "&#128172; " + label;
    }
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(launcher);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
