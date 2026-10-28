/* Prospectra+ — widget de suporte embutível.
 * Uso no site do parceiro:
 *   <script src="https://prospectra.argusprime.com.br/support-widget.js" data-org="<ORG_ID>"></script>
 * A origem do site precisa estar liberada na operação (senão a API recusa com 403).
 * Envia mensagens para a inbox; mostrar a resposta do agente no widget vem no próximo incremento. */
(function () {
  var s = document.currentScript;
  var orgId = s && s.getAttribute('data-org');
  if (!orgId) { console.error('[Prospectra] data-org ausente no script do widget.'); return; }
  var api = (s.getAttribute('data-api') || new URL(s.src).origin).replace(/\/$/, '');
  var key = 'prospectra_support_' + orgId;
  var accent = s.getAttribute('data-accent') || '#155dfc';

  var css = '.pz-btn{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:' + accent + ';color:#fff;border:0;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:24px;z-index:2147483000}'
    + '.pz-panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:system-ui,Segoe UI,Arial,sans-serif}'
    + '.pz-panel.pz-open{display:flex}.pz-head{background:' + accent + ';color:#fff;padding:14px 16px;font-weight:600}'
    + '.pz-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f6f7f9}'
    + '.pz-m{max-width:80%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.35;white-space:pre-wrap;word-break:break-word}'
    + '.pz-me{align-self:flex-end;background:' + accent + ';color:#fff}.pz-them{align-self:flex-start;background:#e9ebef;color:#111}'
    + '.pz-sys{align-self:center;background:#e9ebef;color:#5c5f66;font-size:12px}'
    + '.pz-form{display:flex;gap:6px;padding:10px;border-top:1px solid #e5e7eb}.pz-in{flex:1;border:1px solid #d7dae0;border-radius:10px;padding:8px;font:inherit;resize:none}'
    + '.pz-send{background:' + accent + ';color:#fff;border:0;border-radius:10px;padding:0 14px;cursor:pointer;font-weight:600}.pz-send:disabled{opacity:.5;cursor:default}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button'); btn.className = 'pz-btn'; btn.setAttribute('aria-label', 'Abrir suporte'); btn.textContent = '💬';
  var panel = document.createElement('div'); panel.className = 'pz-panel';
  panel.innerHTML = '<div class="pz-head">Suporte</div><div class="pz-msgs"></div>'
    + '<form class="pz-form"><textarea class="pz-in" rows="1" placeholder="Escreva sua mensagem…" aria-label="Mensagem"></textarea><button class="pz-send" type="submit">Enviar</button></form>';
  document.body.appendChild(btn); document.body.appendChild(panel);

  var msgs = panel.querySelector('.pz-msgs'), form = panel.querySelector('.pz-form'), input = panel.querySelector('.pz-in'), send = panel.querySelector('.pz-send');
  function add(text, cls) { var d = document.createElement('div'); d.className = 'pz-m ' + cls; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; }
  function convId() { try { return localStorage.getItem(key) || undefined; } catch (e) { return undefined; } }
  function setConv(id) { try { localStorage.setItem(key, id); } catch (e) {} }

  var poll = null, lastCount = -1;
  function render(list) {
    msgs.innerHTML = ''; lastCount = list.length;
    if (!list.length) { add('Olá! Como podemos ajudar?', 'pz-sys'); return; }
    list.forEach(function (m) { add(m.body, m.author === 'agent' ? 'pz-them' : 'pz-me'); });
  }
  function refresh() {
    var id = convId(); if (!id) return;
    fetch(api + '/api/support/widget?orgId=' + encodeURIComponent(orgId) + '&conversationId=' + encodeURIComponent(id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.messages && d.messages.length !== lastCount) render(d.messages); })
      .catch(function () {});
  }
  function startPoll() { refresh(); if (!poll) poll = setInterval(refresh, 4000); }
  function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

  btn.addEventListener('click', function () {
    panel.classList.toggle('pz-open');
    if (panel.classList.contains('pz-open')) {
      if (convId()) startPoll(); else if (!msgs.childNodes.length) add('Olá! Como podemos ajudar?', 'pz-sys');
      input.focus();
    } else { stopPoll(); }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = input.value.trim(); if (!body) return;
    input.value = ''; send.disabled = true; add(body, 'pz-me');
    fetch(api + '/api/support/widget', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: orgId, conversationId: convId(), body: body }),
    }).then(function (r) {
      if (r.status === 403) { add('Suporte indisponível neste site.', 'pz-sys'); return null; }
      if (!r.ok) throw new Error('fail');
      return r.json();
    }).then(function (d) {
      if (d && d.conversationId) { setConv(d.conversationId); startPoll(); }
      else if (d !== null) add('Não foi possível enviar. Tente de novo.', 'pz-sys');
    }).catch(function () { add('Não foi possível enviar. Tente de novo.', 'pz-sys'); })
      .finally(function () { send.disabled = false; input.focus(); });
  });
})();
