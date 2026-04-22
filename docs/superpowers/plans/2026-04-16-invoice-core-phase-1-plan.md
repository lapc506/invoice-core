# invoice-core Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build invoice-core v0.1 MVP — a TypeScript hexagonal library that exposes gRPC (`:50061`) + REST (`:8766`) for Costa Rica electronic invoicing v4.4 (all 7 document types via `HaciendaCRAdapter` wrapping `@dojocoding/hacienda-sdk`), Mensaje Receptor end-to-end, inbound gateway + reconciliation scaffold, Redis queue with retry + circuit breaker, PostgreSQL persistence, CertificateVault (Vault + sealed-secrets + local FS), XAdES-EPES SignatureVerifier, full observability, dual deployment (sidecar + standalone), Dockerfile + docker-compose + Helm chart + Zensical/MyST docs scaffold.

**Architecture:** Hexagonal (Explicit Architecture). Primary adapters: gRPC (`:50061`) + REST (`:8766` standalone only). Application layer with 17 ports (5 fully wired in Fase 1, 12 interface-only for Fases 2-6). Pure domain with discriminated-union `Document` + `Taxpayer` + `DocumentSequence` + `Dispute` + value objects. Secondary adapters: `hacienda-cr` SDK, PostgreSQL (Drizzle), Redis (BullMQ), Vault/sealed-secrets, OTel, pino, Prometheus.

**Tech Stack:** TypeScript 5.6 strict · Node 22 LTS · pnpm 9 · Vitest 2 · `@grpc/grpc-js` · buf codegen · PostgreSQL 16 · Redis 7 · Drizzle ORM · Fastify 5 · OpenTelemetry SDK · prom-client · pino · zod · `@dojocoding/hacienda-sdk` (CR v4.4 TaxAuthorityPort) · BullMQ (Redis queue) · opossum (circuit breaker) · xadesjs (signature verification).

---

## Source spec

`/home/kvttvrsis/Documentos/GitHub/invoice-core/docs/superpowers/specs/2026-04-16-invoice-core-design.md` — sections §§3-6, §9 (capability matrix Fase 1 rows), §11 (observability), §12 (security), §14 (Fase 1 roadmap) govern this plan.

**Out of scope for Fase 1** (deferred to Fases 2-7):
- P1: DonationReceipt full flow, DonationAuthorizationPort adapter, AppraisalPort, CustomsDataPort ATENA wiring, FilingDataExportPort real aggregators, IssueExportInvoice (tipo 09) polish.
- P2: Complemento Retenciones MX (`PACMexicoAdapter`), multi-tenant `.p12` per taxpayer, OCRPort.
- P3: DIAN CO (`DIANColombiaAdapter`), event-driven emission.
- P4: CFDI 4.0 completo, DIAN UBL completo.

These appear in Fase 1 only as **port interfaces** and **proto stubs returning `UNIMPLEMENTED`** so that later phases can land adapters without breaking changes.

---

## File Structure (Fase 1)

Every file created or modified in Fase 1. Paths relative to repo root `/home/kvttvrsis/Documentos/GitHub/invoice-core/`.

### Root tooling (10 files)

- `package.json` — pnpm workspace root, scripts (`build`, `test`, `lint`, `proto:gen`, `migrate`).
- `pnpm-workspace.yaml` — declares `packages/*`.
- `tsconfig.base.json` — strict TS config inherited by every package.
- `biome.json` — linter + formatter config.
- `vitest.config.ts` — root test config with coverage thresholds (domain ≥ 95%).
- `vitest.setup.ts` — fake-clock helper, deterministic UUID seed.
- `.gitignore` — `node_modules`, `dist`, `coverage`, `.env*`, `*.tsbuildinfo`, `.turbo`, `.pnpm-store`.
- `.env.example` — documented env vars (no secrets).
- `.nvmrc` — `22.11.0`.
- `.github/workflows/ci.yml` — CI matrix (lint, typecheck, test, proto-lint, build, docker-smoke, helm-lint).

### Proto (10 files)

- `proto/invoice_core/v1/common.proto` — shared types (`UUID`, `ISODateTime`, `ISODate`, `Money`, `Decimal`, `TaxId`, `CABYS`, `Jurisdiction`, `PIIString`).
- `proto/invoice_core/v1/document.proto` — Document + all subtypes (Invoice, Ticket, CreditNote, DebitNote, PurchaseInvoice, ExportInvoice, ReceiverMessage, DonationReceipt, WithholdingCertificate) + LineItem + TaxBreakdown.
- `proto/invoice_core/v1/admin.proto` — `InvoiceAdmin` service (11 RPCs).
- `proto/invoice_core/v1/inbox.proto` — `InvoiceInbox` service (4 RPCs).
- `proto/invoice_core/v1/reporting.proto` — `InvoiceReporting` service (4 RPCs, Fase 1 returns UNIMPLEMENTED for D-101/D-104/D-103, donations stub).
- `proto/invoice_core/v1/health.proto` — `InvoiceHealth` service (3 RPCs).
- `proto/buf.yaml` — buf lint + breaking config.
- `proto/buf.gen.yaml` — codegen wiring to `packages/proto`.
- `packages/proto/package.json` — consumes generated TS.
- `packages/proto/tsconfig.json`.

### Domain layer — `packages/core/src/domain/` (31 files)

Value objects:

- `value-objects/uuid.ts`
- `value-objects/iso-datetime.ts`
- `value-objects/iso-date.ts`
- `value-objects/decimal.ts` — bigint+scale, currency-safe.
- `value-objects/money.ts` — `Decimal` + ISO 4217 currency.
- `value-objects/tax-id.ts` — CR cédula física/jurídica/DIMEX/NITE + MX RFC + CO NIT.
- `value-objects/cabys.ts` — 13-digit CABYS code with check.
- `value-objects/gtin.ts` — GTIN-8/12/13/14 with mod10 check.
- `value-objects/jurisdiction.ts`
- `value-objects/country-code.ts` — ISO 3166-1 alpha-2.
- `value-objects/unit-code.ts` — Hacienda CR unit catalog.
- `value-objects/pii-string.ts` — redacts by default.
- `value-objects/clave-numerica.ts` — 50-digit CR key.

Entities:

- `entities/taxpayer.ts`
- `entities/foreign-receiver.ts`
- `entities/document-sequence.ts`
- `entities/dispute.ts`
- `entities/document-base.ts` — abstract base for discriminated union.
- `entities/invoice.ts` — type `INVOICE_CR`.
- `entities/ticket.ts` — type `TICKET_CR`.
- `entities/credit-note.ts` — type `CREDIT_NOTE_CR`.
- `entities/debit-note.ts` — type `DEBIT_NOTE_CR`.
- `entities/purchase-invoice.ts` — type `PURCHASE_INVOICE_CR` (08).
- `entities/export-invoice.ts` — type `EXPORT_INVOICE_CR` (09, skeleton).
- `entities/receiver-message.ts` — type `RECEIVER_MESSAGE_CR`.
- `entities/donation-receipt.ts` — type `DONATION_RECEIPT_CR` (skeleton, full flow in Fase 2).
- `entities/withholding-certificate.ts` — types `WITHHOLDING_MX` + `WITHHOLDING_CO` (skeleton).
- `entities/line-item.ts` — with optional `customsData` + `traceabilityRef`.
- `entities/tax-line.ts`
- `entities/tax-breakdown.ts`

Services, events, errors, barrel:

- `services/state-machine.ts` — Document state transitions.
- `services/totals-calculator.ts` — IVA + retenciones + grand total.
- `services/clave-builder.ts` — CR 50-digit key composition.
- `events/document-issued.ts`
- `events/document-accepted.ts`
- `events/document-rejected.ts`
- `events/document-cancelled.ts`
- `events/inbound-received.ts`
- `events/inbound-validated.ts`
- `events/receiver-message-submitted.ts`
- `events/reconciliation-completed.ts`
- `events/authority-unavailable.ts`
- `errors.ts` — typed errors (`InvalidDocumentStateTransition`, `InvalidCabys`, `InvalidClaveNumerica`, `TaxpayerNotFound`, `CertificateExpired`, `SignatureInvalid`, `AuthorityTimeout`, `CircuitBreakerOpen`).
- `index.ts` — public re-exports.

### Application layer — `packages/core/src/app/` (30 files)

Ports (17):

- `ports/document-repository-port.ts`
- `ports/sequence-repository-port.ts`
- `ports/cabys-repository-port.ts`
- `ports/taxpayer-repository-port.ts`
- `ports/certificate-vault-port.ts`
- `ports/tax-authority-port.ts`
- `ports/donation-authorization-port.ts` — stub (Fase 2).
- `ports/filing-data-export-port.ts` — stub (Fase 3).
- `ports/inbound-document-gateway-port.ts`
- `ports/signature-verifier-port.ts`
- `ports/reconciliation-port.ts`
- `ports/ocr-port.ts` — stub (P2).
- `ports/appraisal-port.ts` — stub (Fase 2).
- `ports/customs-data-port.ts` — stub (Fase 3).
- `ports/accounting-sink-port.ts` — stub.
- `ports/event-bus-port.ts`
- `ports/observability-port.ts`
- `ports/clock-port.ts` — infrastructure.
- `ports/idempotency-port.ts` — infrastructure.
- `ports/queue-port.ts` — infrastructure.

Commands (11):

- `commands/issue-invoice.ts`
- `commands/issue-ticket.ts`
- `commands/issue-credit-note.ts`
- `commands/issue-debit-note.ts`
- `commands/issue-purchase-invoice.ts`
- `commands/issue-export-invoice.ts`
- `commands/issue-donation-receipt.ts` — stub returning `UNIMPLEMENTED` (Fase 2).
- `commands/issue-withholding-certificate.ts` — stub (Fase 5/6).
- `commands/respond-to-receiver-message.ts`
- `commands/cancel-document.ts`
- `commands/reconcile-inbound.ts`

Queries (5):

- `queries/get-document-status.ts`
- `queries/list-documents.ts`
- `queries/check-authority-health.ts`
- `queries/get-queue-depth.ts`
- `queries/get-circuit-breaker-state.ts`

Middleware + composition:

- `middleware/tracing.ts`
- `middleware/auth.ts`
- `middleware/idempotency.ts`
- `middleware/metrics.ts`
- `middleware/pii-redaction.ts`
- `index.ts`

### Adapters — secondary (45 files)

`packages/adapter-hacienda-cr/src/` (wraps `@dojocoding/hacienda-sdk`):

- `index.ts`
- `hacienda-cr-adapter.ts` — `TaxAuthorityPort` implementation.
- `builders/invoice-builder.ts` — maps domain `Invoice` → SDK `FacturaBuilder`.
- `builders/ticket-builder.ts`
- `builders/credit-note-builder.ts`
- `builders/debit-note-builder.ts`
- `builders/purchase-invoice-builder.ts` — tipo 08.
- `builders/export-invoice-builder.ts` — tipo 09 skeleton.
- `builders/receiver-message-builder.ts`
- `signer.ts` — wraps SDK XAdES-EPES signing with `CertificateVault`.
- `submitter.ts` — wraps SDK API client with retry + circuit breaker hooks.
- `status-poller.ts` — polls acknowledgment with backoff.
- `errors.ts` — maps SDK errors to domain errors.
- `metrics.ts` — `invoice_authority_*` Prometheus counters/histograms.
- `__fixtures__/sample-p12.pem` — dev-only fake cert.
- `__fixtures__/sample-acceptance.xml`

`packages/adapter-postgres/src/`:

- `schema/documents.ts`
- `schema/document-sequences.ts`
- `schema/cabys.ts`
- `schema/taxpayers.ts`
- `schema/inbound-documents.ts`
- `schema/disputes.ts`
- `schema/idempotency.ts`
- `schema/outbox.ts`
- `schema/index.ts`
- `repositories/document-repository.ts`
- `repositories/sequence-repository.ts` — advisory-lock per (taxpayer, branch, terminal, docType).
- `repositories/cabys-repository.ts`
- `repositories/taxpayer-repository.ts`
- `repositories/inbound-repository.ts`
- `cabys-csv-ingester.ts` — parses Hacienda CABYS CSV feed.
- `migrations/0001_init.sql`
- `drizzle.config.ts`

`packages/adapter-vault/src/`:

- `local-fs-vault.ts` — dev mode: reads `.p12` + password from filesystem.
- `vault-credential-vault.ts` — Vault KV v2.
- `sealed-secrets-loader.ts` — K8s sealed-secrets via projected volume.
- `certificate-expiry-monitor.ts` — emits `CertificateVault.ExpiringSoon` events.

`packages/adapter-queue/src/` (BullMQ + opossum):

- `bullmq-queue.ts` — enqueue + worker.
- `submission-worker.ts` — consumes submission jobs, calls `TaxAuthorityPort`.
- `status-poll-worker.ts` — polls status after submission.
- `circuit-breaker.ts` — opossum wrapper per authority.
- `retry-policy.ts` — exponential backoff + jitter.

`packages/adapter-signature/src/`:

- `xades-epes-verifier.ts` — `SignatureVerifier` for CR XAdES-EPES v1.3.2.
- `xades-policy-check.ts` — validates policy hash `Ohixl6upD6av8N7pEvDABhEL6hM=`.
- `__fixtures__/valid-signed.xml`
- `__fixtures__/tampered-signed.xml`

`packages/adapter-inbound/src/`:

- `hacienda-webhook-route.ts` — Fastify route registered by REST layer.
- `hacienda-polling-worker.ts` — polls Hacienda inbound endpoint.
- `inbound-parser.ts` — XML → domain `ReceiverMessage` source doc.

`packages/adapter-otel/src/`:

- `tracer.ts` — OTel SDK bootstrap.
- `metrics.ts` — Prometheus exporter + histograms.
- `logger.ts` — pino with PII redact paths.

### Primary adapters / server — `packages/server/src/` (25 files)

- `grpc/server.ts` — gRPC server bootstrap (`:50061`).
- `grpc/interceptors/tracing.ts`
- `grpc/interceptors/auth.ts`
- `grpc/interceptors/redaction.ts`
- `grpc/interceptors/metrics.ts`
- `grpc/services/admin.ts` — `InvoiceAdmin` (11 RPCs).
- `grpc/services/inbox.ts` — `InvoiceInbox` (4 RPCs).
- `grpc/services/reporting.ts` — `InvoiceReporting` (stubs).
- `grpc/services/health.ts` — `InvoiceHealth`.
- `rest/fastify-app.ts` — Fastify 5 app (`:8766` standalone).
- `rest/routes/admin.ts`
- `rest/routes/inbox.ts`
- `rest/routes/webhook-hacienda.ts`
- `rest/routes/health.ts`
- `rest/openapi.yaml`
- `composition/wire.ts` — DI composition root.
- `composition/config.ts` — zod-validated env.
- `composition/mode.ts` — sidecar vs standalone toggle.
- `bin/standalone.ts` — standalone entry (gRPC + REST both exposed).
- `bin/sidecar.ts` — K8s sidecar entry (gRPC only, loopback).
- `bin/migrate.ts` — runs Drizzle migrations + CABYS CSV ingest.
- `workers/submission.ts` — spawns `SubmissionWorker`.
- `workers/status-poll.ts`
- `workers/inbound-polling.ts`
- `workers/certificate-expiry.ts`

### Deployment (8 files)

- `Dockerfile` — multi-stage (builder + runner, non-root, healthcheck).
- `.dockerignore`
- `docker-compose.yml` — invoice-core + postgres + redis + vault + otel-collector + prometheus + grafana.
- `docker-compose.dev.yml` — dev overrides.
- `helm/invoice-core/Chart.yaml`
- `helm/invoice-core/values.yaml`
- `helm/invoice-core/templates/deployment.yaml`
- `helm/invoice-core/templates/service.yaml`
- `helm/invoice-core/templates/configmap.yaml`
- `helm/invoice-core/templates/sealed-secret.yaml`
- `helm/invoice-core/templates/servicemonitor.yaml`

### Docs (9 files)

- `docs/index.md` — Zensical landing.
- `docs/getting-started.md`
- `docs/architecture.md`
- `docs/api-reference/grpc.md`
- `docs/api-reference/rest.md`
- `docs/adapters/hacienda-cr.md`
- `docs/operations/deployment.md`
- `docs/operations/observability.md`
- `mkdocs.yml` — Zensical + MyST config.

### Scripts (3 files)

- `scripts/create-github-issues.sh` — bulk issue creation (Appendix A).
- `scripts/create-github-labels.sh` — label taxonomy (Appendix B).
- `scripts/dev-bootstrap.sh` — spin up compose, seed vault, run migrations, ingest CABYS sample.

**Total Fase 1 files created/modified: ~185.**

---

## Global conventions

- **Conventional Commits**: `feat(scope): ...`, `test(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `fix(scope): ...`, `ci(scope): ...`. Scopes: `proto`, `domain`, `app`, `hacienda-cr`, `postgres`, `vault`, `queue`, `signature`, `inbound`, `otel`, `grpc`, `rest`, `docker`, `helm`, `docs`, `ci`, `scaffold`.
- **Security rule (PII)**: `TaxId`, `Taxpayer.name`, `LineItem.description` (when it contains client data), `ForeignReceiver` — logged only through `PIIString` + pino redact paths. Error messages use the document UUID, never the raw cédula.
- **Security rule (credentials)**: `.p12` + password flow only through `CertificateVault`. Never read `HACIENDA_P12_PATH` in code paths that are not the Vault adapter. Tests use the `LocalFsVault` in tmp dirs.
- **TDD**: every task writes a failing test first, then implementation, then refactor. `pnpm test --filter <package>` must be green before `git commit`.
- **GitHub issue per task**: after the implementation + commit steps, run `gh issue create` with title `[Fase 1] Task N — <title>` and labels `phase/1` + scope. Issues retroactively track completion; the plan is the source of truth for what work exists.
- **Port numbers** (from spec §3.3): gRPC `:50061`, REST `:8766`, Prometheus `:9465`. Distinct from `agentic-core` (`:50051`/`:8765`/`:9464`) and `compliance-core` (`:50071`/`:8767`/`:9466`) to allow multi-sidecar.

---

## Task 1 — pnpm workspace scaffold

**Files:** `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitignore`, `.env.example`, `tsconfig.base.json`.

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "invoice-core",
  "private": true,
  "version": "0.1.0-dev",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22.11.0" },
  "scripts": {
    "build": "pnpm -r --filter './packages/*' build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "proto:gen": "buf generate --template proto/buf.gen.yaml proto",
    "proto:lint": "buf lint proto",
    "typecheck": "pnpm -r --filter './packages/*' typecheck",
    "migrate": "node packages/server/dist/bin/migrate.js"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "@bufbuild/buf": "1.47.2",
    "typescript": "5.6.3",
    "vitest": "2.1.4",
    "@vitest/coverage-v8": "2.1.4"
  }
}
```

- [ ] **Step 3: Write `.nvmrc`**

```
22.11.0
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
coverage
.env
.env.*
!.env.example
*.tsbuildinfo
.turbo
.pnpm-store
*.p12
```

- [ ] **Step 5: Write `.env.example`**

```
# Postgres
DATABASE_URL=postgres://invoice:invoice@localhost:5432/invoice_core

# Redis
REDIS_URL=redis://localhost:6379

# Vault
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=dev-root-token
VAULT_MOUNT=secret
VAULT_CERT_PATH=invoice-core/certificates

# Hacienda CR
HACIENDA_ENV=sandbox                # sandbox | production
HACIENDA_CLIENT_ID=api-stag
HACIENDA_IDP_REALM=rut-stag

# Transport
GRPC_PORT=50061
REST_PORT=8766
METRICS_PORT=9465
DEPLOYMENT_MODE=standalone          # standalone | sidecar

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
LOG_LEVEL=info

# Webhook
WEBHOOK_HMAC_SECRET_PATH=invoice-core/webhook-secrets
```

- [ ] **Step 6: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "lib": ["ES2023"],
    "types": ["node"]
  }
}
```

- [ ] **Step 7: Install**

Run: `pnpm install`
Expected: `Lockfile created`, no peer-dep errors.

- [ ] **Step 8: Verify Node version**

Run: `node --version`
Expected: `v22.11.0` (matches `.nvmrc`).

- [ ] **Step 9: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml .nvmrc .gitignore .env.example tsconfig.base.json
git commit -m "chore(scaffold): pnpm workspace + strict tsconfig + env template"
```

