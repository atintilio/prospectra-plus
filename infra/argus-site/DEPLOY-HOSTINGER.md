# Publicar o site Argus Prime na Hostinger (hPanel), com rollback

Fonte: `sites/argus-prime/` (HTML/CSS/JS estáticos + `enviar.php` + `.htaccess`).
As páginas são geradas por `infra/argus-site/build.py` (`python3 infra/argus-site/build.py sites/argus-prime`).

## 1. Backup (é o rollback)
hPanel → Sites → argusprime.com.br → **Gerenciador de Arquivos** → `public_html`:
selecione tudo → **Compactar** → baixe o `.zip`. Guarde-o: é a versão anterior.

## 2. Publicar
1. Ainda em `public_html`, apague o conteúdo antigo (o backup já está salvo).
2. **Enviar** `argus-prime-site.zip` → botão direito → **Extrair** em `public_html`.
3. Confirme que `index.html`, `.htaccess` e a pasta `assets/` ficaram direto em `public_html`
   (não dentro de uma subpasta).

## 3. Conferir
- `https://argusprime.com.br` abre o novo site; role a Home: o olho sai do card e a câmera entra na pupila.
- `/servicos`, `/cases`, `/contato` abrem sem `.html` (o `.htaccess` cuida disso).
- Envie um teste pelo formulário de Contato (vai para `contato@argusprime.com.br` via `mail()` do PHP).
- Se o domínio ainda apontar para o Manus: hPanel → Domínios → DNS, aponte o registro A/CNAME para a
  hospedagem da Hostinger. **Enquanto o DNS não muda, o site antigo segue no ar** (rollback natural).

## Voltar à versão anterior
Apague o conteúdo de `public_html`, envie o `.zip` do passo 1 e extraia. Versões deste site também
ficam no git (`sites/argus-prime/`): qualquer commit anterior pode ser empacotado e publicado igual.
