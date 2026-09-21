-- Reglas de remitente para las asociaciones/agrupaciones de corredores a las que Alberto ha
-- pedido condiciones para asociarse (21/09/2026). Son reglas DETERMINISTAS a propósito: el
-- clasificador las consulta antes de llamar a la IA, así que la respuesta llega como aviso
-- inmediato aunque el modelo la habría leído como un comunicado comercial más de seguros.
--
-- Van por DOMINIO y no por dirección exacta porque en estas casas contesta quien contesta:
-- el correo salió a un buzón genérico (info@) y vuelve firmado por una persona.
INSERT INTO correo_reglas (patron, categoria, creado_por) VALUES
  ('@aunnaasociacion.es', 'asociacion-corredores', 'alberto'),
  ('@pactrebol.es',       'asociacion-corredores', 'alberto'),
  ('@infoacsa.com',       'asociacion-corredores', 'alberto'),
  ('@apromes.com',        'asociacion-corredores', 'alberto')
ON CONFLICT (patron) DO NOTHING;