- [ ] **Step 10: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 1 — pnpm workspace scaffold" \
  --label "phase/1,scope/scaffold,type/chore" \
  --body "Initialize pnpm monorepo with packages/* layout, strict tsconfig base, Node 22 LTS pin, env template."
```

---

## Task 2 — Biome lint + format config

**Files:** `biome.json`.

- [ ] **Step 1: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error", "noConsoleLog": "error" },
      "style": { "useConst": "error", "noNonNullAssertion": "error" },
      "complexity": { "noForEach": "off" }
    }
  },
  "files": {
    "ignore": ["**/dist", "**/coverage", "**/generated", "**/*.sql", "**/__fixtures__/**"]
  }
}
```

- [ ] **Step 2: Add packages keeper**

Create empty file `packages/.gitkeep` so `pnpm install` does not complain about missing workspaces.

- [ ] **Step 3: Run lint on empty tree**

Run: `pnpm lint`
Expected: `Checked N files` where N is the small number of root config files; 0 errors.

- [ ] **Step 4: Commit**

```bash
git add biome.json packages/.gitkeep
git commit -m "chore(ci): add Biome linter + formatter config"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 2 — Biome lint + format" \
  --label "phase/1,scope/ci,type/chore" \
  --body "Biome config with strict rules (no any, no console, no non-null assertion)."
```

---

## Task 3 — Vitest root config + coverage thresholds

**Files:** `vitest.config.ts`, `vitest.setup.ts`.

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["packages/**/*.{test,spec}.ts"],
    exclude: ["**/dist/**", "**/generated/**", "**/*.integration.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        "packages/core/src/domain/**": {
          lines: 95,
          functions: 95,
          statements: 95,
          branches: 90,
        },
        "packages/core/src/app/**": {
          lines: 85,
          functions: 85,
          statements: 85,
          branches: 80,
        },
      },
      exclude: ["**/generated/**", "**/*.test.ts", "**/*.spec.ts", "**/__fixtures__/**"],
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

- [ ] **Step 2: Write `vitest.setup.ts`**

```ts
import { afterEach, vi } from "vitest";

/**
 * Opt-in fake clock helper. Tests that need determinism call `useFixedClock("2026-04-16T12:00:00Z")`.
 */
export function useFixedClock(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});
```

- [ ] **Step 3: Smoke test**

Create `packages/.smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest boots", () => {
  expect(1 + 1).toBe(2);
});
```

Run: `pnpm test`
Expected: `1 passed`.

- [ ] **Step 4: Delete smoke test**

```bash
rm packages/.smoke.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts vitest.setup.ts
git commit -m "chore(ci): add Vitest config with coverage thresholds"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 3 — Vitest + coverage" \
  --label "phase/1,scope/ci,type/chore" \
  --body "Root Vitest config enforcing >=95% domain coverage."
```

---

## Task 4 — GitHub Actions CI workflow

**Files:** `.github/workflows/ci.yml`.

- [ ] **Step 1: Write workflow**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.11.0, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.11.0, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm proto:gen
      - run: pnpm typecheck
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.11.0, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm proto:gen
      - run: pnpm test -- --coverage
  proto-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: bufbuild/buf-setup-action@v1
      - run: buf lint proto
      - run: buf breaking proto --against '.git#branch=main,subdir=proto'
  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.11.0, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm proto:gen
      - run: pnpm build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint/typecheck/test/proto/build matrix"
```

- [ ] **Step 3: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 4 — CI workflow" \
  --label "phase/1,scope/ci,type/chore" \
  --body "Matrix CI: lint, typecheck, test+coverage, buf lint+breaking, build."
```

---

## Task 5 — GitHub labels taxonomy

**Files:** `scripts/create-github-labels.sh`.

- [ ] **Step 1: Write script**

```bash
#!/usr/bin/env bash
# Bootstrap GitHub label taxonomy for lapc506/invoice-core.
# Idempotent: re-running updates existing labels via --force.
set -euo pipefail

REPO="${REPO:-lapc506/invoice-core}"

label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" --force
}

# Phase
label "phase/1" "0e8a16" "Fase 1 — v0.1 MVP (CR full)"
label "phase/2" "c2e0c6" "Fase 2 — v0.2 AltruPets donations"
label "phase/3" "c5def5" "Fase 3 — v0.3 AduaNext inbound+customs"
label "phase/4" "bfd4f2" "Fase 4 — v0.4 Vertivolatam export"
label "phase/5" "d4c5f9" "Fase 5 — v0.5 HabitaNexus MX"
label "phase/6" "f9d0c4" "Fase 6 — v0.6 HabitaNexus CO"

# Scope
for s in scaffold proto domain app hacienda-cr postgres vault queue signature inbound otel grpc rest docker helm docs ci; do
  label "scope/$s" "ededed" "Touches $s module"
done

# Type
label "type/feat"      "1d76db" "New feature"
label "type/fix"       "d73a4a" "Bug fix"
label "type/chore"     "cccccc" "Chore / tooling"
label "type/docs"      "0075ca" "Documentation"
label "type/test"      "bfe5bf" "Tests only"
label "type/refactor"  "fbca04" "Refactor"

# Security
label "security/pii"          "b60205" "Handles PII — review for leak-safety"
label "security/credentials"  "d93f0b" "Handles .p12 or secrets"
label "security/signature"    "5319e7" "Touches signature / clave integrity"

# Priority
label "priority/p0" "b60205" "Blocker for Fase 1 go-live"
label "priority/p1" "d93f0b" "Important"
label "priority/p2" "fbca04" "Nice-to-have"

echo "Labels bootstrapped on ${REPO}."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/create-github-labels.sh
```

- [ ] **Step 3: Run once**

```bash
bash scripts/create-github-labels.sh
```

Expected: each `gh label create` prints either "created" or "updated". No errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/create-github-labels.sh
git commit -m "chore(ci): add GitHub labels bootstrap script"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 5 — Labels taxonomy" \
  --label "phase/1,scope/ci,type/chore" \
  --body "Bootstrap GitHub label taxonomy (phase/scope/type/security/priority)."
```

---

## Task 6 — Core package skeleton

**Files:** `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/tsup.config.ts`.

- [ ] **Step 1: Write `packages/core/package.json`**

```json
{
  "name": "@lapc506/invoice-core-core",
  "version": "0.1.0-dev",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./domain": { "import": "./dist/domain/index.js", "types": "./dist/domain/index.d.ts" },
    "./app": { "import": "./dist/app/index.js", "types": "./dist/app/index.d.ts" }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "tsup": "8.3.5",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.test.ts", "dist"]
}
```

- [ ] **Step 3: Write `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/domain/index.ts", "src/app/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2023",
});
```

- [ ] **Step 4: Create stub barrel**

`packages/core/src/index.ts`:

```ts
export {};
```

- [ ] **Step 5: Install + typecheck**

```bash
pnpm install
pnpm --filter @lapc506/invoice-core-core typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/
git commit -m "chore(scaffold): add @lapc506/invoice-core-core package skeleton"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 6 — Core package skeleton" \
  --label "phase/1,scope/scaffold,type/chore" \
  --body "Scaffold packages/core with tsup build + subpath exports."
```

---

## Task 7 — Domain value objects: UUID, ISODateTime, ISODate, Decimal

**Files:** `packages/core/src/domain/value-objects/{uuid,iso-datetime,iso-date,decimal}.ts` + tests.

- [ ] **Step 1: Failing test `uuid.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { InvalidUuid, UUID } from "./uuid.js";

describe("UUID", () => {
  it("parses a valid v4 UUID", () => {
    const v = UUID.parse("550e8400-e29b-41d4-a716-446655440000");
    expect(v).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
  it("rejects a non-UUID", () => {
    expect(() => UUID.parse("not-a-uuid")).toThrow(InvalidUuid);
  });
  it("exposes isUuid type guard", () => {
    expect(UUID.isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(UUID.isUuid("no")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @lapc506/invoice-core-core test uuid`
Expected: cannot find module `./uuid.js`.

- [ ] **Step 3: Implement `uuid.ts`**

```ts
import { z } from "zod";

const schema = z.string().uuid();

export type UUID = string & { readonly __brand: "UUID" };

export const UUID = {
  parse(input: unknown): UUID {
    const r = schema.safeParse(input);
    if (!r.success) throw new InvalidUuid(r.error.message);
    return r.data as UUID;
  },
  isUuid(input: unknown): input is UUID {
    return schema.safeParse(input).success;
  },
};

export class InvalidUuid extends Error {
  constructor(msg: string) {
    super(`Invalid UUID: ${msg}`);
    this.name = "InvalidUuid";
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @lapc506/invoice-core-core test uuid`
Expected: 3 passed.

- [ ] **Step 5: Implement `iso-datetime.ts`**

```ts
import { z } from "zod";

const schema = z.string().datetime({ offset: true });

export type ISODateTime = string & { readonly __brand: "ISODateTime" };

export const ISODateTime = {
  parse(input: unknown): ISODateTime {
    const r = schema.safeParse(input);
    if (!r.success) throw new InvalidISODateTime(r.error.message);
    return r.data as ISODateTime;
  },
  now(clock: () => Date = () => new Date()): ISODateTime {
    return clock().toISOString() as ISODateTime;
  },
};

export class InvalidISODateTime extends Error {
  constructor(msg: string) {
    super(`Invalid ISO datetime: ${msg}`);
    this.name = "InvalidISODateTime";
  }
}
```

- [ ] **Step 6: Test `iso-datetime.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { InvalidISODateTime, ISODateTime } from "./iso-datetime.js";

describe("ISODateTime", () => {
  it("parses RFC3339 with offset", () => {
    expect(ISODateTime.parse("2026-04-16T12:00:00-06:00")).toBe("2026-04-16T12:00:00-06:00");
  });
  it("rejects naive datetime", () => {
    expect(() => ISODateTime.parse("2026-04-16 12:00:00")).toThrow(InvalidISODateTime);
  });
  it("clock-injected now() produces deterministic output", () => {
    const clock = () => new Date("2026-04-16T00:00:00.000Z");
    expect(ISODateTime.now(clock)).toBe("2026-04-16T00:00:00.000Z");
  });
});
```

Run: `pnpm test iso-datetime` → 3 passed.

- [ ] **Step 7: Implement `iso-date.ts`** (YYYY-MM-DD only, no time)

```ts
import { z } from "zod";

const schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type ISODate = string & { readonly __brand: "ISODate" };

export const ISODate = {
  parse(input: unknown): ISODate {
    const r = schema.safeParse(input);
    if (!r.success) throw new InvalidISODate(r.error?.message ?? "format");
    const d = new Date(`${r.data}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw new InvalidISODate("not a real date");
    return r.data as ISODate;
  },
};

export class InvalidISODate extends Error {
  constructor(msg: string) {
    super(`Invalid ISO date: ${msg}`);
    this.name = "InvalidISODate";
  }
}
```

Test rejects `2026-02-30`.

- [ ] **Step 8: Implement `decimal.ts`** (bigint + scale)

```ts
export class Decimal {
  private constructor(
    public readonly value: bigint,
    public readonly scale: number,
  ) {}

  static of(value: bigint, scale: number): Decimal {
    if (scale < 0 || scale > 12) throw new RangeError("scale must be in [0,12]");
    return new Decimal(value, scale);
  }

  static fromString(s: string): Decimal {
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) throw new InvalidDecimal(s);
    const sign = m[1] === "-" ? -1n : 1n;
    const whole = BigInt(m[2] ?? "0");
    const frac = m[3] ?? "";
    const scale = frac.length;
    const value = sign * (whole * 10n ** BigInt(scale) + (frac === "" ? 0n : BigInt(frac)));
    return new Decimal(value, scale);
  }

  add(other: Decimal): Decimal {
    const [a, b, s] = align(this, other);
    return new Decimal(a + b, s);
  }

  sub(other: Decimal): Decimal {
    const [a, b, s] = align(this, other);
    return new Decimal(a - b, s);
  }

  mul(other: Decimal): Decimal {
    return new Decimal(this.value * other.value, this.scale + other.scale);
  }

  toString(): string {
    const s = this.value.toString().replace("-", "");
    const sign = this.value < 0n ? "-" : "";
    if (this.scale === 0) return `${sign}${s}`;
    const pad = s.padStart(this.scale + 1, "0");
    return `${sign}${pad.slice(0, -this.scale)}.${pad.slice(-this.scale)}`;
  }

  equals(other: Decimal): boolean {
    const [a, b] = align(this, other);
    return a === b;
  }
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const s = Math.max(a.scale, b.scale);
  return [a.value * 10n ** BigInt(s - a.scale), b.value * 10n ** BigInt(s - b.scale), s];
}

export class InvalidDecimal extends Error {
  constructor(v: string) {
    super(`Invalid decimal: ${v}`);
    this.name = "InvalidDecimal";
  }
}
```

- [ ] **Step 9: Decimal test**

```ts
import { describe, expect, it } from "vitest";
import { Decimal } from "./decimal.js";

describe("Decimal", () => {
  it("parses, adds, preserves scale", () => {
    const a = Decimal.fromString("1234.56");
    const b = Decimal.fromString("0.044");
    expect(a.add(b).toString()).toBe("1234.604");
  });
  it("mul adds scales", () => {
    expect(Decimal.fromString("2.50").mul(Decimal.fromString("0.13")).toString()).toBe("0.3250");
  });
  it("no float rounding on 0.1+0.2", () => {
    expect(
      Decimal.fromString("0.1").add(Decimal.fromString("0.2")).toString(),
    ).toBe("0.3");
  });
});
```

- [ ] **Step 10: Run all VO tests**

Run: `pnpm --filter @lapc506/invoice-core-core test value-objects`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/domain/value-objects/
git commit -m "feat(domain): add UUID, ISODateTime, ISODate, Decimal value objects"
```

- [ ] **Step 12: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 7 — Base value objects" \
  --label "phase/1,scope/domain,type/feat" \
  --body "UUID (zod+brand), ISODateTime (RFC3339), ISODate (YYYY-MM-DD), Decimal (bigint+scale, float-safe)."
```

---

## Task 8 — Domain VO: Money + Jurisdiction + CountryCode + UnitCode

**Files:** `packages/core/src/domain/value-objects/{money,jurisdiction,country-code,unit-code}.ts` + tests.

- [ ] **Step 1: Failing test `money.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { Decimal } from "./decimal.js";
import { InvalidMoney, Money } from "./money.js";

describe("Money", () => {
  it("creates with ISO 4217 currency", () => {
    const m = Money.of(Decimal.fromString("100.00"), "CRC");
    expect(m.currency).toBe("CRC");
    expect(m.amount.toString()).toBe("100.00");
  });
  it("rejects unknown currency", () => {
    expect(() => Money.of(Decimal.fromString("1"), "ZZZ")).toThrow(InvalidMoney);
  });
  it("refuses add across currencies", () => {
    const crc = Money.of(Decimal.fromString("1"), "CRC");
    const usd = Money.of(Decimal.fromString("1"), "USD");
    expect(() => crc.add(usd)).toThrow(/currency mismatch/);
  });
});
```

- [ ] **Step 2: Implement `money.ts`**

```ts
import type { Decimal } from "./decimal.js";

const ALLOWED = new Set(["CRC", "USD", "EUR", "MXN", "COP"]);

export class Money {
  private constructor(
    public readonly amount: Decimal,
    public readonly currency: string,
  ) {}

  static of(amount: Decimal, currency: string): Money {
    if (!ALLOWED.has(currency)) throw new InvalidMoney(`currency ${currency}`);
    return new Money(amount, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidMoney(`currency mismatch: ${this.currency} vs ${other.currency}`);
    }
    return new Money(this.amount.add(other.amount), this.currency);
  }

  sub(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidMoney(`currency mismatch: ${this.currency} vs ${other.currency}`);
    }
    return new Money(this.amount.sub(other.amount), this.currency);
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency}`;
  }
}

export class InvalidMoney extends Error {
  constructor(msg: string) {
    super(`Invalid money: ${msg}`);
    this.name = "InvalidMoney";
  }
}
```

- [ ] **Step 3: Implement `jurisdiction.ts`**

```ts
import { z } from "zod";

export const JURISDICTIONS = ["CR", "MX", "CO", "US", "GLOBAL"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

const schema = z.enum(JURISDICTIONS);

export const Jurisdiction = {
  parse(input: unknown): Jurisdiction {
    return schema.parse(input);
  },
};
```

- [ ] **Step 4: Implement `country-code.ts`** (ISO 3166-1 alpha-2)

```ts
import { z } from "zod";

const schema = z.string().length(2).regex(/^[A-Z]{2}$/);

export type CountryCode = string & { readonly __brand: "CountryCode" };

export const CountryCode = {
  parse(input: unknown): CountryCode {
    return schema.parse(input) as CountryCode;
  },
};
```

- [ ] **Step 5: Implement `unit-code.ts`** (Hacienda CR catálogo — abbreviated to the commonly used codes for Fase 1)

```ts
import { z } from "zod";

// Subset of Hacienda v4.4 unit catalog. Full catalog landed via ingester in Fase 3.
export const UNIT_CODES = [
  "Sp", "Unid", "kg", "g", "m", "cm", "mm", "l", "ml", "m2", "m3",
  "h", "d", "kWh", "Al", "Alc", "I", "St", "Os",
] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

const schema = z.enum(UNIT_CODES);

export const UnitCode = {
  parse(input: unknown): UnitCode {
    return schema.parse(input);
  },
};
```

- [ ] **Step 6: Tests for the other three VOs**

Write `jurisdiction.spec.ts`, `country-code.spec.ts`, `unit-code.spec.ts` that each exercise valid + invalid inputs.

- [ ] **Step 7: Run**

Run: `pnpm --filter @lapc506/invoice-core-core test value-objects`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/domain/value-objects/
git commit -m "feat(domain): add Money, Jurisdiction, CountryCode, UnitCode value objects"
```

- [ ] **Step 9: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 8 — Money + Jurisdiction + CountryCode + UnitCode" \
  --label "phase/1,scope/domain,type/feat" \
  --body "Money with ISO 4217 + cross-currency guard; enums for jurisdiction, country, unit (subset)."
```

---

## Task 9 — Domain VO: PIIString

**Files:** `packages/core/src/domain/value-objects/pii-string.ts` + test.

- [ ] **Step 1: Failing test `pii-string.spec.ts`**

```ts
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { PIIString } from "./pii-string.js";

describe("PIIString", () => {
  it("toString redacts", () => {
    expect(String(PIIString.from("Luis Andres"))).toBe("[REDACTED]");
  });
  it("toJSON redacts", () => {
    expect(JSON.stringify({ name: PIIString.from("Luis") })).toBe('{"name":"[REDACTED]"}');
  });
  it("util.inspect redacts", () => {
    expect(inspect(PIIString.from("secret"))).toContain("[REDACTED]");
  });
  it("unsafeReveal returns original", () => {
    expect(PIIString.from("raw").unsafeReveal()).toBe("raw");
  });
});
```

- [ ] **Step 2: Implement `pii-string.ts`**

```ts
import { inspect } from "node:util";

const VALUE = Symbol("pii.value");

export class PIIString {
  private readonly [VALUE]: string;

  private constructor(v: string) {
    this[VALUE] = v;
  }

  static from(v: string): PIIString {
    return new PIIString(v);
  }

  unsafeReveal(): string {
    return this[VALUE];
  }

  toString(): string {
    return "[REDACTED]";
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  [inspect.custom](): string {
    return "[REDACTED]";
  }
}
```

- [ ] **Step 3: Run**

Run: `pnpm test pii-string`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/domain/value-objects/pii-string.ts packages/core/src/domain/value-objects/pii-string.spec.ts
git commit -m "feat(domain): add PIIString with redact-by-default serialization"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 9 — PIIString" \
  --label "phase/1,scope/domain,type/feat,security/pii" \
  --body "Safe-by-default PII wrapper — toString/toJSON/util.inspect all redact; unsafeReveal for adapter boundaries."
```

---

## Task 10 — Domain VO: TaxId (CR + MX + CO)

**Files:** `packages/core/src/domain/value-objects/tax-id.ts` + test.

- [ ] **Step 1: Failing test `tax-id.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { InvalidTaxId, TaxId } from "./tax-id.js";

describe("TaxId", () => {
  it("parses CR cédula física (9 digits)", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(t.value).toBe("112340567");
  });
  it("parses CR cédula jurídica (10 digits)", () => {
    const t = TaxId.parse({ country: "CR", kind: "JURIDICA", value: "3101123456" });
    expect(t.kind).toBe("JURIDICA");
  });
  it("parses CR DIMEX (11-12 digits)", () => {
    const t = TaxId.parse({ country: "CR", kind: "DIMEX", value: "112345678912" });
    expect(t.kind).toBe("DIMEX");
  });
  it("parses MX RFC (12-13 alnum)", () => {
    expect(TaxId.parse({ country: "MX", kind: "RFC", value: "VECJ880326XXX" }).value).toBe(
      "VECJ880326XXX",
    );
  });
  it("parses CO NIT (6-10 digits)", () => {
    expect(TaxId.parse({ country: "CO", kind: "NIT", value: "1020304050" }).value).toBe(
      "1020304050",
    );
  });
  it("rejects CR cédula física with wrong length", () => {
    expect(() => TaxId.parse({ country: "CR", kind: "FISICA", value: "12345" })).toThrow(
      InvalidTaxId,
    );
  });
  it("redacted() returns last 4 only", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(t.redacted()).toBe("*****0567");
  });
  it("toString is redacted by default", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(String(t)).toBe("*****0567");
  });
  it("unsafeReveal exposes raw value", () => {
    const t = TaxId.parse({ country: "CR", kind: "FISICA", value: "112340567" });
    expect(t.unsafeReveal()).toBe("112340567");
  });
});
```

- [ ] **Step 2: Implement `tax-id.ts`**

```ts
import { inspect } from "node:util";

export type TaxIdKind =
  | "FISICA"    // CR cédula física, 9 digits
  | "JURIDICA"  // CR cédula jurídica, 10 digits
  | "DIMEX"     // CR Documento de Identidad Migratorio, 11-12 digits
  | "NITE"      // CR NITE (extranjeros), 10 digits
  | "RFC"       // MX RFC, 12-13 alnum
  | "NIT"       // CO NIT, 6-10 digits
  | "PASSPORT"; // fallback

