-- 2026-09-25 — Ficha ↔ CIMA: las diferencias en las que Alberto decide «mantener
-- el mío». Se guarda la HUELLA del valor de CIMA (campo + valor normalizado,
-- `huellaDecisionCima` de `@central/module-seguros`), no el valor: si CIMA manda
-- después OTRO valor, la huella cambia y se vuelve a avisar.
--
-- ADITIVA. Reversible: DROP TABLE seguros.cima_decisiones.

CREATE TABLE IF NOT EXISTS seguros.cima_decisiones (
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias(id),
  cliente_id     uuid NOT NULL REFERENCES seguros.clientes(id) ON DELETE CASCADE,
  huella         text NOT NULL CHECK (length(huella) BETWEEN 3 AND 400),
  decidido_por   text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correduria_id, cliente_id, huella)
);

REVOKE ALL ON seguros.cima_decisiones FROM crm_seguros;
REVOKE ALL ON seguros.cima_decisiones FROM anon, authenticated;
REVOKE ALL ON seguros.cima_decisiones FROM prisma_asegura_portal;
REVOKE TRUNCATE ON seguros.cima_decisiones FROM prisma_seguros;
GRANT SELECT, INSERT, DELETE ON seguros.cima_decisiones TO prisma_seguros;
