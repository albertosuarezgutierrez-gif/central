import type { Marca } from '../tipos'

// Marca de Grupo ASegura (correduría de seguros, Sevilla). 03/09/2026.
// Tema oscuro y sistema de superficies: 05/09/2026.
//
// 🚨 De dónde salen estos valores, porque importa: NO están puestos a ojo ni
// sacados de un manual de marca (no hay). Se midieron de la app que hizo Manuel
// —`app.grupoasegura.com`, la única superficie de marca que existe hoy—, y
// desde el 05/09/2026 **del código fuente de esa app**, no de la página: su
// repo (`albertosuarezgutierrez-gif/asegura`, el que sirve el proyecto Vercel
// `asegura`) se clona y su `globals.css` se lee entero. Antes se medía del CSS
// ya compilado, que es mejor que mirar una captura pero peor que esto.
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
// ✅ **Confirmado el 05/09/2026 contra el fuente**: su `--primary` es
// `oklch(0.555 0.215 265)` y su `--radius` es `1rem`. O sea, el `#3364ee` y el
// `16px` que ya había aquí eran correctos. La medición del 03/09 se sostiene.
//
// 🚨 **Y lo que la lectura del fuente SÍ corrigió: los neutros.** La versión
// del 03/09 decía «se dejan con un sesgo mínimo hacia el azul: es una DECISIÓN
// nuestra». Con el fuente delante se ve que esa decisión iba en contra del
// sistema: Manuel aísla el color de marca en cinco tokens (`--primary`,
// `--ring`, `--chart-1`, `--sidebar-primary`, `--surface-accent`) y **todo lo
// demás es gris de croma 0 exacto**, con un comentario suyo que lo dice
// («Base NEUTRA pura … sin tinte 270°»). Un azul que se cuela en los fondos
// ensucia el único sitio donde el azul significa algo: los botones. Los tres
// valores azulados (`panel2`, `bordeSuave`, `textoTenue2`) pasan a croma 0, y
// lo vigila `css.test.ts`.
//
// ⚠️ Lo que NO sirvió: el logo que había en Drive
// (`cropped-logo-bn-350x100-1.png`) es un recorte de WordPress de 157×45 px,
// **un solo gris `#F6F6F6` sobre transparencia** — 377 píxeles opacos de 7.065.
// Es la variante en blanco para fondos oscuros: no tiene un píxel de color, así
// que de ahí no se podía extraer ninguna paleta. Si aparece el manual de marca
// o el vectorial original a color, estos hex se sustituyen por los suyos.
export const MARCA_ASEGURA: Marca = {
  id: 'asegura',
  nombre: 'Grupo ASegura',
  paleta: {
    // `--primary` del `:root` de la app. oklch(0.555 0.215 265) ≡ #3364ee. Se
    // deja en hex por legibilidad; los neutros van en oklch porque ahí el
    // croma 0 es justo la información que importa.
    primario: '#3364ee',
    // = su `--surface-accent-foreground`: el azul legible SOBRE la superficie
    // tintada. Sirve de tinta oscura del primario.
    primarioInk: 'oklch(0.34 0.13 265)',
    // = su `--surface-accent`, la superficie tintada de marca. Es un color
    // SÓLIDO, no un rgba: sobre un fondo oscuro un alfa del 10% desaparece.
    primarioSuave: 'oklch(0.95 0.045 265)',
    // 📌 Manuel NO tiene un acento decorativo separado: su acento ES el
    // primario. Aquí se conserva el hueco del contrato con el primario del
    // modo oscuro de su app, que como acento del claro funciona. Conviene
    // saber que allí no es un acento: es el primario de la noche.
    acento: '#497CFD',
    acentoInk: '#2F5FD9',
    acentoSuave: '#E3EFFF',
    // ── Neutros: croma 0 EXACTO, como los suyos (ver nota de arriba). ──
    fondo: 'oklch(0.992 0 0)', // su --background (#fdfdfd)
    fondo2: 'oklch(0.97 0 0)', // su --secondary/--muted
    panel: 'oklch(1 0 0)', // su --card (#ffffff)
    panel2: 'oklch(0.97 0 0)', // era #F8FAFD (azulado). Ahora neutro.
    borde: 'oklch(0.905 0 0)', // su --border/--input
    bordeSuave: 'oklch(0.94 0 0)', // era #E9EDF5 (azulado). Ahora neutro.
    texto: 'oklch(0.18 0 0)', // su --foreground (#0d0d0d)
    // Su --muted-foreground. Él lo bajó de 0.556 a 0.52 EXPRESAMENTE para
    // llegar a AA 4.5:1 (deja ~5.4:1). No subirlo sin recalcular el contraste.
    textoTenue: 'oklch(0.52 0 0)',
    textoTenue2: 'oklch(0.62 0 0)', // era #8C95A6 (azulado). Ahora neutro.
    // Semánticos, separados del azul de marca a propósito: un aviso que se
    // pinta del color de la marca deja de leerse como aviso.
    ok: 'oklch(0.55 0.12 160)', // su --success
    // 📌 DECISIÓN nuestra, no medida: su app no declara `--warning` en `:root`
    // (usa el ámbar de Tailwind suelto en los badges de estado). Se conserva
    // el nuestro, que tiene más margen de contraste.
    warn: '#9A6510',
    peligro: 'oklch(0.577 0.245 27.325)', // su --destructive
    superficies: {
      hover: 'oklch(0.965 0 0)', // su --surface-hover
      activo: 'oklch(0.945 0 0)', // su --surface-active
    },
    // Sus tres elevaciones, literales. Son sombras PLANAS: lo que separa una
    // tarjeta del fondo es un anillo de 1px al 5%, no una nube gris.
    elevacion: {
      panel:
        '0 0 0 1px oklch(0.2 0 0 / 0.05), 0 1px 2px oklch(0.2 0 0 / 0.05), 0 8px 22px -10px oklch(0.2 0 0 / 0.10)',
      flotante:
        '0 2px 4px oklch(0.2 0 0 / 0.05), 0 8px 20px -6px oklch(0.2 0 0 / 0.10), 0 0 0 1px oklch(0.2 0 0 / 0.05)',
      encima:
        '0 12px 32px -8px oklch(0.2 0 0 / 0.14), 0 4px 10px oklch(0.2 0 0 / 0.06), 0 0 0 1px oklch(0.2 0 0 / 0.06)',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // Tema oscuro. Valores de su bloque `.dark`, uno a uno.
  //
  // 🚨 En oscuro las sombras dejan de ser sombra: lo que separa una tarjeta del
  // fondo es un anillo BLANCO al 6-8%. Bajarle la opacidad a la sombra clara no
  // produce esto — produce una tarjeta flotando sobre nada.
  paletaOscura: {
    primario: 'oklch(0.62 0.2 265)', // su --primary de noche: más claro, para que siga leyéndose
    primarioInk: 'oklch(0.95 0.02 265)',
    primarioSuave: 'oklch(0.34 0.09 265)',
    acento: 'oklch(0.62 0.2 265)',
    acentoInk: 'oklch(0.95 0.02 265)',
    acentoSuave: 'oklch(0.34 0.09 265)',
    fondo: 'oklch(0.17 0 0)', // #121212
    fondo2: 'oklch(0.26 0 0)',
    panel: 'oklch(0.215 0 0)', // #181818
    panel2: 'oklch(0.26 0 0)',
    borde: 'oklch(1 0 0 / 11%)',
    bordeSuave: 'oklch(1 0 0 / 8%)',
    texto: 'oklch(0.97 0 0)',
    textoTenue: 'oklch(0.72 0 0)',
    textoTenue2: 'oklch(0.60 0 0)',
    ok: 'oklch(0.6 0.13 160)',
    // 📌 DECISIÓN nuestra (él no tiene `--warning`): el `#9A6510` del claro es
    // ilegible sobre `#121212`. Ámbar claro, mismo tono, subido de luminancia.
    warn: 'oklch(0.78 0.13 75)',
    peligro: 'oklch(0.704 0.191 22.216)',
    superficies: {
      hover: 'oklch(0.255 0 0)',
      activo: 'oklch(0.29 0 0)',
    },
    elevacion: {
      panel:
        '0 0 0 1px oklch(1 0 0 / 0.08), 0 1px 3px oklch(0 0 0 / 0.3), 0 8px 22px -10px oklch(0 0 0 / 0.45)',
      flotante:
        '0 2px 8px oklch(0 0 0 / 0.36), 0 0 0 1px oklch(1 0 0 / 0.07)',
      encima:
        '0 12px 32px -6px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(1 0 0 / 0.08)',
    },
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
