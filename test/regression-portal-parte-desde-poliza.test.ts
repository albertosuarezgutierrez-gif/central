// Cepo: llegar al parte DESDE la ficha de una póliza lleva al teléfono de ESA
// compañía, no a la pestaña genérica de siniestros.
//
// ─── Qué pasó (19/09/2026) ──────────────────────────────────────────────────
// Alberto, pulsando «Ver los teléfonos de Allianz y dar parte» en la ficha de
// una de sus pólizas: «tiene que aparecer tlf y los campos para apertura
// siniestros, ahora mismo me sale página de siniestros».
//
// El enlace ya traía la póliza preseleccionada (`?poliza=cartera:<id>`), así
// que el formulario nacía abierto y con ella puesta. Lo que fallaba es lo que
// se veía ANTES de llegar ahí: el historial de siniestros de TODA la cartera, y
// después el bloque de canales con las compañías en el orden de siempre. O sea
// que el botón prometía un teléfono concreto y entregaba una lista en la que
// ese teléfono podía ser el tercero, por debajo de una lista de lo que ya había
// pasado. Quien pulsa ese botón acaba de tener un golpe.
//
// ─── Los tres fallos que este cepo persigue ─────────────────────────────────
//  1. que el botón de la ficha vuelva a apuntar a la pestaña pelada, sin póliza
//  2. que el historial vuelva a colarse por delante del parte cuando se llega
//     con una póliza concreta
//  3. que «enseñar primero la compañía elegida» se convierta en «enseñar SOLO la
//     compañía elegida» — el recorte que le diría a quien llegó desde la póliza
//     equivocada que no hay nadie más a quien llamar. Desde el 25/09/2026 las
//     demás van PLEGADAS detrás de un botón (Alberto: «¿por qué salen todas?»),
//     pero el botón existe siempre que haya más de una.
//
// Ninguno de los tres rompe nada, ninguno da error y los tres se descubren el
// día que hace falta.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const RAIZ = new URL('..', import.meta.url).pathname

/**
 * Sin comentarios: las cabeceras de lo que se vigila explican la prohibición con
 * sus mismas palabras.
 *
 * Escanea en vez de usar un regex de línea completa (`^\s*\/\/.*$`), que deja
 * pasar un comentario que arranca a mitad de línea (`código(); // nota`) — y
 * también respeta las cadenas, para no truncar código por un `'https://…'`.
 */
function sinComentarios(ruta: string): string {
  const src = readFileSync(`${RAIZ}${ruta}`, 'utf8')
  let out = ''
  let i = 0
  let comilla: string | null = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (comilla) {
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue }
      if (c === comilla) comilla = null
      out += c; i += 1; continue
    }
    if (c === "'" || c === '"' || c === '`') { comilla = c; out += c; i += 1; continue }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue }
    out += c; i += 1
  }
  return out
}

const FICHA = sinComentarios('apps/asegura-portal/app/(portal)/boveda/poliza/[id]/page.tsx')
const BOVEDA = sinComentarios('apps/asegura-portal/app/(portal)/boveda/page.tsx')
const PARTE = sinComentarios('apps/asegura-portal/app/(portal)/boveda/ParteSiniestro.tsx')

test('🚨 el boton de la ficha lleva SU poliza, no la pestaña pelada', () => {
  assert.match(
    FICHA,
    /vista=siniestro&poliza=cartera:\$\{p\.id\}/,
    'el botón de la ficha tiene que llevar la póliza en la URL: sin ella se aterriza en la pestaña ' +
      'genérica y hay que volver a encontrar la póliza en un desplegable con las demás.',
  )
})

test('🚨 con una poliza en la URL, el parte va ANTES del historial', () => {
  const i = BOVEDA.indexOf("vista === 'siniestro'")
  assert.notEqual(i, -1, 'no se encuentra la vista de siniestros de la bóveda')
  const bloque = BOVEDA.slice(i, BOVEDA.indexOf("vista === 'recordatorios'", i))
  const parte = bloque.indexOf('<ParteSiniestro')
  const historial = bloque.indexOf('<VistaPorPoliza')
  assert.ok(parte > 0 && historial > 0, 'la vista tiene que pintar el parte y el historial')
  assert.ok(
    parte < historial,
    'Quien llega desde la ficha de una póliza acaba de tener un golpe: el canal de su compañía y el ' +
      'formulario van primero, y el historial detrás.',
  )
})

