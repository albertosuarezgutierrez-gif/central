import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claveAviso, emisionesDeHoy, mensajeRenovaciones, type PolizaAviso,
} from './renovaciones-aviso.ts'

const base: PolizaAviso = {
  id: 'p1', cliente: 'Cliente Uno', tipo: 'auto', aseguradora: 'Mapfre',
  numeroPoliza: '123', fechaVencimiento: '2026-11-01', dias: 61, prima: 395.09,
}
const con = (p: Partial<PolizaAviso>): PolizaAviso => ({ ...base, ...p })
const vacio = new Set<string>()

test('a más de 60 días todavía no se molesta a nadie', () => {
  assert.deepEqual(emisionesDeHoy([con({ dias: 61 })], vacio), [])
})

test('a 60 días entra en ventana', () => {
  const [e] = emisionesDeHoy([con({ dias: 60 })], vacio)
  assert.equal(e.hito, 'ventana')
})

test('a 33 días el aviso es que se cierra el plazo, no que entra en ventana', () => {
  const [e] = emisionesDeHoy([con({ dias: 33 })], vacio)
  assert.equal(e.hito, 'cierre_plazo')
})

test('una póliza que aparece ya a 5 días manda UN aviso, no tres', () => {
  const [e] = emisionesDeHoy([con({ dias: 5 })], vacio)
  assert.equal(e.hito, 'vence_7')
  // Los hitos laxos se dan por consumidos: ya no tienen sentido y tampoco
  // pueden quedar pendientes para disparar mañana.
  assert.deepEqual([...e.consumidos].sort(), ['cierre_plazo', 'vence_7', 'ventana'])
})

test('no se repite un hito ya avisado', () => {
  const p = con({ dias: 40 })
  const ya = new Set([claveAviso(p, 'ventana')])
  assert.deepEqual(emisionesDeHoy([p], ya), [])
})

test('el mismo cliente vuelve a entrar cuando cambia el vencimiento (renovada)', () => {
  const vieja = con({ dias: 40, fechaVencimiento: '2026-10-11' })
  const ya = new Set([claveAviso(vieja, 'ventana')])
  const renovada = con({ dias: 40, fechaVencimiento: '2027-10-11' })
  assert.equal(emisionesDeHoy([renovada], ya).length, 1)
})

test('avisado el hito laxo, el urgente sí se manda al llegar su momento', () => {
  // A 5 días ya aplica `vence_7`; a 20 no aplicaría ninguno nuevo y la póliza
  // callaría, que es justo lo que se quiere (no repetir lo ya dicho).
  const p = con({ dias: 5 })
  const ya = new Set([claveAviso(p, 'ventana'), claveAviso(p, 'cierre_plazo')])
  const [e] = emisionesDeHoy([p], ya)
  assert.equal(e.hito, 'vence_7')
  assert.deepEqual(e.consumidos, ['vence_7'])
})

test('sin emisiones no hay mensaje: el silencio de «hoy no toca» es correcto', () => {
  assert.equal(mensajeRenovaciones([]), null)
})

test('el mensaje agrupa por hito, va en euros españoles y dice qué prima no consta', () => {
  const msg = mensajeRenovaciones(emisionesDeHoy(
    [con({ id: 'a', dias: 3, prima: 2162.49 }), con({ id: 'b', dias: 55, prima: null })],
    vacio,
  ))!
  assert.match(msg, /🔴 Vence esta semana \(1\)/)
  assert.match(msg, /📅 Entra en ventana de renovación \(1\)/)
  assert.match(msg, /2\.162,49€/)
  assert.match(msg, /prima sin informar/)
  assert.ok(!msg.includes('0,00€'), 'una prima desconocida jamás se pinta como 0€')
})

test('dentro de un hito, primero lo que antes vence', () => {
  const msg = mensajeRenovaciones(emisionesDeHoy(
    [con({ id: 'a', cliente: 'Tarde', dias: 6 }), con({ id: 'b', cliente: 'Pronto', dias: 1 })],
    vacio,
  ))!
  assert.ok(msg.indexOf('Pronto') < msg.indexOf('Tarde'))
})
