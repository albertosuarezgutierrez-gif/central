-- Marca manual de verificación: el usuario ha revisado que este movimiento
-- está bien categorizado (destino correcto). Permite mostrar X/Y confirmados.
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS destino_confirmado boolean DEFAULT false;
