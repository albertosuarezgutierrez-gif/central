-- Configuración de selección en portales de cobro
ALTER TABLE cobros_grupo
  ADD COLUMN IF NOT EXISTS modo_seleccion TEXT NOT NULL DEFAULT 'una'
    CHECK (modo_seleccion IN ('una', 'varias')),
  ADD COLUMN IF NOT EXISTS permitir_cantidades BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_seleccion INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mensaje_confirmacion TEXT DEFAULT NULL;

COMMENT ON COLUMN cobros_grupo.modo_seleccion IS 'una = radio (1 ítem), varias = checkboxes (N ítems)';
COMMENT ON COLUMN cobros_grupo.permitir_cantidades IS 'Solo aplica si modo_seleccion=varias. Muestra +/- por ítem';
COMMENT ON COLUMN cobros_grupo.max_seleccion IS 'Máximo de ítems seleccionables (null = sin límite). Solo modo varias sin cantidades';
COMMENT ON COLUMN cobros_grupo.mensaje_confirmacion IS 'Texto personalizado en pantalla de pago confirmado (null = genérico)';
