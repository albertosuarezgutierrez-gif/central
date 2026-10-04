import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leerPeticionNoDuplicado } from './no-duplicado-peticion.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const CUENTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const humano = `humano:${CUENTA}`

test('petición buena: ids en minúscula sin repetir, motivo limpio y decidido_por = la sesión', () => {
  assert.deepEqual(leerPeticionNoDuplicado({ ids: [A, B.toUpperCase(), A], motivo: '  clientes\n distintos ' }, humano), {
    ok: true, ids: [A, B], motivo: 'clientes distintos', decididoPor: humano,
  })
})

test('🚨 decidido_por sale de x-actor, nunca del cuerpo, y tiene que ser una persona', () => {
  const r = leerPeticionNoDuplicado({ ids: [A, B], motivo: 'x', decididoPor: 'otro' }, humano)
  assert.equal(r.ok && r.decididoPor, humano)
  for (const cab of [null, '', 'sistema:plataforma', 'agente:vigia', 'humano:alberto@correo.es']) {
    assert.deepEqual(leerPeticionNoDuplicado({ ids: [A, B], motivo: 'x' }, cab), { ok: false, status: 403, motivo: 'sin_usuario' }, String(cab))
  }
})

test('🚨 motivo obligatorio', () => {
  for (const motivo of [undefined, '', '   ', 7]) {
    assert.deepEqual(leerPeticionNoDuplicado({ ids: [A, B], motivo }, humano), { ok: false, status: 400, motivo: 'motivo_obligatorio' })
  }
})

test('ids: al menos dos uuids distintos', () => {
  const malo = { ok: false, status: 400, motivo: 'ids_no_validos' }
  assert.deepEqual(leerPeticionNoDuplicado({ ids: [A], motivo: 'x' }, humano), malo)
  assert.deepEqual(leerPeticionNoDuplicado({ ids: [A, A], motivo: 'x' }, humano), malo)
  assert.deepEqual(leerPeticionNoDuplicado({ ids: [A, 'no-uuid'], motivo: 'x' }, humano), malo)
  assert.deepEqual(leerPeticionNoDuplicado({ ids: 'A,B', motivo: 'x' }, humano), malo)
  assert.deepEqual(leerPeticionNoDuplicado(null, humano), malo)
})

test('🚨 más de 20 pólizas distintas → 400 demasiadas_polizas explícito (nunca se marca un trozo)', () => {
  const uuid = (i: number) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`
  const muchos = Array.from({ length: 21 }, (_, i) => uuid(i))
  assert.deepEqual(leerPeticionNoDuplicado({ ids: muchos, motivo: 'x' }, humano), { ok: false, status: 400, motivo: 'demasiadas_polizas' })
  // Justo 20 sí pasa, entero.
  const veinte = muchos.slice(0, 20)
  const r = leerPeticionNoDuplicado({ ids: veinte, motivo: 'x' }, humano)
  assert.equal(r.ok && r.ids.length, 20)
  // 21 entradas con un repetido son 20 distintas: pasan.
  const conRepe = [...veinte, veinte[0].toUpperCase()]
  assert.equal(leerPeticionNoDuplicado({ ids: conRepe, motivo: 'x' }, humano).ok, true)
})

test('🚨 la escritura: tabla ausente → migración pendiente (503), jamás éxito; pares revalidados en BD', () => {
  const src = readFileSync(join(import.meta.dirname, 'no-duplicados.ts'), 'utf8')
  const tramo = src.slice(src.indexOf('export async function marcarNoDuplicado'))
  assert.match(tramo, /if \(esTablaAusente\(e\)\) return \{ status: 503, estado: 'error', motivo: 'migracion_pendiente' \}/)
  assert.match(tramo, /throw e/)
  assert.match(tramo, /correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(tramo, /merged_into_poliza_id IS NULL/)
  assert.match(tramo, /paresNoDuplicado\(unicos/)
  assert.match(tramo, /if \(!r\.ok\) return \{ status: 400/)
  assert.match(tramo, /ON CONFLICT \(poliza_a_id, poliza_b_id\) DO NOTHING/)
  // Y la ruta: autorizada como las vecinas, auditada, y la correduría la pone el servidor.
  const ruta = readFileSync(join(import.meta.dirname, '../app/api/operador/duplicados/no-duplicado/route.ts'), 'utf8')
  assert.match(ruta, /export const POST = auditado\(/)
  assert.match(ruta, /if \(!operadorAutorizado\(req\)\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 401 \}\)/)
  assert.match(ruta, /leerPeticionNoDuplicado\(cuerpo, req\.headers\.get\(CABECERA_ACTOR\)\)/)
  assert.match(ruta, /marcarNoDuplicado\(correduria\.id,/)
})
