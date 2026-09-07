// Guardián del muro de compañías.
//
// 🚨 El modo de fallo de esta pantalla es MUDO. Un `<img src="/logos/x.svg">`
// cuyo fichero no está no rompe el build, no rompe el typecheck y no lanza nada
// en el servidor: pinta el icono de imagen rota, y de eso solo se entera quien
// abre la página. Por eso el contrato «lo declarado existe» se comprueba aquí,
// leyendo el disco, y no se confía a que alguien mire la web después de tocar
// la lista.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { COMPANIAS, COMPANIAS_EN_CARTERA } from './companias.ts'

const RAIZ = join(import.meta.dirname, '..')
const DIR_LOGOS = join(RAIZ, 'public/logos')

test('todo logo declarado EXISTE en public/', () => {
  for (const c of COMPANIAS) {
    if (!c.logo) continue
    assert.ok(c.logo.startsWith('/logos/'), `${c.nombre}: el logo va bajo /logos/, no en ${c.logo}`)
    const f = join(RAIZ, 'public', c.logo)
    assert.ok(existsSync(f), `${c.nombre}: declara ${c.logo} y ese fichero NO está en public/`)
  }
})

test('no queda ningún SVG huérfano en public/logos', () => {
  // Al renombrar una compañía es fácil dejar el fichero viejo: no molesta a
  // nadie, no falla nada, y dentro de un año no se sabe si se usa o no.
  const declarados = new Set(COMPANIAS.filter((c) => c.logo).map((c) => c.logo!.replace('/logos/', '')))
  for (const f of readdirSync(DIR_LOGOS)) {
    assert.ok(declarados.has(f), `public/logos/${f} no lo usa ninguna compañía de COMPANIAS`)
  }
})

/** Los logos declarados, separados por formato: cada uno falla de otra manera. */
const CON_LOGO = COMPANIAS.filter((c) => c.logo !== null)
const SVG = CON_LOGO.filter((c) => c.logo!.endsWith('.svg'))
const PNG = CON_LOGO.filter((c) => c.logo!.endsWith('.png'))

test('todo logo es .svg o .png, no otra cosa', () => {
  // Si alguien mete un .webp o un .jpg, las comprobaciones de abajo dejarían de
  // aplicársele SIN fallar: no estaría en ninguna de las dos listas y pasaría
  // por el hueco. Es el fallo que este fichero existe para evitar.
  assert.equal(SVG.length + PNG.length, CON_LOGO.length, 'hay un logo que no es .svg ni .png: nadie lo estaría comprobando')
})

test('cada SVG trae viewBox: sin él la altura del CSS no dimensiona nada', () => {
  // El muro fija la ALTURA y deja el ancho en `auto`. Un SVG sin `viewBox` no
  // tiene relación de aspecto intrínseca, así que ese `auto` se resuelve a 0 o
  // al ancho por defecto: el logo desaparece o se estira, y otra vez sin error.
  for (const c of SVG) {
    const svg = readFileSync(join(RAIZ, 'public', c.logo!), 'utf8')
    assert.match(svg, /<svg[^>]*\sviewBox=/, `${c.nombre}: su SVG no tiene viewBox`)
  }
})

test('ningún logo se trae nada de fuera', () => {
  // Un `<image href="https://…">` dentro del SVG haría que cada visita pidiera
  // un fichero a un tercero, contándole la IP del visitante — justo lo que esta
  // web evita no cargando PostHog hasta que hay consentimiento. Se sirven desde
  // nuestro origen o no se sirven.
  for (const c of SVG) {
    const svg = readFileSync(join(RAIZ, 'public', c.logo!), 'utf8')
    assert.ok(!/https?:\/\//.test(svg.replace(/xmlns[^=]*="[^"]*"/g, '')), `${c.nombre}: su SVG apunta a una URL externa`)
    assert.ok(!/<script/i.test(svg), `${c.nombre}: su SVG lleva un <script>`)
  }
})

// ── Los PNG: dos fallos que un vectorial no puede tener ────────────────────
//
// El muro fija la altura en `calc(1.75rem * escala)` = 28 px a escala 1, y
// `globals.css` lo baja a 20 px en móvil. En una pantalla retina (2×) eso pide
// 56 px REALES de alto. Un PNG más bajo no rompe nada: sale blando, y de eso
// solo se entera quien mira la web en un buen monitor.
const ALTO_CSS_PX = 28
const DENSIDAD = 2

/** Lee ancho y alto del IHDR, que en un PNG siempre son los bytes 16-23. */
function medidasPng(ruta: string): { ancho: number; alto: number; colorType: number } {
  const b = readFileSync(ruta)
  assert.equal(
    b.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    `${ruta}: no empieza por la firma PNG — un fichero renombrado pinta el icono de imagen rota`,
  )
  assert.equal(b.subarray(12, 16).toString('ascii'), 'IHDR', `${ruta}: el primer chunk no es IHDR`)
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), colorType: b[25] }
}

