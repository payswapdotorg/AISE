-- v002__reality_identity.sql — PROD-017: the reality + identity Pg twins.
--
-- Completes the durability mapping the pg/factory.ts header documented as
-- this item's follow-up: the Reality Graph ("in Pg mode reality versions
-- remain file-local") and the identity registry (FsIdentityStore under the
-- data dir) were the two per-instance surfaces left on the deployed stack —
-- the 2026-09-29 deployed seam journey proved the split live (a project
-- registered on one warm lambda instance was project_not_found on another's
-- authorize ask).
--
-- Both namespaces follow the generic record-table pattern (see records.ts):
-- one row per domain record, record_key = the domain id (identity org-scoped
-- records key on "<orgId>::<recordId>"), payload = the canonical document as
-- jsonb, canonical = the BYTE-EXACT canonical JSON the Fs twins write —
-- round-trips are identical by construction. (Statements are single-line,
-- the v001 migration discipline the deterministic splitter + fakes expect.)

CREATE TABLE IF NOT EXISTS reality_project_index (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS reality_versions (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS identity_principals (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS identity_organizations (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS identity_projects (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS identity_roles (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS identity_memberships (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS identity_retention (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS identity_audit (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
