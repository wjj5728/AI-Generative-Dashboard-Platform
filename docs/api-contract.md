# Backend API Contract

All endpoints return a unified JSON envelope:

- Success: `{ "ok": true, "data": { ... } }`
- Error: `{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }`

## Status Code Semantics

| HTTP Status | Meaning |
| --- | --- |
| `200` / `201` | Success |
| `400` | Invalid request parameters or body |
| `401` | Unauthenticated |
| `403` | Insufficient role or non-owner access |
| `404` | Dashboard or revision not found |
| `409` | Optimistic lock conflict (`REVISION_CONFLICT`) |
| `422` | `PageDocument` failed 14-point schema validation (`SCHEMA_VALIDATION_FAILED`) |
| `500` | Unexpected server error |

## Endpoints

### Dashboards & Versioning

- `GET /api/dashboards` — List dashboards ordered by `updatedAt` desc.
- `POST /api/dashboards` — Validate and persist a new `PageDocument` as Revision `1`. Ignores client-supplied `ownerId`.
- `GET /api/dashboards/:id` — Load dashboard metadata and current `PageDocument` from SQLite (**never calls LLM**).
- `PUT /api/dashboards/:id` — Save a new immutable revision. Requires `{ baseRevision, pageDocument, changeDescription? }`; returns `409` if `baseRevision !== currentRevision`.
- `DELETE /api/dashboards/:id` — Delete dashboard and cascade revisions.
- `POST /api/dashboards/:id/publish` — Set `status = "published"` and `publishedRevision = currentRevision`.
- `GET /api/dashboards/:id/revisions` — List immutable revision history.
- `GET /api/dashboards/:id/revisions/:revision` — Fetch a specific historical revision snapshot.
- `POST /api/dashboards/:id/rollback` — Create a new immutable revision copying `targetRevision` (requires `baseRevision` optimistic lock).

### AI Generation & Editing

- `POST /api/dashboards/generate` — Generate a validated candidate `PageDocument` from `{ prompt, scenario? }`.
- `POST /api/dashboards/generate-stream` — Stream dashboard generation over **SSE (`text/event-stream`)** emitting `stage`, `meta`, progressive RFC 6902 `patch` (SpecStream), `complete`, and `error` events. Supports optional `streamDelayMs` pacing and client abort.
- `POST /api/dashboards/:id/ai-edit` — Apply natural language edit `{ instruction, currentDocument? }` and return `{ candidateDocument, patches, changeSummary, validation }` without auto-saving.

### Catalogs & Data Engine

- `GET /api/catalog/components` — Public Component Catalog metadata + versions.
- `GET /api/catalog/datasources` — Public DataSource Catalog metadata filtered by current user's roles (handlers are never exposed).
- `POST /api/data/query-batch` — Execute a batch of semantic queries independently (`results[key]` is either `{ status: "success", data }` or `{ status: "error", error }`).
- `GET /api/health` — Server health & active AI provider check.
