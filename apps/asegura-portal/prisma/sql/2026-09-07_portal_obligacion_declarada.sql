-- Las pólizas que SUBE la persona también entran en su calendario.
--
-- Hasta hoy `lib/obligaciones.ts` abría con `if (!c.vinculada) return` y solo
-- recorría las pólizas de la CARTERA: quien no es cliente de la correduría
-- podía subir su póliza, verla guardada… y no tener ningún vencimiento en su
-- calendario ni, por tanto, ningún aviso posible. La intranet la guardaba y la
-- enseñaba, nada más.
--
-- La tabla ya tenía `poliza_declarada_id`; lo que faltaba era poder hacer
-- `upsert` sobre ella. Sin esta clave el único camino era borrar y volver a
-- crear en cada sincronización, y eso se llevaría por delante `avisada_at` —
-- el sello que impide avisar dos veces —, así que cada visita a la bóveda
-- volvería a mandar el mismo correo.
--
-- 🚨 Se crea como UNIQUE de dos columnas con `poliza_declarada_id` NULLABLE. En
-- PostgreSQL dos NULL no chocan entre sí, así que esta clave NO afecta a las
-- filas que vienen de la cartera (las que tienen `poliza_id`): siguen
-- conviviendo tantas como haga falta, exactamente igual que hasta ahora con
-- `portal_obligacion_una_por_poliza`.
-- El nombre es el de su hermana, no el que pondría Prisma por defecto: la que
-- ya existe se llama `portal_obligacion_una_por_poliza` (comprobado en
-- `pg_constraint` el 07/09/2026, no supuesto). Las dos juntas se leen como lo
-- que son, una pareja.
ALTER TABLE seguros.portal_obligacion
  ADD CONSTRAINT portal_obligacion_una_por_declarada
  UNIQUE (identidad_id, poliza_declarada_id);
