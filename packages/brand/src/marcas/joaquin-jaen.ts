import type { Marca } from '../tipos'

// Marca de Joaquín Jaén (catering/eventos, Sevilla). Extraída de su web real
// (plataformacateringjoaquinjaen.com): VERDE bosque dominante + ORO/bronce de acento,
// sobre blanco; tipografías Montserrat (títulos) + Lato (cuerpo).
// Los hex del verde son aproximación de su identidad; se afinan con su manual de marca.
export const MARCA_JOAQUIN_JAEN: Marca = {
  id: 'joaquin-jaen',
  nombre: 'Joaquín Jaén',
  // Colores EXACTOS extraídos del logotipo oficial (logo-jj.png).
  paleta: {
    primario: '#004433',
    primarioInk: '#003326',
    primarioSuave: 'rgba(0, 68, 51, 0.10)',
    acento: '#998855',
    acentoInk: '#7d6e44',
    acentoSuave: 'rgba(153, 136, 85, 0.16)',
    fondo: '#f6f5f1',
    fondo2: '#eeeee7',
    panel: '#ffffff',
    panel2: '#f7f7f2',
    borde: '#e6e5dd',
    bordeSuave: '#eeede6',
    texto: '#1e2622',
    textoTenue: '#79807a',
    textoTenue2: '#a8aca6',
    ok: '#2f9e5f',
    warn: '#b8791a',
    peligro: '#c0392f',
  },
  // Su lettering es una serif Didone; Playfair Display (Google Fonts) es el match
  // libre más fiel para los títulos. Cuerpo en Lato (la usa su web). Si su manual
  // indica otra fuente y está en Adobe Fonts, se cambia por la exacta.
  tipografia: {
    titulos: "'Playfair Display', Georgia, 'Times New Roman', serif",
    cuerpo: "'Lato', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Lato:wght@400;700&display=swap',
  },
  logos: {
    wordmark: 'Joaquín Jaén',
    monograma: '/logo-mark.svg',
    lockup: '/logo-jj.png',
  },
  radio: '14px',
}
