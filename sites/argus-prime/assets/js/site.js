/* Argus Prime — interações do site (sem dependências além do three.js do olho). */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");
  var REDUZ = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ano */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- cabeçalho: some ao descer, volta ao subir ---------- */
  var header = document.querySelector(".site-header");
  var lastY = window.scrollY;
  function onHeader() {
    if (!header) return;
    var y = window.scrollY;
    if (y > 140 && y > lastY + 4) header.setAttribute("data-hidden", "true");
    else if (y < lastY - 4 || y < 140) header.setAttribute("data-hidden", "false");
    lastY = y;
  }
  window.addEventListener("scroll", onHeader, { passive: true });

  /* ---------- menu ---------- */
  var menu = document.getElementById("menu");
  var toggles = document.querySelectorAll("[data-menu-open]");
  var closers = document.querySelectorAll("[data-menu-close]");
  var lastFocus = null;
  function setMenu(open) {
    if (!menu) return;
    menu.setAttribute("data-open", open ? "true" : "false");
    menu.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    toggles.forEach(function (b) { b.setAttribute("aria-expanded", open ? "true" : "false"); });
    if (open) { lastFocus = document.activeElement; var f = menu.querySelector("a"); if (f) setTimeout(function () { f.focus(); }, 120); }
    else if (lastFocus) lastFocus.focus();
  }
  toggles.forEach(function (b) { b.addEventListener("click", function () { setMenu(true); }); });
  closers.forEach(function (b) { b.addEventListener("click", function () { setMenu(false); }); });
  if (menu) {
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.getAttribute("data-open") === "true") setMenu(false); });
  }

  /* ---------- títulos palavra a palavra ---------- */
  document.querySelectorAll(".split-words").forEach(function (el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement("span");
            s.className = "w"; s.textContent = part;
            s.style.transitionDelay = (0.08 + i++ * 0.07).toFixed(2) + "s";
            frag.appendChild(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    })(el);
  });

  /* ---------- revelações ---------- */
  var targets = document.querySelectorAll(".rv, .rv-mask, .split-words, [data-count]");
  if ("IntersectionObserver" in window && !REDUZ) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        if (e.target.hasAttribute("data-count")) countUp(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- números que contam ---------- */
  function fmt(v, dec) { return v.toFixed(dec).replace(".", ","); }
  function countUp(el) {
    var to = parseFloat(el.getAttribute("data-count"));
    var dec = parseInt(el.getAttribute("data-dec") || "0", 10);
    var pre = el.getAttribute("data-prefix") || "", suf = el.getAttribute("data-suffix") || "";
    var t0 = performance.now(), dur = 1600;
    function step(now) {
      var k = clamp((now - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + fmt(to * e, dec) + suf;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- efeitos ligados ao scroll ---------- */
  var steps = document.querySelector(".steps");
  var stepEls = steps ? steps.querySelectorAll(".step") : [];
  var photos = document.querySelectorAll("[data-parallax] img");
  var phCopy = document.querySelector(".page-hero .ph-copy");
  var ticking = false;
  function onScrollFx() {
    ticking = false;
    var vh = window.innerHeight;
    if (steps) {
      var r = steps.getBoundingClientRect();
      var prog = clamp((vh * 0.75 - r.top) / (r.height + vh * 0.25), 0, 1);
      steps.style.setProperty("--prog", prog.toFixed(3));
      stepEls.forEach(function (s, i) { s.classList.toggle("on", prog >= (i + 0.35) / stepEls.length); });
    }
    if (REDUZ) return;
    photos.forEach(function (img) {
      var r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var k = (r.top + r.height / 2 - vh / 2) / vh;
      img.style.transform = "translate3d(0," + (k * -6).toFixed(2) + "%,0)";
    });
    if (phCopy) {
      var y = window.scrollY;
      phCopy.style.transform = "translate3d(0," + (y * 0.18).toFixed(1) + "px,0)";
      phCopy.style.opacity = clamp(1 - y / (vh * 0.7), 0, 1).toFixed(3);
    }
  }
  function req() { if (!ticking) { ticking = true; requestAnimationFrame(onScrollFx); } }
  window.addEventListener("scroll", req, { passive: true });
  window.addEventListener("resize", req);
  onScrollFx();

  /* ---------- o olho ---------- */
  if (window.ArgusEye) {
    var cine = document.getElementById("cine");
    if (cine) {
      window.ArgusEye.stage({
        section: cine,
        canvas: cine.querySelector("[data-cine-canvas]"),
        card: cine.querySelector("[data-cine-card]"),
        copy: cine.querySelector("[data-cine-copy]"),
        cardDeco: cine.querySelectorAll("[data-cine-deco]"),
        dark: cine.querySelector("[data-cine-dark]"),
        cue: cine.querySelector(".cine-cue"),
        skip: cine.querySelector(".cine-skip"),
        rail: cine.querySelector(".cine-rail"),
        labels: cine.querySelector(".cine-labels"),
        steps: cine.querySelectorAll(".cine-step"),
        header: header
      });
    }
    document.querySelectorAll("[data-eye-mini]").forEach(function (box) { window.ArgusEye.mini(box); });
  } else {
    root.classList.add("no-webgl", "cine-off");
  }

  /* ---------- copiar e-mail ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = btn.getAttribute("data-copy"), label = btn.textContent;
      function ok() { btn.textContent = "Copiado"; setTimeout(function () { btn.textContent = label; }, 1600); }
      function fallback() {
        var target = document.querySelector(btn.getAttribute("data-copy-target") || "");
        if (target && window.getSelection) { var rg = document.createRange(); rg.selectNodeContents(target); var s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(val).then(ok, fallback);
      else fallback();
    });
  });

  /* ---------- formulário de contato (enviar.php) ---------- */
  var form = document.querySelector("form[data-form-contato]");
  if (form) {
    var status = form.querySelector("[data-form-status]");
    var params = new URLSearchParams(window.location.search);
    if (params.get("enviado") === "1" && status) status.textContent = "Mensagem recebida. Retornaremos pelo e-mail informado.";
    if (params.get("erro") === "1" && status) status.textContent = "Não foi possível enviar. Revise os campos ou escreva para contato@argusprime.com.br.";
    form.addEventListener("submit", function (e) {
      if (!window.fetch || !window.FormData) return;
      e.preventDefault();
      var botao = form.querySelector("button[type=submit]"), rotulo = botao.innerHTML;
      botao.disabled = true; botao.textContent = "Enviando…"; status.textContent = "";
      fetch(form.getAttribute("action"), { method: "POST", body: new FormData(form), headers: { "Accept": "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (d) {
          if (d && d.ok) { form.reset(); status.textContent = "Mensagem recebida. Retornaremos pelo e-mail informado."; }
          else status.textContent = (d && d.erro) ? d.erro : "Não foi possível enviar agora. Escreva para contato@argusprime.com.br.";
        })
        .catch(function () { status.textContent = "Não foi possível enviar agora. Verifique a conexão ou escreva para contato@argusprime.com.br."; })
        .then(function () { botao.disabled = false; botao.innerHTML = rotulo; status.focus(); });
    });
  }
})();
