import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuentaAtrasLiberacion, leerAnulacion, textoDesenlaceAnulacion, type DesenlaceAnulacion } from './anulaciones-asegura.ts'

const fila = { id: 'a', polizaId: 'p', clienteId: 'c', fechaEfecto: '2027-01-10', estado: 'solicitada', tipo: 'no_renovacion', motivo: 'precio' }

test('ningún fallo se lee como «hecho»', () => {
  const fallos: DesenlaceAnulacion[] = ['no_encontrada', 'ya_abierta', 'no_permitida', 'invalida', 'error']
  for (const f of fallos) assert.match(textoDesenlaceAnulacion(f), /^NO /, f)
  assert.match(textoDesenlaceAnulacion('error'), /NO se sabe/)
  assert.match(textoDesenlaceAnulacion('no_permitida', 'Sin la firma del cliente no se comunica'), /firma/)
})

test('un expediente sin estado conocido o sin fecha es ilegible, no uno vacío', () => {
  assert.ok(leerAnulacion(fila))
  assert.equal(leerAnulacion({ ...fila, estado: 'borrado' }), null)
  assert.equal(leerAnulacion({ ...fila, fechaEfecto: '' }), null)
  assert.deepEqual(leerAnulacion({ ...fila, siguiente: { texto: 'Falta la firma', alerta: true } })?.siguiente, { texto: 'Falta la firma', alerta: true })
})

test('una baja pedida por el cliente se lee con su origen y su plazo; sin el campo (asegura vieja) es del corredor', () => {
  assert.equal(leerAnulacion(fila)?.origen, 'corredor')
  const p = leerAnulacion({ ...fila, origen: 'portal', liberaSolaAt: '2026-10-07T10:00:00.000Z', liberadaAt: null, motivoTexto: 'competidor: AXA · precio_ofrecido: 99,00€' })!
  assert.equal(p.origen, 'portal')
  assert.equal(p.liberaSolaAt, '2026-10-07T10:00:00.000Z')
  assert.equal(p.liberadaAt, null)
  assert.equal(p.motivoTexto, 'competidor: AXA · precio_ofrecido: 99,00€')
})

test('cuenta atrás de la liberación: días/horas/minutos, «ya» al llegar, y una fecha ilegible no inventa plazo', () => {
  const ahora = new Date('2026-10-05T10:00:00Z')
  assert.equal(cuentaAtrasLiberacion('2026-10-07T10:00:00Z', ahora), 'se libera sola en 2 d')
  assert.equal(cuentaAtrasLiberacion('2026-10-06T14:00:00Z', ahora), 'se libera sola en 1 d 4 h')
  assert.equal(cuentaAtrasLiberacion('2026-10-05T11:20:00Z', ahora), 'se libera sola en 1 h 20 min')
  assert.equal(cuentaAtrasLiberacion('2026-10-05T10:35:00Z', ahora), 'se libera sola en 35 min')
  assert.equal(cuentaAtrasLiberacion('2026-10-05T10:00:00Z', ahora), 'ya se puede firmar')
  assert.equal(cuentaAtrasLiberacion(null, ahora), null)
  assert.equal(cuentaAtrasLiberacion('mañana', ahora), null)
})

test('🪤 el botón «Liberar para firma» manda PATCH accion liberar y la ruta de plataforma deja pasar accion y nota', async () => {
  const { readFileSync } = await import('node:fs')
  const tsx = readFileSync(new URL('../app/(usuario)/correduria/Anulaciones.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /method: 'PATCH'[\s\S]*accion: 'liberar'/)
  assert.match(tsx, /minHeight: 44[\s\S]*Liberar para firma/)
  const ruta = readFileSync(new URL('../app/api/correduria/anulaciones/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /escribirAnulacion\(metodo, b, guarda\.session\.email\)/, 'el cuerpo (accion, nota) pasa entero; solo el actor se pisa')
  assert.doesNotMatch(ruta, /ACCIONES|accion ===/, 'la ruta no filtra acciones: «liberar» llega a asegura')
})
