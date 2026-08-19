-- Validación FUERA DE MUESTRA del canal (19/08/2026, segunda tanda).
--
-- El R² de `ajusteCanal` mide lo bien que la recta describe las ventanas con las que se ajustó:
-- es circular. Si Booking cambiara su comisión o su limpieza, la pasada siguiente reajustaría
-- sobre las ventanas nuevas, volvería a salir R²=0,99 y nadie se enteraría de que el modelo con el
-- que se tarificó ayer estaba equivocado.
--
-- Lo que juzga al modelo es la PREDICCIÓN sobre ventanas que ese ajuste no vio. Esta columna es lo
-- que permite distinguirlas: el cron marca las ventanas al consumirlas, y las que siguen a NULL
-- son las únicas con las que se puede validar. NULL = «todavía no ha entrado en ningún ajuste»,
-- que es distinto de «no sirve».
ALTER TABLE pricing_escaparate ADD COLUMN IF NOT EXISTS usada_en_ajuste_at timestamptz;

COMMENT ON COLUMN pricing_escaparate.usada_en_ajuste_at IS
  'Cuando esta ventana entro en un ajuste del canal. NULL = ventana NUEVA: es la unica que puede validar fuera de muestra la recta vigente (ver validarCanal en lib/sivra/pricing-canal.ts). No la pongas a mano: la escribe /api/sivra/pricing/canal.';

CREATE INDEX IF NOT EXISTS pricing_escaparate_sin_usar_idx
  ON pricing_escaparate (property_id) WHERE usada_en_ajuste_at IS NULL;
