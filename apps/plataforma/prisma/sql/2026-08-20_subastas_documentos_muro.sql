-- Hasta dónde deja VER el Portal del BOE los documentos de una ficha a quien no
-- ha iniciado sesión: 'ninguno' | 'parcial' | 'total' (helper puro
-- `muroDocumental` de @central/module-subastas).
--
-- 🚨 Por qué hace falta la columna (20/08/2026, SUB-JA-2026-262097): el bloque
-- «Información complementaria» —donde el Portal lista edicto y certificación de
-- cargas— solo se enseña a usuarios identificados en unas subastas y no en
-- otras. El cron entra anónimo, recibe la ficha entera con CERO enlaces, y ese
-- «no lo veo» se grababa como `documentos = []`, que aguas abajo es «revisada y
-- el BOE no publica adjuntos» → «🟠 Cargas no publicadas: pide la certificación
-- registral antes de pujar», con la certificación colgada de la ficha.
--
-- Medido a mano ese día contra el Portal, una petición anónima por ficha: de las
-- 13 subastas vivas, 8 con muro TOTAL (las 8 que decían «no publicadas»), 1 con
-- muro PARCIAL (enseña la certificación y esconde el resto) y 4 sin muro.
-- NINGUNA de las 8 carecía de documentos.
--
-- Sin esta columna no hay forma de distinguir «no hay» de «no me lo enseñan», y
-- las dos mandan a Alberto a sitios distintos (el Registro vs. su propio login).
ALTER TABLE subastas
  ADD COLUMN IF NOT EXISTS documentos_muro text;

-- Lo ya grabado como «revisada y sin adjuntos» no se comprobó con la lista a la
-- vista: vuelve a la cola del lector para que la próxima pasada lo reclasifique
-- (o confirme el listado vacío, ahora sí sabiendo si había muro).
UPDATE subastas
   SET documentos = NULL, lector_version = 0
 WHERE fuente = 'boe'
   AND documentos = '[]'::jsonb
   AND documentos_muro IS NULL
   AND archivada_at IS NULL;

-- El semáforo GUARDADO repetía la misma negación dentro del desplegable
-- («analisis» es un snapshot que recalcula el cron `subastas-enriquecer`): se
-- sustituyen los dos puntos afectados por el texto que ya calcula el código,
-- para no dejar la ficha diciendo una cosa en el titular y la contraria abajo.
UPDATE subastas s SET analisis = (
  SELECT jsonb_agg(
    CASE
      WHEN p->>'clave' = 'cargas' AND p->>'detalle' LIKE 'Cargas no publicadas%'
        THEN jsonb_build_object('clave','cargas','nivel','ambar','detalle',
             'El Portal del BOE NO enseña los documentos de esta subasta sin iniciar sesión: entra con tu usuario y ábrelos antes de pujar (no hace falta ir al Registro).')
      WHEN p->>'clave' = 'documentacion' AND p->>'detalle' LIKE 'La ficha no publica%'
        THEN jsonb_build_object('clave','documentacion','nivel','ambar','detalle',
             'El Portal esconde los documentos de esta ficha a quien no ha iniciado sesión: ábrelos identificado antes de pujar.')
      ELSE p
    END ORDER BY idx)
  FROM jsonb_array_elements(s.analisis) WITH ORDINALITY AS t(p, idx)
)
WHERE s.documentos_muro IN ('total', 'parcial') AND s.analisis IS NOT NULL;
