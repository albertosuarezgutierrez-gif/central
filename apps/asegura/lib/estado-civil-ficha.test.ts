// Estado civil del cotizador → ficha (20/10/2026). Catálogo SINTÉTICO, sin red ni BD.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { estadoCivilParaFicha } from './estado-civil-ficha.ts'

const CIVILES = [{ id: 'Single', nombre: 'Soltero' }, { id: 'Married', nombre: 'Casado' }, { id: 'Other', nombre: 'Otro' }]
const lector = (cat: typeof CIVILES | null) => {
  let llamadas = 0
  return { leer: async () => { llamadas++; return cat }, n: () => llamadas }
}

test('ausente → no se toca y NI se lee el catálogo', async () => {
  const l = lector(CIVILES)
  assert.deepEqual(await estadoCivilParaFicha(undefined, l.leer), { ok: true, valor: undefined })
  assert.equal(l.n(), 0)
})

test('opción del catálogo (id) → se guarda su NOMBRE y viaja el catálogo para no pisar el que ya casa', async () => {
  const r = await estadoCivilParaFicha('Married', lector(CIVILES).leer)
  assert.equal(r.ok && r.valor, 'Casado')
  assert.ok(r.ok && r.valor !== undefined && r.catalogo.length === 3)
})

test('fuera de catálogo o de cajón → 422; catálogo ilegible (null o lanza) → 503; nunca se escribe', async () => {
  for (const v of ['Viudo', 'Other', 'N/A', '', 3]) {
    const r = await estadoCivilParaFicha(v, lector(CIVILES).leer)
    assert.equal(!r.ok && r.status, 422, String(v))
  }
  const sin = await estadoCivilParaFicha('Married', lector(null).leer)
  assert.equal(!sin.ok && sin.status, 503)
  const lanza = await estadoCivilParaFicha('Married', async () => { throw new Error('caído') })
  assert.equal(!lanza.ok && lanza.estado, 'catalogo_no_disponible')
})

test('cableado: el PATCH valida ANTES de editar, y editarCliente escribe, audita y no pisa el que ya casa', () => {
  const raiz = join(import.meta.dirname, '..')
  const ruta = readFileSync(join(raiz, 'app/api/operador/cliente/route.ts'), 'utf8')
  const patch = ruta.slice(ruta.indexOf('export const PATCH'))
  const valida = patch.indexOf('await estadoCivilParaFicha(body.estadoCivil')
  assert.ok(valida > 0 && valida < patch.indexOf('await editarCliente('), 'estadoCivilParaFicha antes de editarCliente')
  const ed = readFileSync(join(raiz, 'lib/cartera-edicion.ts'), 'utf8')
  const f = ed.slice(ed.indexOf('export async function editarCliente('), ed.indexOf('// ─── Descartar'))
  assert.match(f, /if \(r\.estadoCivil !== undefined\) data\.estadoCivil = r\.estadoCivil/)
  assert.match(f, /anotarCambio\(\{ entidad: 'cliente', id: clienteId, campo: 'estado_civil' \}\)/)
  assert.match(f, /estadoCivilFichaCasa\(c\.estadoCivil, edicion\.estadoCivilSoloSiNoCasa\)/)
})
