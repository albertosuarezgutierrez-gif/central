import type { Marca } from '../tipos'

// Marca de Joaquín Jaén (catering/eventos, Sevilla). Extraída de su web real
// (plataformacateringjoaquinjaen.com): VERDE bosque dominante + ORO/bronce de acento,
// sobre blanco; tipografías Montserrat (títulos) + Lato (cuerpo).
// Los hex del verde son aproximación de su identidad; se afinan con su manual de marca.
export const MARCA_JOAQUIN_JAEN: Marca = {
  id: 'joaquin-jaen',
  nombre: 'Joaquín Jaén',
  paleta: {
    primario: '#1f4a37',
    primarioInk: '#163a2a',
    primarioSuave: 'rgba(31, 74, 55, 0.10)',
    acento: '#9e814f',
    acentoInk: '#836a3d',
    acentoSuave: 'rgba(158, 129, 79, 0.14)',
    fondo: '#f6f7f4',
    fondo2: '#eef1ec',
    panel: '#ffffff',
    panel2: '#f7f9f6',
    borde: '#e5e8e1',
    bordeSuave: '#eef1eb',
    texto: '#202823',
    textoTenue: '#79837a',
    textoTenue2: '#a7afa7',
    ok: '#2f9e5f',
    warn: '#c9871f',
    peligro: '#c0392f',
  },
  tipografia: {
    titulos: "'Montserrat', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    cuerpo: "'Lato', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Lato:wght@400;700&display=swap',
  },
  logos: {
    wordmark: 'Joaquín Jaén',
    monograma: '/logo-mark.svg',
    lockup: '/logo.svg',
  },
  radio: '14px',
}
