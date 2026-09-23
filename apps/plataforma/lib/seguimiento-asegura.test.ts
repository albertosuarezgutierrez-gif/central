import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTIVOS_PERDIDA } from '@central/module-seguros'
import { colaLlamadas, guionLlamada, interpretarLeads, interpretarTareasHoy, interpretarOportunidad, MOTIVOS_PERDIDA_UI, parsearPrima, rotuloCanal, whatsappDeLead } from './seguimiento-asegura.ts'

const lead = {
  oportunidadId: 'o1', estado: 'competencia', clienteId: 'c1', cliente: 'Ana', ramo: 'auto', aseguradora: 'Mapfre',
  prima: null, vencimientoEstimado: '2026-11-12', dias: 50, ventana: '30_60', telefono: '600', email: null,
  intentos: 0, ultimoContactoEn: null, respondioAntes: false, fueCliente: false, canal: 'solo_telefono', puntuacion: 60,
  siguientePaso: { accion: 'primer_contacto', motivo: 'le vence pronto', dentroDeDias: 0 },
}

test('lista vacía con ok es «no hay»; sin configurar y error NO lo son', () => {
  const vacia = interpretarLeads(200, { estado: 'ok', leads: [], porVentana: {} })
  assert.equal(vacia.estado, 'ok')
  assert.equal(interpretarLeads(503, null).estado, 'sin_configurar')
  assert.equal(interpretarLeads(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  const err = interpretarLeads(500, { estado: 'error', causa: 'credenciales' })
  assert.deepEqual(err, { estado: 'error', motivo: 'credenciales' })
  assert.equal(interpretarLeads(401, null).estado, 'error')
})

test('la prima que no consta sigue siendo null, y una fila rota se cuenta, no se inventa', () => {
  const { intentos: _i, ...sinIntentos } = lead
  void _i
  const r = interpretarLeads(200, { estado: 'ok', leads: [lead, { oportunidadId: 'x' }, sinIntentos, { ...lead, ramo: null, cliente: null }], porVentana: { '30_60': 1 } })
  assert.ok(r.estado === 'ok')
  assert.equal(r.leads.length, 2)
  assert.equal(r.leads[0].prima, null)
  // Sin intentos no se pinta «0 de 3»: la fila se descarta y se cuenta.
  assert.equal(r.descartadas, 2)
  // Ramo o nombre que no constan siguen siendo null, no «otro».
  assert.equal(r.leads[1].ramo, null)
  assert.equal(r.leads[1].cliente, null)
  assert.equal(r.porVentana['30_60'], 1)
  assert.equal(r.porVentana.menos_30, 0)
})

test('asegura antigua sin canal: no se afirma «solo teléfono»', () => {
  const { canal: _c, fueCliente: _f, ...sinCanal } = lead
  void _c; void _f
  const r = interpretarLeads(200, { estado: 'ok', leads: [sinCanal] })
  assert.ok(r.estado === 'ok')
  assert.equal(r.leads[0].canal, null)
  assert.equal(r.leads[0].fueCliente, null)
  assert.equal(r.sinCanalPermitido, null)
  assert.equal(rotuloCanal(null), 'Canal sin comprobar')
})

test('oportunidad: 404 es «no encontrada», no un error; el contexto que falta queda null', () => {
  assert.equal(interpretarOportunidad(404, { estado: 'no_encontrado' }).estado, 'no_encontrado')
  const r = interpretarOportunidad(200, {
    estado: 'ok',
    oportunidad: { id: 'o1', clienteId: 'c1', estado: 'en_negociacion', primaCompetidor: null },
    tareas: [
      { id: 't1', tipo: 'llamada', prioridad: 'media', estado: 'pendiente', observaciones: 'x', fechaLimite: '2026-09-25' },
      { sinId: true },
      // Sin estado no se sabe si está hecha: no se pinta como pendiente.
      { id: 't2', tipo: 'llamada', prioridad: 'media', observaciones: 'y', fechaLimite: null },
    ],
    historial: [{ accion: 'interesado', actor: 'a', fecha: '2026-09-22T10:00:00Z' }],
  })
  assert.ok(r.estado === 'ok')
  assert.equal(r.cliente, null)
  assert.equal(r.fueCliente, null)
  assert.equal(r.tareas.length, 1)
  assert.equal(r.tareasDescartadas, 2)
  assert.equal(r.historial.length, 1)
})

test('los motivos de la pantalla son los del módulo, en su orden y con rótulo', () => {
  assert.deepEqual(MOTIVOS_PERDIDA_UI.map((m) => m.valor), [...MOTIVOS_PERDIDA])
  for (const m of MOTIVOS_PERDIDA_UI) assert.ok(m.rotulo.length > 0, m.valor)
})

test('prima en español: «1.200» son mil doscientos, lo ambiguo no pasa', () => {
  assert.equal(parsearPrima('1.200'), 1200)
  assert.equal(parsearPrima('1.200,50'), 1200.5)
  assert.equal(parsearPrima('412,5'), 412.5)
  assert.equal(parsearPrima('412.50'), 412.5)
  assert.equal(parsearPrima('1200 €'), 1200)
  assert.equal(parsearPrima(''), null)
  for (const mal of ['1,200.50', '12.34.5', '0', 'abc', '1.2345', '-5']) assert.equal(parsearPrima(mal), 'invalido', mal)
})

test('la cola de llamadas: solo a quien se puede llamar y le toca hoy', () => {
  const base = interpretarLeads(200, { estado: 'ok', leads: [lead] })
  assert.ok(base.estado === 'ok')
  const l = base.leads[0]
  const hoy = { ...l, paso: { accion: 'primer_contacto' as const, motivo: '', dentroDeDias: 0 } }
  assert.equal(colaLlamadas([hoy]).length, 1)
  // Le toca otro día, o no tiene teléfono, o no es por teléfono: fuera.
  assert.equal(colaLlamadas([{ ...hoy, paso: { ...hoy.paso, dentroDeDias: 3 } }]).length, 0)
  assert.equal(colaLlamadas([{ ...hoy, telefono: null }]).length, 0)
  assert.equal(colaLlamadas([{ ...hoy, paso: { accion: 'tarea' as const, motivo: '', dentroDeDias: 0 } }]).length, 0)
  // Canal sin comprobar (asegura antigua) no se llama a ciegas.
  assert.equal(colaLlamadas([{ ...hoy, canal: null }]).length, 0)
  // Con correo permitido, el primer contacto va por correo; la llamada sí entra.
  assert.equal(colaLlamadas([{ ...hoy, canal: 'telefono_y_correo' }]).length, 0)
  assert.equal(colaLlamadas([{ ...hoy, canal: 'telefono_y_correo', paso: { accion: 'llamada' as const, motivo: '', dentroDeDias: 0 } }]).length, 1)
})

test('el guion no inventa lo que no consta', () => {
  const r = interpretarLeads(200, { estado: 'ok', leads: [{ ...lead, ramo: null, aseguradora: null }] })
  assert.ok(r.estado === 'ok')
  const g = guionLlamada(r.leads[0]).join(' ')
  assert.ok(!g.includes('null'))
  assert.ok(!g.includes('hace unos años le llevamos'))
  assert.match(g, /sin confirmar/)
})

test('tareas de hoy: error no es «no hay», y una fila rota se cuenta', () => {
  assert.equal(interpretarTareasHoy(503, null).estado, 'sin_configurar')
  assert.equal(interpretarTareasHoy(500, { estado: 'error', causa: 'credenciales' }).estado, 'error')
  assert.equal(interpretarTareasHoy(200, { estado: 'ok' }).estado, 'error')
  const ok = { id: 't', tipo: 'llamada', prioridad: 'alta', fechaLimite: '2026-09-23', oportunidadId: 'o', clienteId: 'c', observaciones: 'x', cliente: null, ramo: 'auto' }
  const r = interpretarTareasHoy(200, { estado: 'ok', tareas: [ok, { ...ok, fechaLimite: null }], truncado: true })
  assert.ok(r.estado === 'ok')
  assert.equal(r.tareas.length, 1)
  assert.equal(r.descartadas, 1)
  assert.equal(r.truncado, true)
  assert.equal(r.tareas[0].cliente, null)
})

test('🪤 WhatsApp de seguimiento solo a quien fue cliente, y con el mes del aniversario', () => {
  const r = interpretarLeads(200, { estado: 'ok', leads: [lead, { ...lead, oportunidadId: 'o2', fueCliente: true, canal: 'telefono_y_correo' }], porVentana: {} })
  assert.ok(r.estado === 'ok')
  // Nunca fue cliente: WhatsApp es comunicación electrónica como el correo (LSSI 21.2).
  assert.equal(whatsappDeLead(r.leads[0]), null)
  const wa = whatsappDeLead(r.leads[1])
  assert.ok(wa)
  assert.equal(wa.telefono, '600')
  assert.match(wa.mensaje, /por noviembre\?/)
  // Sin teléfono, nada; y con fueCliente desconocido tampoco se abre la puerta.
  assert.equal(whatsappDeLead({ ...r.leads[1], telefono: null }), null)
  assert.equal(whatsappDeLead({ ...r.leads[1], fueCliente: null }), null)
})
