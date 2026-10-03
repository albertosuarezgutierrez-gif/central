-- Cola de REVISIÓN del descubrimiento de emisiones de Codeoscopic (03/10/2026).
--
-- El descubrimiento (`POST /api/operador/codeoscopic/descubrir-emisiones`, cron de plataforma cada
-- ~30 min) lista en Avant2 los proyectos con solicitud de emisión presentada (`GET /insurances`,
-- gratis) y registra solos los de auto/moto cuyo tomador casa por DOCUMENTO (hash del DNI) con UNA
-- sola ficha. Todo lo que NO se puede registrar sin una persona delante viene aquí, en vez de
-- escribirse a ciegas en la cartera:
--
--   sin_cliente         el documento del tomador no casa con ninguna ficha (`coincidencias` = 0)
--   varios_clientes     casa con más de una ficha viva (`coincidencias` > 1): no se elige ninguna
--   sin_documento       el proyecto no trae documento del tomador: no se demuestra de quién es
--   ramo_sin_acunar     emitida con nº de póliza en un ramo que la intranet NO acuña sola (hogar,
--                       salud, vida, decesos): «emitida sin acuñar», se registra a mano
--   emitida_sin_acunar  auto/moto aprobada con nº, pero el acuñado no cuajó (sin código DGS…)
--   estado_desconocido  Avant2 da un estado de la solicitud que no se reconoce: se mira allí
--   bloqueada           `sincronizarEmisionExterna` se negó (409/422) con un motivo (`detalle`)
--
-- Sin PII: ni nombre, ni documento, ni hash del tomador. `cliente_id` solo con un match ÚNICO (p. ej.
-- un hogar emitido de un cliente conocido). `coincidencias` NULL = «no se buscó», nunca «0».
--
-- Una sola fila ABIERTA por proyecto (índice parcial). Cuando una pasada posterior registra el
-- proyecto, la fila se cierra sola (`resuelta_por = 'descubrimiento'`). Si la cierra una PERSONA
-- (`resuelta_por` con otro valor), el descubrimiento no vuelve a mirar ese proyecto.
--
-- 🚨 Aplicar ANTES de desplegar el código que la usa: sin la tabla, cada proyecto que debería ir a
-- revisión sale como ERROR de la pasada (latido en rojo), no se pierde en silencio.

CREATE TABLE IF NOT EXISTS seguros.codeoscopic_emisiones_revision (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id           uuid NOT NULL REFERENCES seguros.corredurias (id),
  project_id_codeoscopic  varchar(50) NOT NULL CHECK (project_id_codeoscopic ~ '^[0-9]{1,12}$'),
  motivo                  text NOT NULL CHECK (motivo IN (
                            'sin_cliente', 'varios_clientes', 'sin_documento', 'ramo_sin_acunar',
                            'emitida_sin_acunar', 'estado_desconocido', 'bloqueada')),
  -- Fichas con el mismo hash de documento. NULL = no se buscó (no es «ninguna»).
  coincidencias           integer CHECK (coincidencias >= 0),
  -- `insuranceLine.id` del vendor TAL CUAL (Car, Motorcycle, Home…). NULL = el proyecto no lo dice.
  ramo_vendor             text,
  -- Veredicto leído: aprobada · pendiente · rechazada · desconocido · sin_solicitud.
  estado_emision          text,
  -- Literal del vendor (`status.name` o `status.id`).
  estado_vendor           text,
  compania                text,
  numero_poliza           text,
  cliente_id              uuid REFERENCES seguros.clientes (id) ON DELETE SET NULL,
  -- Motivo legible (sin PII): el texto del bloqueo o del acuñado fallido.
  detalle                 text,
  origen                  text NOT NULL CHECK (origen IN ('cron', 'webhook')),
  veces                   integer NOT NULL DEFAULT 1,
  primera_vez_at          timestamptz NOT NULL DEFAULT now(),
  ultima_vez_at           timestamptz NOT NULL DEFAULT now(),
  resuelta_at             timestamptz,
  resuelta_por            text
);

CREATE UNIQUE INDEX IF NOT EXISTS codeoscopic_emisiones_revision_abierta
  ON seguros.codeoscopic_emisiones_revision (correduria_id, project_id_codeoscopic)
  WHERE resuelta_at IS NULL;
CREATE INDEX IF NOT EXISTS codeoscopic_emisiones_revision_proyecto
  ON seguros.codeoscopic_emisiones_revision (correduria_id, project_id_codeoscopic);

ALTER TABLE seguros.codeoscopic_emisiones_revision ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON seguros.codeoscopic_emisiones_revision TO prisma_seguros;

COMMENT ON TABLE seguros.codeoscopic_emisiones_revision IS
  'Emisiones de Avant2 que el descubrimiento automático NO pudo registrar solo (tomador sin ficha o '
  'con varias, ramo que no se acuña, estado desconocido…). Una fila abierta por proyecto; '
  'resuelta_por = ''descubrimiento'' la cerró una pasada posterior, otro valor la cerró una persona.';
