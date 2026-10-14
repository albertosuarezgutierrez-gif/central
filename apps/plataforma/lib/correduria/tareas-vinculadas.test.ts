import test from 'node:test'
import assert from 'node:assert/strict'
import { TIPOS_TAREA } from '@central/module-seguros'
import { ATAJOS_TAREA, atajo, detalleTareas, interpretarTareasVinculadas, ordenarTareasVinculadas, partirTexto, textoTarea, type TareaVinculada } from './tareas-vinculadas.ts'

const t = (o: Partial<TareaVinculada>): TareaVinculada => ({
  id: 'a', tipo: 'tarea', prioridad: 'media', estado: 'pendiente', texto: 'x', fecha: null,
  polizaId: null, polizaNumero: null, oportunidadId: null, origen: null, ...o,
})

test('fallo de lectura ≠ lista vacía: sin_configurar, secreto y error se distinguen', () => {
  assert.deepEqual(interpretarTareasVinculadas(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarTareasVinculadas(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.equal(interpretarTareasVinculadas(500, { estado: 'error', causa: 'bd' }).estado, 'error')
  assert.deepEqual(interpretarTareasVinculadas(200, { estado: 'ok', tareas: [] }), { estado: 'ok', tareas: [], truncado: false, descartadas: 0 })
})

test('filas sin la forma esperada se cuentan, no se inventan', () => {
  const r = interpretarTareasVinculadas(200, { estado: 'ok', tareas: [{ id: 't1', tipo: 'tarea', estado: 'pendiente', polizaId: 'p1' }, { id: 't2' }], truncado: true })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.tareas.length, 1)
  assert.equal(r.descartadas, 1)
  assert.equal(r.truncado, true)
  assert.equal(r.tareas[0].polizaId, 'p1')
  assert.equal(r.tareas[0].texto, '')
})

test('pendientes primero por fecha (sin fecha al final), cerradas detrás', () => {
  const orden = ordenarTareasVinculadas([
    t({ id: 'c', estado: 'cerrada', fecha: '2026-01-01' }),
    t({ id: 'sin', fecha: null }),
    t({ id: 'tarde', fecha: '2026-10-20' }),
    t({ id: 'pronto', fecha: '2026-10-15' }),
  ]).map(x => x.id)
  assert.deepEqual(orden, ['pronto', 'tarde', 'sin', 'c'])
})

test('baldosa: no leído = null (no «0»); cuenta solo las abiertas', () => {
  assert.equal(detalleTareas({ estado: 'error', motivo: 'red' }), null)
  assert.deepEqual(detalleTareas({ estado: 'ok', tareas: [t({ estado: 'cerrada' })], truncado: false, descartadas: 0 }), { texto: 'ninguna pendiente' })
  assert.deepEqual(detalleTareas({ estado: 'ok', tareas: [t({}), t({ id: 'b' })], truncado: false, descartadas: 0 }), { texto: '2 pendientes', tono: 'aviso' })
})

test('título + descripción viajan en el único campo de texto y se recuperan', () => {
  assert.equal(textoTarea('  ', 'algo'), null)
  assert.equal(textoTarea('Cambio de cuenta', ''), 'Cambio de cuenta')
  const txt = textoTarea('Cambio de cuenta', 'IBAN nuevo por correo')!
  assert.deepEqual(partirTexto(txt), { titulo: 'Cambio de cuenta', descripcion: 'IBAN nuevo por correo' })
  assert.deepEqual(partirTexto('Solo título'), { titulo: 'Solo título', descripcion: null })
})

test('los atajos usan tipos de la tabla de tareas y uno desconocido cae a «Otro»', () => {
  for (const a of ATAJOS_TAREA) assert.ok((TIPOS_TAREA as readonly string[]).includes(a.tipo), a.valor)
  assert.equal(atajo('inventado').valor, 'otro')
  assert.equal(atajo('llamar').tipo, 'llamada')
})
