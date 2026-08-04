-- Las cargas publicadas como DOCUMENTO adjunto («CERTIFICACION DE CARGAS») no
-- rellenan el campo «Cargas» de la ficha del portal, así que el enriquecedor
-- dejaba cargas_conocidas=false aunque la certificación ya estuviera leída y
-- volcada a notas_edicto («Certificación: sin cargas de procedencia…») —
-- p.ej. SUB-JA-2026-263723 (San Pablo) salía como «Cargas no publicadas».
-- Backfill de las filas ya procesadas; el paso de documentos del cron
-- subastas-enriquecer mantiene esto al día para las nuevas.
UPDATE subastas
SET cargas_conocidas = true,
    actualizado_en = now()
WHERE (
    notas_edicto ILIKE '%sin cargas de procedencia%'
    -- Con texto de cargas (de la ficha o volcado a mano de la certificación)
    -- las cargas son conocidas por definición (misma semántica que ficha-boe.ts).
    OR cargas_texto IS NOT NULL
  )
  AND COALESCE(cargas_conocidas, false) = false;
