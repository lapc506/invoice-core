#!/usr/bin/env bash
# Bootstrap / re-sync the GitHub label taxonomy for lapc506/invoice-core.
#
# Idempotent: re-running updates existing labels via `gh label create --force`.
# Safe to run repeatedly. Requires `gh auth login` and repo write access.
#
# The labels on GitHub are the source of truth; this script is the
# reproducible reference for new clones / forks.
set -euo pipefail

REPO="${REPO:-lapc506/invoice-core}"

label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" --force
}

# --- Phase --------------------------------------------------------------
label "phase/1" "0e8a16" "Roadmap phase 1"
label "phase/2" "0e8a16" "Roadmap phase 2"
label "phase/3" "0e8a16" "Roadmap phase 3"
label "phase/4" "0e8a16" "Roadmap phase 4"
label "phase/5" "0e8a16" "Roadmap phase 5"
label "phase/6" "0e8a16" "Roadmap phase 6"

# --- Scope (area of the codebase a PR/issue touches) -------------------
label "scope/proto"       "1d76db" "Area: proto"
label "scope/scaffold"    "1d76db" "Area: scaffold"
label "scope/app"         "1d76db" "Area: app"
label "scope/domain"      "1d76db" "Area: domain"
label "scope/hacienda-cr" "1d76db" "Area: hacienda-cr"
label "scope/postgres"    "1d76db" "Area: postgres"
label "scope/queue"       "1d76db" "Area: queue"
label "scope/signature"   "1d76db" "Area: signature"
label "scope/vault"       "1d76db" "Area: vault"
label "scope/inbound"     "1d76db" "Area: inbound"
label "scope/otel"        "1d76db" "Area: otel"
label "scope/grpc"        "1d76db" "Area: grpc"
label "scope/rest"        "1d76db" "Area: rest"
label "scope/docker"      "1d76db" "Area: docker"
label "scope/server"      "1d76db" "Area: server"
label "scope/ci"          "1d76db" "Area: ci"
label "scope/docs"        "1d76db" "Area: docs"
label "scope/helm"        "1d76db" "Area: helm"

# --- Type (kind of change) ---------------------------------------------
label "type/feat"     "a2eeef" "New feature"
label "type/fix"      "d73a4a" "Bug fix"
label "type/chore"    "cfd3d7" "Chore / tooling"
label "type/docs"     "0075ca" "Documentation"
label "type/refactor" "c2e0c6" "Refactor"
label "type/test"     "bfd4f2" "Tests only"
label "type/infra"    "5319e7" "Infra / deployment"

# --- Security (extra review required) ----------------------------------
label "security/pii"         "b60205" "Handles PII"
label "security/credentials" "b60205" "Handles credentials / secrets"
label "security/signature"   "b60205" "Crypto / signature critical"

# --- Priority (for phase-1 triage) -------------------------------------
label "priority/p0" "e11d21" "Must land in phase"
label "priority/p1" "fbca04" "Nice to land in phase"
label "priority/p2" "fef2c0" "Stretch"

echo "Labels bootstrapped / synced on ${REPO}."
