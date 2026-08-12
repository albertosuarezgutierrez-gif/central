-- Verificación AUTOMÁTICA de eventos previstos.
--
-- POR QUÉ (12/08/2026, petición de Alberto: «esto tiene q ser automático, yo no sé de esta
-- información»). El descubrimiento de previstos del 01/08 terminaba en un Telegram que le pedía
-- pasar el evento a 'confirmado' a mano. Eso le pide un dato que NO tiene —si un festival
-- anunciado en prensa acabará celebrándose es trabajo de rastreo, no conocimiento del dueño de
-- los pisos— y además deja una cola humana que se atasca: un previsto sin confirmar ni descartar
-- protege el suelo (y desde la v2 del 09/08 sube el precio ponderado) de una fecha que quizá no
-- existe, para siempre.
--
-- Estas columnas son la memoria del verificador (`/api/sivra/eventos/verificar`). La clave del
-- diseño está en separar «lo he mirado y no hay nada» de «no he podido mirar»: solo las
-- verificaciones ÚTILES (`verificaciones`) autorizan a caducar un previsto. Con la búsqueda web
-- caída no se descarta NADA, se deja el latido en rojo y se reintenta mañana.
ALTER TABLE pricing_eventos_auto
  ADD COLUMN IF NOT EXISTS verificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificado_ok_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificaciones integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS veredicto text,
  ADD COLUMN IF NOT EXISTS decidido_por text;

COMMENT ON COLUMN pricing_eventos_auto.verificado_at IS
  'Último INTENTO de verificación (haya podido mirar o no). Ordena la cola del cron (NULLS FIRST).';
COMMENT ON COLUMN pricing_eventos_auto.verificado_ok_at IS
  'Última verificación que SÍ pudo mirar (prensa respondió o corroboró una fuente dura). NULL con verificado_at no NULL = se ha intentado y no se ha podido.';
COMMENT ON COLUMN pricing_eventos_auto.verificaciones IS
  'Cuántas verificaciones ÚTILES lleva. Es lo único que autoriza a descartar por caducidad: con 0, un previsto NUNCA se descarta (una búsqueda caída no es un evento inexistente).';
COMMENT ON COLUMN pricing_eventos_auto.veredicto IS
  'Etiqueta corta de la última decisión automática (corroborado_fuente_dura, prensa_confirma, mercado_confirma, desmentido, caducado, fecha_movida, sin_novedad, no_verificable) para poder auditar sin releer el código.';
COMMENT ON COLUMN pricing_eventos_auto.decidido_por IS
  'Quién fijó el estado actual: ''auto'' (el verificador) o ''alberto'' (mano humana). El cron NO toca las filas marcadas ''alberto'' — su decisión manda sobre lo que encuentre la prensa.';

-- Los comentarios de 2026-08-01 decían que confirma/descarta Alberto. Ya no.
COMMENT ON COLUMN pricing_eventos_auto.estado IS
  'confirmado = hay entradas/fecha oficial, mueve precio y suelo al factor pleno. previsto = solo prensa: protege el suelo, sube el precio ponderado por confianza si la fecha está LEJOS, y entra en el barrido de mercado. descartado = comprobado y falso/cancelado (no vuelve a proponerse). Desde el 12/08/2026 las transiciones las decide el cron /api/sivra/eventos/verificar, no la mano de Alberto.';
COMMENT ON COLUMN pricing_eventos_auto.avisado_at IS
  'HISTÓRICO: cuándo se avisó por Telegram del previsto. Sin escritor desde el 12/08/2026 — el aviso que pedía confirmar a mano se retiró al automatizar la verificación.';

-- La cola del cron: previstos vigentes ordenados por antigüedad de verificación.
CREATE INDEX IF NOT EXISTS pricing_eventos_auto_verificacion_idx
  ON pricing_eventos_auto (estado, verificado_at NULLS FIRST, rate_date);
