import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { FILAS, etiquetaVence, proximaEnVencer, type FilaDemo } from './panel-demo.ts'

const COMPONENTE = readFileSync(
  new URL('../components/PanelDemo.tsx', import.meta.url).pathname,
  'utf8',
)
/** Sin comentarios: la cabecera del componente explica el fallo CITÁNDOLO. */
const sinComentarios = COMPONENTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const fila = (p: Partial<FilaDemo>): FilaDemo => ({
  slug: 'x',
  ramo: 'Hogar',
  compania: 'Mapfre',
  dia: 1,
  mes: 6,
  prima: 100,
  ...p,
})

test('🚨 «Próximo» es la que vence antes, NO la primera de la lista', () => {
  // El fallo original: `activas[0]?.vence`. Con las filas en el orden en que
  // están escritas —hogar (12 mar) primero, comunidad (15 ene) la cuarta— el
  // panel enseñaba «12 mar» teniendo «15 ene» encendida.
  const hoy = new Date(Date.UTC(2026, 0, 1)) // 1 de enero
  const p = proximaEnVencer(
    [fila({ slug: 'hogar', dia: 12, mes: 3 }), fila({ slug: 'comunidad', dia: 15, mes: 1 })],
    hoy,
  )
  assert.equal(p?.slug, 'comunidad')
})

test('🚨 una fecha que YA pasó este año cuenta como la del año que viene', () => {
  // Si no, la baldosa «Próximo» enseñaría una fecha pasada, que es exactamente
  // lo que no puede decir esa palabra.
  const hoy = new Date(Date.UTC(2026, 5, 15)) // 15 de junio
  const p = proximaEnVencer(
    [fila({ slug: 'marzo', dia: 12, mes: 3 }), fila({ slug: 'septiembre', dia: 28, mes: 9 })],
    hoy,
  )
  assert.equal(p?.slug, 'septiembre')
})

test('la que vence HOY todavía es la próxima', () => {
  const hoy = new Date(Date.UTC(2026, 5, 4))
  const p = proximaEnVencer(
    [fila({ slug: 'hoy', dia: 4, mes: 6 }), fila({ slug: 'manana', dia: 5, mes: 6 })],
    hoy,
  )
  assert.equal(p?.slug, 'hoy')
})

test('sin ninguna encendida no hay próxima', () => {
  assert.equal(proximaEnVencer([], new Date(Date.UTC(2026, 0, 1))), null)
})

test('la etiqueta sale de dia/mes, así que no puede contradecir a la cuenta', () => {
  assert.equal(etiquetaVence(fila({ dia: 4, mes: 6 })), '04 jun')
  assert.equal(etiquetaVence(fila({ dia: 28, mes: 9 })), '28 sep')
  for (const f of FILAS) assert.match(etiquetaVence(f), /^\d{2} [a-z]{3}$/)
})

test('🚨 el componente NO vuelve a coger la primera fila a mano', () => {
  // El fallo se arregló sacando la cuenta a este módulo. Si alguien vuelve a
  // indexar el array en el JSX, la baldosa miente otra vez y nada falla.
  assert.doesNotMatch(
    sinComentarios,
    /activas\s*\[\s*0\s*\]/,
    'el «próximo» sale de proximaEnVencer(), no del primer elemento del array',
  )
  assert.match(sinComentarios, /proximaEnVencer\(/, 'la vista delega la cuenta en el módulo con cepo')
})

test('🚨 la ventana no puede decir «En vivo»: lleva su insignia de «Ejemplo»', () => {
  // Las dos etiquetas convivían a dos centímetros una de otra. «En vivo» sobre
  // cinco pólizas inventadas es justo lo que la insignia intenta evitar, y es
  // la que gana porque es la que late.
  assert.doesNotMatch(sinComentarios, /En vivo/, 'contradice la insignia «Ejemplo» de la misma barra')
  assert.match(sinComentarios, /mock-ejemplo/, 'la insignia de ejemplo no se quita')
})
