-- Fecha de solicitud de la póliza (EIAC) para la ficha del portal del cliente (03/10/2026).
-- Idempotente. Medido el 03/10/2026: el rol ya la podía leer en producción; este fichero deja
-- el GRANT por escrito para que un entorno nuevo no reviente la consulta de pólizas.
GRANT SELECT (fecha_solicitud) ON seguros.polizas TO prisma_asegura_portal;