export type TaxIdCountry = "CR" | "MX" | "CO";

interface TaxIdInput {
  country: TaxIdCountry;
  kind: TaxIdKind;
  value: string;
}

const RULES: Record<string, RegExp> = {
  "CR:FISICA": /^\d{9}$/,
  "CR:JURIDICA": /^\d{10}$/,
  "CR:DIMEX": /^\d{11,12}$/,
  "CR:NITE": /^\d{10}$/,
  "MX:RFC": /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/,
  "CO:NIT": /^\d{6,10}$/,
};

export class TaxId {
  private constructor(
    public readonly country: TaxIdCountry,
    public readonly kind: TaxIdKind,
    private readonly _value: string,
  ) {}

  static parse(input: TaxIdInput): TaxId {
    const key = `${input.country}:${input.kind}`;
    const rule = RULES[key];
    if (!rule) throw new InvalidTaxId(`unsupported ${key}`);
    if (!rule.test(input.value)) throw new InvalidTaxId(`format ${key}: ${mask(input.value)}`);
    return new TaxId(input.country, input.kind, input.value);
  }

  get value(): string {
    return this._value;
  }

  redacted(): string {
    const v = this._value;
    return `${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
  }

  unsafeReveal(): string {
    return this._value;
  }

  toString(): string {
    return this.redacted();
  }

  toJSON(): string {
    return this.redacted();
  }

  [inspect.custom](): string {
    return `TaxId(${this.country}:${this.kind}:${this.redacted()})`;
  }
}

function mask(v: string): string {
  return v.length <= 4 ? "****" : `${"*".repeat(v.length - 4)}${v.slice(-4)}`;
}

export class InvalidTaxId extends Error {
  constructor(msg: string) {
    super(`Invalid TaxId: ${msg}`);
    this.name = "InvalidTaxId";
  }
}
```

- [ ] **Step 3: Run**

Run: `pnpm test tax-id`
Expected: 9 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/domain/value-objects/tax-id.ts packages/core/src/domain/value-objects/tax-id.spec.ts
git commit -m "feat(domain): add TaxId VO for CR/MX/CO with redaction"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 10 — TaxId VO" \
  --label "phase/1,scope/domain,type/feat,security/pii" \
  --body "CR física/jurídica/DIMEX/NITE, MX RFC, CO NIT validators. Redaction by default; unsafeReveal for SDK adapters."
```

---

## Task 11 — Domain VO: CABYS code + GTIN + ClaveNumerica

**Files:** `packages/core/src/domain/value-objects/{cabys,gtin,clave-numerica}.ts` + tests.

- [ ] **Step 1: Failing test `cabys.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { CABYS, InvalidCabys } from "./cabys.js";

describe("CABYS", () => {
  it("accepts 13 digits", () => {
    expect(CABYS.parse("1234567890123").value).toBe("1234567890123");
  });
  it("rejects 12 digits", () => {
    expect(() => CABYS.parse("123456789012")).toThrow(InvalidCabys);
  });
  it("rejects non-digits", () => {
    expect(() => CABYS.parse("12345678A0123")).toThrow(InvalidCabys);
  });
});
```

- [ ] **Step 2: Implement `cabys.ts`**

Signature shape:

```ts
export class CABYS {
  readonly value: string;
  static parse(v: unknown): CABYS;
}
export class InvalidCabys extends Error {}
```

Implementation: 13-digit regex check. `toString()` returns raw code (public data).

- [ ] **Step 3: Implement `gtin.ts`** with mod10 check and length ∈ {8,12,13,14}; `clave-numerica.ts` with 50-digit check + mod11 check digit at position 21 (per Hacienda CR spec). Tests for each cover valid + invalid + boundary.

- [ ] **Step 4: Run**

Run: `pnpm --filter @lapc506/invoice-core-core test -- cabys gtin clave-numerica`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/value-objects/cabys.ts packages/core/src/domain/value-objects/gtin.ts packages/core/src/domain/value-objects/clave-numerica.ts packages/core/src/domain/value-objects/cabys.spec.ts packages/core/src/domain/value-objects/gtin.spec.ts packages/core/src/domain/value-objects/clave-numerica.spec.ts
git commit -m "feat(domain): add CABYS, GTIN, ClaveNumerica value objects"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 11 — CABYS + GTIN + ClaveNumerica" \
  --label "phase/1,scope/domain,type/feat,security/signature" \
  --body "CABYS 13-digit validator, GTIN mod10 (8/12/13/14), ClaveNumerica 50-digit with mod11 check digit at pos 21."
```

---

## Task 12 — Domain entity: Taxpayer + ForeignReceiver

**Files:** `packages/core/src/domain/entities/{taxpayer,foreign-receiver}.ts` + tests.

- [ ] **Step 1: Failing test `taxpayer.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { TaxId } from "../value-objects/tax-id.js";
import { PIIString } from "../value-objects/pii-string.js";
import { Taxpayer } from "./taxpayer.js";

describe("Taxpayer", () => {
  it("builds a CR juridica taxpayer", () => {
    const t = Taxpayer.of({
      taxId: TaxId.parse({ country: "CR", kind: "JURIDICA", value: "3101123456" }),
      legalName: PIIString.from("Vertivolatam S.A."),
      activityCode: "722001",
    });
    expect(t.taxId.country).toBe("CR");
  });
  it("rejects empty activity code on CR issuer", () => {
    expect(() =>
      Taxpayer.of({
        taxId: TaxId.parse({ country: "CR", kind: "JURIDICA", value: "3101123456" }),
        legalName: PIIString.from("X"),
        activityCode: "",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Implement `taxpayer.ts`**

Signature shape:

```ts
export class Taxpayer {
  readonly taxId: TaxId;
  readonly legalName: PIIString;
  readonly commercialName?: PIIString;
  readonly activityCode: string;   // Hacienda economic activity code
  readonly address?: TaxpayerAddress;
  static of(input: TaxpayerInput): Taxpayer;
}
```

CR issuers must have `activityCode` matching `^\d{6}$`. Non-CR taxpayers may have empty activityCode.

- [ ] **Step 3: Implement `foreign-receiver.ts`** — receiver without local `TaxId`, uses `identification: { type, value, countryCode }`. For MX `RFC`, CO `NIT`, generic `PASSPORT`.

- [ ] **Step 4: Run**

Run: `pnpm test taxpayer foreign-receiver`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/entities/taxpayer.ts packages/core/src/domain/entities/foreign-receiver.ts packages/core/src/domain/entities/taxpayer.spec.ts packages/core/src/domain/entities/foreign-receiver.spec.ts
git commit -m "feat(domain): add Taxpayer + ForeignReceiver entities"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 12 — Taxpayer + ForeignReceiver" \
  --label "phase/1,scope/domain,type/feat,security/pii" \
  --body "Taxpayer aggregate with TaxId + PII-wrapped names + CR activity code. ForeignReceiver for non-local ids."
```

---

## Task 13 — Domain entity: LineItem + TaxLine + TaxBreakdown

**Files:** `packages/core/src/domain/entities/{line-item,tax-line,tax-breakdown}.ts` + tests.

- [ ] **Step 1: Failing test `line-item.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { Decimal } from "../value-objects/decimal.js";
import { Money } from "../value-objects/money.js";
import { CABYS } from "../value-objects/cabys.js";
import { LineItem } from "./line-item.js";

describe("LineItem", () => {
  it("computes subtotal = qty * unitPrice", () => {
    const li = LineItem.of({
      sequenceNumber: 1,
      cabysCode: CABYS.parse("1234567890123"),
      description: "Cocoa beans, grade A",
      quantity: Decimal.fromString("10"),
      unitOfMeasure: "kg",
      unitPrice: Money.of(Decimal.fromString("5000.00"), "CRC"),
      taxes: [],
    });
    expect(li.subtotal().toString()).toBe("50000.00 CRC");
  });
});
```

- [ ] **Step 2: Implement `line-item.ts`**

Signature shape:

```ts
export class LineItem {
  readonly sequenceNumber: number;
  readonly cabysCode: CABYS;
  readonly productCode?: { type: ProductCodeType; code: string };
  readonly description: string;
  readonly quantity: Decimal;
  readonly unitOfMeasure: UnitCode;
  readonly unitPrice: Money;
  readonly discount?: { rate: Decimal; amount: Money; reason?: string };
  readonly taxes: TaxLine[];
  readonly customsData?: CustomsLineData;
  readonly traceabilityRef?: string;
  subtotal(): Money;
  totalWithTaxes(): Money;
  static of(input: LineItemInput): LineItem;
}
```

- [ ] **Step 3: Implement `tax-line.ts`** with code ∈ {01_IVA, 02_SELECT, 03_UNICO, 04_TIMBRE} + rate ∈ {0,1,2,4,13} + optional `exemption: { reason, legalCitation, percent }`.

- [ ] **Step 4: Implement `tax-breakdown.ts`** — aggregator that groups line taxes by `(code, rate)` and yields `Money` totals.

- [ ] **Step 5: Run**

Run: `pnpm test line-item tax-line tax-breakdown`
Expected: all green, ≥ 8 assertions across the three files.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/entities/line-item.ts packages/core/src/domain/entities/tax-line.ts packages/core/src/domain/entities/tax-breakdown.ts packages/core/src/domain/entities/line-item.spec.ts packages/core/src/domain/entities/tax-line.spec.ts packages/core/src/domain/entities/tax-breakdown.spec.ts
git commit -m "feat(domain): add LineItem + TaxLine + TaxBreakdown entities"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 13 — LineItem + TaxLine + TaxBreakdown" \
  --label "phase/1,scope/domain,type/feat" \
  --body "LineItem with optional customsData + traceabilityRef; TaxLine with CR IVA rates + exemption; TaxBreakdown aggregator."
```

---

## Task 14 — Domain entity: DocumentSequence aggregate

**Files:** `packages/core/src/domain/entities/document-sequence.ts` + test.

- [ ] **Step 1: Failing test `document-sequence.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DocumentSequence } from "./document-sequence.js";

describe("DocumentSequence", () => {
  it("starts at 1 for a fresh (taxpayer, branch, terminal, docType) tuple", () => {
    const seq = DocumentSequence.initial({ taxpayerId: "t1", branch: "001", terminal: "00001", docType: "INVOICE_CR" });
    const next = seq.next();
    expect(next.current).toBe(1n);
  });
  it("is monotonic (no gaps)", () => {
    let seq = DocumentSequence.initial({ taxpayerId: "t1", branch: "001", terminal: "00001", docType: "INVOICE_CR" });
    for (let i = 0; i < 5; i++) seq = seq.next();
    expect(seq.current).toBe(5n);
  });
  it("rejects terminal with wrong length", () => {
    expect(() => DocumentSequence.initial({ taxpayerId: "t1", branch: "001", terminal: "1", docType: "INVOICE_CR" })).toThrow();
  });
});
```

- [ ] **Step 2: Implement `document-sequence.ts`**

Signature shape:

```ts
export class DocumentSequence {
  readonly taxpayerId: string;
  readonly branch: string;      // 3 digits
  readonly terminal: string;    // 5 digits
  readonly docType: DocumentType;
  readonly current: bigint;     // last consumed
  next(): DocumentSequence;
  format(): string;             // 20-digit Hacienda consecutivo
  static initial(input: SeqInput): DocumentSequence;
}
```

The persistence layer (Task 39) enforces gap-free advance via advisory lock.

- [ ] **Step 3: Run**

Run: `pnpm test document-sequence`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/domain/entities/document-sequence.ts packages/core/src/domain/entities/document-sequence.spec.ts
git commit -m "feat(domain): add DocumentSequence aggregate (branch/terminal/docType)"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 14 — DocumentSequence aggregate" \
  --label "phase/1,scope/domain,type/feat,security/signature" \
  --body "Per (taxpayer, branch, terminal, docType) monotonic consecutivo; format() yields 20-digit Hacienda field."
```

---

## Task 15 — Domain entity: Document base + Invoice + Ticket

**Files:** `packages/core/src/domain/entities/{document-base,invoice,ticket}.ts` + tests.

- [ ] **Step 1: Failing test `invoice.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { Invoice } from "./invoice.js";
// … import test factories from fixtures
import { anInvoiceInput } from "../__fixtures__/invoice-fixtures.js";

describe("Invoice (INVOICE_CR)", () => {
  it("is created with status=DRAFT", () => {
    const inv = Invoice.create(anInvoiceInput());
    expect(inv.status).toBe("DRAFT");
  });
  it("computes grand total from line items + taxes", () => {
    const inv = Invoice.create(anInvoiceInput());
    expect(inv.totals.grandTotal.currency).toBe("CRC");
  });
  it("rejects condicionVenta CREDITO without plazoCredito", () => {
    expect(() => Invoice.create(anInvoiceInput({ condicionVenta: "CREDITO" }))).toThrow();
  });
});
```

- [ ] **Step 2: Implement `document-base.ts`**

Abstract base shared by all subtypes. Holds `id`, `type`, `status`, `issuer`, `receiver`, `issuedAt`, `fiscalPeriod`, `lineItems`, `taxBreakdown`, `totals`, `relatedDocuments`, `xmlBlob`, `claveNumerica?`, `acknowledgment?`, `auditTrail`. Constructor validates required fields and delegates discriminator to subclass.

- [ ] **Step 3: Implement `invoice.ts`** (`type = "INVOICE_CR"`, adds `condicionVenta: "CONTADO"|"CREDITO"|"CONSIGNACION"|"APARTADO"|"ARRENDAMIENTO_OPCION_COMPRA"|"ARRENDAMIENTO_FUNCION_FINANCIERA"|"COBRO_TERCEROS"|"SERVICIOS_ESTADO_CREDITO"|"PAGO_SERVICIOS_INSTITUCION_ESTADO"|"OTROS"`, `medioPago: MedioPago[]`, `plazoCredito?: number`).

- [ ] **Step 4: Implement `ticket.ts`** (`type = "TICKET_CR"`, receiver optional, smaller schema).

- [ ] **Step 5: Run**

Run: `pnpm test invoice ticket document-base`
Expected: ≥ 6 assertions green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/entities/document-base.ts packages/core/src/domain/entities/invoice.ts packages/core/src/domain/entities/ticket.ts packages/core/src/domain/entities/invoice.spec.ts packages/core/src/domain/entities/ticket.spec.ts packages/core/src/domain/entities/__fixtures__/
git commit -m "feat(domain): add Document base + Invoice + Ticket subtypes"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 15 — Document base + Invoice + Ticket" \
  --label "phase/1,scope/domain,type/feat" \
  --body "Abstract Document base + Invoice (01) + Ticket (04) subtypes with totals computation."
```

---

## Task 16 — Domain entity: CreditNote + DebitNote

**Files:** `packages/core/src/domain/entities/{credit-note,debit-note}.ts` + tests.

- [ ] **Step 1: Failing test `credit-note.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { CreditNote } from "./credit-note.js";
import { aCreditNoteInput } from "../__fixtures__/credit-note-fixtures.js";

describe("CreditNote (CREDIT_NOTE_CR)", () => {
  it("requires at least one relatedDocument", () => {
    expect(() => CreditNote.create(aCreditNoteInput({ relatedDocuments: [] }))).toThrow();
  });
  it("relatedDocument must be of type INVOICE_CR or TICKET_CR", () => {
    expect(() =>
      CreditNote.create(aCreditNoteInput({
        relatedDocuments: [{ type: "CREDIT_NOTE_CR", claveNumerica: "X".repeat(50), issuedAt: "2026-04-15T00:00:00Z" }],
      })),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Implement `credit-note.ts`** (`type = "CREDIT_NOTE_CR"`, requires `relatedDocuments[0].type ∈ {INVOICE_CR, TICKET_CR, EXPORT_INVOICE_CR}`).

- [ ] **Step 3: Implement `debit-note.ts`** (`type = "DEBIT_NOTE_CR"`, same related-doc rule).

- [ ] **Step 4: Run**

Run: `pnpm test credit-note debit-note`
Expected: ≥ 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/entities/credit-note.ts packages/core/src/domain/entities/debit-note.ts packages/core/src/domain/entities/credit-note.spec.ts packages/core/src/domain/entities/debit-note.spec.ts packages/core/src/domain/entities/__fixtures__/credit-note-fixtures.ts
git commit -m "feat(domain): add CreditNote + DebitNote subtypes with referential rules"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 16 — CreditNote + DebitNote" \
  --label "phase/1,scope/domain,type/feat" \
  --body "NC/ND (02/03) with referential integrity to source INVOICE_CR/TICKET_CR/EXPORT_INVOICE_CR."
```

---

## Task 17 — Domain entity: PurchaseInvoice (tipo 08) + ExportInvoice (tipo 09 skeleton)

**Files:** `packages/core/src/domain/entities/{purchase-invoice,export-invoice}.ts` + tests.

- [ ] **Step 1: Failing test `purchase-invoice.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { PurchaseInvoice } from "./purchase-invoice.js";
import { aPurchaseInvoiceInput } from "../__fixtures__/purchase-invoice-fixtures.js";

describe("PurchaseInvoice (PURCHASE_INVOICE_CR, tipo 08)", () => {
  it("requires providerNotRegistered block", () => {
    expect(() => PurchaseInvoice.create(aPurchaseInvoiceInput({ providerNotRegistered: undefined }))).toThrow();
  });
  it("accepts provider with idType=00_NINGUNO (grower with no id)", () => {
    const pi = PurchaseInvoice.create(aPurchaseInvoiceInput({
      providerNotRegistered: { idType: "00_NINGUNO", name: "Grower X" },
    }));
    expect(pi.type).toBe("PURCHASE_INVOICE_CR");
  });
});
```

- [ ] **Step 2: Implement `purchase-invoice.ts`** — required `providerNotRegistered: { idType: "05_EXTRANJERO" | "00_NINGUNO"; name; identifier? }`. Issuer must be inscrito.

- [ ] **Step 3: Implement `export-invoice.ts`** (`type = "EXPORT_INVOICE_CR"`, adds `incoterms?`, receiver must be `ForeignReceiver`, currency not restricted to CRC). Skeleton; deeper validation lands in Fase 4.

- [ ] **Step 4: Run**

Run: `pnpm test purchase-invoice export-invoice`
Expected: ≥ 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/entities/purchase-invoice.ts packages/core/src/domain/entities/export-invoice.ts packages/core/src/domain/entities/purchase-invoice.spec.ts packages/core/src/domain/entities/export-invoice.spec.ts packages/core/src/domain/entities/__fixtures__/purchase-invoice-fixtures.ts
git commit -m "feat(domain): add PurchaseInvoice (08) + ExportInvoice (09 skeleton)"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 17 — PurchaseInvoice 08 + ExportInvoice 09" \
  --label "phase/1,scope/domain,type/feat" \
  --body "Factura-compra tipo 08 for non-registered providers (Vertivolatam growers). ExportInvoice tipo 09 skeleton with ForeignReceiver."
```

---

## Task 18 — Domain entity: ReceiverMessage + WithholdingCertificate stub + DonationReceipt stub

**Files:** `packages/core/src/domain/entities/{receiver-message,withholding-certificate,donation-receipt}.ts` + tests.

- [ ] **Step 1: Failing test `receiver-message.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ReceiverMessage } from "./receiver-message.js";
import { aReceiverMessageInput } from "../__fixtures__/receiver-message-fixtures.js";

describe("ReceiverMessage", () => {
  it("supports messageType=1 (accept)", () => {
    const r = ReceiverMessage.create(aReceiverMessageInput({ messageType: 1 }));
    expect(r.messageType).toBe(1);
  });
  it("supports messageType=3 (reject) requires rejectionReason", () => {
    expect(() => ReceiverMessage.create(aReceiverMessageInput({ messageType: 3, rejectionReason: undefined }))).toThrow();
  });
});
```

- [ ] **Step 2: Implement `receiver-message.ts`** — fields: `sourceClaveNumerica`, `messageType: 1|2|3`, `rejectionReason?`, `totalImpuesto`, `totalFactura`, `condicionImpuesto?`.

- [ ] **Step 3: Implement `withholding-certificate.ts`** — stub that constructs but returns `status: "DRAFT"` and throws `NotImplementedInFase1` on `.sign()` call. Jurisdiction-aware: `WITHHOLDING_MX` or `WITHHOLDING_CO`.

- [ ] **Step 4: Implement `donation-receipt.ts`** — stub: allows construction with `kind ∈ {CASH, IN_KIND, SERVICE}` + `donatario` + `donor`, but `.finalize()` throws `NotImplementedInFase1` (full flow lands in Fase 2).

- [ ] **Step 5: Run**

Run: `pnpm test receiver-message withholding-certificate donation-receipt`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/entities/receiver-message.ts packages/core/src/domain/entities/withholding-certificate.ts packages/core/src/domain/entities/donation-receipt.ts packages/core/src/domain/entities/receiver-message.spec.ts packages/core/src/domain/entities/withholding-certificate.spec.ts packages/core/src/domain/entities/donation-receipt.spec.ts
git commit -m "feat(domain): add ReceiverMessage + Withholding/Donation stubs"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 18 — ReceiverMessage + Withholding/Donation stubs" \
  --label "phase/1,scope/domain,type/feat" \
  --body "ReceiverMessage full; WithholdingCertificate + DonationReceipt stubs throw NotImplementedInFase1 for .sign()/.finalize()."
```

---

## Task 19 — Domain entity: Dispute aggregate

**Files:** `packages/core/src/domain/entities/dispute.ts` + test.

- [ ] **Step 1: Failing test `dispute.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { Dispute } from "./dispute.js";

describe("Dispute", () => {
  it("opens from an inbound document", () => {
    const d = Dispute.open({ inboundDocumentId: "doc-1", reason: "duplicate_line_item", reportedBy: "user-42" });
    expect(d.status).toBe("OPEN");
  });
  it("resolves with a resolution note", () => {
    const d = Dispute.open({ inboundDocumentId: "doc-1", reason: "wrong_amount", reportedBy: "user-42" });
    const r = d.resolve({ resolvedBy: "user-1", note: "supplier reissued via NC" });
    expect(r.status).toBe("RESOLVED");
  });
  it("rejects resolve() when already RESOLVED", () => {
    const d = Dispute.open({ inboundDocumentId: "doc-1", reason: "x", reportedBy: "u" }).resolve({ resolvedBy: "u", note: "ok" });
    expect(() => d.resolve({ resolvedBy: "u", note: "again" })).toThrow();
  });
});
```

- [ ] **Step 2: Implement `dispute.ts`**

Signature shape:

```ts
export type DisputeStatus = "OPEN" | "ESCALATED" | "RESOLVED" | "REJECTED";
export class Dispute {
  readonly id: string;
  readonly inboundDocumentId: string;
  readonly reason: string;
  readonly status: DisputeStatus;
  readonly reportedBy: string;
  readonly resolvedBy?: string;
  readonly note?: string;
  static open(input): Dispute;
  escalate(by: string): Dispute;
  resolve(input): Dispute;
  reject(input): Dispute;
}
```

Immutable — each transition returns a new instance.

- [ ] **Step 3: Run**

Run: `pnpm test dispute`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/domain/entities/dispute.ts packages/core/src/domain/entities/dispute.spec.ts
git commit -m "feat(domain): add Dispute aggregate with OPEN→ESCALATED→RESOLVED/REJECTED states"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 19 — Dispute aggregate" \
  --label "phase/1,scope/domain,type/feat" \
  --body "Dispute states (OPEN/ESCALATED/RESOLVED/REJECTED) for AduaNext inbound reconciliation gaps."
```

---

## Task 20 — Domain services: state machine + totals + clave builder

**Files:** `packages/core/src/domain/services/{state-machine,totals-calculator,clave-builder}.ts` + tests.

- [ ] **Step 1: Failing test `state-machine.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { InvalidDocumentStateTransition, transition } from "./state-machine.js";

describe("state-machine", () => {
  it("DRAFT → SIGNED allowed", () => {
    expect(transition("DRAFT", "SIGNED")).toBe("SIGNED");
  });
  it("ACCEPTED → SIGNED rejected", () => {
    expect(() => transition("ACCEPTED", "SIGNED")).toThrow(InvalidDocumentStateTransition);
  });
  it("REJECTED is terminal", () => {
    expect(() => transition("REJECTED", "CANCELLED")).toThrow(InvalidDocumentStateTransition);
  });
});
```

- [ ] **Step 2: Implement `state-machine.ts`** per spec §4.3.

- [ ] **Step 3: Implement `totals-calculator.ts`** — pure function `computeTotals(lineItems: LineItem[]): DocumentTotals` returning `{ subtotal, totalDiscounts, totalTaxes, totalExempt, grandTotal }`.

- [ ] **Step 4: Implement `clave-builder.ts`** — 50-digit composition: `país(3) + día(2) + mes(2) + año(2) + taxId(12, left-padded) + sucursal(3) + terminal(5) + tipoDoc(2) + consecutivo(10) + situación(1) + código(8) + check(1)` with mod11 check at last pos.

- [ ] **Step 5: Run**

Run: `pnpm test state-machine totals-calculator clave-builder`
Expected: ≥ 8 assertions green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/services/state-machine.ts packages/core/src/domain/services/totals-calculator.ts packages/core/src/domain/services/clave-builder.ts packages/core/src/domain/services/state-machine.spec.ts packages/core/src/domain/services/totals-calculator.spec.ts packages/core/src/domain/services/clave-builder.spec.ts
git commit -m "feat(domain): add state machine + totals calculator + clave builder services"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 20 — Domain services (state/totals/clave)" \
  --label "phase/1,scope/domain,type/feat,security/signature" \
  --body "State machine per §4.3; totals aggregator; clave-numerica builder with mod11 check digit."
```

---

## Task 21 — Domain events + typed errors barrel

**Files:** `packages/core/src/domain/events/*.ts` + `packages/core/src/domain/errors.ts` + `packages/core/src/domain/index.ts`.

- [ ] **Step 1: Failing test `events.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DocumentIssued, DocumentAccepted, DocumentRejected, ReceiverMessageReceived, DocumentReconciled } from "./index.js";

describe("domain events", () => {
  it("DocumentIssued carries id + clave + issuer + timestamp", () => {
    const e = DocumentIssued.of({ documentId: "d1", claveNumerica: "0".repeat(50), issuerTaxId: "3101123456", at: "2026-04-16T00:00:00Z" });
    expect(e.type).toBe("DocumentIssued");
    expect(e.version).toBe(1);
  });
  it("events never serialize raw PII", () => {
    const e = DocumentRejected.of({ documentId: "d1", reasonCode: "INVALID_XML", at: "2026-04-16T00:00:00Z" });
    expect(JSON.stringify(e)).not.toContain("cédula");
  });
});
```

- [ ] **Step 2: Implement event classes** under `packages/core/src/domain/events/` — one file per event with static `of()` factory + readonly fields. Cover: `DocumentIssued`, `DocumentAccepted`, `DocumentRejected`, `DocumentCancelled`, `InboundReceived`, `InboundValidated`, `ReceiverMessageSubmitted` (aka `ReceiverMessageReceived` alias), `ReconciliationCompleted` (aka `DocumentReconciled`), `AuthorityUnavailable`.

- [ ] **Step 3: Implement `errors.ts`** with typed errors from spec §4 + barrel in `domain/index.ts` re-exporting all VOs + entities + services + events + errors.

- [ ] **Step 4: Run**

Run: `pnpm test events`
Expected: all events green; PII-leak assertion passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/events/ packages/core/src/domain/errors.ts packages/core/src/domain/index.ts
git commit -m "feat(domain): add domain events + typed errors + public barrel"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 21 — Domain events + errors barrel" \
  --label "phase/1,scope/domain,type/feat,security/pii" \
  --body "9 domain events (Issued/Accepted/Rejected/Cancelled/InboundReceived/InboundValidated/ReceiverMessageSubmitted/ReconciliationCompleted/AuthorityUnavailable) + typed errors, zero PII in payloads."
```

---



## Task 22 — Application ports: persistence group (DocumentRepository, TaxpayerRepository, SequenceRepository, CABYSRepository)

**Files:** `packages/core/src/app/ports/{document-repository-port,taxpayer-repository-port,sequence-repository-port,cabys-repository-port}.ts` + contract tests.

- [ ] **Step 1: Failing test `document-repository-port.contract.ts`**

Defines a shared test suite that any adapter (Postgres, in-memory) must satisfy:

```ts
import { describe, expect, it } from "vitest";
import type { DocumentRepositoryPort } from "./document-repository-port.js";

export function documentRepositoryContract(factory: () => DocumentRepositoryPort) {
  describe("DocumentRepositoryPort contract", () => {
    it("save + findById round-trips", async () => {
      const repo = factory();
      // … build a canonical Invoice fixture …
      // await repo.save(inv);
      // expect((await repo.findById(inv.id))?.id).toBe(inv.id);
    });
  });
}
```

Plus an in-memory stub implementation that must pass the contract.

- [ ] **Step 2: Define port interfaces**

Signature shapes:

```ts
export interface DocumentRepositoryPort {
  save(doc: Document): Promise<void>;
  findById(id: string): Promise<Document | null>;
  findByClaveNumerica(clave: string): Promise<Document | null>;
  list(q: DocumentQuery): AsyncIterable<Document>;
  updateStatus(id: string, to: DocumentStatus, ack?: Acknowledgment): Promise<void>;
}
export interface TaxpayerRepositoryPort {
  save(t: Taxpayer): Promise<void>;
  findByTaxId(taxId: TaxId): Promise<Taxpayer | null>;
}
export interface SequenceRepositoryPort {
  nextFor(key: SequenceKey): Promise<DocumentSequence>;  // MUST be gap-free
}
export interface CABYSRepositoryPort {
  lookup(code: string): Promise<CabysEntry | null>;
  search(term: string, limit: number): Promise<CabysEntry[]>;
  upsertBatch(entries: CabysEntry[]): Promise<number>;
}
```

- [ ] **Step 3: In-memory stub + contract run**

Run: `pnpm test document-repository-port`
Expected: in-memory stub passes the shared contract.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app/ports/document-repository-port.ts packages/core/src/app/ports/taxpayer-repository-port.ts packages/core/src/app/ports/sequence-repository-port.ts packages/core/src/app/ports/cabys-repository-port.ts packages/core/src/app/ports/__contract__/
git commit -m "feat(app): add persistence ports + shared contract tests"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 22 — Persistence ports" \
  --label "phase/1,scope/app,type/feat" \
  --body "DocumentRepository / TaxpayerRepository / SequenceRepository / CABYSRepository ports + portable contract suites."
```

---

## Task 23 — Application ports: authority + inbound group (TaxAuthorityPort, ReceiverMessagePort, InboundDocumentGatewayPort, SignatureVerifierPort)

**Files:** `packages/core/src/app/ports/{tax-authority-port,receiver-message-port,inbound-document-gateway-port,signature-verifier-port}.ts` + contract stubs.

- [ ] **Step 1: Failing test `tax-authority-port.contract.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { TaxAuthorityPort } from "./tax-authority-port.js";

export function taxAuthorityContract(factory: () => TaxAuthorityPort) {
  describe("TaxAuthorityPort contract", () => {
    it("submit returns a SubmissionAck with traceable id", async () => {
      // fake adapter returns synthetic ack
    });
    it("queryStatus maps authority codes to DocumentStatus", async () => {});
  });
}
```

- [ ] **Step 2: Define port interfaces**

Signature shapes:

```ts
export interface TaxAuthorityPort {
  submit(signedXml: Buffer, ctx: SubmitCtx): Promise<SubmissionAck>;
  queryStatus(claveNumerica: string, ctx: AuthorityCtx): Promise<AuthorityStatus>;
  health(): Promise<AuthorityHealth>;
  jurisdiction: Jurisdiction;
}
export interface ReceiverMessagePort {
  submit(msg: ReceiverMessage, signed: Buffer, ctx: SubmitCtx): Promise<SubmissionAck>;
}
export interface InboundDocumentGatewayPort {
  subscribe(handler: (raw: InboundRawDocument) => Promise<void>): Promise<Unsubscribe>;
  pollOnce(ctx: PollCtx): Promise<InboundRawDocument[]>;
}
export interface SignatureVerifierPort {
  verify(xml: Buffer, policy: SignaturePolicy): Promise<VerificationResult>;
}
```

- [ ] **Step 3: Fake-based contract tests**

Write a fake that implements each port with in-memory lookups — contracts must pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app/ports/tax-authority-port.ts packages/core/src/app/ports/receiver-message-port.ts packages/core/src/app/ports/inbound-document-gateway-port.ts packages/core/src/app/ports/signature-verifier-port.ts packages/core/src/app/ports/__contract__/
git commit -m "feat(app): add authority + inbound ports with contract stubs"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 23 — Authority + inbound ports" \
  --label "phase/1,scope/app,type/feat" \
  --body "TaxAuthorityPort / ReceiverMessagePort / InboundDocumentGatewayPort / SignatureVerifierPort with contract suites."
```

---

## Task 24 — Application ports: infrastructure group (CertificateVault, EventPublisher, Clock, IdGenerator, RetryQueue, PIIRedactor, ReconciliationEngine)

**Files:** `packages/core/src/app/ports/{certificate-vault-port,event-bus-port,clock-port,idempotency-port,queue-port,pii-redactor-port,reconciliation-port}.ts`.

- [ ] **Step 1: Failing test `certificate-vault-port.contract.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { CertificateVaultPort } from "./certificate-vault-port.js";

export function certificateVaultContract(factory: () => CertificateVaultPort) {
  describe("CertificateVaultPort contract", () => {
    it("loadP12 returns a Disposable buffer cleared on dispose", async () => {});
    it("getExpiry returns a future ISO date for valid certs", async () => {});
  });
}
```

- [ ] **Step 2: Define port interfaces**

Signature shapes:

```ts
export interface CertificateVaultPort {
  loadP12(taxpayerId: string): Promise<DisposableP12>;
  getExpiry(taxpayerId: string): Promise<ISODate>;
  watchExpiring(threshold: Duration): AsyncIterable<CertificateExpiringEvent>;
}
export interface EventPublisherPort {
  publish<E extends DomainEvent>(event: E, ctx: PublishCtx): Promise<void>;
}
export interface ClockPort { now(): ISODateTime; date(): ISODate; }
export interface IdGeneratorPort { uuid(): UUID; }
export interface RetryQueuePort {
  enqueue(job: SubmissionJob): Promise<string>;
  subscribe(handler: JobHandler): Promise<Unsubscribe>;
  depth(): Promise<number>;
}
export interface PIIRedactorPort { redact<T>(obj: T): T; }
export interface ReconciliationEnginePort {
  reconcile(inbound: Document, candidates: PurchaseOrder[]): Promise<ReconciliationResult>;
}
```

- [ ] **Step 3: In-memory + fake-clock adapters**

Provide fakes that pass contracts. Commit them to `packages/core/src/app/ports/__fakes__/`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app/ports/
git commit -m "feat(app): add infrastructure ports + in-memory fakes"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 24 — Infrastructure ports" \
  --label "phase/1,scope/app,type/feat,security/credentials" \
  --body "CertificateVault (Disposable), EventPublisher, Clock, IdGenerator, RetryQueue, PIIRedactor, ReconciliationEngine."
```

---

## Task 25 — Application ports: stub group (DonationAuthorization, Appraisal, CustomsData, FilingDataExport, OCR, AccountingSink)

**Files:** `packages/core/src/app/ports/{donation-authorization-port,appraisal-port,customs-data-port,filing-data-export-port,ocr-port,accounting-sink-port}.ts`.

- [ ] **Step 1: Failing test `stubs.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { UnimplementedInFase1 } from "../../domain/errors.js";
import { donationAuthorizationStub, appraisalStub, customsDataStub, filingDataExportStub, ocrStub, accountingSinkStub } from "./__stubs__/index.js";

describe("Fase 1 stubs throw UnimplementedInFase1", () => {
  it("DonationAuthorization.isAuthorized throws", async () => {
    await expect(donationAuthorizationStub().isAuthorized("3101123456")).rejects.toThrow(UnimplementedInFase1);
  });
  // … one assertion per stub
});
```

- [ ] **Step 2: Define port interfaces + stubs**

Signature shapes (minimal):

```ts
export interface DonationAuthorizationPort { isAuthorized(taxId: string): Promise<AuthorizationStatus>; }
export interface AppraisalPort { attach(ref: URI, docId: string): Promise<AppraisalRef>; }
export interface CustomsDataPort { fetchDUA(duaNumber: string): Promise<CustomsLineData>; }
export interface FilingDataExportPort { exportD101Casillas(period: FiscalPeriod): Promise<D101Data>; /* + D104, D103 */ }
export interface OCRPort { extract(pdf: Buffer): Promise<OCRResult>; }
export interface AccountingSinkPort { push(doc: Document): Promise<SinkReceipt>; }
```

Each stub throws `UnimplementedInFase1` with a message pointing to the Fase that lands the real adapter.

- [ ] **Step 3: Run**

Run: `pnpm test stubs`
Expected: 6 stubs throw correctly.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app/ports/donation-authorization-port.ts packages/core/src/app/ports/appraisal-port.ts packages/core/src/app/ports/customs-data-port.ts packages/core/src/app/ports/filing-data-export-port.ts packages/core/src/app/ports/ocr-port.ts packages/core/src/app/ports/accounting-sink-port.ts packages/core/src/app/ports/__stubs__/
git commit -m "feat(app): add Fase 2-5 port interfaces + UnimplementedInFase1 stubs"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 25 — Deferred port stubs" \
  --label "phase/1,scope/app,type/feat" \
  --body "6 deferred ports as interfaces + UnimplementedInFase1 stubs so proto RPCs can wire to placeholders and Fase 2-5 adapters swap in without breaking changes."
```

---

## Task 26 — Use case: IssueInvoice (TDD)

**Files:** `packages/core/src/app/commands/issue-invoice.ts` + test.

- [ ] **Step 1: Failing test `issue-invoice.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { IssueInvoice } from "./issue-invoice.js";
import { testComposition } from "../__fixtures__/composition.js";

describe("IssueInvoice", () => {
  it("persists as SIGNED and enqueues submission", async () => {
    const deps = testComposition();
    const ack = await new IssueInvoice(deps).execute(/* request */);
    expect(ack.status).toBe("QUEUED");
    expect(deps.queue.depth()).resolves.toBe(1);
  });
  it("emits DocumentIssued event", async () => {
    const deps = testComposition();
    await new IssueInvoice(deps).execute(/* request */);
    expect(deps.eventPublisher.published.map(e => e.type)).toContain("DocumentIssued");
  });
  it("is idempotent on the same idempotencyKey", async () => {
    const deps = testComposition();
    const uc = new IssueInvoice(deps);
    const a = await uc.execute({ idempotencyKey: "k1" /* … */ });
    const b = await uc.execute({ idempotencyKey: "k1" /* … */ });
    expect(a.claveNumerica).toBe(b.claveNumerica);
    expect(deps.queue.depth()).resolves.toBe(1);
  });
});
```

- [ ] **Step 2: Implement `issue-invoice.ts`**

Flow:

1. Lookup idempotency → short-circuit if hit.
2. Load Taxpayer via `TaxpayerRepositoryPort.findByTaxId(request.issuerTaxId)`.
3. `SequenceRepositoryPort.nextFor` → consecutivo.
4. `clave-builder` → 50-digit key.
5. Build domain `Invoice` via `Invoice.create(...)`.
6. `DocumentRepositoryPort.save` with status=SIGNED (signing done inside adapter next step — Fase 1 simplification: status moves to SIGNED after building XML).
7. `RetryQueuePort.enqueue(job)`.
8. `EventPublisherPort.publish(DocumentIssued)`.
9. Return `DocumentAck { claveNumerica, status: QUEUED }`.

- [ ] **Step 3: Run**

Run: `pnpm test issue-invoice`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app/commands/issue-invoice.ts packages/core/src/app/commands/issue-invoice.spec.ts
git commit -m "feat(app): add IssueInvoice use case (idempotent, event-emitting)"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 26 — IssueInvoice use case" \
  --label "phase/1,scope/app,type/feat,priority/p0" \
  --body "Primary emission use case: lookup taxpayer → seq → clave → build domain → persist SIGNED → enqueue → emit DocumentIssued. Idempotent."
```

---

## Task 27 — Use case: IssueCreditNote + IssueDebitNote + CancelDocument

**Files:** `packages/core/src/app/commands/{issue-credit-note,issue-debit-note,cancel-document}.ts` + tests.

- [ ] **Step 1: Failing tests**

```ts
// issue-credit-note.spec.ts
it("requires source document to exist and be in ACCEPTED state", async () => {
  // deps with no matching source → throws SourceDocumentNotFound
});
it("inherits issuer from source invoice", async () => { /* … */ });
// cancel-document.spec.ts
it("issues a CreditNote referencing the source and transitions source to CANCELLED-on-accept", async () => { /* … */ });
```

- [ ] **Step 2: Implement `issue-credit-note.ts`** — pattern identical to IssueInvoice but validates source doc + references it.

- [ ] **Step 3: Implement `issue-debit-note.ts`** — same shape.

- [ ] **Step 4: Implement `cancel-document.ts`** — orchestrates `IssueCreditNote` with full-amount negative lines; only transitions source to `CANCELLED` after NC acceptance (listener on `DocumentAccepted`).

- [ ] **Step 5: Run**

Run: `pnpm test issue-credit-note issue-debit-note cancel-document`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/app/commands/issue-credit-note.ts packages/core/src/app/commands/issue-debit-note.ts packages/core/src/app/commands/cancel-document.ts packages/core/src/app/commands/issue-credit-note.spec.ts packages/core/src/app/commands/issue-debit-note.spec.ts packages/core/src/app/commands/cancel-document.spec.ts
git commit -m "feat(app): add IssueCreditNote / IssueDebitNote / CancelDocument"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 27 — Credit/Debit Note + Cancel" \
  --label "phase/1,scope/app,type/feat" \
  --body "NC/ND emission + CancelDocument orchestrator (issues NC + listens for Accepted → transitions source to CANCELLED)."
```

---

## Task 28 — Use case: IssueTicket + IssuePurchaseInvoice (tipo 08) + IssueExportInvoice (tipo 09 skeleton)

**Files:** `packages/core/src/app/commands/{issue-ticket,issue-purchase-invoice,issue-export-invoice}.ts` + tests.

- [ ] **Step 1: Failing tests**

```ts
// issue-ticket.spec.ts — smaller: no receiver required
it("accepts request with no receiver", async () => { /* … */ });
// issue-purchase-invoice.spec.ts
it("issuer must be inscrito; provider block carries idType=05_EXTRANJERO", async () => { /* … */ });
// issue-export-invoice.spec.ts
it("receiver must be ForeignReceiver; currency may be USD", async () => { /* … */ });
```

- [ ] **Step 2: Implement the three use cases**

Each reuses the `IssueInvoice` skeleton from Task 26 with subtype-specific validation + domain factory (`Ticket.create`, `PurchaseInvoice.create`, `ExportInvoice.create`).

- [ ] **Step 3: Run**

Run: `pnpm test issue-ticket issue-purchase-invoice issue-export-invoice`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app/commands/issue-ticket.ts packages/core/src/app/commands/issue-purchase-invoice.ts packages/core/src/app/commands/issue-export-invoice.ts packages/core/src/app/commands/issue-ticket.spec.ts packages/core/src/app/commands/issue-purchase-invoice.spec.ts packages/core/src/app/commands/issue-export-invoice.spec.ts
git commit -m "feat(app): add IssueTicket + IssuePurchaseInvoice (08) + IssueExportInvoice (09)"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 28 — Ticket + PurchaseInvoice + ExportInvoice" \
  --label "phase/1,scope/app,type/feat" \
  --body "Three subtype use cases: Ticket (04), PurchaseInvoice (08 — Vertivolatam growers), ExportInvoice (09 skeleton)."
```

---

## Task 29 — Use case: ReceiveIncomingDocument + AcknowledgeReceipt (Mensaje Receptor)

**Files:** `packages/core/src/app/commands/{receive-incoming-document,respond-to-receiver-message}.ts` + tests.

- [ ] **Step 1: Failing test `receive-incoming-document.spec.ts`**

```ts
it("validates signature before persisting", async () => {
  const deps = testComposition({ signatureVerifier: fakeFailingVerifier() });
  await expect(new ReceiveIncomingDocument(deps).execute(/* raw */)).rejects.toThrow("SignatureInvalid");
});
it("persists + emits InboundReceived + InboundValidated", async () => { /* … */ });
```

- [ ] **Step 2: Implement `receive-incoming-document.ts`**

Flow:
1. Parse XML → domain snapshot.
2. `SignatureVerifierPort.verify` — fail fast if invalid.
3. Persist via `DocumentRepositoryPort` (new doc with status=ACCEPTED, direction=INBOUND).
4. Emit `InboundReceived`, then `InboundValidated`.

- [ ] **Step 3: Implement `respond-to-receiver-message.ts`**

Flow:
1. Fetch inbound doc.
2. Build `ReceiverMessage` with `messageType ∈ {1,2,3}`.
3. Sign + submit via `ReceiverMessagePort`.
4. Emit `ReceiverMessageSubmitted`.

- [ ] **Step 4: Run**

Run: `pnpm test receive-incoming-document respond-to-receiver-message`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/app/commands/receive-incoming-document.ts packages/core/src/app/commands/respond-to-receiver-message.ts packages/core/src/app/commands/receive-incoming-document.spec.ts packages/core/src/app/commands/respond-to-receiver-message.spec.ts
git commit -m "feat(app): add ReceiveIncomingDocument + RespondToReceiverMessage"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 29 — Inbound + Mensaje Receptor" \
  --label "phase/1,scope/app,type/feat,priority/p0" \
  --body "Inbound validation (signature-first) + Mensaje Receptor emission per CR v4.4."
```

---

## Task 30 — Use case: ReconcileDocument (Fase 1 scaffold)

**Files:** `packages/core/src/app/commands/reconcile-inbound.ts` + test.

- [ ] **Step 1: Failing test `reconcile-inbound.spec.ts`**

```ts
it("matches 1:1 on claveNumerica + expected PO", async () => { /* … */ });
it("returns UNMATCHED when no candidate fits", async () => { /* … */ });
it("emits DocumentReconciled on match", async () => { /* … */ });
```

- [ ] **Step 2: Implement `reconcile-inbound.ts`**

Delegates heavy lifting to `ReconciliationEnginePort.reconcile`. Fase 1 implementation: the engine is in-memory, matches on `(claveNumerica, grandTotal, issuerTaxId)` within tolerance; Fase 3 adds AduaNext-specific DUA matching.

- [ ] **Step 3: Run**

Run: `pnpm test reconcile-inbound`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app/commands/reconcile-inbound.ts packages/core/src/app/commands/reconcile-inbound.spec.ts
git commit -m "feat(app): add ReconcileDocument use case (Fase 1 in-memory engine)"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 30 — ReconcileDocument" \
  --label "phase/1,scope/app,type/feat" \
  --body "Fase 1 in-memory reconciliation (clave + total + issuer). Fase 3 adds DUA matching for AduaNext."
```

---

## Task 31 — Middleware chain (tracing / auth / idempotency / metrics / PII redaction) + composition barrel

**Files:** `packages/core/src/app/middleware/*.ts` + `packages/core/src/app/index.ts`.

- [ ] **Step 1: Failing test `middleware.spec.ts`**

```ts
it("tracing middleware starts and ends a span per invocation", async () => { /* … */ });
it("idempotency short-circuits duplicate keys", async () => { /* … */ });
it("PII redaction runs before logs emit", async () => { /* … */ });
it("auth denies missing bearer on REST path", async () => { /* … */ });
it("metrics increments invoice_issued_total on success", async () => { /* … */ });
```

- [ ] **Step 2: Implement five middleware modules**

Each is a small higher-order function `(next) => (req, ctx) => Promise<Resp>` composable via `compose(mw1, mw2, ..., handler)`.

- [ ] **Step 3: Implement `app/index.ts` barrel**

Re-exports commands + queries + ports + middleware for consumption by `packages/server`.

- [ ] **Step 4: Run**

Run: `pnpm test middleware`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/app/middleware/ packages/core/src/app/index.ts
git commit -m "feat(app): add middleware chain + app barrel"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 31 — Middleware chain" \
  --label "phase/1,scope/app,type/feat,security/pii,priority/p0" \
  --body "Tracing + auth + idempotency + metrics + PII redaction; composition barrel so server layer consumes one import."
```

---


## Task 32 — Proto codegen pipeline (buf) + generated `packages/proto`

**Files:** `proto/buf.yaml`, `proto/buf.gen.yaml`, `proto/invoice_core/v1/*.proto`, `packages/proto/{package.json,tsconfig.json}`.

- [ ] **Step 1: Write `proto/buf.yaml`**

```yaml
version: v2
lint:
  use: [DEFAULT]
breaking:
  use: [WIRE_JSON]
```

- [ ] **Step 2: Write `proto/buf.gen.yaml`**

```yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: packages/proto/src/generated
    opt: [target=ts]
  - local: protoc-gen-connect-es
    out: packages/proto/src/generated
    opt: [target=ts]
```

- [ ] **Step 3: Author proto files** per spec §6 with `common.proto`, `document.proto`, `admin.proto`, `inbox.proto`, `reporting.proto`, `health.proto`. Keep `reporting.proto` fully declared even though implementation returns `UNIMPLEMENTED` for D-101/D-104/D-103.

- [ ] **Step 4: Run codegen**

```bash
pnpm install @bufbuild/protobuf @bufbuild/protoc-gen-es @connectrpc/connect @connectrpc/protoc-gen-connect-es
pnpm proto:lint
pnpm proto:gen
```

Expected: `packages/proto/src/generated/invoice_core/v1/*.ts` produced; no lint errors.

- [ ] **Step 5: Contract test** that generated `DocumentAck` has fields `claveNumerica`, `status`, `documentId`.

```ts
import { DocumentAck } from "@lapc506/invoice-core-proto/invoice_core/v1/common_pb.js";
it("DocumentAck shape", () => {
  const a = new DocumentAck({ claveNumerica: "0".repeat(50), status: "QUEUED", documentId: "d1" });
  expect(a.claveNumerica).toHaveLength(50);
});
```

- [ ] **Step 6: Commit**

```bash
git add proto/ packages/proto/
git commit -m "feat(proto): add buf codegen pipeline + v1 services"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 32 — Proto codegen pipeline" \
  --label "phase/1,scope/proto,type/feat" \
  --body "buf lint + breaking + codegen to packages/proto. Admin/Inbox/Reporting/Health services declared; Reporting D-101/D-104/D-103 return UNIMPLEMENTED in Fase 1."
```

---

## Task 33 — HaciendaCRAdapter: builders + signer (wraps `@dojocoding/hacienda-sdk`)

**Files:** `packages/adapter-hacienda-cr/src/{index,hacienda-cr-adapter,signer}.ts` + `builders/*` + tests using SDK sandbox fixtures.

- [ ] **Step 1: Failing test `hacienda-cr-adapter.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { HaciendaCRAdapter } from "./hacienda-cr-adapter.js";
import { inMemoryVault, sampleInvoice } from "./__fixtures__/index.js";

describe("HaciendaCRAdapter", () => {
  it("submit() signs XML then delegates to SDK client", async () => {
    const sdkClient = fakeSdkClient({ submit: async () => ({ clave: "0".repeat(50), status: "recibido" }) });
    const adapter = new HaciendaCRAdapter({ sdkClient, vault: inMemoryVault(), metrics: fakeMetrics() });
    const ack = await adapter.submit(await buildSignedXml(sampleInvoice()), { taxpayerId: "t1" });
    expect(ack.authorityId).toBe("0".repeat(50));
  });
  it("maps SDK TimeoutError to AuthorityTimeout domain error", async () => { /* … */ });
});
```

- [ ] **Step 2: Implement adapter**

Signature shape:

```ts
export class HaciendaCRAdapter implements TaxAuthorityPort, ReceiverMessagePort {
  readonly jurisdiction = "CR";
  constructor(private deps: { sdkClient: HaciendaSdkClient; vault: CertificateVaultPort; metrics: AdapterMetrics; clock: ClockPort });
  async submit(xml: Buffer, ctx: SubmitCtx): Promise<SubmissionAck>;
  async queryStatus(clave: string, ctx: AuthorityCtx): Promise<AuthorityStatus>;
  async health(): Promise<AuthorityHealth>;
}
```

`submit` uses `builders/*` to translate domain fixtures → SDK builder calls; `signer.ts` wraps SDK signing using `vault.loadP12` within a try/finally that disposes the buffer.

- [ ] **Step 3: Implement 7 builders** (`invoice-builder`, `ticket-builder`, `credit-note-builder`, `debit-note-builder`, `purchase-invoice-builder`, `export-invoice-builder`, `receiver-message-builder`) each with a unit test that maps a minimal domain fixture → expected SDK builder output shape.

- [ ] **Step 4: Implement `errors.ts`** mapping SDK errors → domain errors (`AuthorityTimeout`, `AuthorityRejected`, `SignatureInvalid`, `CertificateExpired`).

- [ ] **Step 5: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-hacienda-cr test`
Expected: builders + adapter green.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-hacienda-cr/
git commit -m "feat(hacienda-cr): wrap @dojocoding/hacienda-sdk as TaxAuthorityPort + ReceiverMessagePort"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 33 — HaciendaCRAdapter (builders + signer)" \
  --label "phase/1,scope/hacienda-cr,type/feat,security/credentials,priority/p0" \
  --body "Wraps @dojocoding/hacienda-sdk. 7 builders (01/02/03/04/08/09/MR). SDK errors → domain errors. Signing via CertificateVault Disposable."
```

---

## Task 34 — HaciendaCRAdapter: submitter + status-poller + metrics

**Files:** `packages/adapter-hacienda-cr/src/{submitter,status-poller,metrics}.ts` + tests.

- [ ] **Step 1: Failing test `status-poller.spec.ts`**

```ts
it("polls with exponential backoff until ACCEPTED", async () => { /* uses fake-timers */ });
it("bubbles AuthorityTimeout after maxAttempts", async () => { /* … */ });
it("emits invoice_authority_latency_seconds histogram observation", async () => { /* … */ });
```

- [ ] **Step 2: Implement submitter + poller**

Signature shape:

```ts
export class Submitter {
  constructor(private sdk: HaciendaSdkClient, private metrics: AdapterMetrics);
  submit(xml: Buffer, ctx: SubmitCtx): Promise<RawAck>;
}
export class StatusPoller {
  constructor(private sdk: HaciendaSdkClient, private clock: ClockPort, private opts: PollOpts);
  pollUntilFinal(clave: string, ctx: AuthorityCtx): Promise<AuthorityStatus>;
}
```

Backoff: 1s, 2s, 4s, 8s, 15s, 30s, 60s (cap). Timeout 5 min total.

- [ ] **Step 3: Implement `metrics.ts`** — Prometheus histogram `invoice_authority_latency_seconds{authority,operation}` + counter `invoice_authority_errors_total{authority,code}` using `prom-client`.

- [ ] **Step 4: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-hacienda-cr test submitter status-poller metrics`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-hacienda-cr/src/submitter.ts packages/adapter-hacienda-cr/src/status-poller.ts packages/adapter-hacienda-cr/src/metrics.ts packages/adapter-hacienda-cr/src/submitter.spec.ts packages/adapter-hacienda-cr/src/status-poller.spec.ts packages/adapter-hacienda-cr/src/metrics.spec.ts
git commit -m "feat(hacienda-cr): add Submitter + StatusPoller + Prometheus metrics"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 34 — Submitter + StatusPoller + metrics" \
  --label "phase/1,scope/hacienda-cr,type/feat" \
  --body "Submission with exponential backoff, terminal-state polling, Prometheus histogram + counters per §11."
```

---

## Task 35 — PostgreSQL schema via Drizzle + migrations

**Files:** `packages/adapter-postgres/src/schema/*.ts`, `packages/adapter-postgres/drizzle.config.ts`, `packages/adapter-postgres/migrations/0001_init.sql`.

- [ ] **Step 1: Failing test `schema-shape.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { documents, documentSequences, taxpayers, inboundDocuments, disputes, cabys, idempotency, outbox } from "./schema/index.js";

describe("Postgres schema", () => {
  it("documents table has clave_numerica unique index", () => { /* introspect table config */ });
  it("document_sequences has unique (taxpayer_id, branch, terminal, doc_type)", () => { /* … */ });
  it("idempotency has 24h TTL partition", () => { /* … */ });
});
```

- [ ] **Step 2: Implement schema files** (one per aggregate, barrel `schema/index.ts`):

Signature shape for `documents`:

```ts
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey(),
  taxpayerId: varchar("taxpayer_id", { length: 36 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  claveNumerica: varchar("clave_numerica", { length: 50 }),
  payload: jsonb("payload").notNull(),     // domain JSON snapshot
  xmlBlobUri: text("xml_blob_uri"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// + index("documents_clave_uk").on(documents.claveNumerica)
```

Other tables: `document_sequences`, `taxpayers`, `inbound_documents`, `disputes`, `cabys`, `idempotency`, `outbox` (for event publish durability).

- [ ] **Step 3: Generate + author `0001_init.sql`** via `drizzle-kit generate`.

- [ ] **Step 4: Docker-based migration smoke**

```bash
docker compose -f docker-compose.dev.yml up -d postgres
pnpm --filter @lapc506/invoice-core-adapter-postgres exec drizzle-kit push
```

Expected: tables created; re-run is idempotent.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-postgres/src/schema/ packages/adapter-postgres/drizzle.config.ts packages/adapter-postgres/migrations/
git commit -m "feat(postgres): add Drizzle schema + initial migration"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 35 — Postgres schema + migrations" \
  --label "phase/1,scope/postgres,type/feat,security/pii" \
  --body "8 tables: documents + document_sequences + taxpayers + inbound_documents + disputes + cabys + idempotency + outbox. JSONB payload + claveNumerica unique index."
```

---

## Task 36 — DocumentRepositoryPg + TaxpayerRepositoryPg

**Files:** `packages/adapter-postgres/src/repositories/{document-repository,taxpayer-repository}.ts` + integration tests against real Postgres.

- [ ] **Step 1: Failing test `document-repository.integration.spec.ts`**

Uses `documentRepositoryContract` from Task 22:

```ts
import { documentRepositoryContract } from "@lapc506/invoice-core-core/app/ports/__contract__/document-repository-port.js";
import { DocumentRepositoryPg } from "./document-repository.js";
import { withPg } from "../__fixtures__/pg.js";

documentRepositoryContract(() => new DocumentRepositoryPg(withPg()));
```

- [ ] **Step 2: Implement `DocumentRepositoryPg`** — `save` upsert by `id`, `findById`, `findByClaveNumerica`, `list` with async iteration via cursor, `updateStatus` touches `status` + appends to `audit_trail` array column.

- [ ] **Step 3: Implement `TaxpayerRepositoryPg`** — `save` + `findByTaxId(country, kind, value)` index lookup.

- [ ] **Step 4: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-postgres test:integration`
Expected: contract suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-postgres/src/repositories/document-repository.ts packages/adapter-postgres/src/repositories/taxpayer-repository.ts packages/adapter-postgres/src/repositories/document-repository.integration.spec.ts packages/adapter-postgres/src/repositories/taxpayer-repository.integration.spec.ts
git commit -m "feat(postgres): add DocumentRepositoryPg + TaxpayerRepositoryPg"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 36 — DocumentRepositoryPg + TaxpayerRepositoryPg" \
  --label "phase/1,scope/postgres,type/feat,priority/p0" \
  --body "Postgres-backed implementations passing the shared port contract suite."
```

---

## Task 37 — SequenceRepositoryPg with gap-free advisory-lock + CABYS CSV ingester

**Files:** `packages/adapter-postgres/src/repositories/{sequence-repository,cabys-repository}.ts`, `packages/adapter-postgres/src/cabys-csv-ingester.ts` + tests.

- [ ] **Step 1: Failing test `sequence-repository.integration.spec.ts`**

```ts
it("100 concurrent nextFor() on the same key produce 1..100 gap-free", async () => {
  const repo = new SequenceRepositoryPg(pg);
  const out = await Promise.all(Array.from({ length: 100 }, () => repo.nextFor(key)));
  const nums = out.map(s => Number(s.current)).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
});
```

- [ ] **Step 2: Implement `SequenceRepositoryPg`**

Uses `pg_advisory_xact_lock(hashtext($key))` inside a transaction that reads `current`, increments, writes back, commits. Hashing is deterministic per `(taxpayerId, branch, terminal, docType)`.

- [ ] **Step 3: Implement `CABYSRepositoryPg`** — `lookup` by exact code, `search` by trigram (`pg_trgm`), `upsertBatch` via `INSERT ... ON CONFLICT DO UPDATE`.

- [ ] **Step 4: Implement `cabys-csv-ingester.ts`**

Reads Hacienda CABYS CSV feed, streams rows through `zod` validation, batches 500 rows into `CABYSRepositoryPg.upsertBatch`.

Test: with a 100-row fixture, ingester produces 100 rows; re-run produces 0 new rows.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-postgres/src/repositories/sequence-repository.ts packages/adapter-postgres/src/repositories/cabys-repository.ts packages/adapter-postgres/src/cabys-csv-ingester.ts packages/adapter-postgres/src/repositories/sequence-repository.integration.spec.ts packages/adapter-postgres/src/repositories/cabys-repository.integration.spec.ts packages/adapter-postgres/src/cabys-csv-ingester.spec.ts
git commit -m "feat(postgres): add gap-free SequenceRepositoryPg + CABYS CSV ingester"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 37 — SequenceRepositoryPg + CABYS" \
  --label "phase/1,scope/postgres,type/feat,security/signature,priority/p0" \
  --body "Advisory-lock gap-free consecutivo (100-parallel test). CABYSRepositoryPg + trigram search + weekly CSV ingester."
```

---

## Task 38 — CertificateVault: Vault + sealed-secrets + local-FS fallback

**Files:** `packages/adapter-vault/src/{local-fs-vault,vault-credential-vault,sealed-secrets-loader,certificate-expiry-monitor}.ts` + tests.

- [ ] **Step 1: Failing test `local-fs-vault.spec.ts`**

```ts
it("loadP12 returns a Disposable buffer cleared on dispose", async () => {
  const v = new LocalFsVault({ rootDir: tmpDir });
  const d = await v.loadP12("t1");
  expect(d.buffer.byteLength).toBeGreaterThan(0);
  d[Symbol.dispose]();
  expect(d.buffer.byteLength).toBe(0);
});
it("getExpiry parses PKCS#12 validTo correctly", async () => { /* … */ });
```

- [ ] **Step 2: Implement `local-fs-vault.ts`**

Signature shape:

```ts
export class LocalFsVault implements CertificateVaultPort {
  constructor(private opts: { rootDir: string; passwordEnv?: string });
  async loadP12(taxpayerId: string): Promise<DisposableP12> { /* reads ${rootDir}/${taxpayerId}.p12 */ }
  async getExpiry(taxpayerId: string): Promise<ISODate>;
  watchExpiring(threshold: Duration): AsyncIterable<CertificateExpiringEvent>;
}
```

`DisposableP12` implements `Symbol.dispose` and zero-fills the buffer.

- [ ] **Step 3: Implement `vault-credential-vault.ts`** using Vault KV v2 HTTP API (renew token every 50% of TTL).

- [ ] **Step 4: Implement `sealed-secrets-loader.ts`** — reads projected volume at `/etc/invoice-core/certs/${taxpayerId}.p12` + password at `/etc/invoice-core/certs/${taxpayerId}.pass`.

- [ ] **Step 5: Implement `certificate-expiry-monitor.ts`** — scheduled job that emits `CertificateExpiringEvent` at 30/14/7/1 days before expiry.

- [ ] **Step 6: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-vault test`
Expected: all green; each vault passes the shared `certificateVaultContract`.

- [ ] **Step 7: Commit**

```bash
git add packages/adapter-vault/
git commit -m "feat(vault): add CertificateVault adapters (Vault + sealed-secrets + local-FS)"
```

- [ ] **Step 8: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 38 — CertificateVault" \
  --label "phase/1,scope/vault,type/feat,security/credentials,priority/p0" \
  --body "Three vault backends all passing CertificateVaultPort contract. Disposable buffers + expiry monitor emitting 30/14/7/1-day events."
```

---

## Task 39 — XAdES-EPES SignatureVerifier (xadesjs) + policy check

**Files:** `packages/adapter-signature/src/{xades-epes-verifier,xades-policy-check}.ts` + golden XML fixtures.

- [ ] **Step 1: Failing test `xades-epes-verifier.spec.ts`**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { XadesEpesVerifier } from "./xades-epes-verifier.js";

describe("XadesEpesVerifier", () => {
  const validXml = readFileSync("src/__fixtures__/valid-signed.xml");
  const tampered = readFileSync("src/__fixtures__/tampered-signed.xml");

  it("accepts Hacienda CR signed XML with valid XAdES-EPES signature and policy hash", async () => {
    const r = await new XadesEpesVerifier().verify(validXml, { policyHash: "Ohixl6upD6av8N7pEvDABhEL6hM=" });
    expect(r.valid).toBe(true);
  });
  it("rejects tampered XML", async () => {
    const r = await new XadesEpesVerifier().verify(tampered, { policyHash: "Ohixl6upD6av8N7pEvDABhEL6hM=" });
    expect(r.valid).toBe(false);
  });
  it("rejects XAdES-BES (wrong form)", async () => { /* … */ });
});
```

- [ ] **Step 2: Implement `xades-epes-verifier.ts`**

Uses `xadesjs` + `xmldsig-js`; verifies: canonicalization, digest, signature value, certificate chain against Hacienda CR root CA, policy identifier matches `Ohixl6upD6av8N7pEvDABhEL6hM=` with SHA-1.

- [ ] **Step 3: Implement `xades-policy-check.ts`** — pluggable check so future jurisdictions can swap policy.

- [ ] **Step 4: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-signature test`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-signature/
git commit -m "feat(signature): add XAdES-EPES verifier with CR policy hash"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 39 — XAdES-EPES verifier" \
  --label "phase/1,scope/signature,type/feat,security/signature,priority/p0" \
  --body "Verifies canonicalization + digest + signature value + certificate chain + policy hash Ohixl6upD6av8N7pEvDABhEL6hM="
```

---

## Task 40 — BullMQ RetryQueue + opossum circuit breaker

**Files:** `packages/adapter-queue/src/{bullmq-queue,submission-worker,status-poll-worker,circuit-breaker,retry-policy}.ts` + tests.

- [ ] **Step 1: Failing test `bullmq-queue.spec.ts`**

```ts
it("enqueue returns a jobId and depth increments", async () => { /* uses redis-memory-server */ });
it("subscribe dispatches jobs to the handler in FIFO order", async () => { /* … */ });
```

- [ ] **Step 2: Implement `bullmq-queue.ts`** implementing `RetryQueuePort` — thin wrapper around `Queue` + `Worker` from BullMQ. Jobs carry `{ documentId, claveNumerica, attempt, createdAt }`.

- [ ] **Step 3: Implement `retry-policy.ts`** — exponential backoff `1s, 5s, 30s, 2m, 10m, 1h, 6h, 24h` with jitter; permanent failure after 24h.

- [ ] **Step 4: Implement `circuit-breaker.ts`** — `opossum` wrapper per `jurisdiction`. Opens on 50% failure rate over last 20 calls, half-open after 30s, resets on 3 consecutive successes. Emits `invoice_circuit_breaker_state{authority}` gauge updates.

- [ ] **Step 5: Implement `submission-worker.ts`** — pulls from queue, calls `TaxAuthorityPort.submit`, persists status, enqueues status-poll job on success. Circuit-breaker-wrapped.

- [ ] **Step 6: Implement `status-poll-worker.ts`** — runs StatusPoller from Task 34.

- [ ] **Step 7: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-queue test`
Expected: all green; 10-job burst test shows depth monotonic.

- [ ] **Step 8: Commit**

```bash
git add packages/adapter-queue/
git commit -m "feat(queue): add BullMQ RetryQueue + submission/status-poll workers + opossum circuit breaker"
```

- [ ] **Step 9: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 40 — RetryQueue + workers + circuit breaker" \
  --label "phase/1,scope/queue,type/feat,priority/p0" \
  --body "BullMQ queue with submission + status-poll workers. opossum circuit breaker per authority with 50%/20/30s policy. Emits invoice_queue_depth + invoice_circuit_breaker_state metrics."
```

---

## Task 41 — Observability: pino logger + OTel tracer + Prometheus metrics

**Files:** `packages/adapter-otel/src/{tracer,metrics,logger}.ts` + tests.

- [ ] **Step 1: Failing test `logger.spec.ts`**

```ts
it("redacts PII keys by path", () => {
  const log = createLogger({ level: "info", redactPaths: ["issuer.taxId", "receiver.taxId", "lineItems[*].description"] });
  const out = captureLogs(() => log.info({ issuer: { taxId: "112340567" } }, "emission"));
  expect(out).toContain('"taxId":"[Redacted]"');
  expect(out).not.toContain("112340567");
});
```

- [ ] **Step 2: Implement `logger.ts`**

pino logger configured with `redact: { paths, remove: false, censor: "[Redacted]" }` and `formatters.level` for JSON output. Export a `createLogger` factory + default instance.

- [ ] **Step 3: Implement `tracer.ts`**

OTel SDK bootstrap: `@opentelemetry/sdk-node` with OTLP HTTP exporter → env `OTEL_EXPORTER_OTLP_ENDPOINT`. Auto-instrumentation: `@opentelemetry/auto-instrumentations-node`. Custom attributes: `invoice.jurisdiction`, `invoice.doc_type`.

- [ ] **Step 4: Implement `metrics.ts`**

`prom-client` default registry + histograms/counters per spec §11. Expose `register` for `/metrics` scraping.

- [ ] **Step 5: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-otel test`
Expected: logger redaction + tracer smoke + metrics introspection green.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-otel/
git commit -m "feat(otel): add pino logger + OTel tracer + Prometheus metrics"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 41 — Observability (pino + OTel + prom-client)" \
  --label "phase/1,scope/otel,type/feat,security/pii,priority/p0" \
  --body "pino with redact paths per PII policy; OTel SDK → OTLP; prom-client registry exposing §11 metrics."
```

---

## Task 42 — InboundDocumentGateway: Hacienda webhook + polling worker

**Files:** `packages/adapter-inbound/src/{hacienda-webhook-route,hacienda-polling-worker,inbound-parser}.ts` + tests.

- [ ] **Step 1: Failing test `inbound-parser.spec.ts`**

```ts
it("parses Hacienda inbound envelope → InboundRawDocument", async () => {
  const raw = readFileSync("src/__fixtures__/hacienda-inbound.json", "utf8");
  const parsed = parseHaciendaInbound(raw);
  expect(parsed.source).toBe("hacienda-cr");
  expect(parsed.xmlBlob.byteLength).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Implement `inbound-parser.ts`** — decodes base64 XML payload, parses envelope metadata.

- [ ] **Step 3: Implement `hacienda-webhook-route.ts`** — Fastify route factory that HMAC-verifies the request, parses, calls `ReceiveIncomingDocument` use case. Returns 202 on success, 400 on bad signature.

- [ ] **Step 4: Implement `hacienda-polling-worker.ts`** — runs every 5 min, fetches recent inbound via SDK, dedupes against `inbound_documents.clave_numerica`, calls use case.

- [ ] **Step 5: Run**

Run: `pnpm --filter @lapc506/invoice-core-adapter-inbound test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-inbound/
git commit -m "feat(inbound): add Hacienda webhook route + polling worker + parser"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 42 — InboundDocumentGateway" \
  --label "phase/1,scope/inbound,type/feat,security/signature" \
  --body "Webhook (HMAC-verified) + 5-min polling worker. Dedupe on clave_numerica. Feeds ReceiveIncomingDocument use case."
```

---


## Task 43 — gRPC server bootstrap (`:50061`) + DI composition root

**Files:** `packages/server/src/grpc/server.ts`, `packages/server/src/composition/{wire,config,mode}.ts`.

- [ ] **Step 1: Failing test `grpc-bootstrap.spec.ts`**

```ts
it("boots on 127.0.0.1:<ephemeral> and answers Health.Check", async () => {
  const app = await buildTestApp({ grpcPort: 0 });
  const res = await new HealthClient(app.channel).check({});
  expect(res.status).toBe("SERVING");
  await app.close();
});
```

- [ ] **Step 2: Implement `composition/config.ts`** — zod-validated env loader: `GRPC_PORT`, `REST_PORT`, `METRICS_PORT`, `DATABASE_URL`, `REDIS_URL`, `VAULT_*`, `HACIENDA_*`, `DEPLOYMENT_MODE`, `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`.

- [ ] **Step 3: Implement `composition/wire.ts`** — DI composition root returning `{ useCases, queries, workers, closer }`. Wires: Postgres pool, BullMQ connection, CertificateVault (per `VAULT_ADDR` presence), HaciendaCRAdapter, XadesEpesVerifier, BullMQ queue + workers, pino logger, OTel tracer, prom-client registry.

- [ ] **Step 4: Implement `composition/mode.ts`** — sidecar vs standalone toggle. Sidecar binds `127.0.0.1:50061` only; standalone binds `0.0.0.0:50061` + `0.0.0.0:8766`.

- [ ] **Step 5: Implement `grpc/server.ts`** — `@grpc/grpc-js` server, registers 4 services (Admin/Inbox/Reporting/Health), installs interceptors (Task 44), starts on configured port.

- [ ] **Step 6: Run**

Run: `pnpm --filter @lapc506/invoice-core-server test grpc-bootstrap`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/grpc/server.ts packages/server/src/composition/
git commit -m "feat(grpc): add gRPC server bootstrap + DI composition root"
```

- [ ] **Step 8: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 43 — gRPC bootstrap + composition" \
  --label "phase/1,scope/grpc,type/feat,priority/p0" \
  --body "gRPC server on :50061 with DI composition wiring Postgres + Vault + Queue + HaciendaCRAdapter + observability."
```

---

## Task 44 — gRPC interceptors (tracing, auth, redaction, metrics) + reflection + health

**Files:** `packages/server/src/grpc/interceptors/{tracing,auth,redaction,metrics}.ts` + `packages/server/src/grpc/services/health.ts` + reflection wiring.

- [ ] **Step 1: Failing test `interceptors.spec.ts`**

```ts
it("auth interceptor rejects calls without mTLS peer cert in sidecar mode", async () => { /* … */ });
it("redaction interceptor strips PII before handler logs", async () => { /* … */ });
it("reflection exposes InvoiceAdmin service", async () => {
  const client = new ReflectionClient(channel);
  const services = await client.listServices();
  expect(services).toContain("invoice_core.v1.InvoiceAdmin");
});
it("grpc_health_v1.Health reports SERVING when deps healthy", async () => { /* … */ });
```

- [ ] **Step 2: Implement 4 interceptors**

Each is a `ServerInterceptor` wrapping the next handler. Tracing extracts `traceparent` + starts span; auth validates mTLS peer cert (sidecar) or bearer (REST-only — no gRPC bearer in Fase 1); redaction clones request, redacts PII paths, stores on span attributes; metrics records RPC latency + status.

- [ ] **Step 3: Implement `services/health.ts`** — `grpc_health_v1.Health` with service-level checks: Postgres `SELECT 1`, Redis PING, vault reachability, authority circuit-breaker state.

- [ ] **Step 4: Enable reflection**

Register `grpc-reflection` server side so `grpcurl` + Postman work out of the box.

- [ ] **Step 5: Run**

Run: `pnpm --filter @lapc506/invoice-core-server test interceptors health reflection`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/grpc/interceptors/ packages/server/src/grpc/services/health.ts
git commit -m "feat(grpc): add interceptors + reflection + health service"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 44 — gRPC interceptors + reflection + health" \
  --label "phase/1,scope/grpc,type/feat,security/pii,security/credentials,priority/p0" \
  --body "Tracing + auth (mTLS) + PII redaction + metrics interceptors; grpc_health_v1.Health; reflection."
```

---

## Task 45 — gRPC services: InvoiceAdmin + InvoiceInbox wired

**Files:** `packages/server/src/grpc/services/{admin,inbox}.ts` + integration tests.

- [ ] **Step 1: Failing test `admin-service.integration.spec.ts`**

```ts
it("IssueInvoice RPC returns QUEUED and persists", async () => {
  const app = await buildTestApp();
  const ack = await new InvoiceAdminClient(app.channel).issueInvoice(sampleRequest());
  expect(ack.status).toBe("QUEUED");
  expect(ack.claveNumerica).toHaveLength(50);
  await app.close();
});
```

- [ ] **Step 2: Implement `admin.ts`** — maps each of the 11 RPCs to its use case (Task 26-28, plus donation/withholding stubs returning `UNIMPLEMENTED`, `CancelDocument`, `GetDocumentStatus`, `ListDocuments` query stream).

- [ ] **Step 3: Implement `inbox.ts`** — 4 RPCs: `IngestInboundDocument` → `ReceiveIncomingDocument` use case; `RespondToInbound` → `RespondToReceiverMessage`; `ListInbound` streams via cursor; `ReconcileWithPO` → `ReconcileDocument`.

- [ ] **Step 4: Run**

Run: `pnpm --filter @lapc506/invoice-core-server test:integration admin-service inbox-service`
Expected: full RPC round-trip green against dockerized Postgres + Redis.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/grpc/services/admin.ts packages/server/src/grpc/services/inbox.ts
git commit -m "feat(grpc): wire InvoiceAdmin + InvoiceInbox services"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 45 — InvoiceAdmin + InvoiceInbox services" \
  --label "phase/1,scope/grpc,type/feat,priority/p0" \
  --body "11 Admin RPCs (incl. stubs) + 4 Inbox RPCs wired to use cases. Integration tested against real Postgres + Redis."
```

---

## Task 46 — gRPC services: InvoiceReporting (stubs) + InvoiceHealth extras

**Files:** `packages/server/src/grpc/services/reporting.ts` + updates to `health.ts`.

- [ ] **Step 1: Failing test `reporting-stubs.spec.ts`**

```ts
it("ExportD101Casillas returns UNIMPLEMENTED with a pointer to Fase 3", async () => {
  const res = new InvoiceReportingClient(channel).exportD101Casillas({ period: 2026 });
  await expect(res).rejects.toMatchObject({ code: status.UNIMPLEMENTED });
});
it("ExportDonationsSummary returns UNIMPLEMENTED pointing to Fase 2", async () => { /* … */ });
it("InvoiceHealth.GetCircuitBreakerState returns current per-authority state", async () => { /* … */ });
```

- [ ] **Step 2: Implement `reporting.ts`** — 4 RPCs. All return `status.UNIMPLEMENTED` with a `google.rpc.DebugInfo` detail pointing at the Fase that will land the implementation.

- [ ] **Step 3: Extend `health.ts`** with `GetQueueDepth` + `GetCircuitBreakerState` + `CheckAuthorityHealth` RPCs.

- [ ] **Step 4: Run**

Run: `pnpm --filter @lapc506/invoice-core-server test reporting-stubs health-extras`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/grpc/services/reporting.ts packages/server/src/grpc/services/health.ts
git commit -m "feat(grpc): add InvoiceReporting stubs + InvoiceHealth extras"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 46 — Reporting stubs + Health extras" \
  --label "phase/1,scope/grpc,type/feat" \
  --body "Reporting RPCs return UNIMPLEMENTED pointing to later fases; Health exposes queue depth + CB state + authority health."
```

---

## Task 47 — Fastify REST `:8766` (standalone-only admin) + webhook route + OpenAPI

**Files:** `packages/server/src/rest/{fastify-app,openapi.yaml}` + `rest/routes/{admin,inbox,webhook-hacienda,health}.ts`.

- [ ] **Step 1: Failing test `rest-admin.spec.ts`**

```ts
it("POST /v1/invoices with bearer token returns 202 + claveNumerica", async () => {
  const app = await buildTestApp({ mode: "standalone" });
  const res = await app.inject({ method: "POST", url: "/v1/invoices", headers: { authorization: "Bearer dev" }, payload: sampleInvoiceBody() });
  expect(res.statusCode).toBe(202);
});
it("POST /v1/invoices without bearer returns 401", async () => { /* … */ });
it("REST server does not start in sidecar mode", async () => { /* … */ });
```

- [ ] **Step 2: Implement `fastify-app.ts`** — Fastify 5 with helmet + CORS (configurable) + compress + `@fastify/bearer-auth` for Bearer token from env.

- [ ] **Step 3: Implement `routes/admin.ts`** — admin routes mirror gRPC subset (`POST /v1/invoices`, `POST /v1/credit-notes`, `POST /v1/documents/:id:cancel`, `GET /v1/documents/:id`, `GET /v1/documents?...`).

- [ ] **Step 4: Implement `routes/inbox.ts`** — `GET /v1/inbound`, `POST /v1/inbound/:id:respond`, `POST /v1/inbound/:id:reconcile`.

- [ ] **Step 5: Implement `routes/webhook-hacienda.ts`** — HMAC-verified inbound webhook (reuses adapter from Task 42).

- [ ] **Step 6: Implement `routes/health.ts`** — GET `/healthz` + `/readyz`.

- [ ] **Step 7: Author `rest/openapi.yaml`** describing all routes. Render via Stoplight Elements in docs (Task 57).

- [ ] **Step 8: Run**

Run: `pnpm --filter @lapc506/invoice-core-server test rest`
Expected: admin + webhook + health green.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/rest/
git commit -m "feat(rest): add Fastify REST server (:8766 standalone) + webhook + OpenAPI"
```

- [ ] **Step 10: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 47 — REST :8766 + OpenAPI" \
  --label "phase/1,scope/rest,type/feat,security/credentials,priority/p0" \
  --body "Fastify 5 app: admin + inbox + webhook + health routes. Bearer auth for standalone. OpenAPI spec for docs rendering."
```

---

## Task 48 — Entry-points: `bin/standalone.ts` + `bin/sidecar.ts` + `bin/migrate.ts` + worker spawners

**Files:** `packages/server/src/bin/{standalone,sidecar,migrate}.ts` + `packages/server/src/workers/{submission,status-poll,inbound-polling,certificate-expiry}.ts`.

- [ ] **Step 1: Failing test `entrypoints.smoke.ts`**

```ts
it("bin/standalone.ts spawns and binds gRPC + REST; SIGTERM drains cleanly", async () => {
  const proc = spawn("node", ["dist/bin/standalone.js"], { env: { ...testEnv, DEPLOYMENT_MODE: "standalone" } });
  await waitForPort(50061);
  await waitForPort(8766);
  proc.kill("SIGTERM");
  const code = await waitExit(proc);
  expect(code).toBe(0);
});
it("bin/sidecar.ts binds only loopback gRPC", async () => { /* … */ });
it("bin/migrate.ts runs drizzle migrations + CABYS sample ingest", async () => { /* … */ });
```

- [ ] **Step 2: Implement `bin/standalone.ts`**

Boots `composition.wire()`, starts gRPC + REST, installs SIGTERM handler that drains workers → closes servers → closes Pg/Redis within 30s deadline.

- [ ] **Step 3: Implement `bin/sidecar.ts`** — same as standalone minus REST; binds loopback only.

- [ ] **Step 4: Implement `bin/migrate.ts`** — runs drizzle migrator, then seeds a 100-row CABYS sample if DB empty.

- [ ] **Step 5: Implement worker spawners** under `workers/` that are launched in-process from the entrypoints.

- [ ] **Step 6: Run**

Run: `pnpm --filter @lapc506/invoice-core-server build && pnpm --filter @lapc506/invoice-core-server test:smoke`
Expected: all entrypoints smoke-green.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/bin/ packages/server/src/workers/
git commit -m "feat(server): add standalone/sidecar/migrate entrypoints + worker spawners"
```

- [ ] **Step 8: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 48 — Entrypoints + workers" \
  --label "phase/1,scope/server,type/feat,priority/p0" \
  --body "bin/standalone + bin/sidecar + bin/migrate + worker spawners with SIGTERM drain."
```

---

## Task 49 — Dockerfile multi-stage + .dockerignore

**Files:** `Dockerfile`, `.dockerignore`.

- [ ] **Step 1: Failing test `docker-build.smoke.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
docker buildx build --check .        # Dockerfile lint via buildx
IMG=$(docker build -q -t invoice-core:smoke .)
docker run --rm --entrypoint=node "$IMG" -e "console.log('ok')"
```

- [ ] **Step 2: Write `Dockerfile`**

Stages:
- `FROM node:22.11-bookworm-slim AS base` — set PNPM_HOME, install corepack.
- `FROM base AS deps` — copy manifests + `pnpm install --frozen-lockfile --prod=false`.
- `FROM deps AS builder` — copy sources, `pnpm proto:gen && pnpm build`.
- `FROM base AS runtime` — non-root user (`invoice:invoice` UID 10001), copy `packages/*/dist` + pruned `node_modules` via `pnpm deploy`, set `HEALTHCHECK CMD node dist/bin/healthcheck.js`.

- [ ] **Step 3: Write `.dockerignore`** — excludes `node_modules`, `dist`, `coverage`, `.git`, `docs/`, `charts/`, `*.p12`.

- [ ] **Step 4: Run smoke**

```bash
bash scripts/docker-build.smoke.sh
```

Expected: image builds ≤ 2 min cold, final image < 300 MB.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore scripts/docker-build.smoke.sh
git commit -m "feat(docker): add multi-stage Dockerfile + smoke test"
```

- [ ] **Step 6: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 49 — Dockerfile" \
  --label "phase/1,scope/docker,type/infra" \
  --body "Multi-stage Node 22 slim image; non-root user; HEALTHCHECK; < 300 MB final layer."
```

---

## Task 50 — docker-compose for local dev (postgres + redis + vault-dev + otel collector)

**Files:** `docker-compose.yml`, `docker-compose.dev.yml`, `scripts/dev-bootstrap.sh`.

- [ ] **Step 1: Failing test `compose-up.smoke.sh`**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# wait for healthchecks
until [ "$(docker inspect --format='{{.State.Health.Status}}' invoice-core-dev-postgres-1)" = "healthy" ]; do sleep 2; done
curl -fsS http://localhost:8766/healthz
docker compose down
```

- [ ] **Step 2: Write `docker-compose.yml`**

Services: `invoice-core` (built locally), `postgres:16-alpine` with healthcheck, `redis:7-alpine` with healthcheck, `hashicorp/vault:1.18` in dev mode, `otel/opentelemetry-collector-contrib:latest` (OTLP → stdout), `prom/prometheus` scraping `:9465`, `grafana/grafana` with invoice-core dashboards mounted.

- [ ] **Step 3: Write `docker-compose.dev.yml`** — dev overrides: source mounted as volume, `command: ["pnpm","--filter","@lapc506/invoice-core-server","dev"]`, vault seeded with a dev `.p12`.

- [ ] **Step 4: Write `scripts/dev-bootstrap.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
pnpm install
pnpm proto:gen
pnpm --filter @lapc506/invoice-core-server build
node packages/server/dist/bin/migrate.js
vault kv put -mount=secret invoice-core/certificates/dev @fixtures/dev.p12
```

- [ ] **Step 5: Run**

```bash
bash scripts/compose-up.smoke.sh
```

Expected: all services healthy; REST `/healthz` returns 200.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml scripts/dev-bootstrap.sh scripts/compose-up.smoke.sh
git commit -m "feat(docker): add dev compose stack + bootstrap + smoke"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 50 — docker-compose dev stack" \
  --label "phase/1,scope/docker,type/infra" \
  --body "Compose stack: invoice-core + postgres + redis + vault-dev + otel-collector + prometheus + grafana. dev-bootstrap.sh seeds vault + migrates DB."
```

---

## Task 51 — Helm chart skeleton `charts/invoice-core/`

**Files:** `charts/invoice-core/{Chart.yaml,values.yaml}` + `templates/{deployment,service,configmap,sealed-secret,servicemonitor,ingress,pdb}.yaml`.

- [ ] **Step 1: Failing test `helm-lint.sh`**

```bash
helm lint charts/invoice-core
helm template test charts/invoice-core --values charts/invoice-core/values.test.yaml | kubeconform -strict
```

- [ ] **Step 2: Write `Chart.yaml`**

```yaml
apiVersion: v2
name: invoice-core
description: Electronic invoicing sidecar for Costa Rica + MX retention + CO retention
type: application
version: 0.1.0
appVersion: "0.1.0"
```

- [ ] **Step 3: Write `values.yaml`** covering: `image.repository`, `image.tag`, `image.pullPolicy`, `mode: sidecar|standalone`, `resources.requests/limits`, `env.*`, `postgres.dsn`, `redis.url`, `vault.*`, `servicemonitor.enabled`, `ingress.*` (standalone only), `podSecurityContext`, `networkPolicy.*`.

- [ ] **Step 4: Write templates**

- `deployment.yaml` — supports mode toggle (sidecar injects alongside a host container via `sharedProcessNamespace: true`; standalone uses own Deployment).
- `service.yaml` — ClusterIP on `50061` + `8766` (standalone) / headless (sidecar).
- `configmap.yaml` — non-secret env.
- `sealed-secret.yaml` — template for Vault/sealed-secrets `.p12` + bearer token.
- `servicemonitor.yaml` — Prometheus Operator scrape on `:9465`.
- `ingress.yaml` — gated on `ingress.enabled` (standalone).
- `pdb.yaml` — PodDisruptionBudget minAvailable=1.

- [ ] **Step 5: Run**

Run: `bash scripts/helm-lint.sh`
Expected: lint clean + kubeconform passes.

- [ ] **Step 6: Commit**

```bash
git add charts/invoice-core/ scripts/helm-lint.sh
git commit -m "feat(helm): add invoice-core chart skeleton (sidecar + standalone modes)"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 51 — Helm chart" \
  --label "phase/1,scope/helm,type/infra" \
  --body "Chart supports sidecar + standalone. Deployment/Service/ConfigMap/SealedSecret/ServiceMonitor/Ingress/PDB templates. Lints clean."
```

---

## Task 52 — K8s sidecar manifest example (consumer-side reference)

**Files:** `examples/k8s/sidecar/{habitanexus-backend-with-invoice-core.yaml,kustomization.yaml}`.

- [ ] **Step 1: Failing test `sidecar-manifest.smoke.sh`**

```bash
kubectl apply --dry-run=client -f examples/k8s/sidecar/habitanexus-backend-with-invoice-core.yaml
kubeconform -strict examples/k8s/sidecar/habitanexus-backend-with-invoice-core.yaml
```

- [ ] **Step 2: Author manifest**

Two-container Pod:
- `habitanexus-backend` (placeholder image) calls `grpc://127.0.0.1:50061`.
- `invoice-core` container (our image) runs `bin/sidecar.js`, mounts `sealed-secret` with `.p12` + bearer.
- `shareProcessNamespace: false` (loopback gRPC sufficient).
- NetworkPolicy denies egress except Hacienda CR API + Postgres + Redis + Vault.

- [ ] **Step 3: Run**

Run: `bash scripts/sidecar-manifest.smoke.sh`
Expected: dry-run OK + kubeconform clean.

- [ ] **Step 4: Commit**

```bash
git add examples/k8s/sidecar/ scripts/sidecar-manifest.smoke.sh
git commit -m "feat(helm): add sidecar example manifest for consumer backends"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 52 — Sidecar example manifest" \
  --label "phase/1,scope/helm,type/infra,type/docs" \
  --body "Reference Pod spec for consumer backends (HabitaNexus, AltruPets, Vertivolatam, AduaNext) running invoice-core as sidecar on 127.0.0.1:50061."
```

---

## Task 53 — Standalone deployment manifest example

**Files:** `examples/k8s/standalone/{deployment,service,ingress,networkpolicy}.yaml`.

- [ ] **Step 1: Failing test `standalone-manifest.smoke.sh`**

```bash
kubectl apply --dry-run=client -k examples/k8s/standalone/
kubeconform -strict examples/k8s/standalone/*.yaml
```

- [ ] **Step 2: Author manifests**

- `deployment.yaml` — 2 replicas, `bin/standalone.js`, probes on `/healthz` + `/readyz`.
- `service.yaml` — ClusterIP exposing `50061` + `8766` + `9465`.
- `ingress.yaml` — routes `invoice.<cluster-domain>` to REST `:8766` with cert-manager TLS.
- `networkpolicy.yaml` — ingress limited to trusted CIDRs; egress to Hacienda + Postgres + Redis + Vault.

- [ ] **Step 3: Run**

Run: `bash scripts/standalone-manifest.smoke.sh`
Expected: dry-run OK + kubeconform clean.

- [ ] **Step 4: Commit**

```bash
git add examples/k8s/standalone/ scripts/standalone-manifest.smoke.sh
git commit -m "feat(helm): add standalone example manifests"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 53 — Standalone example manifest" \
  --label "phase/1,scope/helm,type/infra" \
  --body "2-replica standalone Deployment + Service + Ingress + NetworkPolicy."
```

---

## Task 54 — CI smoke: container boots + health ping

**Files:** update `.github/workflows/ci.yml` (add `docker-smoke` job) + `scripts/ci-health-smoke.sh`.

- [ ] **Step 1: Failing test — author `scripts/ci-health-smoke.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose -f docker-compose.yml up -d postgres redis
docker build -t invoice-core:ci .
docker run -d --name ic --network host -e DATABASE_URL=postgres://invoice:invoice@localhost:5432/invoice_core -e REDIS_URL=redis://localhost:6379 -e DEPLOYMENT_MODE=standalone invoice-core:ci
for i in {1..30}; do curl -fsS http://localhost:8766/healthz && break; sleep 2; done
curl -fsS http://localhost:8766/healthz
docker logs ic | grep -q "gRPC server listening on :50061"
```

- [ ] **Step 2: Add `docker-smoke` CI job**

```yaml
docker-smoke:
  runs-on: ubuntu-latest
  needs: [build]
  steps:
    - uses: actions/checkout@v4
    - run: bash scripts/ci-health-smoke.sh
```

- [ ] **Step 3: Add `helm-lint` CI job**

```yaml
helm-lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: azure/setup-helm@v4
    - run: helm lint charts/invoice-core
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml scripts/ci-health-smoke.sh
git commit -m "ci: add docker-smoke + helm-lint jobs"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 54 — CI smoke + helm lint" \
  --label "phase/1,scope/ci,type/test" \
  --body "Container boots and answers /healthz in CI; helm chart lints on every PR."
```

---


## Task 55 — Zensical/MyST docs site skeleton

**Files:** `mkdocs.yml`, `docs/index.md`, `docs/getting-started.md`, `docs/architecture.md`.

- [ ] **Step 1: Failing test `docs-build.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
pip install --user mkdocs-material mkdocs-material-extensions mkdocs-macros-plugin myst-parser
mkdocs build --strict
```

- [ ] **Step 2: Write `mkdocs.yml`**

```yaml
site_name: invoice-core
theme:
  name: material
  features: [navigation.tabs, content.code.copy, content.tabs.link]
plugins: [search, macros]
markdown_extensions:
  - admonition
  - pymdownx.superfences
  - pymdownx.tabbed
  - pymdownx.snippets
  - myst_parser
nav:
  - Home: index.md
  - Getting Started: getting-started.md
  - Architecture: architecture.md
  - API Reference:
      - gRPC: api-reference/grpc.md
      - REST (Stoplight): api-reference/rest.md
  - Adapters:
      - Hacienda CR: adapters/hacienda-cr.md
  - Operations:
      - Deployment: operations/deployment.md
      - Observability: operations/observability.md
```

- [ ] **Step 3: Write `docs/index.md`** — landing with spec summary + Fase 1 scope + quick-install blurb.

- [ ] **Step 4: Write `docs/architecture.md`** — pulls Mermaid diagrams from spec §3.

- [ ] **Step 5: Run**

Run: `bash scripts/docs-build.sh`
Expected: `site/` directory built without warnings.

- [ ] **Step 6: Commit**

```bash
git add mkdocs.yml docs/index.md docs/getting-started.md docs/architecture.md scripts/docs-build.sh
git commit -m "docs: add MkDocs Material + MyST site skeleton"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 55 — Docs site skeleton" \
  --label "phase/1,scope/docs,type/docs" \
  --body "MkDocs Material + MyST. Home, Getting Started, Architecture (pulls spec Mermaids), scaffolds for API reference + adapters + operations."
```

---

## Task 56 — Stoplight Elements embed for REST OpenAPI rendering (reuse across lapc506 startups)

**Files:** `docs/api-reference/rest.md`, `docs/_overrides/partials/stoplight.html`.

- [ ] **Step 1: Failing test `docs-rest-embed.sh`**

```bash
mkdocs build --strict
grep -q "stoplight-elements" site/api-reference/rest/index.html
```

- [ ] **Step 2: Author Stoplight embed**

`docs/api-reference/rest.md`:

```markdown
# REST API

<elements-api apiDescriptionUrl="/openapi.yaml" router="hash" layout="sidebar" />

<script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css">
```

- [ ] **Step 3: Copy `packages/server/src/rest/openapi.yaml` to `docs/openapi.yaml`** via mkdocs `include` plugin or a small build hook.

- [ ] **Step 4: Extract the Stoplight block to a partial** `docs/_overrides/partials/stoplight.html` so habitanexus/altrupets/vertivolatam/aduanext docs can reuse it via `--theme.custom_dir`.

- [ ] **Step 5: Run**

Run: `bash scripts/docs-rest-embed.sh`
Expected: `site/api-reference/rest/index.html` contains the Stoplight web component tag.

- [ ] **Step 6: Commit**

```bash
git add docs/api-reference/rest.md docs/_overrides/partials/stoplight.html scripts/docs-rest-embed.sh
git commit -m "docs: embed Stoplight Elements for REST API rendering (reusable across lapc506 startups)"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 56 — Stoplight Elements embed" \
  --label "phase/1,scope/docs,type/docs" \
  --body "REST docs render via Stoplight Elements. Reusable partial so HabitaNexus/AltruPets/Vertivolatam/AduaNext docs get the same treatment per lapc506 convention."
```

---

## Task 57 — README with quickstart (sidecar + standalone)

**Files:** `README.md`.

- [ ] **Step 1: Failing test `readme-links.sh`**

```bash
#!/usr/bin/env bash
# Fail if README references paths or scripts that do not exist.
set -euo pipefail
for p in "docker-compose.yml" "charts/invoice-core/Chart.yaml" "scripts/dev-bootstrap.sh" "examples/k8s/sidecar/habitanexus-backend-with-invoice-core.yaml" "docs/getting-started.md"; do
  test -e "$p" || { echo "Missing: $p"; exit 1; }
done
```

- [ ] **Step 2: Author `README.md`** with sections:

- Badges (CI, version, BSL 1.1 licence, Node 22).
- Short value prop (3 lines from spec §1).
- Quickstart sidecar: 6-command sequence (`helm install invoice-core ./charts/invoice-core --set mode=sidecar ...`).
- Quickstart standalone: 6-command sequence (`docker compose up`).
- Supported documents table (7 CR types + MX/CO retention stubs).
- Ports table (`:50061`, `:8766`, `:9465`).
- Pointer to full docs (`docs/getting-started.md`) and spec (`docs/superpowers/specs/...`).
- Licence + contribution pointers.

- [ ] **Step 3: Run**

Run: `bash scripts/readme-links.sh`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md scripts/readme-links.sh
git commit -m "docs: add README with sidecar + standalone quickstarts"
```

- [ ] **Step 5: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 57 — README quickstart" \
  --label "phase/1,scope/docs,type/docs" \
  --body "README with BSL 1.1 badge, sidecar + standalone quickstarts, supported docs table, ports table."
```

---

## Task 58 — CONTRIBUTING.md + SECURITY.md

**Files:** `CONTRIBUTING.md`, `SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`.

- [ ] **Step 1: Failing test `governance-files.sh`**

```bash
test -f CONTRIBUTING.md
test -f SECURITY.md
test -f .github/PULL_REQUEST_TEMPLATE.md
test -f .github/ISSUE_TEMPLATE/bug_report.yml
test -f .github/ISSUE_TEMPLATE/feature_request.yml
grep -q "BSL 1.1" CONTRIBUTING.md
grep -q "andres@dojocoding.io" SECURITY.md
```

- [ ] **Step 2: Author `CONTRIBUTING.md`** covering: BSL 1.1 CLA-less policy, Conventional Commits, TDD + coverage thresholds, per-task worktree isolation + `superpowers:executing-plans` loop, Linear + GitHub issue cross-link convention, PR checklist.

- [ ] **Step 3: Author `SECURITY.md`** covering: reporting channel `andres@dojocoding.io` + PGP key link, response SLA (72h ack), scope (production + sandbox), CVD policy, `.p12`/cert handling warning.

- [ ] **Step 4: Author PR + issue templates** — checklist mirroring spec §10 testing strategy + §12 security review.

- [ ] **Step 5: Run**

Run: `bash scripts/governance-files.sh`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add CONTRIBUTING.md SECURITY.md .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/ scripts/governance-files.sh
git commit -m "docs: add CONTRIBUTING + SECURITY + templates"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 58 — CONTRIBUTING + SECURITY" \
  --label "phase/1,scope/docs,type/docs,security/credentials" \
  --body "BSL 1.1 contribution policy; SECURITY.md with andres@dojocoding.io reporting + CVD; PR + issue templates."
```

---

## Task 59 — Adapter + operations docs

**Files:** `docs/adapters/hacienda-cr.md`, `docs/operations/deployment.md`, `docs/operations/observability.md`.

- [ ] **Step 1: Failing test `adapter-docs-build.sh`**

```bash
mkdocs build --strict
for f in adapters/hacienda-cr operations/deployment operations/observability; do
  test -f "site/${f}/index.html"
done
```

- [ ] **Step 2: Author `adapters/hacienda-cr.md`** — describes SDK wrap strategy, supported doc types, circuit-breaker behaviour, sandbox vs production env vars.

- [ ] **Step 3: Author `operations/deployment.md`** — sidecar install (`helm install`), standalone install (`docker compose`), secret rotation (hot-reload), migration playbook.

- [ ] **Step 4: Author `operations/observability.md`** — metrics catalogue from §11, log paths redacted per §12, OTel exporter config, example Grafana dashboard JSON link.

- [ ] **Step 5: Run**

Run: `bash scripts/adapter-docs-build.sh`
Expected: all three pages rendered.

- [ ] **Step 6: Commit**

```bash
git add docs/adapters/ docs/operations/ scripts/adapter-docs-build.sh
git commit -m "docs: add hacienda-cr adapter + deployment + observability docs"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 59 — Adapter + operations docs" \
  --label "phase/1,scope/docs,type/docs" \
  --body "Hacienda CR adapter + deployment + observability (metrics catalogue + PII redaction paths)."
```

---

## Task 60 — BSL 1.1 LICENSE + release v0.1.0 tag wiring

**Files:** `LICENSE`, `.github/workflows/release.yml`, `CHANGELOG.md`.

- [ ] **Step 1: Failing test `license-check.sh`**

```bash
test -f LICENSE
grep -q "Business Source License 1.1" LICENSE
grep -q "Change Date:" LICENSE
grep -q "Change License:" LICENSE
```

- [ ] **Step 2: Author `LICENSE`** — BSL 1.1 template populated for `invoice-core` with: Licensor `Luis Andres Pena Castillo`, Change Date `2030-04-16` (4-year horizon per memory `feedback_bsl_license.md`), Change License `Apache-2.0`, Additional Use Grant: production use for organisations ≤ USD 1M ARR.

- [ ] **Step 3: Author `.github/workflows/release.yml`** — triggers on tags `v*.*.*`, publishes container to GHCR, publishes `@lapc506/invoice-core-core` + `@lapc506/invoice-core-proto` + `@lapc506/invoice-core-server` to npm via `pnpm publish -r --access public`.

- [ ] **Step 4: Author `CHANGELOG.md`** — seed with Fase 1 scope header.

- [ ] **Step 5: Run**

Run: `bash scripts/license-check.sh`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add LICENSE .github/workflows/release.yml CHANGELOG.md scripts/license-check.sh
git commit -m "chore: add BSL 1.1 LICENSE + release workflow + CHANGELOG"
```

- [ ] **Step 7: Retro GitHub issue**

```bash
gh issue create --repo lapc506/invoice-core \
  --title "[Fase 1] Task 60 — LICENSE + release workflow" \
  --label "phase/1,scope/ci,type/chore" \
  --body "BSL 1.1 with 2030-04-16 Change Date (Apache-2.0). Release workflow publishes container + npm packages on v*.*.* tags."
```

---

## Self-review — Fase 1 spec coverage

- [ ] **§3 Architecture**: hexagonal layout present. Primary adapters gRPC (`:50061`) + REST (`:8766`) wired; 17 ports defined — 5 fully wired (`DocumentRepositoryPort`, `TaxpayerRepositoryPort`, `SequenceRepositoryPort`, `CABYSRepositoryPort`, `CertificateVaultPort`, `TaxAuthorityPort`, `ReceiverMessagePort`, `InboundDocumentGatewayPort`, `SignatureVerifierPort`, `EventPublisherPort`, `ClockPort`, `IdGeneratorPort`, `RetryQueuePort`, `PIIRedactorPort`, `ReconciliationEnginePort`), 6 deferred as stubs.
- [ ] **§3.3 Deployment modes**: `bin/standalone.ts` + `bin/sidecar.ts` (Task 48) + Helm mode toggle (Task 51).
- [ ] **§4 Domain**: Document base + 9 subtypes (Invoice, Ticket, CreditNote, DebitNote, PurchaseInvoice, ExportInvoice, ReceiverMessage, DonationReceipt stub, WithholdingCertificate stub), Taxpayer + ForeignReceiver, DocumentSequence, LineItem + TaxLine + TaxBreakdown, Dispute.
- [ ] **§4.3 State machine**: Task 20 service with transition tests.
- [ ] **§5 Ports**: 17 port interfaces present; contract suites for 5 fully-wired ports.
- [ ] **§6 Proto**: 4 services, buf codegen, UNIMPLEMENTED stubs for Reporting + Donation/Withholding admin RPCs.
- [ ] **§7 Adapters**: CR full via `HaciendaCRAdapter`. MX PAC + CO DIAN deferred to Fase 5/6 (port interfaces only).
- [ ] **§9 Capability matrix**: Fase 1 rows (P0) all covered — emission 01/02/03/04/08, Mensaje Receptor, recepción + reconciliación scaffold, queue + retry + circuit breaker, CABYS, IVA + retenciones calc in domain, observability, gRPC + REST sidecar/standalone.
- [ ] **§11 Observability**: pino + OTel + prom-client with §11 metrics (Task 41).
- [ ] **§12 Security**: `.p12` via CertificateVault (Task 38), PII redaction in logs (Task 41 + middleware Task 31), mTLS interceptor (Task 44), HMAC webhooks (Task 47), BSL 1.1 licence (Task 60).
- [ ] **§14 Fase 1 roadmap**: every deliverable mapped to tasks.

Gaps deliberately deferred (each has a later-fase home):

- D-101 / D-104 / D-103 export **stubbed** in Reporting RPCs (Fase 3 `FilingDataExportPort`).
- `DonationAuthorizationPort` + `AppraisalPort` full adapters deferred to Fase 2.
- `CustomsDataPort` full adapter deferred to Fase 3.
- PAC MX (`PACMexicoAdapter`) deferred to Fase 5.
- DIAN CO (`DIANColombiaAdapter`) deferred to Fase 6.
- Multi-tenant `.p12` per taxpayer deferred (single-tenant per operator; tipo 08 handles growers).
- `OCRPort` full adapter deferred (P2).
- Event-driven emission bridge to blockchain deferred (P3).

If any check fails, open a follow-up issue `[Fase 1] gap: <topic>` before declaring Fase 1 done.

---

## Execution handoff

- Primary sub-skill: **`superpowers:subagent-driven-development`** to fan tasks out in parallel where dependencies allow. Alternative: **`superpowers:executing-plans`** for sequential execution with review checkpoints, or `/make-no-mistakes:implement` over Linear issue IDs once GitHub issues are cross-linked.
- Git strategy: one branch per task (`feat/task-NN-<slug>`), open draft PR with the task checklist copied, merge when all checkboxes green + CI passes. Rebase onto `main` before merge.
- Worktree isolation: follow `superpowers:using-git-worktrees` when multiple tasks run in parallel to avoid cross-branch pollution.
- Review rhythm: after every 10 tasks (i.e., after 20, 30, 40, 50, 60), pause for a governance review against the rubric criteria; adjust plan if findings emerge.
- Dependency order highlights:
  - Tasks 1-6 (tooling + scaffold) must land before any domain task.
  - Tasks 7-21 (domain) can be parallelised task-by-task but must precede application tasks.
  - Tasks 22-25 (ports) must land before 26-31 (use cases).
  - Task 32 (proto) must land before 43-47 (gRPC + REST).
  - Tasks 33-42 (adapters) can be parallelised but must land before 45 (Admin/Inbox wire them).
  - Tasks 49-54 (infra) depend on server build being green (Task 48).
  - Tasks 55-60 (docs + licence) can run in parallel with infra once the API surface is stable.
- Done criteria: all 60 tasks merged, CI green, `helm install invoice-core ./charts/invoice-core` works against a `kind` cluster, `IssueInvoice` E2E against Hacienda CR sandbox completes, docs render cleanly, LICENSE in place.

---

## Appendix A — Bulk issue creation script

`scripts/create-github-issues.sh`:

```bash
#!/usr/bin/env bash
# Bulk-create all Fase 1 issues on lapc506/invoice-core.
# Requires: gh auth login, labels already created via create-github-labels.sh (Task 5).
set -euo pipefail

REPO="lapc506/invoice-core"
PHASE_LABEL="phase/1"

create() {
  local number="$1" title="$2" labels="$3" body="$4"
  gh issue create \
    --repo "$REPO" \
    --title "[Fase 1] Task ${number} — ${title}" \
    --label "${PHASE_LABEL},${labels}" \
    --body "${body}"
}

create  1 "pnpm workspace scaffold"              "scope/scaffold,type/chore"                    "Initialize pnpm monorepo with strict tsconfig, Node 22 pin, env template."
create  2 "Biome lint + format"                  "scope/ci,type/chore"                          "Biome config with strict rules (no any, no console, no non-null)."
create  3 "Vitest + coverage thresholds"         "scope/ci,type/chore"                          "Root Vitest config enforcing ≥95% domain coverage."
create  4 "CI workflow"                          "scope/ci,type/chore"                          "Matrix CI: lint, typecheck, test, proto, build."
create  5 "Labels taxonomy"                      "scope/ci,type/chore"                          "Bootstrap GitHub label taxonomy (phase/scope/type/security/priority)."
create  6 "Core package skeleton"                "scope/scaffold,type/chore"                    "Scaffold packages/core with tsup + subpath exports."
create  7 "Base value objects"                   "scope/domain,type/feat"                       "UUID + ISODateTime + ISODate + Decimal."
create  8 "Money/Jurisdiction/Country/Unit VOs"  "scope/domain,type/feat"                       "Money ISO4217; Jurisdiction/Country/UnitCode enums."
create  9 "PIIString VO"                         "scope/domain,type/feat,security/pii"          "Safe-by-default PII wrapper."
create 10 "TaxId VO"                             "scope/domain,type/feat,security/pii"          "CR física/jurídica/DIMEX/NITE + MX RFC + CO NIT."
create 11 "CABYS + GTIN + ClaveNumerica"         "scope/domain,type/feat,security/signature"    "CABYS 13-digit + GTIN mod10 + clave 50-digit mod11."
create 12 "Taxpayer + ForeignReceiver"           "scope/domain,type/feat,security/pii"          "Taxpayer aggregate; ForeignReceiver for non-local ids."
create 13 "LineItem + TaxLine + TaxBreakdown"    "scope/domain,type/feat"                       "Line items with optional customs + traceability; IVA rates; aggregator."
create 14 "DocumentSequence aggregate"           "scope/domain,type/feat,security/signature"    "Per (taxpayer,branch,terminal,docType) monotonic consecutivo."
create 15 "Document base + Invoice + Ticket"    "scope/domain,type/feat"                       "Abstract base + 01/04 subtypes."
create 16 "CreditNote + DebitNote"               "scope/domain,type/feat"                       "NC/ND (02/03) with referential integrity."
create 17 "PurchaseInvoice 08 + ExportInvoice 09" "scope/domain,type/feat"                      "Factura-compra + Export skeleton."
create 18 "ReceiverMessage + Withholding/Donation stubs" "scope/domain,type/feat"               "MR full; Withholding + Donation stubs throw NotImplementedInFase1."
create 19 "Dispute aggregate"                    "scope/domain,type/feat"                       "OPEN→ESCALATED→RESOLVED/REJECTED states."
create 20 "Domain services (state/totals/clave)" "scope/domain,type/feat,security/signature"    "State machine + totals + clave builder with mod11."
create 21 "Domain events + errors barrel"        "scope/domain,type/feat,security/pii"          "9 events + typed errors; zero PII in payloads."
create 22 "Persistence ports"                    "scope/app,type/feat"                          "Document/Taxpayer/Sequence/CABYS repository ports + contracts."
create 23 "Authority + inbound ports"            "scope/app,type/feat"                          "TaxAuthority/ReceiverMessage/InboundGateway/SignatureVerifier ports + contracts."
create 24 "Infrastructure ports"                 "scope/app,type/feat,security/credentials"     "CertificateVault/EventPublisher/Clock/IdGenerator/RetryQueue/PIIRedactor/ReconciliationEngine."
create 25 "Deferred port stubs"                  "scope/app,type/feat"                          "Donation/Appraisal/Customs/Filing/OCR/AccountingSink interfaces + UnimplementedInFase1."
create 26 "IssueInvoice use case"                "scope/app,type/feat,priority/p0"              "Primary emission: lookup → seq → clave → persist → enqueue → emit. Idempotent."
create 27 "Credit/Debit + Cancel"                "scope/app,type/feat"                          "NC/ND emission + CancelDocument orchestrator."
create 28 "Ticket + PurchaseInvoice + Export"    "scope/app,type/feat"                          "Three subtype use cases."
create 29 "Inbound + Mensaje Receptor"           "scope/app,type/feat,priority/p0"              "ReceiveIncomingDocument + RespondToReceiverMessage."
create 30 "ReconcileDocument"                    "scope/app,type/feat"                          "Fase 1 in-memory reconciliation engine."
create 31 "Middleware chain"                     "scope/app,type/feat,security/pii,priority/p0" "Tracing + auth + idempotency + metrics + PII redaction."
create 32 "Proto codegen pipeline"               "scope/proto,type/feat"                        "buf lint + breaking + codegen; 4 services declared."
create 33 "HaciendaCRAdapter (builders + signer)" "scope/hacienda-cr,type/feat,security/credentials,priority/p0" "Wraps @dojocoding/hacienda-sdk; 7 builders; SDK errors → domain errors."
create 34 "Submitter + StatusPoller + metrics"   "scope/hacienda-cr,type/feat"                  "Exponential backoff + terminal-state poll + Prometheus metrics."
create 35 "Postgres schema + migrations"         "scope/postgres,type/feat,security/pii"        "8 tables via Drizzle; claveNumerica unique index; JSONB payload."
create 36 "DocumentRepositoryPg + TaxpayerRepositoryPg" "scope/postgres,type/feat,priority/p0"  "Pass shared port contracts."
create 37 "SequenceRepositoryPg + CABYS"         "scope/postgres,type/feat,security/signature,priority/p0" "Advisory-lock gap-free consecutivo (100-parallel test) + trigram CABYS search + CSV ingester."
create 38 "CertificateVault"                     "scope/vault,type/feat,security/credentials,priority/p0" "Vault + sealed-secrets + local-FS; Disposable buffers; expiry monitor."
create 39 "XAdES-EPES verifier"                  "scope/signature,type/feat,security/signature,priority/p0" "Canonicalization + digest + signature + cert chain + policy hash."
create 40 "RetryQueue + workers + circuit breaker" "scope/queue,type/feat,priority/p0"          "BullMQ + opossum (50%/20/30s); submission + status-poll workers."
create 41 "pino + OTel + prom-client"            "scope/otel,type/feat,security/pii,priority/p0" "Logger with redact paths; OTel SDK; Prometheus registry for §11 metrics."
create 42 "InboundDocumentGateway"               "scope/inbound,type/feat,security/signature"   "Webhook (HMAC) + 5-min polling worker."
create 43 "gRPC bootstrap + composition"         "scope/grpc,type/feat,priority/p0"             "gRPC :50061 + DI composition root."
create 44 "gRPC interceptors + reflection + health" "scope/grpc,type/feat,security/pii,security/credentials,priority/p0" "Tracing + auth + redaction + metrics; reflection; grpc_health_v1."
create 45 "InvoiceAdmin + InvoiceInbox services" "scope/grpc,type/feat,priority/p0"             "11 Admin RPCs + 4 Inbox RPCs wired; integration tested."
create 46 "Reporting stubs + Health extras"      "scope/grpc,type/feat"                         "Reporting UNIMPLEMENTED (→ Fase 3); queue + CB + authority health."
create 47 "REST :8766 + OpenAPI"                 "scope/rest,type/feat,security/credentials,priority/p0" "Fastify admin + inbox + webhook + health."
create 48 "Entrypoints + workers"                "scope/server,type/feat,priority/p0"           "bin/standalone + bin/sidecar + bin/migrate + worker spawners."
create 49 "Dockerfile"                           "scope/docker,type/infra"                      "Multi-stage Node 22 slim; non-root; HEALTHCHECK; <300 MB."
create 50 "docker-compose dev stack"             "scope/docker,type/infra"                      "invoice-core + postgres + redis + vault + otel + prometheus + grafana."
create 51 "Helm chart"                           "scope/helm,type/infra"                        "Sidecar + standalone modes; Deployment/Service/ConfigMap/SealedSecret/ServiceMonitor/Ingress/PDB."
create 52 "Sidecar example manifest"             "scope/helm,type/infra,type/docs"              "Reference Pod spec for consumer backends."
create 53 "Standalone example manifest"          "scope/helm,type/infra"                        "2-replica Deployment + Service + Ingress + NetworkPolicy."
create 54 "CI smoke + helm lint"                 "scope/ci,type/test"                           "Container boots and answers /healthz; chart lints."
create 55 "Docs site skeleton"                   "scope/docs,type/docs"                         "MkDocs Material + MyST; Home/Getting Started/Architecture."
create 56 "Stoplight Elements embed"             "scope/docs,type/docs"                         "Reusable REST docs partial across lapc506 startups."
create 57 "README quickstart"                    "scope/docs,type/docs"                         "Sidecar + standalone quickstarts; ports + doc type tables."
create 58 "CONTRIBUTING + SECURITY"              "scope/docs,type/docs,security/credentials"    "BSL 1.1 policy + SECURITY reporting + PR/issue templates."
create 59 "Adapter + operations docs"            "scope/docs,type/docs"                         "hacienda-cr + deployment + observability docs."
create 60 "LICENSE + release workflow"           "scope/ci,type/chore"                          "BSL 1.1 (Change Date 2030-04-16, Apache-2.0) + release on v*.*.*."

echo "Created 60 Fase 1 issues on ${REPO}."
```

Make executable: `chmod +x scripts/create-github-issues.sh`. Run after Task 5 (labels exist).

---

## Appendix B — Labels bootstrap script (summary)

Full script lives at `scripts/create-github-labels.sh` (Task 5). Label matrix:

| Namespace | Labels |
|---|---|
| `phase/` | `phase/1`, `phase/2`, `phase/3`, `phase/4`, `phase/5`, `phase/6` |
| `scope/` | `scope/scaffold`, `scope/proto`, `scope/domain`, `scope/app`, `scope/hacienda-cr`, `scope/postgres`, `scope/vault`, `scope/queue`, `scope/signature`, `scope/inbound`, `scope/otel`, `scope/grpc`, `scope/rest`, `scope/server`, `scope/docker`, `scope/helm`, `scope/docs`, `scope/ci` |
| `type/` | `type/feat`, `type/fix`, `type/chore`, `type/docs`, `type/test`, `type/refactor`, `type/infra` |
| `security/` | `security/pii`, `security/credentials`, `security/signature` |
| `priority/` | `priority/p0`, `priority/p1`, `priority/p2` |

Script uses `gh label create ... --force` (idempotent) so it is safe to re-run.

---

## Appendix C — Post-execution findings (Tasks 1–10)

Tasks 1–10 executed and merged 2026-04-21 via `/make-no-mistakes:implement` (PRs #65–#74). Seven deviations from the plan surfaced during execution. This appendix records them so future executors (Tasks 11–60) start with accurate expectations. Each finding identifies the affected task, the root cause, the resolution that shipped, and the implication for later tasks.

### C.1 · `@types/node` missing from devDependencies (affects Tasks 1 & 6)

**Symptom:** `tsconfig.base.json` declares `"types": ["node"]`, but no plan step adds `@types/node` to dependencies. TypeScript build fails on any source file importing `node:*` modules.

**Resolution shipped:**
- PR #65 (Task 1): added `@types/node@^22` to root `package.json` devDependencies.
- PR #70 (Task 6): added `@types/node@^22` to `packages/core/package.json` devDependencies.

**Implication for Tasks 11+:** every new package created under `packages/*` must include `@types/node` in its local `devDependencies`. Update the plan's per-task package-creation snippets accordingly; do not rely on hoisting via the root.

### C.2 · CI workflow rejected by GitHub Actions validator (affects Task 4)

**Symptom:** The plan's original `.github/workflows/ci.yml` used inline bash guards (`if [ -d proto ]; then ...`) for `proto-lint` and `build` jobs. The workflow parsed locally but GitHub's Actions validator refused to dispatch any jobs — the entire run never started, with no visible error on the PR.

**Resolution shipped (PR #68):** CI reduced to three jobs — `lint`, `typecheck`, `test` — each running unconditionally. `proto-lint` and `build` were dropped from Fase 1 CI.

**Implication for Tasks 11+:**
- `proto-lint` job lands with Task 32 (proto codegen pipeline), once `buf.yaml` + `.proto` files exist.
- `build` job lands with Task 48 (entrypoints + workers), once there is actual compiled output to validate.
- Avoid inline `if [ -d ... ]` guards in workflow files — GitHub's validator rejects them when the referenced path does not exist at the commit being validated. Use `paths:` triggers or separate workflows for conditional jobs.

### C.3 · Coverage thresholds fail against empty directories (affects Task 3)

**Symptom:** As soon as `src/app/index.ts` exists as `export {};`, the Vitest threshold glob `packages/core/src/app/**` matches and reports 0% coverage, failing CI before a single test for that layer is written.

**Resolution shipped (refined via PR #71 during Task 7 setup):** `vitest.config.ts` now excludes `**/index.ts` and `**/*.config.ts` from coverage collection:

```ts
coverage: {
  exclude: ["**/index.ts", "**/*.config.ts", "**/*.spec.ts", "**/node_modules/**"],
}
```

**Implication for Tasks 11+:** update plan Task 3 snippet upfront to include these excludes. Any task that introduces a new "barrel-only" `index.ts` (e.g., Task 21 — domain events + errors barrel) is already covered by the existing exclude; no per-task change needed.

### C.4 · `pnpm test --coverage` fails with "No test files found" (affects Task 4)

**Symptom:** The plan's original CI step ran `pnpm test -- --coverage`. Between Task 4 landing and Task 7 landing (when the first test file exists), Vitest exits non-zero with "No test files found", failing CI.

**Resolution shipped (PR #68):** CI step uses `pnpm test --run --passWithNoTests` until tests exist. Task 7 (PR #71) silently drops `--passWithNoTests` once the first spec lands.

**Implication for Tasks 11+:** no change needed — `--passWithNoTests` is already gone from CI. Flag documented here for reproducibility if the foundation is ever rebuilt.

### C.5 · Biome formatter is stricter than the plan's inline code samples (cross-cutting)

**Symptom:** Inline TypeScript samples in Tasks 10, 26, 33, 36–41 use multi-line discriminated union types and method-chained zod schemas that trip Biome's formatter. PRs initially fail `pnpm lint` until `pnpm lint:fix` is run.

**Resolution shipped:** every task executor ran `pnpm lint:fix` before committing (adds ~10 s per task). No behavioral change.

**Implication for Tasks 11+:** the executor workflow for every remaining task must include `pnpm lint:fix` before `git commit`. Consider adding a Husky pre-commit hook in a later task to automate this (candidate: extend Task 2 retroactively, or drop into Task 58 CONTRIBUTING as a developer-experience note).

### C.6 · UUID VO accepts any UUID version, not only v4 (affects Tasks 7 & 11)

**Symptom:** `UUID` VO in Task 7 uses `z.string().uuid()`, which accepts v1–v8 UUIDs. The test fixture happens to be v4 and passes, but a v1 UUID (which encodes the generator's MAC address — a PII leak vector) would also be accepted.

**Resolution shipped (PR #71):** none for Task 7 — merged as `z.string().uuid()`. Future tightening deferred.

**Implication for Tasks 11+:** when **Task 11 (CABYS + GTIN + ClaveNumérica)** lands, tighten the `UUID` VO schema to require v4 specifically (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`). Clave Numérica's 50-digit structure embeds a UUID-like segment and explicitly requires v4 per the SDK spec; that's the natural moment to lock the root VO.

### C.7 · Greptile IS installed on the repo (operational, no plan change)

**Symptom:** Pre-flight incorrectly reported that Greptile was not installed because it probed `gh pr view --json comments,reviews` on an already-merged PR (#2) with no bot activity logged. Greptile only posts review comments on open PRs and leaves a `check_suite` record behind after merge.

**Resolution shipped:** executor observed a queued `Greptile` check on every PR during Task 1–10 execution. No action taken because Greptile was not actively commenting.

**Implication for Tasks 11+:**
- Use `gh api repos/lapc506/invoice-core/check-suites --jq '.check_suites[].app.name' | sort -u` during pre-flight to verify installed review apps.
- If Greptile starts commenting, tag `@greptile review` per the canonical `/make-no-mistakes:implement` protocol and resolve findings before merge.
- CodeRabbit and Graphite were NOT observed in any check suite — treat as not installed until verified otherwise.

---

## Appendix D — Future executor checklist (Tasks 11–60)

Distilled from Appendix C. Before dispatching the next execution batch:

- [ ] Confirm `@types/node@^22` is in both root and per-package `devDependencies` before any new package is scaffolded.
- [ ] Before adding CI jobs, test the `.yml` against GitHub's dispatch validator — push to a throwaway branch and check `gh run list` actually fires jobs, not just that it parses locally.
- [ ] Update Task 32 scope to include the `proto-lint` CI job (previously planned for Task 4).
- [ ] Update Task 48 scope to include the `build` CI job (previously planned for Task 4).
- [ ] Every task that introduces new files under `packages/*/src/**` runs `pnpm lint:fix` before `git commit`.
- [ ] Task 11 tightens the `UUID` VO to require v4 (see C.6).
- [ ] Verify installed review apps via `gh api ... /check-suites` during pre-flight, not via PR-comment scraping.

