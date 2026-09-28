-- Opciones del producto de CADA precio de una tarificación — 28/09/2026.
--
-- Avant2 manda en cada cotización `formattedOptions` («Asistencia en viaje: Estándar»,
-- «Vehículo de sustitución: No»…): el valor con el que la compañía ha tarificado ESE precio.
-- Se leía (`leerOpcionesLegibles`) y se tiraba. Sin él no se puede saber si la asistencia de
-- un precio es la básica o la ampliada, y el filtro de garantías las trata igual.
--
-- Una columna, NULL y sin backfill aquí:
--   · `opciones` → sobre `{ estado, lista, leidasAt }`:
--       estado 'leidas'    → `lista` = [{ etiqueta, valor }] tal cual el vendor (puede ser []).
--       estado 'no_manda'  → el vendor no trae `formattedOptions` para ese precio (lista null).
--       estado 'sin_precio'→ la fila no casa con ningún precio del proyecto releído (lista null).
--       estado 'fallo'     → la relectura del proyecto falló (lista null).
--     NULL = NO SE HA INTENTADO leer. Nunca se colapsa a []: «[]» diría «sin opciones».
--
-- La escribe `guardarCotizacion` al tarificar y, para las filas anteriores, el cron
-- `coberturas-backfill` (relee el proyecto, gratis). Escritura con `where opciones is null`.
--
-- 🚨 Aplicar ANTES de desplegar el código: `guardarCotizacion` la escribe en el INSERT y sin
-- la columna cada tarificación pagada se quedaría sin copia en silencio.

alter table seguros.tarificacion_precios
  add column if not exists opciones jsonb;

comment on column seguros.tarificacion_precios.opciones is
  'Opciones del producto con las que el vendor tarificó este precio (formattedOptions). Sobre '
  '{estado: leidas|no_manda|sin_precio|fallo, lista, leidasAt}. NULL = no se ha intentado leer.';
