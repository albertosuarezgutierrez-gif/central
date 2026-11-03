-- Felicitación de cumpleaños a EX-CLIENTES (30/10/2026, Alberto: «felicitar también a los ex-clientes con un
-- mensaje de reconquista»). Código: apps/asegura/lib/felicitaciones-exclientes.ts. SIN APLICAR: la aplica Alberto.
-- El código va ANTES que este SQL: con la puerta `ASEGURA_FELICITACIONES_EXCLIENTES` apagada no se usa, y encendida
-- sin él falla con `felicitacion_sin_migracion` antes de escribir nada.
--
--  · `variante`: qué texto le tocó ('ex_cliente' | 'posible_cliente'); NULL = felicitación de cliente en vigor.
--  · canales nuevos: 'pendiente_ok' (propuesta en Telegram esperando ✅/❌), 'enviando' (reclamada al pulsar ✅ o en
--    modo auto, justo antes de mandar: un doble clic no manda dos) y 'descartada' (❌, o caducó sin pulsar el día).
--  · La reserva por persona y año (`felicitacion_una_por_anio`) es la misma: no se repite ni se solapa con clientes.
BEGIN;
ALTER TABLE seguros.felicitacion ADD COLUMN IF NOT EXISTS variante text;
ALTER TABLE seguros.felicitacion DROP CONSTRAINT IF EXISTS felicitacion_variante;
ALTER TABLE seguros.felicitacion ADD CONSTRAINT felicitacion_variante
  CHECK (variante IS NULL OR variante IN ('ex_cliente', 'posible_cliente'));
ALTER TABLE seguros.felicitacion DROP CONSTRAINT IF EXISTS felicitacion_canal;
ALTER TABLE seguros.felicitacion ADD CONSTRAINT felicitacion_canal
  CHECK (canal IN ('correo', 'solo_app', 'pendiente_ok', 'enviando', 'descartada'));
-- `variante` se escribe solo al reservar (INSERT, ya concedido); el UPDATE sigue siendo solo de `canal`.
COMMIT;

-- Comprobación tras aplicar (debe dar 1 y el CHECK nuevo):
--   select column_name from information_schema.columns where table_schema='seguros' and table_name='felicitacion' and column_name='variante';
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'felicitacion_canal';
