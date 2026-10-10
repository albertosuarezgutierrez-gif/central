import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agruparRenovaciones, diferenciaPrima, duracion, leerRespuestaPanel, porcentaje, type Renovacion } from './tarificador-panel.ts'

const APP = join(import.meta.dirname, '..')

const PANEL = {
  generadoEn: '2026-10-07T09:00:00Z',
  interruptores: { rpa: false, renovaciones: false, topeDia: 3 },
  metricas: { d7: { dias: 7 }, d30: { dias: 30 }, fallos: [] },
  intervenciones: { disponible: false, motivo: 'tabla_sin_crear' },
  renovaciones: { porEstado: { cotizada: 0 }, lista: [] },
  alertasTarifa: [],
}

test('panel: 200 con forma buena → ok; sin secreto / red / forma rara → mensaje, nunca panel vacío', () => {
  assert.equal(leerRespuestaPanel(200, PANEL).ok, true)
  const sin = leerRespuestaPanel(503, { estado: 'sin_configurar' })
  assert.ok(!sin.ok && /ASEGURA_OPERADOR_SECRET/.test(sin.mensaje))
  assert.equal(leerRespuestaPanel(502, null).ok, false)
  const err = leerRespuestaPanel(503, { estado: 'error', causa: 'conexion' })
  assert.ok(!err.ok && err.mensaje.includes('conexion'))
  assert.equal(leerRespuestaPanel(200, { ...PANEL, alertasTarifa: null }).ok, false)
  assert.equal(leerRespuestaPanel(200, null).ok, false)
})

test('formatos: null → «—», nunca 0', () => {
  assert.equal(porcentaje(null), '—')
  assert.equal(porcentaje(66.7), '66,7 %')
  assert.equal(duracion(null), '—')
  assert.equal(duracion(45), '45 s')
  assert.equal(duracion(185), '3 min 5 s')
  assert.equal(duracion(120), '2 min')
})

test('diferencia de prima: solo con los dos datos', () => {
  assert.equal(diferenciaPrima(1000, 900.5), -99.5)
  assert.equal(diferenciaPrima(null, 900), null)
  assert.equal(diferenciaPrima(1000, null), null)
})

test('grupos: cotizadas · pendientes (en cola, por cotizar, fallidas) · faltan datos', () => {
  const r = (estado: Renovacion['estado']): Renovacion => ({
    polizaId: estado, clienteId: 'c', cliente: 'X', numeroPoliza: null, compania: 'allianz', vencimiento: '2026-12-01', dias: 55,
    primaActual: null, estado, trabajoId: null, primaAllianz: null, faltan: [],
  })
  const g = agruparRenovaciones([r('cotizada'), r('en_cola'), r('pendiente'), r('fallida'), r('faltan_datos')])
  assert.equal(g.cotizadas.length, 1)
  assert.equal(g.pendientes.length, 3)
  assert.equal(g.faltanDatos.length, 1)
})

test('cableado: la página lee del proxy y el menú de /correduria la enlaza', () => {
  const cliente = readFileSync(join(APP, 'app/(usuario)/correduria/tarificador/PanelTarificador.tsx'), 'utf8')
  assert.match(cliente, /\/api\/correduria\/tarificador\/panel/)
  assert.match(cliente, /eur\(/, 'el dinero va con eur()')
  const menu = readFileSync(join(APP, 'app/(usuario)/correduria/AccionesCabecera.tsx'), 'utf8')
  assert.match(menu, /href="\/correduria\/tarificador"/)
})
