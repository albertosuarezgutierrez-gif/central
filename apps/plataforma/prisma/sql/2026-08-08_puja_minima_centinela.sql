-- Documental, sin cambio de esquema: fija la semántica de `puja_minima` tras
-- distinguir el «Sin puja mínima» explícito del portal (PR de 08/08/2026).
-- Tres estados: número > 0 = puja mínima publicada · 0 = el portal declara
-- «Sin puja mínima» (revisado: cualquier postura es admisible) · NULL = no
-- publicada / ficha aún sin releer. El COALESCE de la ingesta/enriquecimiento
-- persiste el 0 sin que un null posterior lo pise. NUNCA filtrar con
-- `puja_minima > 0` para «tiene dato»: usar `IS NOT NULL`.
COMMENT ON COLUMN subastas.puja_minima IS
  'Puja mínima admisible. 0 = «Sin puja mínima» declarado por el portal (revisado, no hay); NULL = no publicada/sin releer. No colapsar 0 con NULL.';
COMMENT ON COLUMN subastas.cantidad_reclamada IS
  'Deuda del procedimiento (principal+intereses+costas). Vía alternativa de aprobación del remate (art. 670.4 LEC) y techo probable de la puja del ejecutante. NO es el valor por el que se puja (ese es valor_subasta).';
