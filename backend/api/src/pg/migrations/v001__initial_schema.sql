-- AISE Postgres persistence — v001 initial schema (PROD-005).
--
-- Deterministic, additive, idempotent bootstrap of the Neon persistence
-- family. EVERY statement is `CREATE ... IF NOT EXISTS`: re-running applies
-- nothing the second time, and no destructive DDL (DROP/TRUNCATE/ALTER/
-- DELETE) ever runs automatically — redeploying the application touches
-- only compute, never durable domain state (that is the whole point of
-- PROD-005). Rollbacks, when they are ever written, live in explicitly
-- named rollback files that NOTHING in the runtime calls.
--
-- The generic JSONB pattern: one row per domain record with
--   record_key TEXT  — the domain id (already filesystem-unsafe ids are
--                      safe as keys; the Fs stores hashed them, Pg does not
--                      need to);
--   payload   JSONB  — the canonical document as a queryable jsonb value;
--   canonical TEXT   — the BYTE-EXACT canonical JSON text (the same bytes
--                      the Fs stores write to disk), the source for every
--                      read-back so round-trips are byte-identical.

CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS seed_markers (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS boq_sources (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, bytes BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS boq_documents (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS boq_normalizations (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS capture_assets (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, bytes BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS capture_sessions (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS capture_batches (session_id TEXT NOT NULL, sequence INTEGER NOT NULL, batch_id TEXT NOT NULL, payload JSONB NOT NULL, canonical TEXT NOT NULL, PRIMARY KEY (session_id, sequence));

CREATE TABLE IF NOT EXISTS capture_idempotency (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS mission_revisions (mission_id TEXT NOT NULL, revision INTEGER NOT NULL, payload JSONB NOT NULL, canonical TEXT NOT NULL, PRIMARY KEY (mission_id, revision));

CREATE TABLE IF NOT EXISTS evidence_records (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS evidence_invalidations (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS evidence_links (id BIGSERIAL PRIMARY KEY, journal_key TEXT NOT NULL, payload JSONB NOT NULL, canonical TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS evidence_derivations (id BIGSERIAL PRIMARY KEY, journal_key TEXT NOT NULL, payload JSONB NOT NULL, canonical TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS case_records (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS gap_analysis_records (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
