# invoice-core

TypeScript library for multi-country electronic invoicing (Costa Rica v4.4 + México retenciones + Colombia retención en la fuente) as a **sidecar companion** to startup backends. Wraps [`@dojocoding/hacienda-sdk`](https://github.com/DojoCodingLabs/hacienda-cr) in a hexagonal architecture and exposes gRPC services aligned with [`agentic-core`](https://github.com/lapc506/agentic-core) and `marketplace-core` patterns.

**Status**: **Pre-alpha**. Design spec approved 2026-04-16. Implementation pending.

## Why

`marketplace-core` explicitly declares "Tax reporting (TRIBU-CR, ISR — each project integrates)" as out of scope. `invoice-core` fills that gap:

- Emission + reception of electronic invoices (CR v4.4 all 7 types + Mensaje Receptor).
- Withholding certificates for MX (art. 18-D) and CO (Dec. 1091).
- Deductible donation receipts (CR Foundation modality).
- Multi-startup reuse: HabitaNexus, AltruPets Foundation, Vertivolatam, AduaNext.

## Architecture

- **Hexagonal** (Explicit Architecture, Herbert Graca).
- **gRPC sidecar** (`:50061`) with dual deployment: K8s sidecar or standalone Docker.
- **TypeScript 5.x strict** on Node 22 LTS.
- **17 ports** covering document repo, certificate vault, tax authority adapters, reconciliation, reporting, accounting sinks.
- Observability stack aligned with agentic-core (OTel + Prometheus + Loki + Tempo + Grafana).

## Design specification

Full approved design: [`docs/superpowers/specs/2026-04-16-invoice-core-design.md`](docs/superpowers/specs/2026-04-16-invoice-core-design.md)

Complementary documents (author's local workspace):

- Research findings: `2026-04-16-invoice-core-hallazgos.md`.
- Governance rubric for future `-core` decisions: `2026-04-16-core-governance-rubric.md`.

## Roadmap

| Phase | Content | Gate |
|---|---|---|
| Fase 1 | MVP v0.1: CR v4.4 + hexagonal scaffold + gRPC + sidecar deployment | — |
| Fase 2 | AltruPets Foundation donation receipts | Foundation authorized by D-408 |
| Fase 3 | AduaNext inbound + customs line data | — |
| Fase 4 | Vertivolatam export invoices (type 09) | — |
| Fase 5 | HabitaNexus MX retention certificates | SAT RFC foreign registration |
| Fase 6 | HabitaNexus CO retention | DIAN registration |
| Fase 7 | v1.0 GA | — |

## Ecosystem

Sibling libraries:

- [`agentic-core`](https://github.com/lapc506/agentic-core) — AI agent orchestration (Python, BSL 1.1).
- `marketplace-core` — product catalog + traceability (TypeScript, MIT).
- `compliance-core` — KYC + AML + PoP (TypeScript, BSL 1.1, next after invoice-core).
- `filing-core` — tax declarations (TypeScript, BSL 1.1, deferred to year 2).

## License

[Business Source License 1.1](LICENSE.md). Five-year conversion to Non-Profit OSL 3.0.
