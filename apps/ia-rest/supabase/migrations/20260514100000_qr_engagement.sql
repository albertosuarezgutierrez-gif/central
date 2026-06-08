-- ── QR Engagement: review funnel + fidelización ──────────────
-- Migración: 20260514100000

-- 1. Campos de engagement en restaurantes
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS google_review_url TEXT,         -- link directo a reseña Google
  ADD COLUMN IF NOT EXISTS instagram_url     TEXT,         -- perfil Instagram del restaurante
  ADD COLUMN IF NOT EXISTS web_url           TEXT;         -- web propia (para WhatsApp share)

-- 2. Enriquecer qr_valoraciones con datos de engagement
ALTER TABLE qr_valoraciones
  ADD COLUMN IF NOT EXISTS enviado_google       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS compartido_whatsapp  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_captado        TEXT,
  ADD COLUMN IF NOT EXISTS opciones_feedback    TEXT[],   -- chips seleccionados (1-3★)
  ADD COLUMN IF NOT EXISTS origen               TEXT DEFAULT 'success_page';

-- 3. RLS: permitir INSERT anónimo desde la success page
CREATE POLICY IF NOT EXISTS "anon_insert_qr_valoraciones"
  ON qr_valoraciones FOR INSERT
  WITH CHECK (true);

-- 4. RLS: permitir UPDATE del propio registro (para marcar google/whatsapp/email)
CREATE POLICY IF NOT EXISTS "anon_update_qr_valoraciones_own"
  ON qr_valoraciones FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 5. Vista para el owner: resumen de valoraciones
CREATE OR REPLACE VIEW v_qr_valoraciones_resumen AS
SELECT
  r.nombre                                         AS restaurante,
  COUNT(*)                                         AS total_valoraciones,
  ROUND(AVG(v.estrellas), 1)                       AS media_estrellas,
  COUNT(*) FILTER (WHERE v.estrellas >= 4)         AS positivas,
  COUNT(*) FILTER (WHERE v.estrellas <= 3)         AS negativas,
  COUNT(*) FILTER (WHERE v.enviado_google = true)  AS click_google,
  COUNT(*) FILTER (WHERE v.compartido_whatsapp)    AS compartido_wa,
  COUNT(*) FILTER (WHERE v.email_captado IS NOT NULL) AS emails_captados
FROM qr_valoraciones v
JOIN restaurantes r ON r.id = v.restaurante_id
GROUP BY r.id, r.nombre;
