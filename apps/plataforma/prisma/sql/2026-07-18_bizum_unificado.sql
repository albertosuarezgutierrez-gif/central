-- Unifica los envíos de Bizum de Alberto en una única subcategoría personal 'bizum'.
--
-- Alberto pidió ver el Bizum unificado en una sola categoría en vez de disperso: 47 filas con
-- subcategoria NULL (mostraban "Sin categoría..." en la cola de atención de /banca?tab=personal),
-- 27 ya barridas al cajón genérico 'otros_gasto', y 5 mal enganchadas a categorías ajenas (ocio,
-- club, restaurante_bar, supermercado) porque el motivo libre del Bizum ("ENVIO BIZUM padel")
-- casaba antes con una palabra clave de esa categoría. Código: nueva regla PRIMERA prioridad en
-- lib/subcategoria-keywords.ts (['BIZUM'] → 'bizum') + lib/destino.ts ya la asigna en la ingesta.
--
-- Aplicado en Supabase MCP el 18/07/2026.

UPDATE movimientos_bancarios
SET subcategoria = 'bizum'
WHERE destino = 'personal'
  AND importe < 0
  AND COALESCE(duplicado_estado, '') <> 'ignorado'
  AND concepto ILIKE '%BIZUM%'
  AND COALESCE(subcategoria, '') <> 'bizum';

-- Alcance: solo GASTO (Bizum enviado). Los Bizum RECIBIDOS (importe>0, 9 filas 'otros_ingreso') se
-- dejan fuera a propósito — 'bizum' no se añadió a SUBCATEGORIAS_INGRESO, es un cambio de eje
-- distinto que Alberto no pidió.
