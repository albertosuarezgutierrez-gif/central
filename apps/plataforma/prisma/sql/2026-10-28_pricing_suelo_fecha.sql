-- Suelo del PROPIETARIO por piso y FECHA para el motor de pricing (apply).
-- Motivo (28/10/2026, Alberto): Semana Santa y Feria 2027 en Duplex. El dueño sabe lo que valen esas
-- noches antes que el mercado medido (a 5 meses vista el conector apenas barre esas fechas) y quiere
-- un mínimo por noche que ningún techo derivado del mercado perfore. min_price es un suelo de COSTE
-- y min_price_finde solo distingue vie/sáb: un evento necesita su fecha.
--
-- Semántica (ver lib/sivra/pricing-suelo-fecha.ts → sueloFechaPropietario), igual que min_price_finde:
--   · la noche que EMPIEZA en `fecha`;
--   · en BASE (sin channel_markup ni cuota_fija), igual que min_price;
--   · se aplica después de primas, raíl y techos de mercado/ADR; solo max_price le gana;
--   · anula la banda muerta del 3 %; si coincide con min_price_finde, manda el mayor;
--   · sin fila = sin efecto (comportamiento idéntico al actual).
--
-- ADITIVO y seguro: tabla nueva y vacía → ningún piso cambia al aplicarla. Poner un suelo es un
-- INSERT aparte y explícito (abajo, comentado). El apply la lee con tolerancia: si el código llega
-- antes que esta migración, no hay efecto y la pasada declara la lectura `suelos_fecha` caída
-- (ok:false + Telegram + latido rojo) hasta que se aplique — conviene aplicarla ANTES del deploy.
-- ialimp no toca esta tabla.
CREATE TABLE IF NOT EXISTS pricing_suelos_fecha (
  property_id text        NOT NULL,
  fecha       date        NOT NULL,
  suelo_base  integer     NOT NULL,
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_suelos_fecha_pk PRIMARY KEY (property_id, fecha),
  CONSTRAINT pricing_suelos_fecha_suelo_positivo CHECK (suelo_base > 0)
);

COMMENT ON TABLE pricing_suelos_fecha IS
  'Suelo manual del propietario por piso y noche (eventos). En BASE (sin markup ni cuota fija), como min_price. El apply lo aplica después de raíl y techos; solo max_price le gana. Sin fila = sin efecto.';
COMMENT ON COLUMN pricing_suelos_fecha.fecha IS
  'Noche que EMPIEZA ese día (misma convención que rate_date).';
COMMENT ON COLUMN pricing_suelos_fecha.suelo_base IS
  'Precio BASE mínimo de Smoobu para esa noche. Precio huésped ≈ channel_markup × base + cuota_fija / noches_ref (pricing-canal.ts).';
COMMENT ON COLUMN pricing_suelos_fecha.motivo IS
  'Por qué (p. ej. «Semana Santa 2027»). Texto libre, solo para quien lo lea.';

-- Misma política de acceso que el resto de tablas del motor (pricing_avisos, pricing_escaparate):
-- solo los roles de las apps (privilegios por defecto del esquema). RLS sin políticas: el trigger
-- ensure_rls de la BD ya la activa en toda tabla nueva; se deja explícito e idempotente.
ALTER TABLE pricing_suelos_fecha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pricing_suelos_fecha FROM anon, authenticated;

-- ─── NO EJECUTADO: suelos de Duplex para Semana Santa y Feria 2027 (decisión de Alberto) ─────────
-- Conversión huésped → base con la MISMA recta del motor (baseDesdeGuestConFijo, pricing-canal.ts):
--   base = (huésped − cuota_fija / noches_ref) / channel_markup
-- pricing_settings de prop_duplex_center leído el 28/10/2026: channel_markup 0,951 · cuota_fija 35,4 ·
-- noches_ref 2 → 17,7 €/noche fijos · canal_recargo_uh 1,001 (solo ≤6 días vista: no aplica aquí).
-- Redondeo a 5 € HACIA ARRIBA: es un suelo, el huésped no puede ver menos que el objetivo.
--   23/03/2027  405 → (405 − 17,7)/0,951 = 407,3 → 410  (huésped 407,6)
--   24/03/2027  450 → (450 − 17,7)/0,951 = 454,6 → 455  (huésped 450,4)
--   12/04/2027  435 → (435 − 17,7)/0,951 = 438,8 → 440  (huésped 436,1)
--   13/04/2027  480 → (480 − 17,7)/0,951 = 486,1 → 490  (huésped 483,7)
--   14/04/2027  405 → (405 − 17,7)/0,951 = 407,3 → 410  (huésped 407,6)
--   18/04/2027  205 → (205 − 17,7)/0,951 = 196,9 → 200  (huésped 207,9)
-- OJO: el «huésped» es por noche en una estancia de noches_ref (2) noches; en estancias más largas la
-- cuota fija se reparte más y la noche sale algo más barata. Si el cron de canal reescribe markup o
-- cuota, el suelo (que es base) se queda y el precio huésped se mueve con ellos.
--
-- INSERT INTO pricing_suelos_fecha (property_id, fecha, suelo_base, motivo) VALUES
--   ('prop_duplex_center', '2027-03-23', 410, 'Semana Santa 2027 (huésped 405)'),
--   ('prop_duplex_center', '2027-03-24', 455, 'Semana Santa 2027 (huésped 450)'),
--   ('prop_duplex_center', '2027-04-12', 440, 'Feria 2027 (huésped 435)'),
--   ('prop_duplex_center', '2027-04-13', 490, 'Feria 2027 (huésped 480)'),
--   ('prop_duplex_center', '2027-04-14', 410, 'Feria 2027 (huésped 405)'),
--   ('prop_duplex_center', '2027-04-18', 200, 'Feria 2027 (huésped 205)')
-- ON CONFLICT (property_id, fecha) DO UPDATE SET suelo_base = EXCLUDED.suelo_base, motivo = EXCLUDED.motivo;
