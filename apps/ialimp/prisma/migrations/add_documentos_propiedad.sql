-- Documentos generales del piso (contrato de alquiler/explotación, licencia VFT,
-- seguro, escritura, IBI, certificado energético, etc.) gestionados por el
-- propietario desde su portal. Cada documento es un objeto en el array jsonb:
--   {
--     "id": "rand",                       -- id estable para editar/borrar
--     "url": "https://…/documentos-propiedad/…",
--     "nombre": "Contrato 2026.pdf",
--     "tipo": "application/pdf",
--     "tamano": 123456,
--     "subido_at": "2026-06-02T10:00:00.000Z",
--     "categoria": "contrato|licencia_vft|seguro|escritura|impuestos|cee|suministros|otros",
--     "caducidad": "2027-01-01" | null,    -- fecha de caducidad opcional (VFT, seguros…)
--     "compartido": false,                 -- true = visible para la empresa de limpieza
--     "notas": ""
--   }
-- Scope multi-tenant: cuelga de propiedades (que ya lleva empresa_id + cliente_id).

ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS documentos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Bucket de Storage para estos documentos (público con URL impredecible, mismo
-- modelo que property-access-files). Las políticas se crean más abajo.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-propiedad', 'documentos-propiedad', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas idénticas a property-access-files (public read/insert/delete; la
-- ruta lleva {empresa_id}/{propiedad_id}/… y la URL es impredecible).
DROP POLICY IF EXISTS "documentos-propiedad: read"   ON storage.objects;
DROP POLICY IF EXISTS "documentos-propiedad: insert" ON storage.objects;
DROP POLICY IF EXISTS "documentos-propiedad: delete" ON storage.objects;
CREATE POLICY "documentos-propiedad: read"   ON storage.objects FOR SELECT USING (bucket_id = 'documentos-propiedad');
CREATE POLICY "documentos-propiedad: insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documentos-propiedad');
CREATE POLICY "documentos-propiedad: delete" ON storage.objects FOR DELETE USING (bucket_id = 'documentos-propiedad');
