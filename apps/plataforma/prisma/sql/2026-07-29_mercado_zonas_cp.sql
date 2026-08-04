-- Zona por DISTRITO en capitales: el mapeo CP→distrito se aprende de los
-- anuncios del propio Fotocasa (cada anuncio embebe zipCode + district).
-- `veces` desempata cuando un CP aparece en dos distritos (anuncios fronterizos).
CREATE TABLE IF NOT EXISTS mercado_zonas_cp (
  cp text NOT NULL,
  slug_zona text NOT NULL,
  veces integer NOT NULL DEFAULT 1,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cp, slug_zona)
);
REVOKE ALL ON mercado_zonas_cp FROM anon, authenticated;
GRANT ALL ON mercado_zonas_cp TO prisma_plataforma;

-- Etiqueta legible de la zona usada («Cerro - Amate» o el municipio).
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS zona_portal text;
