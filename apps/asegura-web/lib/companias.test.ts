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

test('cada SVG trae viewBox: sin él la altura del CSS no dimensiona nada', () => {
  // El muro fija la ALTURA y deja el ancho en `auto`. Un SVG sin `viewBox` no
  // tiene relación de aspecto intrínseca, así que ese `auto` se resuelve a 0 o
  // al ancho por defecto: el logo desaparece o se estira, y otra vez sin error.
  for (const c of COMPANIAS) {
    if (!c.logo) continue
    const svg = readFileSync(join(RAIZ, 'public', c.logo), 'utf8')
    assert.match(svg, /<svg[^>]*\sviewBox=/, `${c.nombre}: su SVG no tiene viewBox`)
  }
})

test('ningún logo se trae nada de fuera', () => {
  // Un `<image href="https://…">` dentro del SVG haría que cada visita pidiera
  // un fichero a un tercero, contándole la IP del visitante — justo lo que esta
  // web evita no cargando PostHog hasta que hay consentimiento. Se sirven desde
  // nuestro origen o no se sirven.
  for (const c of COMPANIAS) {
    if (!c.logo) continue
    const svg = readFileSync(join(RAIZ, 'public', c.logo), 'utf8')
    assert.ok(!/https?:\/\//.test(svg.replace(/xmlns[^=]*="[^"]*"/g, '')), `${c.nombre}: su SVG apunta a una URL externa`)
    assert.ok(!/<script/i.test(svg), `${c.nombre}: su SVG lleva un <script>`)
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
  const sinLogo = COMPANIAS.filter((c) => c.logo === null).map((c) => c.nombre)
  assert.deepEqual(sinLogo, ['Fidelidade', 'Asisa'], 'cambió qué compañías no tienen logo: revisa el muro')
  for (const c of COMPANIAS) {
    assert.notEqual(c.logo, '', `${c.nombre}: logo vacío — usa null`)
  }
})
