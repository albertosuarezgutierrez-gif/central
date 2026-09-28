-- Coberturas y garantías de CADA precio de una tarificación — 29/09/2026.
-- Plan: docs/superpowers/plans/2026-09-28-presupuesto-filtro-garantias.md (entrega 1).
--
-- Hasta hoy las coberturas solo se leían al PREPARAR un presupuesto, y solo de las
-- 2-3 opciones de portada. Para filtrar por garantía («que incluya lunas») sobre los
-- 31 precios de una tarificación hace falta saber qué cubre cada uno, y eso se lee
-- GRATIS de Codeoscopic (`GET /insurances/{id}/offers/{offerId}/coverages`) si se
-- guarda la oferta de la que sale cada precio.
--
-- Tres columnas, las tres NULL y sin backfill aquí:
--   · `oferta_id`   → la oferta inicial que contiene el precio (`PrecioComparable.ofertaId`).
--                     La escribe `guardarCotizacion` al cotizar.
--   · `coberturas`  → el SOBRE leído del vendor (mismo contrato que `presupuesto_opcion.coberturas`).
--   · `garantias`   → la clasificación de ese sobre al catálogo normalizado del ramo.
--
-- Las rellena `completarCoberturasTarificacion` (apps/asegura/lib/codeoscopic/
-- coberturas-tarificacion.ts), disparada con `after()` tras tarificar y otra vez, de red
-- de seguridad, al preparar el presupuesto. Escribe con `where coberturas is null`:
-- idempotente, nunca pisa una lectura ya hecha.
--
-- Aditiva: columnas NULL. Una fila vieja (sin `oferta_id`) sigue funcionando por el
-- camino de siempre (casar la opción con el proyecto al preparar).
--
-- 🚨 Aplicar ANTES de desplegar el código que la usa: `guardarCotizacion` escribe
-- `oferta_id` en el INSERT, y sin la columna el insert falla — y como `guardarSinTumbar`
-- se traga el error a propósito, cada tarificación pagada se quedaría SIN COPIA en
-- silencio («no ha quedado guardada» en pantalla, ni un error rojo).

alter table seguros.tarificacion_precios
  add column if not exists oferta_id text,
  add column if not exists coberturas jsonb,
  add column if not exists garantias jsonb;

comment on column seguros.tarificacion_precios.oferta_id is
  'Oferta inicial de Codeoscopic que contiene este precio (offerId). Con ella se leen sus '
  'coberturas gratis (GET /insurances/{project}/offers/{oferta}/coverages). NULL = el precio '
  'no tiene oferta en el proyecto (no todos la tienen) o la fila es anterior al 29/09/2026.';

comment on column seguros.tarificacion_precios.coberturas is
  'Coberturas de la oferta leídas del vendor. NULL = NO SE HA INTENTADO leer (aún). Si no, '
  'el sobre {estado, lista, leidasAt}: estado leidas (lista con al menos una), vacias (la '
  'compañía respondió lista vacía: es un dato), fallo (red/4xx/5xx/tiempo: lista NULL, NUNCA '
  '[] — un fallo no es «no cubre nada») o sin_oferta; lista = [{nombre, texto, incluida}] con '
  'incluida true/false/null (null = el vendor no lo dice, ver texto). Lo escribe '
  'completarCoberturasTarificacion con «where coberturas is null» (idempotente).';

comment on column seguros.tarificacion_precios.garantias is
  'Clasificación de las coberturas al catálogo normalizado del ramo (clasificarCoberturas de '
  '@central/module-seguros): {version, porClave: {clave: si|no|no_consta}}. no_consta = no '
  'sabemos (sin dato o nombre no reconocido), NUNCA «no incluye». NULL = aún no clasificada, '
  'o el ramo no tiene catálogo (auto, moto, hogar, decesos, salud y vida lo tienen). Con otra version que '
  'VERSION_CATALOGO se reclasifica desde coberturas.';
