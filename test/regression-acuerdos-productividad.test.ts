// Guardián de la productividad, el cotejo y la lectura unificada del cuadro
// firmado en `apps/asegura` (fase 2 de acuerdos con compañías, 06/10/2026).
// `node --test` (gate en CI vía `pnpm test:guardia`). Lee el FUENTE: los SQL y
// los `where` de Prisma no los mira tsc, y un test que importase estos módulos
// tumbaría el job de tests, que corre sin `prisma generate`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, 'apps/asegura', f), 'utf8')
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

test('productividad: recibos de SU correduría y de cartera viva por la fuente única (no reimplementada)', () => {
  const src = sinComentarios(leer('lib/acuerdos-productividad.ts'))
  assert.match(src, /polizaRecibo\.findMany\(\{\s*where: \{\s*correduriaId,/)
  assert.match(src, /poliza: \{ correduriaId, \.\.\.WHERE_CARTERA_VIVA/)
  assert.doesNotMatch(src, /importRef|import_ref|eiacXmlHash/, 'qué es cartera viva lo decide WHERE_CARTERA_VIVA, no este fichero')
  assert.match(src, /completo: !truncado/, 'con la lectura cortada ningún objetivo puede salir en color')
  assert.match(src, /revisado: a\.revisadoAt !== null/, 'el cotejo llega a la regla pura')
})

test('cotejo: filtra por correduría en las DOS consultas y no re-sella un acuerdo ya cotejado', () => {
  const src = sinComentarios(leer('lib/acuerdo-cotejo.ts'))
  assert.match(src, /updateMany\(\{\s*where: \{ id: acuerdoId, correduriaId, revisadoAt: null \}/)
  assert.match(src, /findFirst\(\{\s*where: \{ id: acuerdoId, correduriaId \}/)
  assert.doesNotMatch(src, /\.update\(\{/, 'un update por id sin correduría sellaría acuerdos de otra')
})

test('cotejo: la ruta va envuelta en auditado() y deja el cambio con su valor', () => {
  const ruta = leer('app/api/operador/companias/acuerdo/cotejar/route.ts')
  assert.match(ruta, /export const POST = auditado\(/)
  assert.match(ruta, /anotarCambio\(\{ entidad: 'acuerdo', id: [^,]+, campo: 'revisado_at'/)
  assert.match(leer('lib/cambios.ts'), /'acuerdo\.revisado_at'/)
})

test('cuadro firmado: se lee de las tablas de acuerdos (no de comision_pactada), por correduría y solo lo cruzable', () => {
  const src = sinComentarios(leer('lib/comisiones-pactadas.ts'))
  assert.match(src, /from acuerdo_comisiones l\s+join acuerdos_compania a/)
  assert.doesNotMatch(src, /from comision_pactada/)
  assert.match(src, /where a\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(src, /esCodigoProducto\(f\.producto\) && f\.pctNueva !== null && f\.pctCartera !== null/,
    'una línea con % que no consta o con nombre comercial no entra en el cruce')
})

test('productividad y acuerdos: las rutas del puerto exigen el Bearer y resuelven la correduría', () => {
  for (const f of ['app/api/operador/companias/productividad/route.ts', 'app/api/operador/companias/acuerdo/cotejar/route.ts']) {
    const src = leer(f)
    assert.match(src, /if \(!operadorAutorizado\(req\)\)/, f)
    assert.match(src, /correduriaUnica\(\)/, f)
  }
})
