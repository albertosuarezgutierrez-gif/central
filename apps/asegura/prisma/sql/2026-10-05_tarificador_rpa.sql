-- Tarificador RPA de Grupo ASegura (05/10/2026): un canal MÁS para cotizar en el portal de la
-- compañía lo que Codeoscopic/Avant2 no cubre (RC, comercios, comunidades). Empieza por Allianz ePAC,
-- ramo comunidades. Codeoscopic sigue siendo el canal para lo que cubre.
--
-- ⚠️ NO APLICADA. Aplicar ANTES de desplegar el código que la nombra (`lib/tarificador/*` y las rutas
--    `/api/operador/tarificador/*` y `/api/tarificador/*`). Al revés no rompe nada que exista hoy: todo
--    es aditivo y con DEFAULT, y el canal arranca APAGADO (`TARIFICADOR_RPA_ACTIVO`).
--
-- Qué hace (una transacción; idempotente: se puede re-aplicar):
--   1. `tarificaciones.canal` (codeoscopic | rpa | manual, DEFAULT codeoscopic: lo existente no cambia).
--      El invariante `simulada_sin_libro` (simulado = sin línea en el libro de Codeoscopic) pasa a
--      valer SOLO para Codeoscopic, y uno nuevo deja escrito que lo que NO es Codeoscopic no tiene ni
--      libro, ni `project_id_codeoscopic`, ni es simulado. Así ningún camino de Avant2 (emitir, ReRate,
--      reproceso, backfill de coberturas), que se agarran TODOS a `project_id_codeoscopic`, puede tocar
--      una tarificación de portal: NULL no casa con nada.
--   2. Un presupuesto que cuelga de una tarificación la exige de canal `codeoscopic` (trigger APARTE,
--      no se toca `presupuesto_no_enviar_simulado`, que reescribe el PR #4305). Un precio de portal se
--      lleva al cliente por el modelo de OFERTAS del #4305 (revisada por el corredor), no como si lo
--      hubiera dado Avant2.
--   3. `companias_integracion`: cómo se habla con cada compañía/ramo. Fail-closed: solo
--      `rpa_autorizada` automatiza (`puedeAutomatizar` de @central/module-tarificacion).
--   4. `tarificacion_trabajos`: la COLA (sin Redis ni colas externas). Una fila por trabajo; la reclama
--      el orquestador con lease y la ejecuta una máquina efímera de Fly.
--   5. Permisos: `prisma_seguros` (la app). Ni `crm_seguros` (ingesta de Manuel) ni el portal.
--
-- 🔑 Las credenciales de portal NO están aquí ni en ninguna tabla: solo el NOMBRE de la variable
--    (`credencial_clave` = 'ALLIANZ_EPAC' → fly secrets `CRED_ALLIANZ_EPAC_USER` / `_PASS`).
--
-- Se deshace con: drop trigger/func `presupuesto_tarificacion_codeoscopic`, drop table ×2, drop
-- constraint `tarificacion_fuera_de_avant2` y re-crear `simulada_sin_libro` como en
-- 2026-09-02_tarificaciones_guardadas.sql (solo si no hay filas con canal <> 'codeoscopic'), drop column canal.
BEGIN;

SET search_path = seguros, public;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. El canal de cada tarificación
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificaciones ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'codeoscopic';

ALTER TABLE seguros.tarificaciones DROP CONSTRAINT IF EXISTS tarificaciones_canal_valido;
ALTER TABLE seguros.tarificaciones
  ADD CONSTRAINT tarificaciones_canal_valido CHECK (canal IN ('codeoscopic', 'rpa', 'manual'));

-- El invariante de siempre, ahora solo donde tiene sentido (Codeoscopic tiene libro de gasto).
ALTER TABLE seguros.tarificaciones DROP CONSTRAINT IF EXISTS simulada_sin_libro;
ALTER TABLE seguros.tarificaciones
  ADD CONSTRAINT simulada_sin_libro CHECK (canal <> 'codeoscopic' OR simulado = (intento_id IS NULL));

-- 🚨 Lo que no es Codeoscopic: sin libro, sin proyecto de Avant2 y nunca simulado (un precio de portal
--    lo dio la compañía de verdad; si no, no se guarda).
ALTER TABLE seguros.tarificaciones DROP CONSTRAINT IF EXISTS tarificacion_fuera_de_avant2;
ALTER TABLE seguros.tarificaciones
  ADD CONSTRAINT tarificacion_fuera_de_avant2 CHECK (
    canal = 'codeoscopic' OR (intento_id IS NULL AND project_id_codeoscopic IS NULL AND simulado = false)
  );

COMMENT ON COLUMN seguros.tarificaciones.canal IS
  'Por dónde se tarificó: codeoscopic (Avant2, con libro de gasto), rpa (bot en el portal de la compañía, '
  'tarificador RPA) o manual. Lo que no es codeoscopic NO tiene project_id_codeoscopic ni intento_id: '
  'ningún camino de Avant2 (emitir, ReRate, reproceso, backfill) puede casarlo.';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Un presupuesto «de Avant2» no puede colgar de una tarificación de portal
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION seguros.presupuesto_tarificacion_codeoscopic()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_canal text;
BEGIN
  IF NEW.tarificacion_id IS NULL THEN
    RETURN NEW;  -- origen `ofertas` (PR #4305): sin tarificación, lo vigilan sus propios CHECK
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tarificacion_id IS NOT DISTINCT FROM OLD.tarificacion_id THEN
    RETURN NEW;
  END IF;
  SELECT t.canal INTO v_canal FROM seguros.tarificaciones t WHERE t.id = NEW.tarificacion_id;
  IF v_canal IS DISTINCT FROM 'codeoscopic' THEN
    RAISE EXCEPTION
      'presupuesto %: su tarificación es del canal % (no de Avant2); un precio de portal se presenta como OFERTA revisada, no como presupuesto de Codeoscopic',
      NEW.id, coalesce(v_canal, 'desconocido');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS presupuesto_tarificacion_codeoscopic ON seguros.presupuesto;
CREATE TRIGGER presupuesto_tarificacion_codeoscopic
  BEFORE INSERT OR UPDATE OF tarificacion_id ON seguros.presupuesto
  FOR EACH ROW EXECUTE FUNCTION seguros.presupuesto_tarificacion_codeoscopic();


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Cómo se habla con cada compañía y ramo
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.companias_integracion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias (id),
  -- Clave canónica (minúsculas, sin tildes): `claveCompania()` de @central/module-tarificacion.
  compania           text NOT NULL CHECK (compania = lower(compania) AND compania <> ''),
  ramo               text NOT NULL CHECK (ramo = lower(ramo) AND ramo <> ''),
  modo               text NOT NULL CHECK (modo IN (
                       'api_oficial', 'integracion_oficial', 'rpa_autorizada',
                       'rpa_no_confirmada', 'rpa_prohibida', 'manual')),
  -- Quién autorizó automatizar y con qué respaldo. Sin nota no hay `rpa_autorizada`.
  nota_autorizacion  text,
  -- El NOMBRE de la credencial (nunca su valor): fly secrets CRED_<clave>_USER / CRED_<clave>_PASS.
  credencial_clave   text CHECK (credencial_clave IS NULL OR credencial_clave ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
  -- Trabajos simultáneos con esta compañía (= esta credencial). Ritmo humano: 1.
  max_concurrencia   integer NOT NULL DEFAULT 1 CHECK (max_concurrencia BETWEEN 1 AND 3),
  activo             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT companias_integracion_una_por_ramo UNIQUE (correduria_id, compania, ramo),
  CONSTRAINT rpa_autorizada_con_nota CHECK (
    modo <> 'rpa_autorizada' OR (nota_autorizacion IS NOT NULL AND btrim(nota_autorizacion) <> '' AND credencial_clave IS NOT NULL)
  )
);

COMMENT ON TABLE seguros.companias_integracion IS
  'Cómo se tarifica cada compañía/ramo: api_oficial, integracion_oficial, rpa_autorizada (el bot puede '
  'entrar en el portal), rpa_no_confirmada, rpa_prohibida o manual. Fail-closed: solo rpa_autorizada '
  'automatiza. Sin credenciales: credencial_clave es el NOMBRE del fly secret, no su valor.';

ALTER TABLE seguros.companias_integracion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.companias_integracion FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.companias_integracion TO prisma_seguros;

-- La fila de Allianz / comunidades, para la correduría de Grupo ASegura (y solo si hay exactamente una).
DO $seed$
DECLARE
  v_correduria uuid;
  v_n integer;
BEGIN
  SELECT count(*)::int INTO v_n FROM seguros.corredurias WHERE nombre = 'Grupo ASegura';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'companias_integracion: se esperaba UNA correduría «Grupo ASegura» y hay %', v_n;
  END IF;
  SELECT id INTO v_correduria FROM seguros.corredurias WHERE nombre = 'Grupo ASegura';

  INSERT INTO seguros.companias_integracion
    (correduria_id, compania, ramo, modo, nota_autorizacion, credencial_clave, max_concurrencia, activo)
  VALUES
    (v_correduria, 'allianz', 'comunidades', 'rpa_autorizada',
     'Autorizada por Alberto 05/10/2026, sin confirmación escrita de Allianz', 'ALLIANZ_EPAC', 1, true)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. La cola de trabajos
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificacion_trabajos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id           uuid NOT NULL REFERENCES seguros.corredurias (id),
  -- Anclas en la cartera. `cliente_id` obligatorio: el PDF y la evidencia van a `documentos`,
  -- que exige colgar de algo (`documentos_colgado_de_algo`).
  oportunidad_id          uuid REFERENCES seguros.oportunidades (id),
  cliente_id              uuid NOT NULL REFERENCES seguros.clientes (id),
  poliza_id               uuid REFERENCES seguros.polizas (id),
  -- La tarificación que salió (canal rpa). NULL hasta que el trabajo acaba `ok`.
  tarificacion_id         uuid REFERENCES seguros.tarificaciones (id),
  compania                text NOT NULL,
  ramo                    text NOT NULL,
  -- `RiesgoComunidad` validado (validarRiesgoComunidad). Es lo ÚNICO del caso que ve el worker.
  riesgo                  jsonb NOT NULL CHECK (jsonb_typeof(riesgo) = 'object'),
  estado                  text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
                            'pendiente', 'en_curso', 'ok', 'error_reintentable',
                            'error_definitivo', 'requiere_humano', 'cancelado')),
  -- Se cuenta al RECLAMAR. Tope 2 = el primero + UN reintento, y solo de infraestructura.
  intentos                integer NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 2),
  lease_hasta             timestamptz,
  fly_machine_id          text,
  -- {tipo, mensaje, html_documento_id?} ya REDACTADO por el worker. NULL = no ha fallado.
  error                   jsonb CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  -- Captura de pantalla del fallo (o el PDF de la oferta si acabó bien).
  evidencia_documento_id  uuid REFERENCES seguros.documentos (id) ON DELETE SET NULL,
  solicitado_por          text NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  iniciado_at             timestamptz,
  terminado_at            timestamptz,

  CONSTRAINT trabajo_en_curso_con_lease CHECK (estado <> 'en_curso' OR lease_hasta IS NOT NULL),
  CONSTRAINT trabajo_ok_con_tarificacion CHECK (estado <> 'ok' OR tarificacion_id IS NOT NULL),
  CONSTRAINT trabajo_fallido_con_error CHECK (
    estado NOT IN ('error_reintentable', 'error_definitivo', 'requiere_humano') OR error IS NOT NULL
  )
);

