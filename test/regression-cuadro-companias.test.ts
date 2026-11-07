// Cepo del cuadro de mando por compañía (07/11/2026): lo que tsc no ve de su cableado.
// Lee el FUENTE. La lógica de cálculo la prueban `cuadro-compania.test.ts` (module-seguros) y
// `apps/plataforma/lib/cuadro-companias.test.ts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8')

test('el puerto de asegura: autenticado, acotado a la correduría y con error clasificado', () => {
  const ruta = leer('apps/asegura/app/api/operador/companias/cuadro/route.ts')
  assert.match(ruta, /operadorAutorizado\(req\)/, 'sin Bearer de operador')
  assert.match(ruta, /correduriaUnica\(\)/, 'sin correduriaUnica(): con BYPASSRLS leería todas las corredurías')
  assert.match(ruta, /registrarErrorCartera\(/, 'errores pelados')
  const lib = leer('apps/asegura/lib/cuadro-companias.ts')
  assert.match(lib, /correduriaId/, 'las lecturas no filtran por correduría')
  assert.doesNotMatch(lib, /\$queryRaw|\$executeRaw/, 'SQL crudo sin pasar por el cepo de aislamiento')
  assert.match(lib, /registrarErrorCartera\(/)
})

test('el proxy de plataforma exige sesión de la correduría y filtra el libro por cuenta', () => {
  const ruta = leer('apps/plataforma/app/api/correduria/companias/cuadro/route.ts')
  assert.match(ruta, /exigirCorreduria\(\)/)
  assert.match(ruta, /cuenta_id = \$\{cuentaId\}/, 'comisiones_devengo sin filtrar por cuenta_id')
})

test('la pantalla no pinta null como 0,00€ ni usa colores a mano', () => {
  const ui = leer('apps/plataforma/app/(usuario)/correduria/companias/CuadroCompanias.tsx')
  assert.doesNotMatch(ui, /eur\((?:c|a|libro|f|v)\??\.[\w.]*(?:prima|devengada|incurrido|mediaPorPoliza|liquidado|cobrado|primaNetaCobrada)\b/, 'eur() sobre un importe que puede ser null')
  assert.doesNotMatch(ui, /#[0-9a-fA-F]{3,8}\b/, 'color hexadecimal: usa tokens var(--x)')
})

test('el endpoint está enlazado: lista y ficha montan el cuadro', () => {
  assert.match(leer('apps/plataforma/app/(usuario)/correduria/companias/ListaCompanias.tsx'), /<CuadroCompanias /)
  assert.match(leer('apps/plataforma/app/(usuario)/correduria/companias/page.tsx'), /<ListaCompanias conCuadro /)
  assert.match(leer('apps/plataforma/app/(usuario)/correduria/companias/[codigo]/FichaCompania.tsx'), /<CuadroFicha/)
})
