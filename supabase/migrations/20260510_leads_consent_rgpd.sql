-- Trazabilidad de consentimiento RGPD en leads del formulario de contacto
-- Art. 7 RGPD: el responsable debe poder demostrar que el interesado consintió
-- Art. 5.2 RGPD: principio de responsabilidad proactiva (accountability)

alter table leads
  add column if not exists consent_rgpd  boolean     not null default false,
  add column if not exists consent_at    timestamptz default now(),
  add column if not exists consent_ip    text,        -- IP anonimizada (últimos octetos a cero)
  add column if not exists email         text;        -- si no existía ya

-- Índice para auditorías: "¿todos los leads tienen consentimiento?"
create index if not exists idx_leads_consent on leads (consent_rgpd, consent_at);

comment on column leads.consent_rgpd is 'El interesado marcó la casilla de consentimiento en el formulario (art. 6.1.a + art. 7 RGPD)';
comment on column leads.consent_at   is 'Timestamp exacto del consentimiento (UTC). Evidencia para la AEPD.';
comment on column leads.consent_ip   is 'IP anonimizada del navegador en el momento del consentimiento (último octeto IPv4 puesto a 0). No se almacena IP completa.';
