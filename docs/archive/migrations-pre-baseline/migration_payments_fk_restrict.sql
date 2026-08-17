-- ============================================================
-- EDUCHESS — payments.user_id: ON DELETE CASCADE -> RESTRICT
-- ------------------------------------------------------------
-- Run this AFTER migration_phase11_payments.sql.
--
-- Addresses audit finding DB-02. payments.user_id shipped as ON DELETE
-- CASCADE, so deleting an auth user silently destroyed their entire
-- payment/receipt history. That contradicts the project's own rule for
-- business records: tournament_registrations and workshop_registrations are
-- ON DELETE RESTRICT for exactly this reason (see migration_security_fixes.sql
-- and migration_phase4_workshops.sql). Payments are the stronger financial
-- record, so they get the same protection — deleting a user who has payments
-- is now blocked until those payments are handled deliberately.
--
-- NOTE for a future right-to-erasure (DPDP) flow: to delete a user who has
-- paid, either delete/anonymise their payments rows first, or switch this FK
-- to ON DELETE SET NULL (which needs payments.user_id made nullable) so the
-- anonymised financial record survives the account deletion. RESTRICT is the
-- safe default chosen here; it prevents silent loss without deciding the
-- erasure policy prematurely.
--
-- Safe to re-run.
-- ============================================================

alter table public.payments
  drop constraint if exists payments_user_id_fkey;

alter table public.payments
  add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;
