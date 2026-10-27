# Commercial intelligence backend

`/inteligencia` exposes seller identity, seller-approved strategy and up to eight offers. Only leads owned by the signed-in seller in the active organization are selectable and accepted by the server action. Inactive accounts/organizations, disabled organization AI and do-not-contact leads are rejected. Managers must own the selected lead too; management privileges do not bypass this boundary.

## Runtime and cost

Uses the already configured OpenRouter endpoint, `OPENROUTER_API_KEY` and `AI_MODEL`. No extra provider, Python daemon, subscription login or package is installed. The model must be `openrouter/free` or end in `:free`; the default is `openrouter/free`. An unavailable provider, invalid JSON or ungrounded evidence fails closed. Provider responses and credentials are not logged. The browser never receives the key.

Each generation has a 25-second timeout, 700-token response cap and bounded input. Free model availability is controlled by the provider; this implementation does not claim guaranteed availability. A ChatGPT/Codex/Claude desktop subscription is not an API credential and is not used as one.

## Safety and review

This increment is deliberately a constrained planning adapter. The model chooses an approved offer, a question from a fixed list, an intent, a topic and exact evidence excerpts. Strict Zod validation rejects extra response fields, invalid offers and quotes missing from the selected source. The application assembles the draft from seller-approved offer text and known name/company fields. AI cannot supply free-form draft prose, prices, discounts, guarantees or arbitrary recipients. Seller-approved descriptions are used verbatim and require the seller's explicit approval checkbox, so the seller remains responsible for their accuracy. Strategy informs the plan selection, not unconstrained outbound text.

Every result requires human review. Any received reply forces structured handoff even if AI incorrectly classifies it as outreach. Deterministic opt-out phrases suppress the draft without contacting the inference provider. Saving a handoff atomically stops the selected lead's active enrollments and skips its pending actions, preserving completed actions and other leads. An explicit opt-out also sets do_not_contact. This preparation surface never emits a sent-message event or sends a message. Demo organizations cannot trigger real WhatsApp delivery; demo generation can call the inference provider when configured.

Commercial/strategy/negotiation/administration handoffs suggest Andre (`atintilio@argusprime.com.br`); growth/marketing/data suggest Moises (`mloro@argusprime.com.br`); technical, unexpected, opt-out, mixed or unknown issues suggest both. Recipients are hardcoded server-side and never model-provided. Handoffs are displayed and saved; no notification is sent.

## Persistence and remaining scope

The existing `leads.notes` text field receives a timestamped note containing approved seller context, offers, draft, evidence and handoff. Atomic PostgreSQL concatenation preserves concurrent note writes. The update repeats tenant/owner constraints and refuses appending when existing notes exceed 200,000 characters. No existing notes are overwritten. Notes may include exact short quotes selected from the reply, but no complete inbound transcript is copied. No fake message/event type is written. A failed save is explicitly reported beside the generated result.

There is no reusable seller-profile/offer table or dedicated draft/handoff lifecycle in the existing schema. Context remains in the form while open and is saved with each lead outcome; selecting the page again starts a new context. Durable multi-offer profiles, campaign approval and automatic execution of the approved flow, delivery, reply ingestion, notifications, voice and progressive follow-up remain separate work. This increment does not claim those integrations are connected.

The confirmed future follow-up is internal: after handoff, follow up with the **seller** over WhatsApp about the opportunity. Requests for assistance route to Andre/Moises as defined above. It must not become an automated two-day message to the lead. Timing, progressive follow-up, lifecycle pause/close rules, a dedicated durable handoff lifecycle and the approved outbound executor are not implemented by this draft planner; interruption of currently active cadences is implemented on handoff save.

## Provenance

Inspected the user-supplied `/Users/apple/Downloads/harvey-main.zip`, archive commit marker `f851026f876dad9ea665f2164b5ef73d01432349`, including `harvey/agents/writer.py`, `harvey/agents/handler.py`, and `LICENSE` (MIT, copyright 2026 Ethan Rogers). The design adapts the concepts of grounded personalized outreach, deterministic validation and human escalation. All TypeScript, prompts and UI were written fresh; no original Python code, assets or prompt blocks were copied. The original CLI subscription runtimes were not ported to SaaS.

Upstream MIT notice for reference:

```text
MIT License

Copyright (c) 2026 Ethan Rogers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
