-- ============================================================
-- NICSI NPMS — Attach Project Managers to a Managing Director
-- Migration: V9__app_user_managed_by.sql
--
-- Adds `managed_by` = the MD (username) who oversees a PM. This lets
-- an MD see only the Project Managers attached to them, while the
-- Super Admin can provision both MDs and PMs (and attach PMs to any MD).
-- ============================================================

SET search_path = nicsi_erp;

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS managed_by VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_app_user_managed_by ON app_user(managed_by);
