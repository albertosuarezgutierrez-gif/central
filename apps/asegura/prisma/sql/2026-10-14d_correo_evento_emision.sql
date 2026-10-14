-- 2026-10-14d — Eventos de correo de compañías: tipo nuevo `emision` (póliza nueva).
--
-- El triaje de plataforma lee ya la «Rel. Emisión Producción» de Allianz (lista de pólizas NUEVAS en un PDF
-- adjunto; `leerCorreoEventoAseguradora` de @central/module-seguros) y la manda a
-- `POST /api/operador/correo/evento` con `tipo: 'emision'`. El CHECK de `tipo` de
-- `seguros.correo_evento_entrante` (2026-10-14_correo_evento_entrante.sql) no lo admite.
--
-- Qué se hace con una emisión (apps/asegura/lib/correo-evento.ts, `planItem`): NUNCA se crea una póliza desde
-- el correo (la fuente es CIMA) ni se escribe nota o tarea. Si CIMA ya la trae en vigor → `duplicado_cima`; si
-- no → `sin_resolver` con «póliza nueva aún no llegada por CIMA» (bandeja «Correos de compañía» de Mi mesa).
-- `importe` guarda el total del primer recibo; `detalle` el elemento leído (nº de póliza y recibo, producto,
-- fecha de efecto, prima). Sin tomador, matrícula, NIF ni IBAN.
--
-- ADITIVA: solo se ensancha el CHECK (drop + add del mismo nombre, con un valor más). Ninguna fila existente
-- deja de cumplirlo. Código ANTES que el SQL: sin esta migración el insert de una emisión choca con el CHECK y
-- el puerto responde 503 `sin_migracion` (el triaje avisa igual por Telegram con lo leído y lo declara), no 500.
--
-- El nombre `correo_evento_entrante_tipo_check` es el que Postgres pone al CHECK en línea de la columna `tipo`.
-- Comprobación previa (debe devolver UNA fila con la lista de cinco tipos):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'seguros.correo_evento_entrante'::regclass and contype = 'c' and conname like '%tipo%';
--
-- Reversible (solo si no hay filas `emision`):
--   ALTER TABLE seguros.correo_evento_entrante DROP CONSTRAINT correo_evento_entrante_tipo_check;
--   ALTER TABLE seguros.correo_evento_entrante ADD CONSTRAINT correo_evento_entrante_tipo_check
--     CHECK (tipo IN ('siniestro', 'pre_anulacion', 'impago', 'anulacion', 'suplemento'));

BEGIN;

ALTER TABLE seguros.correo_evento_entrante DROP CONSTRAINT IF EXISTS correo_evento_entrante_tipo_check;
ALTER TABLE seguros.correo_evento_entrante ADD CONSTRAINT correo_evento_entrante_tipo_check
  CHECK (tipo IN ('siniestro', 'pre_anulacion', 'impago', 'anulacion', 'suplemento', 'emision'));

COMMIT;
