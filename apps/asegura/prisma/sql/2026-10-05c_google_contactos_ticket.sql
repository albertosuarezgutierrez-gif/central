-- Ticket de inicio del OAuth de Google Contacts desde plataforma (05/10/2026).
--
-- Alberto conecta Google desde `/correduria/google-contactos` de plataforma, donde no tiene sesión
-- de asegura. plataforma pide por el puerto (`POST /api/operador/google-contactos/ticket`) un ticket
-- HMAC de 2 minutos y el navegador abre `/api/google-contactos/conectar?ticket=…`. El ticket es de
-- UN SOLO USO: `conectar` inserta aquí su `jti` (clave primaria); si ya estaba (P2002),
-- es una reutilización y se rechaza. Sin esta tabla `conectar?ticket=` falla CERRADO (`ticket_bd`)
-- y el flujo con sesión de asegura sigue como antes. Lógica: `apps/asegura/lib/google-oauth-ticket.ts`.
--
-- Filas minúsculas (jti + ids + fechas, ningún secreto); `conectar` purga las de más de 1 día.
-- 🚪 Permisos: solo `prisma_seguros`, como sus hermanas de `2026-10-05b_google_contactos.sql`.
-- 🚨 GATE DDL: no aplicar en producción sin PR-review + segundo par de ojos.

CREATE TABLE IF NOT EXISTS seguros.google_contactos_ticket_usado (
  jti            text PRIMARY KEY CHECK (length(jti) BETWEEN 16 AND 64),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias (id),
  cuenta_id      text NOT NULL,
  caduca_en      timestamptz NOT NULL,
  usado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_contactos_ticket_usado_usado_en ON seguros.google_contactos_ticket_usado (usado_en);

ALTER TABLE seguros.google_contactos_ticket_usado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.google_contactos_ticket_usado FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, DELETE ON seguros.google_contactos_ticket_usado TO prisma_seguros;
