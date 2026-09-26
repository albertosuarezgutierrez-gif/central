-- Los correos que tratan de UNA póliza la llevan apuntada (26/09/2026). El cron `polizas-pdf` manda el
-- PDF de la compañía a quien ya recibió el correo de la emisión DE ESA PÓLIZA: deduplicar por cliente
-- mezclaba dos emisiones del mismo cliente (una tapaba o autorizaba el envío de la otra).
ALTER TABLE seguros.correo_envio ADD COLUMN IF NOT EXISTS poliza_id uuid REFERENCES seguros.polizas (id);
CREATE INDEX IF NOT EXISTS idx_correo_envio_poliza ON seguros.correo_envio (poliza_id, tipo) WHERE poliza_id IS NOT NULL;

-- La póliza original que archiva el agente al emitir la ve el cliente en su portal («Documentos de tu
-- póliza»). Las archivadas antes de este cambio se quedaron con `false`: sin este relleno, el portal
-- diría «aún no la tenemos» teniéndola.
UPDATE seguros.documentos SET visible_por_cliente = true
WHERE tipo = 'poliza' AND subido_por = 'agente' AND poliza_id IS NOT NULL AND visible_por_cliente = false;
