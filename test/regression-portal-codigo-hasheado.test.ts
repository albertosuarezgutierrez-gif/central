// El código de un solo uso del portal NO se guarda en claro.
//
// Hasta la auditoría del 20/09/2026, `seguros.portal_codigo.codigo` guardaba los
// 6 dígitos tal cual y `estadoCodigo()` los comparaba con `===`. Una lectura de
// la BD, un volcado o una copia de seguridad expuesta durante esos 10 minutos
// dejaba entrar como cualquier cliente que acabara de pedir código — y el propio
// fichero ya se tomaba la molestia de hashear el CANAL con pimienta.
//
// 🪤 Estos cepos leen el FUENTE porque lo que vigilan no se puede observar desde
// fuera: un `===` y una comparación en tiempo constante devuelven exactamente lo
// mismo, y un test de comportamiento sería verde con las dos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

/** Sin comentarios: la cabecera de estos ficheros EXPLICA el fallo que se
 *  persigue, y escribe literalmente `===` y «codigo» al hacerlo. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function pos(cuerpo: string, aguja: string | RegExp): number {
  const i = typeof aguja === 'string' ? cuerpo.indexOf(aguja) : cuerpo.search(aguja)
  assert.ok(i >= 0, `no aparece: ${aguja}`)
  return i
}

test('a la BD se escribe el HASH, nunca el código generado', () => {
  const fuente = sinComentarios(leer('apps/asegura-portal/app/api/acceso/solicitar/route.ts'))
  const i = pos(fuente, 'portalCodigo.create')
  const create = fuente.slice(i, i + 300)
  assert.match(create, /codigo:\s*hashCodigo\(/, 'el `create` tiene que guardar hashCodigo(codigo)')
  assert.doesNotMatch(create, /codigo\s*[,}]/, 'un `codigo` a secas guarda los 6 dígitos en claro')
  assert.match(fuente, /import\s*\{[^}]*hashCodigo[^}]*\}\s*from\s*'@\/lib\/auth'/, 'el hash sale del helper de la app, no de una copia local')
})

test('el código en claro sigue yendo por el canal: el hash NO se envía', () => {
  const fuente = sinComentarios(leer('apps/asegura-portal/app/api/acceso/solicitar/route.ts'))
  const envio = fuente.slice(pos(fuente, 'enviarCodigo('), pos(fuente, 'enviarCodigo(') + 120)
  assert.match(envio, /enviarCodigo\(destino,\s*codigo\)/, 'al cliente se le manda el código, no su hash')
})

test('al verificar se compara HASH contra HASH', () => {
  const fuente = sinComentarios(leer('apps/asegura-portal/app/api/acceso/verificar/route.ts'))
  const i = pos(fuente, 'estadoCodigo(')
  const llamada = fuente.slice(i, i + 400)
  assert.match(llamada, /codigoHash:\s*guardado\.codigo/, 'lo guardado entra como codigoHash')
  assert.match(llamada, /hashCodigo\(codigo\)/, 'la entrada del usuario se hashea antes de comparar')
  assert.doesNotMatch(llamada, /\n\s*codigo,/, 'pasar el código en claro no compara nada: nadie podría entrar')
})

test('estadoCodigo NO compara con === y usa la comparación en tiempo constante', () => {
  const fuente = sinComentarios(leer('packages/module-seguros-portal/src/codigo.ts'))
  const i = pos(fuente, 'export function estadoCodigo')
  const cuerpo = fuente.slice(i)
  assert.match(cuerpo, /igualEnTiempoConstante\(\s*entradaHash\s*,\s*guardado\.codigoHash\s*\)/)
  assert.doesNotMatch(cuerpo, /===\s*guardado\.codigoHash/, 'un === filtra por tiempo cuánto prefijo se ha acertado')
  assert.doesNotMatch(cuerpo, /entradaHash\s*===/, 'ídem al revés')
})

test('el bucle de comparación no corta al primer carácter distinto', () => {
  const fuente = sinComentarios(leer('packages/module-seguros-portal/src/codigo.ts'))
  const i = pos(fuente, 'export function igualEnTiempoConstante')
  const cuerpo = fuente.slice(i, fuente.indexOf('\n}', i))
  assert.match(cuerpo, /dif\s*\|=/, 'se acumula la diferencia, no se compara carácter a carácter')
  const linea = cuerpo.split('\n').find((l) => l.includes('for ('))
  assert.ok(linea, 'no se encontró el bucle')
  assert.doesNotMatch(linea, /\breturn\b/, 'un return dentro del bucle lo convierte en un === lento')
})

test('el módulo del código NO puede importar node:crypto (lo carga el navegador)', () => {
  // Misma razón que `generarCodigo`: el barril lo importan componentes de
  // cliente y `node:crypto` revienta el build de producción.
  const fuente = sinComentarios(leer('packages/module-seguros-portal/src/codigo.ts'))
  assert.doesNotMatch(fuente, /from\s*'node:crypto'/)
})

test('el hash del código reutiliza la pimienta del canal, sin una segunda forma de hashear', () => {
  const fuente = sinComentarios(leer('apps/asegura-portal/lib/auth.ts'))
  const i = pos(fuente, 'export function hashCodigo')
  const cuerpo = fuente.slice(i, i + 200)
  assert.match(cuerpo, /hashConPimienta\(/, 'hashCodigo tiene que pasar por el mismo helper que hashCanal')
  assert.doesNotMatch(cuerpo, /createHash\(/, 'una segunda forma de hashear es una segunda cosa que desincronizar')
  // Y sin pimienta un SHA-256 de 6 dígitos se revierte con un bucle de 10^6.
  const pimienta = fuente.slice(pos(fuente, 'function hashConPimienta'), pos(fuente, 'function hashConPimienta') + 300)
  assert.match(pimienta, /requireSecret\(\s*'ASEGURA_PORTAL_CANAL_PEPPER'/)
})
