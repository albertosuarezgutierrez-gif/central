import type { Marca } from '../tipos'

// Marca de Grupo ASegura (correduría de seguros, Sevilla). 03/09/2026.
//
// 🚨 De dónde salen estos valores, porque importa: NO están puestos a ojo ni
// sacados de un manual de marca (no hay). Se midieron de la app que hizo Manuel
// —`app.grupoasegura.com`, la única superficie de marca que existe hoy— así:
//
//   - Los AZULES salen del bloque `:root` del CSS compilado de la app.
//
// ⚠️ **Corrección del 03/09/2026, unas horas después de la primera versión de
// este fichero.** El primario NO es `#193BA1`. Esa primera lectura se sacó de
// los oklch que aparecían inline en el HTML, y resultó ser el FINAL de un
// degradado (`from-primary to-[oklch(0.4_0.17_265)]`, el del cuadro del
// monograma «AS»): aparece una sola vez en toda la app. El token de verdad es
// `--primary: #3364ee` = oklch(0.555 0.215 265.1). `#193BA1` encaja como tinta
// oscura del primario, que es donde se ha quedado.
// Lección: leer el CSS compilado, no los estilos inline de una página.
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
  nombre: 'Grupo ASegura',
  paleta: {
    // `--primary` del `:root` de la app. Medido en el CSS compilado.
    primario: '#3364ee',
    // El final del degradado del monograma. Sirve de tinta oscura.
    primarioInk: '#193BA1',
    primarioSuave: 'rgba(51, 100, 238, 0.10)',
    // `--primary` del modo OSCURO de la app. Como acento del claro funciona,
    // pero conviene saber que allí no es un acento: es el primario de la noche.
    acento: '#497CFD',
    acentoInk: '#2F5FD9',
    // = su `--surface-accent`, la superficie tintada de marca.
    acentoSuave: '#E3EFFF',
    // 🚨 Los neutros de la app son grises PUROS (croma 0.000), no fríos. Aquí
    // se dejan con un sesgo mínimo hacia el azul: es una DECISIÓN nuestra, no
    // una medición suya, y por eso está dicho.
    fondo: '#FCFCFC',
    fondo2: '#F5F5F5',
    panel: '#FFFFFF',
    panel2: '#F8FAFD',
    borde: '#DFDFDF',
    bordeSuave: '#E9EDF5',
    texto: '#121212',
    textoTenue: '#696969',
    textoTenue2: '#8C95A6',
    // Semánticos, separados del azul de marca a propósito: un aviso que se
    // pinta del color de la marca deja de leerse como aviso.
    //
    // ⚠️ El verde de la app (`--success: #118659`) da **4,47:1** sobre su
    // fondo — por debajo de AA para texto normal. Allí se salva porque solo se
    // usa a peso 600-800. Aquí se mantiene el nuestro, que tiene más margen.
    ok: '#059669',
    warn: '#9A6510',
    peligro: '#E40014',
  },
  tipografia: {
    // 📌 MEDIDO (no elegido): la app sirve `--font-sans: Inter`,
    // `--font-display: Fraunces` (serif) y `--font-mono: JetBrains Mono`.
    //
    // Se adopta **Inter para todo**. Fraunces se queda fuera a propósito: allí
    // vive a 2-4 rem en titulares de landing, y en el portal el titular más
    // grande es un h1 de 20 px. A ese tamaño no aporta carácter — solo un
    // segundo webfont en la carga de alguien que abre el portal desde el móvil
    // después de recibir un correo.
    titulos: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    cuerpo: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  },
  logos: {
    wordmark: 'Grupo ASegura',
    // `currentColor`: el color lo pone el contexto, no el fichero.
    monograma: '/brand/marca-asegura.svg',
    lockup: '/brand/marca-asegura.svg',
  },
  // `--radius` de la app. Su escala deriva de aquí: .6 / .8 / 1 / 1.4 / 1.8.
  radio: '16px',
}
