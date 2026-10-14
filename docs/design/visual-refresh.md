# Prospectra visual refresh

The supplied `architecture.md`, `recon.md`, and `schema.sql` describe a separate, proposed application. This increment applies only the visual language to the existing Prospectra+: white surfaces, blue accent, dark text, clear focus and compact B2B panels. It retains the current React/Vite app, routes, session contract, storage and integrations.

The user-provided LeadFlow kit is a marketing website, so its assets and code are not copied into the authenticated product. The existing Prospectra trail symbol was recolored in blue. The dashboard, CRM, campaigns, login, integration settings and mobile navigation use the same color roles.

| Component | Main states | Accessibility |
| --- | --- | --- |
| Navigation item | default, hover, selected, focus | real button; blue selection and visible focus ring |
| Primary/secondary action | default, hover, disabled, focus | text contrast on dark blue; disabled does not imply success |
| Panel/KPI card | default, empty, loading via existing components | dark text on white; status communicated with words |
| Form field | default, focus, invalid via existing flow | label retained; 3px focus ring |
| LinkedIn connection | disconnected, pending configuration, connected, failure | existing backend-derived status; connect, switch and unlink preserved |

The attached PostgreSQL schema and proposed services are **not migrations** for the current production storage. The recon's additional screens (search credits, inbox and day queue) still require backend implementation and verification before being exposed as operating features.
