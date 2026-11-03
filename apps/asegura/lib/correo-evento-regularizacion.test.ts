import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_MARGEN_MINIMO_REGULARIZACION, DIAS_PLAZO_REGULARIZACION, MARCA_SEGUNDO_AVISO, campoFechaDedupe, claveTareaDe, planItem, tareaValida,
  validarEntradaEvento, venceRegularizacion, type ContextoItem, type ItemEvento,
} from './correo-evento.ts'

// Regularización de RC de Occident (03/11/2026). `hoy` siempre inyectado.
const HOY = '2026-11-03'
const suma = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

const poliza = { id: 'p1', clienteId: 'c1', numeroPoliza: 'BIDS000001', codigoDgs: 'C0468', aseguradora: 'Occident', importRef: null, eiacXmlHash: 'h', estado: 'activa', sustituidaAt: null }
function ctx(c: Partial<ContextoItem> = {}): ContextoItem {
  return { resolucion: { estado: 'en_vigor', poliza }, siniestro: null, expediente: null, tareaAbierta: false, fechaCorreo: '2026-11-02', hoy: HOY, ...c }
}
function reg(o: Partial<Extract<ItemEvento, { tipo: 'suplemento' }>> = {}): ItemEvento {
  return {
    tipo: 'suplemento', clave: 'BIDS000001', numeroPoliza: 'BIDS000001', descripcion: 'Regularización de RC',
    periodoDesde: '2025-06', periodoHasta: '2026-06', subtipo: 'regularizacion_rc', periodo: '2025-06_2026-06',
    fechaEnvioCompania: null, esRecordatorio: false, ...o,
  }
}

test('clave por póliza + periodo; otro periodo = otra tarea; sin periodo cae a la clave de siempre', () => {
  assert.equal(claveTareaDe(reg(), 'p1'), 'suplemento:regularizacion:p1:2025-06_2026-06')
  assert.notEqual(claveTareaDe(reg(), 'p1'), claveTareaDe(reg({ periodo: '2026-06_2027-06' }), 'p1'))
  assert.equal(claveTareaDe(reg({ periodo: null }), 'p1'), 'suplemento:p1')
  // Un suplemento que no es de regularización no cambia.
  const otro: ItemEvento = { tipo: 'suplemento', clave: 'X', numeroPoliza: 'BIDS000001', descripcion: null, periodoDesde: null, periodoHasta: null }
  assert.equal(claveTareaDe(otro, 'p1'), 'suplemento:p1')
})

test('vencimiento: envío + plazo; nunca antes de hoy + margen; sin envío, hoy + 7', () => {
  assert.equal(venceRegularizacion(suma(HOY, 3), HOY), suma(suma(HOY, 3), DIAS_PLAZO_REGULARIZACION))
  assert.equal(venceRegularizacion(suma(HOY, -14), HOY), suma(HOY, DIAS_MARGEN_MINIMO_REGULARIZACION)) // envío+15 = hoy+1 → sube a hoy+2
  assert.equal(venceRegularizacion(suma(HOY, -60), HOY), suma(HOY, DIAS_MARGEN_MINIMO_REGULARIZACION))
  assert.equal(venceRegularizacion(null, HOY), suma(HOY, 7))
})

test('planItem: 1er aviso crea tarea media con el vencimiento por fecha de envío y clave por periodo', () => {
  const envio = suma(HOY, -1)
  const p = planItem(reg({ fechaEnvioCompania: envio }), 'occident', ctx())
  assert.equal(p.tarea?.fechaLimite, suma(envio, DIAS_PLAZO_REGULARIZACION))
  assert.equal(p.tarea?.prioridad, 'media')
  assert.equal(p.claveTarea, 'suplemento:regularizacion:p1:2025-06_2026-06')
  assert.equal(p.reforzarTarea, null)
  assert.doesNotMatch(p.nota ?? '', /2º aviso/)
  assert.deepEqual(tareaValida(p.tarea!, new Date(`${HOY}T12:00:00Z`)), { ok: true })
})

