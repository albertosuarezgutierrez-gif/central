// Tres agujeros cerrados el 24/09/2026 en el portal del cliente, con cepo cada uno:
//  1. El tope de 5 intentos del código se saltaba con peticiones en paralelo:
//     se leía `intentos`, se comparaba y luego se sumaba. Ahora se RESERVA el
//     intento con una escritura condicionada ANTES de comparar.
//  2. `/api/acceso/verificar` no tenía tope por IP.
//  3. La hoja del QR (pública con el token) enseñaba también las pólizas que
//     OTROS te autorizaron a ver. Derogado el 26/10/2026 por Alberto: ahora se
//     ofrecen a propósito, desde la misma lectura que la bóveda (ver el test).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('el intento del código se reserva de forma atómica ANTES de comparar', () => {
  const src = sinComentarios(leer('apps/asegura-portal/app/api/acceso/verificar/route.ts'))
  const reserva = src.search(/portalCodigo\.updateMany\(\{\s*where: \{ id: guardado\.id, usadoEn: null, intentos: \{ lt: MAX_INTENTOS \} \}/)
  const compara = src.indexOf('estadoCodigo(')
  assert.ok(reserva !== -1, 'falta la reserva condicionada del intento')
  assert.ok(compara !== -1 && reserva < compara, 'la reserva tiene que ir antes de comparar el código')
  assert.doesNotMatch(
    src,
    /portalCodigo\.update\(\{ where: \{ id: guardado\.id \}, data: \{ intentos: \{ increment: 1 \} \} \}\)/,
    'el incremento suelto después de comparar es el que dejaba pasar ráfagas',
  )
})

test('verificar lleva tope por IP antes de tocar la BD', () => {
  const src = sinComentarios(leer('apps/asegura-portal/app/api/acceso/verificar/route.ts'))
  const post = src.slice(src.indexOf('export async function POST'))
  const tope = post.search(/rateLimit\(`verificar:\$\{getIp\(req\)\}`/)
  const bd = post.indexOf('prisma.')
  assert.ok(tope !== -1, 'falta el rateLimit por IP')
  assert.ok(bd === -1 || tope < bd, 'el tope va antes de cualquier consulta')
})

test('la hoja del QR parte de la MISMA lectura que la bóveda y «todas» = solo las propias (26/10/2026)', () => {
  // Deroga el brazo del 24/09 («solo propias»): Alberto decidió que la hoja ofrezca cualquier póliza
  // viva que quien la genera VE. Lo que no se puede perder: una sola fuente de acceso
  // (`carteraDeIdentidad` → `candidatasDeLaHoja`), releída en vivo, y «todas» sin las ajenas.
  const pagina = sinComentarios(leer('apps/asegura-portal/app/hoja/[token]/page.tsx'))
  const hojas = sinComentarios(leer('apps/asegura-portal/lib/hojas.ts'))
  const modulo = sinComentarios(leer('packages/module-seguros-portal/src/hoja-qr.ts'))
  assert.match(pagina, /candidatasEnVivo\(hoja\.identidadId\)/, 'la página pública relee la cartera de quien la generó')
  assert.match(pagina, /polizasQueEnsenaLaHoja\(/, 'la selección se aplica con la regla de «todas» = propias')
  assert.equal((hojas.match(/carteraDeIdentidad\(identidadId\)/g) ?? []).length, 2, 'selector y página: la MISMA lectura')
  assert.equal((hojas.match(/candidatasDeLaHoja|elegiblesDeCartera/g) ?? []).length >= 2, true)
  assert.match(modulo, /seleccion\.todas \? candidatas\.filter\(\(c\) => c\.propia\)/, '«todas» no arrastra las ajenas')
  assert.doesNotMatch(pagina, /declaradasDeIdentidad|portalPolizaDeclarada/, 'las añadidas a mano no van en la hoja')
})
