-- Migration: add_documento_url_contabilidad
-- Adjunto (justificante PDF/imagen) para apuntes de contabilidad de empresa.
-- El archivo se sube al bucket público 'documentos-contables' y se guarda su URL.
ALTER TABLE documentos_contables ADD COLUMN IF NOT EXISTS documento_url TEXT;
ALTER TABLE ingresos_manuales    ADD COLUMN IF NOT EXISTS documento_url TEXT;

-- Bucket de Storage + políticas (replican el patrón de 'property-access-files')
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-contables', 'documentos-contables', true)
ON CONFLICT (id) DO NOTHING;

-- NOTA: las políticas RLS de storage.objects se crean en una migración aparte
-- (documentos_contables_storage_policies): read / insert / delete para 'public'
-- filtrando por bucket_id = 'documentos-contables'.
