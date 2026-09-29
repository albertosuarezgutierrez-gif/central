-- La respuesta ENTERA del vendor a cada cotización (29/09/2026, Alberto: «guarda toda la
-- información… no se puede fallar ahí»).
--
-- Hasta hoy se guardaba lo que el parser sacaba (`tarificacion_precios`) y se tiraba el resto:
-- errores de cada producto, forma de pago, duración, el `mainQuote` de cada precio. Si el parser
-- leía mal un campo, el dato bueno ya no existía en ningún sitio y volver a mirarlo costaba otros
-- 0,50€. Con la respuesta cruda, cualquier duda sobre un precio se contrasta contra lo que dijo la
-- compañía, gratis y sin volver a tarificar.
--
-- Tamaño: ~30 cotizaciones reales al mes (medido: 31 en 30 días); el jsonb va comprimido (TOAST).
-- 🔒 Lleva datos del riesgo y del tomador, igual que `peticion`: el portal del cliente NO tiene
-- GRANT sobre esta columna (sus permisos en `tarificaciones` son por columna: id, simulado).
-- NULL = cotización anterior a esta columna o simulada; nunca se inventa.

alter table seguros.tarificaciones
  add column if not exists respuesta jsonb;

comment on column seguros.tarificaciones.respuesta is
  'Cuerpo ENTERO de la respuesta del vendor al POST de cotizar. Fuente para contrastar el parser sin '
  'volver a pagar. NULL = anterior al 29/09/2026 o simulada. Contiene datos personales: no se sirve por el puerto.';
