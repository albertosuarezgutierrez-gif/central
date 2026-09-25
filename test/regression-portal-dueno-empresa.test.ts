// El DUEÑO ve su empresa entera, derivado de la relación `Dueño` en cada lectura (25/09/2026).
//
// Decisión de Alberto: «si esa persona es el dueño de la empresa, automáticamente hay que dar
// acceso a toda la información de la empresa… y después el dueño autoriza a quien quiera». Este
// cepo vigila las fronteras que hacen que eso no rompa nada: no se escribe ningún vínculo (borrar la
// relación lo corta al instante), el dueño no cuenta como visita de un tercero, el cron lo puede
// calcular sin cookie, y lo PERSONAL (Mis datos, uso de autorizaciones) sigue solo en su ficha.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('la cartera suma las empresas del dueño sin escribir ningún vínculo', () => {
  const src = sinComentarios(leer('apps/asegura-portal/lib/cartera-lectura.ts'))
  assert.match(src, /await empresasDeFichas\(/, 'la cartera ya no mira de qué empresas es dueño')
  assert.match(src, /\[\.\.\.propiosIds, \.\.\.autorizadosIds, \.\.\.representadasIds\]/)
  assert.doesNotMatch(src, /portalVinculo\.(create|upsert|update|createMany)/, 'la lectura de cartera escribe vínculos')
  assert.match(src, /via: 'dueno'/)
})

test('las empresas del dueño NO se anotan como visita de un tercero', () => {
  const src = sinComentarios(leer('apps/asegura-portal/lib/cartera-lectura.ts'))
  const i = src.indexOf('const camposDueno')
  assert.notEqual(i, -1)
  const bloque = src.slice(i, src.indexOf('return {', i))
  assert.doesNotMatch(bloque, /autorizacionesUsadas/, 'el dueño aparece en «quién ha mirado tus seguros»')
  assert.match(bloque, /camposDeAlcances\(\['total'\], 'juridica'\)/)
})

test('empresasDeFichas no depende de la cookie (la usa el cron) y solo abre con «Dueño»', () => {
  const src = sinComentarios(leer('apps/asegura-portal/lib/representacion.ts'))
  const i = src.indexOf('export async function empresasDeFichas')
  const cuerpo = src.slice(i)
  assert.doesNotMatch(cuerpo, /getIdentidad\(/)
  assert.match(cuerpo, /tipoRelacion: RELACION_DUENO/)
  assert.match(cuerpo, /mergedIntoClienteId: null, activo: true/)
})

test('lo personal sigue solo en su ficha: registrarUso y Mis datos no ven la empresa', () => {
  const src = sinComentarios(leer('apps/asegura-portal/lib/autorizaciones.ts'))
  const i = src.indexOf('export async function registrarUso')
  assert.match(src.slice(i, i + 800), /fichasDeIdentidad\(/)
  assert.doesNotMatch(src.slice(i), /fichasOtorgablesDe\(/)
  for (const fn of ['autorizacionesDeIdentidad', 'conceder', 'ampliarATotal', 'resolver']) {
    const j = src.indexOf(`export async function ${fn}`)
    const k = src.indexOf('export async function', j + 10)
    assert.match(src.slice(j, k), /fichasOtorgablesDe\(/, `${fn} no deja al dueño autorizar sobre su empresa`)
  }
  assert.doesNotMatch(leer('apps/asegura-portal/lib/mis-datos.ts'), /empresasDeFichas|fichasOtorgablesDe/)
})
