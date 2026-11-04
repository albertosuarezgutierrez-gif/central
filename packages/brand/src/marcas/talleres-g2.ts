import type { Marca } from '../tipos'

// Marca de «Talleres de Automoción G2» (taller de vehículos, Camas; piloto de apps/taller). 04/11/2026.
//
// Colores EXACTOS medidos del logo real (Drive: «talleres de automocion G2.jpg», 1080×1080, subido el 04/11/2026),
// cuantizando los píxeles no negros: blanco `#fcfcfc` (≈75k px, el «G» y «TALLERES DE»), lima `#8ffa09` (media de
// ≈84k px del «2», «AUTOMOCIÓN» y los filetes) y negro de fondo `#0a0a0a`. El logo es BLANCO+LIMA SOBRE NEGRO: es un
// logo para superficie oscura. Fuentes en `packages/brand/assets/talleres-g2/` (`logo-original.jpg` + `logo.png`
// recortado); la app copia `logo.png` a su `public/brand/` (el lockup apunta a esa ruta).
//
// 🚨 Contraste (WCAG): el lima NO sostiene texto blanco (1,3:1) ni sirve de texto sobre claro. Por eso:
//   - `sobrePrimario` = `#0a0a0a` sobre el lima: 14,9:1 (botones/chips con relleno lima, texto negro).
//   - `primarioInk` = `#407004` (lima oscurecido hacia negro, mismo tono): 5,9:1 sobre blanco → texto/enlaces en claro.
//   - En el tema oscuro el lima SÍ vale como texto: 13,9:1 sobre `#141414`.
// Tipografía: itálica ancha de automoción en el logo; en UI se usa Barlow Condensed (títulos) + Inter (cuerpo), sin
// itálicas (regla de UI del repo); el nombre se pinta con el logo real, no re-escrito.
export const MARCA_TALLERES_G2: Marca = {
  id: 'talleres-g2',
  nombre: 'Talleres de Automoción G2',
  paleta: {
    primario: '#8ffa09',
    primarioInk: '#407004',
    primarioSuave: 'rgba(143, 250, 9, 0.16)',
    sobrePrimario: '#0a0a0a',
    // El lima es el color de marca; el acento decorativo es el blanco del logo (filetes) en oscuro y el negro en claro.
    acento: '#0a0a0a',
    acentoInk: '#0a0a0a',
    acentoSuave: 'rgba(10, 10, 10, 0.08)',
    fondo: '#f7f8f5',
    fondo2: '#eef0ea',
    panel: '#ffffff',
    panel2: '#f4f6f0',
    borde: '#e1e4da',
    bordeSuave: '#ebede5',
    texto: '#0a0a0a',
    textoTenue: '#555a4e',
    textoTenue2: '#7a7f72',
    ok: '#2f9e5f',
    warn: '#9a6510',
    peligro: '#c0392f',
  },
  // El logo nace sobre negro: el tema oscuro es el «natural» de la marca.
  paletaOscura: {
    primario: '#8ffa09',
    primarioInk: '#8ffa09',
    primarioSuave: 'rgba(143, 250, 9, 0.16)',
    sobrePrimario: '#0a0a0a',
    acento: '#fcfcfc',
    acentoInk: '#fcfcfc',
    acentoSuave: 'rgba(252, 252, 252, 0.10)',
    fondo: '#0a0a0a',
    fondo2: '#141414',
    panel: '#141414',
    panel2: '#1c1c1c',
    borde: 'rgba(252, 252, 252, 0.14)',
    bordeSuave: 'rgba(252, 252, 252, 0.08)',
    texto: '#fcfcfc',
    textoTenue: '#b4b8ac',
    textoTenue2: '#8d9186',
    ok: '#4cc27f',
    warn: '#e0a63a',
    peligro: '#ff6b5e',
  },
  tipografia: {
    titulos: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
    cuerpo: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap',
  },
  logos: {
    wordmark: 'Talleres de Automoción G2',
    lockup: '/brand/talleres-g2-logo.png',
  },
  radio: '10px',
  // Decisión de Alberto (04/11/2026): todo corporativo del taller; Grupo ASegura, sutil («con Grupo ASegura»).
  coMarca: {
    texto: 'con Grupo ASegura',
    color: '#3364ee', // = MARCA_ASEGURA.paleta.primario (sin import en runtime: Node ESM exige extensión)
    colorOscuro: '#3364ee', // en oscuro (sobre #0a0a0a) da 3,96:1: válido para el sello (decorativo, ≥14 px bold), no para párrafos
    fuente: "'Quicksand', 'Nunito Sans', system-ui, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700&display=swap',
  },
}
