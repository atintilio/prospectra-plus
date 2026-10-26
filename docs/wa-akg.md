# WhatsApp gateway: WA-AKG

Prospectra uses WA-AKG API, not the former standalone Baileys bridge. AKG itself uses Baileys internally. No CRM auth, login appearance, users or existing LinkedIn cadence is replaced.

## Architecture
Authenticated seller + active operation → Prospectra server action → private server-only AKG API key → deterministic session for operation/seller. Session data/credentials persist in AKG's database; app migrations only store outgoing command receipts, not WhatsApp credentials.
Demo cannot connect or send. API session IDs never come from form input. Polling is restricted to visible pairing screen and expires; disconnected status is not simulated.

## Prepare the gateway on the existing VPS
1. Review RAM/disk/backup. Do not install on the old pressured 1 GB Oracle VM. VPS France access is still needed; nothing here confirms it is installed.
2. Copy `infra/wa-akg`, and the user-provided WA-AKG-main.zip to a private staging directory. Run `python3 prepare.py /path/to/WA-AKG-main.zip ./source`. Source hash is fixed; an updated archive requires review. This preserves MIT license and applies three small compatibility/security corrections documented in `source/PROSPECTRA-PATCHES.md`.
3. Copy `.env.example` to `.env`, set strong secrets (for example `openssl rand -hex 32`), protect with chmod600. Use the existing VPS, no new subscription. Gateway uses a private local MariaDB because the reviewed schema and queries target MySQL; it does not replace the CRM's Postgres. Check RAM capacity before building. No automatic Supabase conversion.
4. Run `docker compose config --quiet`, then `docker compose up -d --build`. The upstream Docker build and runtime require validation on the target VPS; preparation is not a successful deployment.
5. Initial gateway dashboard is at VPS loopback 3101; access through an SSH tunnel. Create a dedicated service account/API key with required session permissions. Remove bootstrap password from environment after setup. Persist database/media volumes and protect backups.
6. Use the existing reverse proxy and domain/TLS for the API; do not expose port3101 or database publicly. A subdomain should forward `/api/` only to loopback3101; dashboard can remain tunnel-only. Configure firewall/reverse proxy explicitly on actual infra.
7. Configure Vercel server vars `WA_AKG_BASE_URL=https://your-gateway-host` (without `/api`) and `WA_AKG_API_KEY=...`, then redeploy. Neither variable has NEXT_PUBLIC prefix. Do not paste keys into chat or repository.

## Operator flow
Open WhatsApp in the left navigation. Click Conectar WhatsApp, scan QR in WhatsApp → Dispositivos conectados → Conectar dispositivo. Connected is shown only with live instance and authenticated account data. Desvincular logs out and stops the instance; another number can pair afterward. If gateway unreachable/config missing, UI states it honestly.
The page allows one explicitly submitted text per command; command receipt prevents blind retries after timeout. `sent` means the gateway returned a message ID, not delivered/read by recipient. No new WhatsApp campaign automation is activated by this change. Incoming inbox/webhooks and durable multi-channel campaign delivery remain a separate increment; existing LinkedIn assisted queue stays intact.

## Cutover gate
Keep old bridge backed up and stopped only after new session pairs, a real authorized test message returns an ID and logout/re-pair work. Existing Baileys auth files are not copied to AKG blindly. Session provisioning/QR with mocked HTTP is a contract test, not real WhatsApp validation.

## Current validation record
Fill real commit, test output and deployment below when executed. Do not mark VPS deployed until Docker is healthy and a number has paired. No gateway URL/key was supplied when this integration was requested.

### Reconciling uncertain commands
An interrupted send remains pending/unknown and is never automatically retried. Before preparing a new message, the seller checks the connected phone conversation. A database operator may read receipts scoped to the authenticated seller/org (`id`, `state`, `provider_message_id`, `created_at` in `whatsapp_commands`); payload text and phone are intentionally not stored there. There is no reconciliation UI yet. Do not delete a receipt to force a retry or treat it as delivered/read.
