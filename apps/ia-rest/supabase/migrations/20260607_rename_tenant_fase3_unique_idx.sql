-- ============================================================
-- 20260607_rename_tenant_fase3_unique_idx.sql
-- FASE 3 del rename restaurante_id -> local_id.
-- ============================================================
-- Tras migrar el código a local_id, los upsert con onConflict('local_id') /
-- ('local_id','nif') necesitan índices únicos sobre local_id (los existentes
-- estaban sobre restaurante_id). Espejo aditivo y seguro: local_id = restaurante_id
-- ya está sincronizado por el trigger de Fase 1, así que los datos cumplen unicidad.
-- Aplicada al remoto el 2026-06-07.
create unique index if not exists cobro_config_local_id_key
  on public.cobro_config (local_id);
create unique index if not exists clientes_fiscales_local_id_nif_key
  on public.clientes_fiscales (local_id, nif);
