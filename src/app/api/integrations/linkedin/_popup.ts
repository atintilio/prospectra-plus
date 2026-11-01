import { NextResponse } from 'next/server';

export type PopupResult = 'connected' | 'cancelled' | 'error';

const MESSAGES: Record<PopupResult, string> = {
  connected: 'Conta LinkedIn vinculada. Você já pode voltar ao Prospectra.',
  cancelled: 'Autorização cancelada no LinkedIn. Nada foi alterado.',
  error: 'Não foi possível concluir a conexão com o LinkedIn. Tente novamente.',
};

/** Texto dentro de <script>: JSON sem escapar o </script>. */
function jsonForScript(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Página mínima do popup de autorização: avisa a janela que abriu (o app) e
 * fecha. A mensagem vai por `postMessage` — o callback nunca devolve JSON
 * para quem está olhando a janela.
 */
export function popupPage(result: PopupResult, message?: string): NextResponse {
  const text = message ?? MESSAGES[result];
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conexão LinkedIn · Prospectra</title>
</head>
<body style="font:16px system-ui,sans-serif;margin:3rem;max-width:34rem">
<h1>Conexão LinkedIn</h1>
<p id="message"></p>
<p><a href="/linkedin">Voltar ao Prospectra</a></p>
<script>
(function () {
  var result = ${jsonForScript(result)};
  var message = ${jsonForScript(text)};
  var el = document.getElementById('message');
  if (el) el.textContent = message;
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'prospectra-linkedin-oidc', result: result }, window.location.origin);
      window.close();
    }
  } catch (err) {}
})();
</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
