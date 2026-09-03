import type { Marca } from '../tipos'

// Marca de GRUPO ASEGURA (correduría de seguros, Sevilla). 03/09/2026.
//
// 🚨 De dónde salen estos valores, porque importa: NO están puestos a ojo ni
// sacados de un manual de marca (no hay). Se midieron de la app que hizo Manuel
// —`app.grupoasegura.com`, la única superficie de marca que existe hoy— así:
//
//   - Los AZULES estaban declarados en OKLCH (`oklch(0.4 0.17 265)`,
//     `oklch(0.62 0.2 265)`, `oklch(0.78 0.14 264)`) y se convirtieron a sRGB.
//     Hue 264-265 en las tres: es un azul, y es deliberado, no un accidente.
//   - El MONOGRAMA se trajo vectorial de `/icon.svg` → `public/brand/marca-asegura.svg`.
//
// ⚠️ Y lo que NO sirvió: el logo que había en Drive
// (`cropped-logo-bn-350x100-1.png`) es un recorte de WordPress de 157×45 px,
// **un solo gris `#F6F6F6` sobre transparencia** — 377 píxeles opacos de 7.065.
// Es la variante en blanco para fondos oscuros: no tiene un píxel de color, así
// que de ahí no se podía extraer ninguna paleta. Si aparece el manual de marca
// o el vectorial original a color, estos hex se sustituyen por los suyos.
//
// 📌 Las tipografías son una DECISIÓN, no una medición: la app las sirve
// self-hosted con nombres de fichero hasheados (`/_next/static/media/*.woff2`),
// así que no se puede leer qué familia usa. Se eligen aquí y se dicen como tal.
export const MARCA_ASEGURA: Marca = {
  id: 'asegura',
  nombre: 'Grupo Asegura',
  paleta: {
    // Medidos: oklch(0.4 0.17 265) / oklch(0.62 0.2 265) / oklch(0.78 0.14 264).
    primario: '#193BA1',
    primarioInk: '#122B75',
    primarioSuave: 'rgba(25, 59, 161, 0.10)',
    acento: '#497CFD',
    acentoInk: '#2F5FD9',
    acentoSuave: 'rgba(73, 124, 253, 0.14)',
    // Neutros con sesgo frío hacia el azul de marca: un gris puro al lado de
    // este azul se ve sucio, y además delata que no se eligió.
    fondo: '#F5F7FB',
    fondo2: '#EDF1F8',
    panel: '#FFFFFF',
    panel2: '#F8FAFD',
    borde: '#DDE3EE',
    bordeSuave: '#E9EDF5',
    texto: '#111726',
    textoTenue: '#5A6478',
    textoTenue2: '#8C95A6',
    // Semánticos, separados del azul de marca a propósito: un aviso que se pinta
    // del color de la marca deja de leerse como aviso.
    ok: '#1E7A55',
    warn: '#9A6510',
    peligro: '#B3261E',
  },
  tipografia: {
    // Una correduría vende criterio, no simpatía. Una grotesca con algo de
    // carácter para los titulares y una humanista neutra para el cuerpo: se lee
    // bien un vencimiento en un móvil a 320 px, que es donde se va a leer.
    titulos: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    cuerpo: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600;700&family=Inter:wght@400;500;600&display=swap',
  },
  logos: {
    wordmark: 'Grupo Asegura',
    // `currentColor`: el color lo pone el contexto, no el fichero.
    monograma: '/brand/marca-asegura.svg',
    lockup: '/brand/marca-asegura.svg',
  },
  radio: '12px',
}
