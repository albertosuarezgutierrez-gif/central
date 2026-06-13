-- Normaliza la columna gastos.propiedad: los gastos antiguos guardaban el NOMBRE
-- del piso ("Luxury Busto") en vez del id ("prop_luxury_busto"). Esto los pasa al
-- id (= properties.id) para que cuadren con el desplegable, el filtro de la
-- pantalla de Gastos y el desglose de rentabilidad por piso.
-- Aplicado a Supabase wswbehlcuxqxyinousql el 2026-06-13 (34 filas migradas).
UPDATE public.gastos g
   SET propiedad = p.id, updated_at = now()
  FROM public.properties p
 WHERE g.propiedad = p.name;
