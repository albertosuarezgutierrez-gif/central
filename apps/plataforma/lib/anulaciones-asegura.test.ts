import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerAnulacion, textoDesenlaceAnulacion, type DesenlaceAnulacion } from './anulaciones-asegura.ts'

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
