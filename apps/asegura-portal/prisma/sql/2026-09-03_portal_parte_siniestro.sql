-- El parte de siniestro que abre el CLIENTE desde el portal (03/09/2026).
--
-- 🚨 Por qué NO se escribe en `seguros.siniestros`, que es donde «debería» ir:
--
--   1. `siniestros` es la CARTERA, y la llena CIMA. Una fila metida ahí por el
--      portal aparecería mezclada con las de la entidad y sin forma de saber
--      cuál la puso quién más allá de `origen`, que ya usa `gestionado_correduria`
--      para los siniestros que abre Alberto de verdad.
--   2. El rol `prisma_asegura_portal` NO tiene INSERT sobre la cartera, y darle
--      escritura sobre la tabla que ve TODA la correduría es exactamente la
--      superficie que evita que el portal sea una app aparte.
--   3. Un parte no es un siniestro: es la DECLARACIÓN de uno. Entre los dos hay
--      un paso humano (Alberto lo abre en la entidad) que la tabla tiene que
--      poder representar, porque mientras no ocurra el cliente NO está
--      comunicado con su compañía. Ver `packages/module-seguros-portal/src/parte-siniestro.ts`.
--
-- Quién escribe y quién lee:
--   · `prisma_asegura_portal` — INSERT del parte propio y SELECT para verlo.
--     **Sin UPDATE ni DELETE a propósito**: lo declarado es una comunicación,
--     no un borrador. Rectificar es mandar otro parte o llamar a Alberto.
--   · `prisma_seguros` (panel del corredor, BYPASSRLS) — lee todos y mueve el
--     estado. Es el único que puede hacerlo.
--
-- ⚠️ MEDIDO al aplicar esto (03/09/2026), porque los GRANT de abajo NO cuentan
-- la historia entera: el schema `seguros` tiene DEFAULT PRIVILEGES que dan DML
-- completo a `prisma_seguros` y a `crm_seguros` sobre CADA tabla nueva. O sea,
-- los dos salen con INSERT/UPDATE/DELETE aunque aquí solo se conceda SELECT y
-- UPDATE. `prisma_asegura_portal` NO está en esos defaults, así que su acceso
-- es exactamente el de la línea de abajo — que es la propiedad que importa y
-- está comprobada: el portal no puede reescribir lo que el cliente declaró.
--   · `crm_seguros` es el CRM de Manuel, hoy solo motor de ingesta de CIMA. Que
--     los defaults le den escritura sobre esta tabla no lo necesita nadie; es
--     una decisión del schema, no de este fichero, y por eso no se revoca aquí.
--
-- Los tres CHECK se probaron contra la BD real (INSERT dentro de un bloque con
-- ROLLBACK): los tres rechazan lo que deben. Un CHECK que nadie ha visto morder
-- es una suposición, no una garantía.

CREATE TYPE seguros.portal_parte_estado AS ENUM (
  'enviado', 'recibido', 'abierto_en_compania', 'descartado'
);

CREATE TABLE seguros.portal_parte_siniestro (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id           uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,

  -- Póliza de la CARTERA. Sin FK: `polizas` es del volcado y el rol del portal
  -- no escribe en ella; una FK ataría su borrado.
  poliza_id              uuid,
  poliza_declarada_id    uuid REFERENCES seguros.portal_poliza_declarada(id) ON DELETE SET NULL,

  -- Lo único que sabe el cliente, y nada más. Ni tramitador, ni perito, ni
  -- referencia: esos los pone la compañía y son gestión del corredor (regla de
  -- visibilidad del portal, 03/09/2026).
  descripcion            text NOT NULL,
  -- NOT NULL: sin ella no hay plazo del art. 16 LCS que contar, y obliga a
  -- Alberto a perseguir al cliente para preguntársela.
  fecha_hecho            date NOT NULL,
  -- Opcional y en texto: es APROXIMADA. Mucha gente sabe el día y no la hora, y
  -- una hora inventada en un parte de accidente es peor que ninguna.
  hora_aproximada        text CONSTRAINT portal_parte_hora_formato
                           CHECK (hora_aproximada IS NULL OR hora_aproximada ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  lugar                  text,

  -- 🚨 NULLABLE A PROPÓSITO, los dos. `NULL` = «no lo ha contestado»; `false` =
  -- «ha dicho que no». Colapsarlos deja a Alberto leyendo «sin heridos» de un
  -- accidente sobre el que nadie preguntó, y un parte con heridos se tramita en
  -- horas. Es la regla del NULL de la raíz en el peor sitio posible.
  hay_heridos            boolean,
  hay_terceros           boolean,

  estado                 seguros.portal_parte_estado NOT NULL DEFAULT 'enviado',
  -- El siniestro REAL, cuando exista. Sin FK (cartera) y sin valor por defecto:
  -- NULL aquí significa «la compañía todavía no lo sabe», que es un hecho.
  siniestro_id           uuid,

  recibido_at            timestamptz,
  abierto_en_compania_at timestamptz,
  descartado_at          timestamptz,
  motivo_descarte        text,

  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),

  -- Un parte cuelga de UNA póliza como mucho. Ninguna de las dos SÍ vale: «no
  -- sé cuál me cubre esto» es justo el caso en que el cliente necesita a Alberto.
  CONSTRAINT portal_parte_una_poliza
    CHECK (poliza_id IS NULL OR poliza_declarada_id IS NULL),

  -- 🚨 El cepo que impide que el estado MIENTA. `abierto_en_compania` es lo
  -- único que la pantalla puede contar como «tu compañía ya lo sabe»: si se
  -- pudiera poner sin sello ni siniestro, la frase más delicada del portal
  -- dependería de que nadie se equivocara al teclear un UPDATE.
  CONSTRAINT portal_parte_abierto_con_sello
    CHECK (estado <> 'abierto_en_compania'
           OR (abierto_en_compania_at IS NOT NULL AND siniestro_id IS NOT NULL))
);

CREATE INDEX portal_parte_identidad_idx ON seguros.portal_parte_siniestro (identidad_id);
-- El índice de la bandeja de Alberto: lo que todavía no ha mirado nadie.
CREATE INDEX portal_parte_sin_atender_idx
  ON seguros.portal_parte_siniestro (creado_en)
  WHERE estado = 'enviado';

GRANT SELECT, INSERT ON seguros.portal_parte_siniestro TO prisma_asegura_portal;
GRANT SELECT, UPDATE ON seguros.portal_parte_siniestro TO prisma_seguros;