-- La consulta caliente del orquestador: lo vivo, por compañía y antigüedad.
CREATE INDEX IF NOT EXISTS tarificacion_trabajos_vivos
  ON seguros.tarificacion_trabajos (compania, estado, created_at)
  WHERE estado IN ('pendiente', 'en_curso', 'error_reintentable');
CREATE INDEX IF NOT EXISTS tarificacion_trabajos_por_oportunidad
  ON seguros.tarificacion_trabajos (correduria_id, oportunidad_id, created_at)
  WHERE oportunidad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tarificacion_trabajos_por_cliente
  ON seguros.tarificacion_trabajos (correduria_id, cliente_id, created_at);

COMMENT ON TABLE seguros.tarificacion_trabajos IS
  'Cola del tarificador RPA (sin Redis): una fila por cotización en un portal de compañía. La reclama el '
  'orquestador (apps/asegura) con lease y la ejecuta una máquina EFÍMERA de Fly (asegura-tarificador). '
  'TARIFICAR ≠ EMITIR: el worker aborta ante cualquier paso de emisión. Sin credenciales ni PII del tomador.';

ALTER TABLE seguros.tarificacion_trabajos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificacion_trabajos FROM PUBLIC, anon, authenticated, crm_seguros;
-- Sin DELETE a propósito: un trabajo es el rastro de que un bot entró en un portal con nuestra credencial.
GRANT SELECT, INSERT, UPDATE ON seguros.tarificacion_trabajos TO prisma_seguros;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select canal, count(*) from seguros.tarificaciones group by 1;            -- todo 'codeoscopic'
--   select compania, ramo, modo, credencial_clave from seguros.companias_integracion;  -- 1 fila allianz
--   select count(*) from seguros.tarificaciones
--    where canal = 'codeoscopic' and simulado <> (intento_id is null);         -- 0
-- Ensayo (BEGIN … ROLLBACK): insertar una tarificación canal 'rpa' con project_id_codeoscopic → 23514;
-- y un presupuesto con tarificacion_id de una 'rpa' → P0001.
-- ════════════════════════════════════════════════════════════════════════════