test('🚨 el parte va SIEMPRE antes del historial, y la poliza se comprueba contra la lista de la sesion', () => {
  // Un id inventado en la barra de direcciones no puede preseleccionar nada ni
  // sugerir que hay una póliza detrás: se filtra contra `polizasParte`, que ya
  // está acotada a esta identidad.
  assert.match(
    BOVEDA,
    /polizasParte\.some\(\(p\) => p\.valor === polizaInicial\)/,
    'la póliza del enlace tiene que comprobarse contra la lista ya acotada a esta sesión',
  )
  assert.match(
    BOVEDA,
    /polizaInicial=\{polizaEnLista\}/,
    'la preselección sale de esa comprobación, no del parámetro crudo',
  )
  // 24/09/2026: desde la pestaña también. Los teléfonos de la compañía no pueden
  // quedar debajo del historial para quien acaba de tener un golpe.
  const vista = BOVEDA.slice(BOVEDA.indexOf("vista === 'siniestro' && ("))
  const parte = vista.indexOf('<ParteSiniestro')
  const historial = vista.indexOf('<VistaPorPoliza')
  assert.ok(parte !== -1 && historial !== -1, 'la vista de siniestros pinta el parte y el historial')
  assert.ok(parte < historial, 'el parte (con los teléfonos) va antes que el historial')
  assert.equal(vista.slice(0, historial).split('<ParteSiniestro').length - 1, 1, 'un solo parte, siempre arriba')
})

test('🚨 la compañia de la poliza elegida se pone DELANTE, con el helper que tiene cepo', () => {
  assert.match(
    PARTE,
    /canalesConCompaniaPrimero\(/,
    'ordenar es una regla con test propio (nunca recorta, nunca promueve «la más parecida»). ' +
      'Rehacerla en el JSX la deja sin cepo.',
  )
  assert.match(
    PARTE,
    /destacada=\{companiaElegida\}/,
    'el bloque de canales tiene que recibir la compañía elegida',
  )
})

test('🚨 la compañia destacada sale de la poliza ELEGIDA AHORA, no de la del enlace', () => {
  // Si saliera de `polizaInicial`, cambiar de póliza en el desplegable dejaría
  // el teléfono de la anterior en primer lugar y marcado como «la tuya».
  assert.match(
    PARTE,
    /polizas\.find\(\(p\) => p\.valor === form\.poliza\)\?\.canal\.nombre/,
    'la compañía destacada se deriva de la selección viva del formulario',
  )
})

test('🚨 poner una compañia delante NO es quedarse solo con ella', () => {
  // El recorte es la forma más fácil de «arreglar» esta pantalla, y le diría a
  // quien llegó desde la póliza equivocada —el coche de su padre, el piso en
  // vez del local— que no hay nadie más a quien llamar.
  const i = PARTE.indexOf('canalesConCompaniaPrimero(')
  const tras = PARTE.slice(i, i + 260)
  assert.doesNotMatch(tras, /\.filter\(/, 'no se filtra la lista de compañías')
  assert.doesNotMatch(tras, /\.slice\(/, 'no se recorta la lista de compañías')
})

test('🚨 con una poliza elegida las demas companias se PLIEGAN, no desaparecen', () => {
  // Plegar es lo que pidió Alberto; borrar es el fallo 3 de la cabecera.
  assert.match(PARTE, /otrasPlegadas &&[\s\S]{0,80}<button[^>]*onClick=\{\(\) => setOtrasAbiertasPara\(clave\)\}/,
    'con las demás plegadas tiene que haber un botón que las despliegue')
  assert.match(PARTE, /Ver las otras \$\{numOtras\} compañías/, 'el botón dice cuántas hay detrás')
  assert.match(PARTE, /const numOtras = canales\.length - 1/, 'el recuento sale de la lista ENTERA')
})