test('cada PNG es un PNG de verdad y tiene píxeles para retina', () => {
  for (const c of PNG) {
    const { ancho, alto } = medidasPng(join(RAIZ, 'public', c.logo!))
    const minimo = Math.ceil(ALTO_CSS_PX * (c.escala ?? 1) * DENSIDAD)
    assert.ok(
      alto >= minimo,
      `${c.nombre}: su PNG mide ${ancho}×${alto} y el muro lo pinta a ${ALTO_CSS_PX * (c.escala ?? 1)} px; en retina hacen falta ${minimo} px de alto o se ve borroso`,
    )
  }
})

test('cada PNG tiene canal alfa: sin él sale una caja blanca sobre la banda', () => {
  // La sección tiene fondo propio (`.banda`). Un PNG sin transparencia se pinta
  // como un rectángulo del color de su lienzo —normalmente blanco— encima de
  // ese fondo. No falla nada: queda feo, y solo lo ve quien abre la página.
  // colorType 4 = gris+alfa, 6 = RGBA. 0/2/3 no llevan alfa (el 3, paleta,
  // podría traer un chunk tRNS, pero no es lo que vamos a servir).
  for (const c of PNG) {
    const { colorType } = medidasPng(join(RAIZ, 'public', c.logo!))
    assert.ok(
      colorType === 4 || colorType === 6,
      `${c.nombre}: su PNG tiene color_type ${colorType}, sin canal alfa — se vería como un recuadro sobre el fondo de la banda`,
    )
  }
})

test('la CIFRA de la banda sigue saliendo de la lista corta', () => {
  // Son dos listas a propósito: el muro es «con quién trabajamos» y la cifra es
  // «con cuántas hay pólizas vivas». Fundirlas subiría el número de 4 a 7 sin
  // que fallara nada, y nadie mira dos veces un número que sale de una
  // constante.
  assert.ok(
    COMPANIAS_EN_CARTERA.length < COMPANIAS.length,
    'si las dos listas coinciden, alguien las ha fundido',
  )
  const muro = new Set(COMPANIAS.map((c) => c.nombre))
  for (const n of COMPANIAS_EN_CARTERA) {
    assert.ok(muro.has(n), `${n} cuenta para la cifra pero no está en el muro`)
  }
})

test('la página pinta la lista, no nombres escritos a mano', () => {
  const fuente = readFileSync(join(RAIZ, 'app/page.tsx'), 'utf8')
  assert.match(fuente, /COMPANIAS,\s*\.\.\.COMPANIAS,\s*\.\.\.COMPANIAS/, 'el muro ya no recorre COMPANIAS')
  assert.match(fuente, /src=\{c\.logo\}/, 'el muro ya no pinta el logo de cada compañía')
  // Un nombre escrito directamente en el JSX se saltaría toda la procedencia
  // documentada en `companias.ts`.
  for (const c of COMPANIAS) {
    assert.ok(!fuente.includes(`>${c.nombre}<`), `«${c.nombre}» está escrito a mano en page.tsx`)
  }
})

test('las que aún no tienen logo se declaran como null, no con un hueco', () => {
  // `logo: ''` o un fichero que no existe son la misma mentira con dos caras.
  // `null` dice «todavía no lo tenemos», que es un estado, no una ausencia de
  // dato — y por eso la página sabe pintar el nombre en su lugar.
  // Asisa dejó de estar aquí el 07/09/2026 (Alberto subió su PNG a Drive).
  // Fidelidade sigue: su fichero no se ha podido traer, y NO se dibuja uno
  // parecido — un logo aproximado de una aseguradora en la web de su corredor
  // es peor que no ponerlo.
  const sinLogo = COMPANIAS.filter((c) => c.logo === null).map((c) => c.nombre)
  assert.deepEqual(sinLogo, ['Fidelidade'], 'cambió qué compañías no tienen logo: revisa el muro')
  for (const c of COMPANIAS) {
    assert.notEqual(c.logo, '', `${c.nombre}: logo vacío — usa null`)
  }
})
