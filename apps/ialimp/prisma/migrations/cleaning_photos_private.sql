-- Cierra el bucket cleaning-photos: pasa a PRIVADO.
-- Ejecutar SOLO cuando el código que sirve las fotos por proxy firmado
-- (GET /api/l/photo + lib/cleaning-photos.ts) esté ya en producción.
-- Las fotos se siguen viendo porque el proxy firma con la anon key (policy SELECT).
UPDATE storage.buckets SET public = false WHERE id = 'cleaning-photos';

-- Rollback inmediato si las fotos se rompieran:
-- UPDATE storage.buckets SET public = true WHERE id = 'cleaning-photos';
