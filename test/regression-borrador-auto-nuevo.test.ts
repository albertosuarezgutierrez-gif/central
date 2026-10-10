// Guardián: la pantalla de AUTO NUEVO no puede volver a perder lo tecleado.
//
// Caso fundacional (21/09/2026). Para cotizar hace falta el código postal, y
// el código postal se corrige en OTRA pantalla (la ficha del cliente). Como
// `AutoNuevo.tsx` guardaba su estado solo en `useState`, ir a arreglarlo
// borraba el formulario entero: el camino normal de uso castigaba con volver
// a teclear coche, matrícula, fechas y el historial completo. La pantalla
// hermana (`retarificar`) ya tenía borrador local desde hacía meses.
//
// Lo que se vigila aquí no es que el borrador «exista», sino las tres cosas
// que lo hacen útil y seguro: que se guarde al teclear, que se restaure al
// abrir, y que se BORRE en cuanto la cotización está pagada — porque lleva
// DNI, nombre, teléfono y fecha de nacimiento dentro.
//
// Se lee el FUENTE a propósito: no hay forma barata de montar esta pantalla
// entera (Next + catálogos del vendor) en un test de node.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const AUTO_NUEVO = join(
  RAIZ,
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx',
)
const RETARIFICAR = join(
  RAIZ,
  'apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/retarificador.tsx',
)
const COMUN = join(RAIZ, 'apps/plataforma/lib/correduria/borrador-local.ts')

const fuente = readFileSync(AUTO_NUEVO, 'utf8')

/**
 * El fuente sin comentarios: un cepo no puede darse por bueno con su propia
 * explicación.
 *
 * 🪤 Las líneas `//` se quitan ANTES que los bloques `/* *\/`, y el orden no es
 * indiferente: `retarificador.tsx` tiene un comentario de línea que menciona
 * la ruta `/api/cartera/` con un asterisco, y al revés ese asterisco abría un
 * «bloque» que se comía los imports hasta el siguiente cierre. El cepo llegó a
 * fallar por eso — lo que prueba que mira de verdad al fuente.
 */
function sinComentarios(s: string): string {
  return s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}
const codigo = sinComentarios(fuente)

test('auto-nuevo guarda el borrador mientras se teclea', () => {
  assert.match(
    codigo,
    /guardarBorrador\b/,
    'sin guardado, salir a corregir el código postal borra el formulario entero',
  )
})

test('auto-nuevo restaura el borrador al abrir', () => {
  assert.match(codigo, /leerBorrador\b/, 'guardar sin restaurar no sirve de nada')
})

test('el borrador se BORRA en cuanto la cotización está pagada', () => {
  // Lleva DNI, nombre, teléfono y fecha de nacimiento: en cuanto
  // `seguros.tarificaciones` tiene la verdad, el dato personal sobra aquí.
  assert.match(codigo, /borrarBorrador\(/, 'el borrador con datos personales tiene que limpiarse')
  assert.match(
    codigo,
    /!r\.simulado\)\s*\{\s*(?:[\w.?()]+\s*=\s*[^\n]+\n\s*|[\w.?]+\([^\n]*\)\n\s*)*borrarBorrador\(/,
    'se borra solo cuando se ha PAGADO: una cotización simulada puede querer repetirse',
  )
})

test('usa la clave propia de auto-nuevo, no la de retarificar', () => {
  // Compartir clave haría que abrir una pantalla pisara el borrador de la otra.
  assert.match(codigo, /claveBorradorAutoNuevo\(/)
  assert.doesNotMatch(codigo, /claveBorradorRetarificar\(/)
})

test('la clave lleva el id del cliente (y el del riesgo en una variante): un borrador no pisa al de otro', () => {
  assert.match(codigo, /claveBorradorAutoNuevo\(\s*clienteId\s*,\s*variante\?\.oportunidadId\s*\)/)
})

test('las dos pantallas comparten UN mecanismo, no dos copias', () => {
  // Dos copias es la forma callada de que una de las dos deje de guardar.
  for (const [nombre, ruta] of [
    ['auto-nuevo', AUTO_NUEVO],
    ['retarificar', RETARIFICAR],
  ] as const) {
    const s = sinComentarios(readFileSync(ruta, 'utf8'))
    assert.match(
      s,
      /from '@\/lib\/correduria\/borrador-local'/,
      `${nombre} tiene que usar el borrador común, no su propia copia`,
    )
    assert.doesNotMatch(
      s,
      /function\s+(leer|guardar|borrar)Borrador\b/,
      `${nombre} no puede redefinir el borrador en local: eso es la segunda copia`,
    )
  }
})

test('el borrador caduca: el dato personal no se queda para siempre', () => {
  const comun = sinComentarios(readFileSync(COMUN, 'utf8'))
  assert.match(comun, /BORRADOR_TTL_MS/)
  assert.doesNotMatch(
    comun,
    /BORRADOR_TTL_MS\s*=\s*(Infinity|0\b)/,
    'sin caducidad real, el DNI tecleado se queda en el navegador indefinidamente',
  )
})

test('el borrador NO viaja a la base: no es una cotización', () => {
  const comun = sinComentarios(readFileSync(COMUN, 'utf8'))
  assert.doesNotMatch(comun, /prisma|fetch\(|seguros\./i)
})

test('si gana el borrador del servidor, SUSTITUYE al estado (no se mezcla con el local)', () => {
  assert.match(
    codigo,
    /origen === 'servidor'\)\s*\{\s*(?:\/\/[^\n]*\n\s*)*restablecerInicial\(\)\s*aplicarBorrador\(/,
    'aplicar el del servidor sin vaciar antes deja campos del borrador local mezclados',
  )
})

test('🪤 no se guarda (local ni servidor) mientras el formulario esté igual que al abrirlo', () => {
  assert.match(codigo, /esBorradorVacio\(d, estadoInicial\.current\)/, 'sin comparar con el estado inicial, los valores por defecto pisan un borrador bueno')
  assert.match(
    codigo,
    /ultimoBorrador\.current = datos\s*(?:\/\/[^\n]*\n\s*)*if \(bloqueado\.current \|\| vacio\(datos\)\) \{[^}]*return/,
    'el autoguardado debe salir antes de escribir en local si el estado es el inicial',
  )
  assert.match(codigo, /elegirMasReciente\(local, srv, vacio\)/, 'un local vacío no puede ganar al servidor')
  assert.match(codigo, /!datos \|\| vacio\(datos\)/, 'subirBorrador no puede subir un formulario vacío')
})

test('🪤 tras pagar: se bloquea el guardado y se aborta el POST en vuelo ANTES del DELETE', () => {
  assert.match(
    codigo,
    /bloqueado\.current = true\s*abortSubida\.current\?\.abort\(\)[\s\S]*?clearTimeout\(temporizadorNube\.current\)[\s\S]*?void borrarBorradorServidor\(/,
    'bloquear + abortar + cancelar el debounce deben ir antes del DELETE, o un POST tardío resucita el borrador pagado',
  )
  assert.match(codigo, /new AbortController\(\)/)
  assert.match(codigo, /signal: ctl\.signal/)
  assert.match(codigo, /function volcar\(\) \{\s*if \(bloqueado\.current\) return/, 'el pagehide keepalive no puede disparar tras el pago')
  assert.match(codigo, /if \(bloqueado\.current \|\| !reconciliado\.current/, 'subirBorrador debe respetar el bloqueo')
})
