-- Biblioteca de empresa (F2 del módulo @iarest/module-concursos) — tabla propiedad de la app.
-- Documentos/datos reutilizables del licitador: se suben una vez y autocompletan
-- el checklist de cada concurso. Multi-tenant: SIEMPRE scopeado por empresa_id.
-- BD compartida Supabase wswbehlcuxqxyinousql. Gestión por SQL crudo.
-- OJO: se aplica a mano en Supabase, como add_concursos.sql (no se ejecuta en build).

CREATE TABLE IF NOT EXISTS biblioteca_documentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  tipo           text NOT NULL,                 -- TipoDocumentoBiblioteca del módulo
  nombre         text NOT NULL,
  storage_key    text,                          -- ruta en Supabase Storage (fichero), opcional
  vigencia_hasta date,                          -- null = no caduca
  datos          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- metadatos (p.ej. nº de póliza)
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biblioteca_documentos_empresa ON biblioteca_documentos(empresa_id);
