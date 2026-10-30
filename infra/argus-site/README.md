# Site institucional Argus Prime na VPS (migração do Manus)

Serve `argusprime.com.br` a partir da **sua VPS** (`103.102.135.126`, 12 GB) com **Apache + PHP**,
mantendo o `.htaccess` funcionando igual ao Manus. Domínio continua gerenciado na **Hostinger**
(só muda o apontamento DNS). Deploy com **rollback** por troca de symlink (sem downtime).

## Visão geral
- `setup-vps.sh` — instala Apache + PHP e cria o VirtualHost (rodar uma vez).
- `deploy.sh` — publica uma versão a partir de um `.zip`, com rollback e histórico de releases.
- O site vai para `/var/www/argusprime.com.br_releases/<data>/`; a versão ativa é o symlink
  `/var/www/argusprime.com.br`.

## Pré-requisito
Acesso **SSH funcionando** à VPS (ainda pendente — ver a seção no fim). Tudo abaixo roda na VPS.

## Passo 1 — Preparar a VPS (uma vez)
Copie esta pasta e o zip do site para a VPS e rode o setup:

```bash
# do seu computador:
scp -P 9229 -r infra/argus-site root@103.102.135.126:/opt/argus-site
scp -P 9229 argus-prime-site_PUBLICAR.zip root@103.102.135.126:/opt/argus-site/

# na VPS:
cd /opt/argus-site
sudo bash setup-vps.sh
```

## Passo 2 — Publicar o site (com rollback)
```bash
sudo bash deploy.sh /opt/argus-site/argus-prime-site_PUBLICAR.zip
```
- Isso cria uma release datada e a ativa.
- Ver releases:   `sudo bash deploy.sh --list`
- Voltar atrás:   `sudo bash deploy.sh --rollback`  ← **o rollback que você pediu**

## Passo 3 — DNS na Hostinger
No hPanel da Hostinger → **Domínios → argusprime.com.br → Gerenciar registros DNS**:

| Tipo | Nome  | Aponta para        | TTL  |
|------|-------|--------------------|------|
| A    | `@`   | `103.102.135.126`  | 3600 |
| A    | `www` | `103.102.135.126`  | 3600 |

> Remova o registro A/CNAME antigo que aponta para o Manus. A propagação leva de minutos a
> algumas horas. Dá para testar antes da propagação editando o `/etc/hosts` da sua máquina.

## Passo 4 — HTTPS (depois que o DNS apontar para a VPS)
```bash
sudo apt-get install -y certbot python3-certbot-apache
sudo certbot --apache -d argusprime.com.br -d www.argusprime.com.br
```
O certbot instala o certificado e ativa a renovação automática. O `.htaccess` já força HTTPS.

## Passo 5 — Formulário de contato (PHP)
O `enviar.php` usa a função `mail()` do PHP. Numa VPS limpa isso exige um MTA local ou um relay SMTP,
senão os e-mails não saem. Opções:
- Simples: `sudo apt-get install -y msmtp msmtp-mta` e configurar um relay (ex.: SMTP do Office 365
  da Argus) como sendmail do sistema; ou
- Trocar o `enviar.php` para enviar via SMTP autenticado.
Me avise qual prefere que eu te passo a configuração exata.

## Reduzir dependência do Manus
Depois que o site estiver no ar pela VPS e o DNS apontando para cá, o Manus deixa de servir o site.
Mantenha o `.zip` de export do Manus guardado como backup histórico.

---

## ⚠️ Pendência: acesso SSH à VPS
Até agora o SSH à VPS não autenticou (`root` fechou a conexão; `debian` recusou). Antes do Passo 1,
descubra o método aceito:

```bash
ssh -p 9229 -v root@103.102.135.126 2>&1 | grep -i "authentications that can continue"
```
Se vier só `publickey`, o caminho é adicionar sua chave SSH (ou usar o console VNC/KVM do painel
vps1euro, ou reinstalar a imagem definindo senha/chave).
