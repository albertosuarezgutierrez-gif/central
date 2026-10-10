// Cepo (lee el FUENTE): «oportunidad + solicitud» del lead web es ATÓMICO. Si la solicitud falla, la
// oportunidad recién creada no puede quedar viva ni contar para el tope; una `duplicada` no se toca.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const lead = readFileSync(new URL('./lead-web-solicitud.ts', import.meta.url), 'utf8')
const op = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
const crear = op.slice(op.indexOf('export async function crearOportunidad'), op.indexOf('export async function editarOportunidad'))

test('crearOportunidad ejecuta `trasCrear` DENTRO de su transacción, tras el tope y antes de confirmar', () => {
  const tx = crear.indexOf('$transaction(')
  const tope = crear.indexOf('opciones.topeDiario !== undefined')
  const insert = crear.indexOf('insert into oportunidades')
  const hook = crear.indexOf('await opciones.trasCrear(tx, o.id)')
  const ok = crear.indexOf("return { tipo: 'ok' as const, id: o.id }")
  assert.ok(tx > 0 && tope > tx && insert > tope && hook > insert && ok > hook, 'orden: transacción → tope → insert → trasCrear → ok')
  // La rama `duplicada` vuelve antes del insert: nunca llega al hook.
  const dup = crear.indexOf("return { tipo: 'duplicada' as const, id: ya.id, completada: false }")
  assert.ok(dup > 0 && dup < insert)
})

test('el lead web escribe la solicitud con `insertarSolicitud` dentro de `trasCrear`, no después', () => {
  const hook = lead.indexOf('trasCrear: async (tx, oportunidadId) =>')
  assert.ok(hook > 0)
  assert.ok(lead.indexOf('insertarSolicitud(tx,', hook) > hook)
  // `crearSolicitud` (transacción aparte) solo en la rama de una oportunidad que YA estaba.
  const dup = lead.indexOf("if (o.estado !== 'duplicada')")
  const cs = lead.indexOf('await crearSolicitud(')
  assert.ok(dup > 0 && cs > dup, 'crearSolicitud solo tras descartar todo lo que no sea duplicada')
  assert.equal(lead.split('await crearSolicitud(').length - 1, 1)
})
