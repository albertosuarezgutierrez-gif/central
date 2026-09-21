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

-- 🚨 Segunda tanda, el mismo día y por un fallo MEDIDO: AUNNA contestó desde
-- `javier.sampedro@aunnanetwork.es`, no desde el `info@aunnaasociacion.es` al que se
-- escribió. La regla no casó y la respuesta cayó al clasificador genérico. Escribir a un
-- buzón NO garantiza que la casa conteste desde ese dominio: las agrupaciones tienen una
-- sociedad detrás (aunnanetwork/aunnabroker para Aunna, Grupo PACC para Pactrebol) y
-- responde una persona con el correo corporativo de ESA sociedad. Se siembran también
-- esos dominios.
INSERT INTO correo_reglas (patron, categoria, creado_por) VALUES
  ('@aunnanetwork.es',  'asociacion-corredores', 'alberto'),
  ('@aunnabroker.es',   'asociacion-corredores', 'alberto'),
  ('@grupopacc.es',     'asociacion-corredores', 'alberto')
ON CONFLICT (patron) DO NOTHING;
