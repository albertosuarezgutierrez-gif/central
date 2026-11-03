// Guardián del «gabinete de siniestros» (IA del expediente). Lee la FUENTE, no importa nada de la app.
// Protege: no aiComplete, POST auditado, una sola llamada por paso sin reintentos, modelo barato para índice y ficha,
// verificarCitas aplicado también al índice y al veredicto, versión de la base de conocimiento en todo meta,
// cartera EN VIGOR para «otrasPolizas» y que con índice no se mande el texto entero de la póliza.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const LIB = 'apps/asegura/lib/siniestro-ia.ts'
const PROMPT = 'apps/asegura/lib/siniestro-ia-prompt.ts'
const RUTA = 'apps/asegura/app/api/operador/siniestro/ia/route.ts'
const GABINETE = 'packages/module-seguros/src/siniestro-gabinete.ts'

/** Cuerpo de `export function <nombre>` hasta la siguiente función exportada. */
function cuerpo(src: string, nombre: string): string {
  const i = src.indexOf(`export function ${nombre}`)
  if (i < 0) return ''
  const j = src.indexOf('\nexport ', i + 10)
  return src.slice(i, j < 0 ? undefined : j)
}

test('gabinete: ni aiComplete ni POST sin auditar', () => {
  for (const p of [LIB, PROMPT, RUTA]) assert.doesNotMatch(leer(p), /\baiComplete\b/, `${p}: va por iaTexto`)
  assert.match(leer(RUTA), /export const POST = auditado\(/)
})

test('gabinete: UNA llamada a iaTexto (en llamarIA) y cada paso se llama una sola vez, sin reintentos', () => {
  const lib = leer(LIB)
  assert.equal((lib.match(/await iaTexto\(/g) ?? []).length, 1, 'un único sitio que llama a iaTexto')
  for (const paso of ['indice', 'ficha', 'veredicto', 'redactar']) {
    assert.equal((lib.match(new RegExp(`llamarIA\\('${paso}'`, 'g')) ?? []).length, 1, `paso ${paso}: una llamada`)
  }
  assert.doesNotMatch(lib, /(for|while)\s*\([^)]*\)\s*\{[^}]*llamarIA\(/, 'llamarIA dentro de un bucle = reintentos')
})

test('gabinete: índice y ficha con el modelo BARATO; veredicto y redacción con el bueno', () => {
  const lib = leer(LIB)
  assert.match(lib, /SINIESTRO_IA_MODELO_EXTRACCION/)
  assert.match(lib, /llamarIA\('indice'[^\n]*modelo: modeloExtraccion/)
  assert.match(lib, /llamarIA\('ficha'[^\n]*modelo: modeloExtraccion/)
  assert.match(lib, /llamarIA\('veredicto'[^\n]*modelo,/)
})

test('gabinete: verificarCitas también en las citas del índice y del veredicto', () => {
  const lib = leer(LIB)
  assert.match(lib, /verificarCitasIndice\(/, 'la lib verifica las citas del índice')
  assert.match(lib, /verificarCitasVeredicto\(/, 'la lib verifica las citas del veredicto')
  assert.match(lib, /verificarCitas\(respuesta, poliz\.texto\)/, 'texto libre (redactar / veredicto que no valida)')
  const g = leer(GABINETE)
  assert.match(cuerpo(g, 'verificarCitasIndice'), /verificarCitas\(/, 'verificarCitasIndice usa verificarCitas')
  assert.match(cuerpo(g, 'verificarCitasVeredicto'), /verificarCitas\(/, 'verificarCitasVeredicto usa verificarCitas')
})

test('gabinete: todo mensaje de la IA lleva metaGabinete (versión de la base de conocimiento) y cabe en el meta', () => {
  const lib = leer(LIB)
  const guardados = (lib.match(/anadirMensajeSiniestro\(correduriaId/g) ?? []).length
  assert.ok(guardados >= 2)
  assert.equal((lib.match(/encajarMeta\(metaGabinete\(/g) ?? []).length, guardados, 'cada guardado pasa por encajarMeta(metaGabinete(…))')
  assert.match(cuerpo(leer(GABINETE), 'metaGabinete'), /conocimientoVersion: CONOCIMIENTO_SINIESTROS_VERSION/)
})

test('gabinete: con índice completo NO se manda el texto entero; otrasPolizas solo de la cartera EN VIGOR', () => {
  const lib = leer(LIB)
  assert.match(lib, /usarIndice \? \[[^\]]*indiceParaPrompt\(indice!\)\] : bloqueTextoPoliza/)
  assert.match(lib, /WHERE_CARTERA_EN_VIGOR/)
  assert.doesNotMatch(lib, /clientes?\.tipo|cliente:\s*\{\s*tipo/, 'nunca clientes.tipo')
  assert.match(lib, /polizasPermitidas:/, 'los ids de otrasPolizas se filtran a la lista dada')
})

test('base de conocimiento: encabezado de revisión pendiente y versión', () => {
  const c = leer('packages/module-seguros/src/conocimiento-siniestros.ts')
  assert.match(c, /PENDIENTE DE REVISIÓN POR ALBERTO/)
  assert.match(c, /export const CONOCIMIENTO_SINIESTROS_VERSION = '\d{4}-\d{2}-\d{2}\.\d+'/)
})
