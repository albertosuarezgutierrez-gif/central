-- Bucket privado `rrhh-documentos`: faltaba la policy de lectura, así que con RLS activo el
-- firmado de URLs (anon key) devolvía null y los documentos del expediente no se podían descargar.
-- Esta policy permite crear URLs firmadas (el bucket sigue privado; subir/borrar van con service_role).
CREATE POLICY "rrhh-documentos: read" ON storage.objects FOR SELECT USING (bucket_id = 'rrhh-documentos');
