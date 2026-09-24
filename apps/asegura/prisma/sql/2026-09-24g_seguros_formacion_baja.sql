-- 2026-09-24 — Personas que dejan de distribuir seguros (formación continua IDD). Sin esto, quien se
-- va seguiría saliendo «atrasado» tres años. Una fila por persona (clave = nombre normalizado, como
-- `clavePersona` de `@central/module-seguros`); borrarla = vuelve a distribuir.
--
-- ADITIVA. Reversible: DROP TABLE seguros.formacion_baja.

CREATE TABLE IF NOT EXISTS seguros.formacion_baja (
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias(id),
  persona_clave  text NOT NULL CHECK (length(persona_clave) BETWEEN 1 AND 120),
  persona        text NOT NULL CHECK (length(btrim(persona)) BETWEEN 1 AND 120),
  desde          date NOT NULL CHECK (desde >= date '2000-01-01'),
  creada_por     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correduria_id, persona_clave)
);

REVOKE ALL ON seguros.formacion_baja FROM crm_seguros;
REVOKE ALL ON seguros.formacion_baja FROM anon, authenticated;
REVOKE ALL ON seguros.formacion_baja FROM prisma_asegura_portal;
REVOKE TRUNCATE ON seguros.formacion_baja FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.formacion_baja TO prisma_seguros;
