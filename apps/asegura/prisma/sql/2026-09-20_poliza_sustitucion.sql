-- Enlace de sustitución por retarificación (cambio de compañía).
--
-- Cuando se retarifica una póliza y se EMITE de verdad con otra compañía, la
-- vieja se marca `sustituida_at` y la nueva guarda `poliza_origen_id` — dos
-- columnas PROPIAS que ninguna ingesta externa toca (CIMA no las conoce, así
-- que un pull no las puede pisar). El `estado` de CIMA sobre la vieja no se
-- toca aquí: la cancelación real en la compañía la sigue confirmando CIMA por
-- su cauce normal, y `sustituida_at` es solo nuestra marca de seguimiento.
--
-- No confundir con `poliza_padre_id` (cadena de RENOVACIONES, misma compañía)
-- ni con `poliza_sustituida`/`poliza_competencia` (json del volcado del CRM
-- viejo, sin lector ni forma verificada en este repo).

alter table seguros.polizas
  add column if not exists poliza_origen_id uuid references seguros.polizas(id),
  add column if not exists sustituida_at timestamptz;

create index if not exists idx_polizas_origen_id on seguros.polizas(poliza_origen_id) where poliza_origen_id is not null;
