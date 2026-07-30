-- Puja máxima CALCULADA por el agente, congelada mientras la subasta está viva.
--
-- Cierra el bucle del sistema: hasta ahora se calculaba un techo de puja para
-- cada subasta y nadie comprobaba jamás si ese techo tenía algo que ver con lo
-- que de verdad pagó el mercado. Guardándolo se puede contrastar contra
-- `importe_adjudicacion` cuando la subasta concluye (`calibracionPuja`).
--
-- ⚠️ NO confundir con `subastas_seguidas.puja_maxima`, que es el límite que
-- Alberto se pone a sí mismo. Esta es la del modelo de coste.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS puja_maxima_calc numeric;

COMMENT ON COLUMN subastas.puja_maxima_calc IS
  'Puja máxima calculada por el agente para el descuento objetivo (25%). La escribe el clasificador mientras la subasta está viva y deja de tocarse al concluir, para poder contrastarla con importe_adjudicacion.';
