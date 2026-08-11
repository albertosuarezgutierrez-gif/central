-- Lector registral de subastas: el agente ya no solo mira el campo «Cargas» de la
-- ficha (casi siempre vacío), sino que lee TODOS los documentos adjuntos —incluidas
-- las certificaciones ESCANEADAS, vía extracción de imágenes + modelo de visión— y
-- guarda el cuadro de cargas estructurado.
--
-- Contexto: el 30/07/2026 se auditó que 30 de 34 subastas vigentes decían «Cargas no
-- publicadas» teniendo la certificación colgada de su ficha del BOE.

-- Cuadro completo tal como lo devolvió el lector (cargas, rangos, literales de
-- respaldo, vía del procedimiento). Es la EVIDENCIA de dónde sale cada cifra.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS cargas_detalle jsonb;

-- Cómo se obtuvo: campo_ficha | texto_documento | ocr_ia | manual. Cambia cuánto
-- hay que fiarse del importe (ocr_ia lleva doble lectura con consenso, pero es OCR).
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS cargas_fuente text;

-- Cuántos documentos de la ficha se pudieron leer de verdad.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS documentos_leidos integer;

-- Versión del lector con la que se procesó la ficha. Al subir LECTOR_VERSION en el
-- código, las fichas quedan por debajo y se vuelven a leer solas en la siguiente
-- pasada del cron. Sin esto, una ficha mal leída se quedaba congelada para siempre
-- (el bug de `notas_edicto = ''`, que solo se reintentaba si era NULL).
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS lector_version integer DEFAULT 0;

-- Las ya procesadas por el lector viejo entran en la cola del nuevo.
UPDATE subastas SET lector_version = 0 WHERE lector_version IS NULL;

-- La cola de trabajo del cron: vigentes cuya versión de lector se ha quedado atrás.
CREATE INDEX IF NOT EXISTS idx_subastas_lector_version
  ON subastas (lector_version, fecha_fin)
  WHERE es_inmueble = true;
