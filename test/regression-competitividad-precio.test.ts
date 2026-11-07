// Cepo de la competitividad de precio por compañía (07/11/2026): lo que tsc no ve de su cableado.
// Lee el FUENTE. El cálculo lo prueba `packages/module-seguros/src/competitividad-precio.test.ts`; el adaptador,
// `apps/asegura/lib/observaciones-precio-tarificaciones.test.ts`; el texto, `apps/plataforma/lib/preparar-reunion.test.ts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8')

test('el cálculo es PURO y no sabe de dónde vienen los precios', () => {
  const calculo = leer('packages/module-seguros/src/competitividad-precio.ts')
  assert.doesNotMatch(calculo, /prisma|\$queryRaw|fetch\(|Date\.now\(|new Date\(\)/, 'el cálculo toca BD, red o reloj')
  const adaptador = leer('apps/asegura/lib/observaciones-precio-tarificaciones.ts')
  assert.doesNotMatch(adaptador, /prisma|\$queryRaw|fetch\(|Date\.now\(|new Date\(\)/, 'el adaptador puro toca BD, red o reloj')
  assert.match(adaptador, /ObservacionPrecio/, 'el adaptador no produce la forma genérica')
})

test('el puerto de asegura: autenticado, acotado a la correduría y con SQL por correduria_id', () => {
  const ruta = leer('apps/asegura/app/api/operador/companias/competitividad/route.ts')
  assert.match(ruta, /operadorAutorizado\(req\)/, 'sin Bearer de operador')
  assert.match(ruta, /correduriaUnica\(\)/, 'sin correduriaUnica(): con BYPASSRLS leería todas las corredurías')
  assert.match(ruta, /registrarErrorCartera\(/, 'errores pelados')
  const lib = leer('apps/asegura/lib/competitividad-companias.ts')
  const sqls = lib.match(/\$queryRaw<[\s\S]*?`[\s\S]*?`/g) ?? []
  assert.ok(sqls.length >= 2, 'faltan las dos lecturas (tarificaciones y precios)')
  for (const q of sqls) assert.match(q, /correduria_id = \$\{correduriaId\}::uuid/, `lectura sin filtrar por correduría: ${q.slice(0, 80)}`)
  assert.match(lib, /simulado = false/, 'las tarificaciones simuladas no son precios de la compañía')
})

test('el proxy de plataforma exige sesión de la correduría y distingue fallo de «sin datos»', () => {
  const ruta = leer('apps/plataforma/app/api/correduria/companias/competitividad/route.ts')
  assert.match(ruta, /exigirCorreduria\(\)/)
  assert.match(ruta, /interpretarCompetitividad\(/)
})

test('la pantalla monta el bloque y el botón «Preparar reunión» en la ficha, sin colores a mano', () => {
  const ui = leer('apps/plataforma/app/(usuario)/correduria/companias/CuadroCompanias.tsx')
  assert.match(ui, /Competitividad de precio/)
  assert.match(ui, /Preparar reunión/)
  assert.match(ui, /<PrepararReunion /)
  assert.doesNotMatch(ui, /#[0-9a-fA-F]{3,8}\b/, 'color hexadecimal: usa tokens var(--x)')
  assert.match(leer('apps/plataforma/app/(usuario)/correduria/companias/[codigo]/FichaCompania.tsx'), /nombre=\{/, 'la ficha no pasa el nombre al cuadro')
})