test('planItem: sin fecha de envío, hoy + 7 (como antes)', () => {
  assert.equal(planItem(reg(), 'occident', ctx()).tarea?.fechaLimite, suma(HOY, 7))
})

test('planItem: recordatorio SIN tarea abierta crea la tarea ya en alta y marcada 2º aviso', () => {
  const p = planItem(reg({ esRecordatorio: true }), 'occident', ctx())
  assert.equal(p.tarea?.prioridad, 'alta')
  assert.ok(p.nota?.startsWith(MARCA_SEGUNDO_AVISO))
  assert.match(p.tarea?.observaciones ?? '', /2º aviso/)
})

test('planItem: recordatorio CON tarea abierta → nota marcada + refuerzo (alta y nuevo vencimiento), sin tarea nueva', () => {
  const envio = suma(HOY, -1)
  const p = planItem(reg({ esRecordatorio: true, fechaEnvioCompania: envio }), 'occident', ctx({ tareaAbierta: true }))
  assert.equal(p.tarea, null)
  assert.ok(p.nota?.startsWith(MARCA_SEGUNDO_AVISO))
  assert.deepEqual(p.reforzarTarea, { prioridad: 'alta', fechaLimite: suma(envio, DIAS_PLAZO_REGULARIZACION) })
})

test('planItem: 1er aviso repetido con tarea abierta sigue siendo solo nota (sin refuerzo)', () => {
  const p = planItem(reg(), 'occident', ctx({ tareaAbierta: true }))
  assert.equal(p.tarea, null)
  assert.equal(p.reforzarTarea, null)
  assert.ok(p.nota)
})

test('dedupe: el 2º aviso no se compara contra el 1º (fecha de envío, o «ya hay un 2º aviso»)', () => {
  assert.equal(campoFechaDedupe('suplemento', reg()), 'periodoHasta')
  assert.equal(campoFechaDedupe('suplemento', reg({ esRecordatorio: true })), 'esRecordatorio')
  assert.equal(campoFechaDedupe('suplemento', reg({ esRecordatorio: true, fechaEnvioCompania: '2026-10-02' })), 'fechaEnvioCompania')
  assert.equal(campoFechaDedupe('suplemento'), 'periodoHasta')
})

test('validarEntradaEvento: conserva los campos de regularización y descarta lo mal formado', () => {
  const evento = {
    tipo: 'suplemento', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0, numeroPoliza: 'BIDS000001', descripcion: 'x',
    periodoDesde: '2025-06', periodoHasta: '2026-06', subtipo: 'regularizacion_rc', periodo: '2025-06_2026-06',
    fechaEnvioCompania: '2026-10-02', esRecordatorio: true,
  }
  const ok = validarEntradaEvento({ mensajeId: '<a@b>', evento })
  assert.ok(ok.ok)
  const it = ok.ok ? ok.entrada.items[0] : null
  assert.ok(it && it.tipo === 'suplemento')
  assert.equal(it.subtipo, 'regularizacion_rc')
  assert.equal(it.periodo, '2025-06_2026-06')
  assert.equal(it.fechaEnvioCompania, '2026-10-02')
  assert.equal(it.esRecordatorio, true)
  const mal = validarEntradaEvento({ mensajeId: '<a@b>', evento: { ...evento, periodo: 'basura', fechaEnvioCompania: '02.10.2026', esRecordatorio: 'true' } })
  const im = mal.ok ? mal.entrada.items[0] : null
  assert.ok(im && im.tipo === 'suplemento')
  assert.equal(im.periodo, null)
  assert.equal(im.fechaEnvioCompania, null)
  assert.equal(im.esRecordatorio, false)
  // Sin subtipo, un suplemento genérico no gana campos.
  const gen = validarEntradaEvento({ mensajeId: '<a@b>', evento: { ...evento, subtipo: undefined } })
  const ig = gen.ok ? gen.entrada.items[0] : null
  assert.ok(ig && ig.tipo === 'suplemento')
  assert.equal(ig.subtipo, undefined)
  assert.equal('esRecordatorio' in ig, false)
})
