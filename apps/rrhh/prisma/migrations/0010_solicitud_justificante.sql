-- Justificante opcional adjunto a una solicitud de permiso (p. ej. certificado de hospitalización
-- o de defunción). Ruta del objeto en el bucket privado `rrhh-documentos` bajo prefijo `justificantes/`.
alter table rrhh.solicitudes add column if not exists justificante_path text;
