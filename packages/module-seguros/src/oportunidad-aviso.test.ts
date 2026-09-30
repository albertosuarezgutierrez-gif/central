import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_AVISO_OPORTUNIDAD, avisosOportunidadDeHoy, claveAvisoOportunidad, fechaAvisoOportunidad, fechaVencimientoDudosa, planTareaTrasVencimiento, vencimientoDelCiclo,
} from './oportunidad-aviso.ts'
import { DIAS_PRIMER_CONTACTO, siguientePasoLead } from './lead-competencia.ts'

const HOY = '2026-09-29'

test('la regla es 45 días', () => {
  assert.equal(DIAS_AVISO_OPORTUNIDAD, 45)
  assert.equal(DIAS_PRIMER_CONTACTO, DIAS_AVISO_OPORTUNIDAD, 'a un lead no se le escribe antes del aviso')
})

test('fecha del primer paso: 45 días antes, nunca antes de mañana', () => {
  assert.equal(fechaAvisoOportunidad('2026-12-31', HOY), '2026-11-16')
  assert.equal(fechaAvisoOportunidad('2026-10-20', HOY), '2026-09-30', 'ventana ya abierta → mañana')
  assert.equal(fechaAvisoOportunidad(null, HOY), '2026-09-30')
  assert.equal(fechaAvisoOportunidad('2026-02-30', HOY), '2026-09-30', 'fecha imposible = sin fecha')
})

test('vencimiento del ciclo: se corre de año en año, 29/02 → 28/02', () => {
  assert.equal(vencimientoDelCiclo('2026-11-01', HOY), '2026-11-01')
  assert.equal(vencimientoDelCiclo('2024-10-15', HOY), '2026-10-15')
  assert.equal(vencimientoDelCiclo('2024-02-29', HOY), '2027-02-28')
  assert.equal(vencimientoDelCiclo(HOY, HOY), HOY)
  assert.equal(vencimientoDelCiclo('basura', HOY), null)
})

test('qué se avisa hoy: abiertas, en ventana, no aparcadas, una vez por ciclo', () => {
  const base = { aparcadaHasta: null }
  const ops = [
    { ...base, id: 'a', estado: 'competencia', fechaFinVigencia: '2026-11-13' }, // 45 d → sí
    { ...base, id: 'b', estado: 'competencia', fechaFinVigencia: '2026-11-14' }, // 46 d → aún no
    { ...base, id: 'c', estado: 'ganada', fechaFinVigencia: '2026-10-10' },      // cerrada
    { ...base, id: 'd', estado: 'en_negociacion', fechaFinVigencia: null },      // sin fecha: no se inventa
    { id: 'e', estado: 'pendiente_cliente', fechaFinVigencia: '2026-10-10', aparcadaHasta: '2026-10-05' },
    { ...base, id: 'f', estado: 'competencia', fechaFinVigencia: '2025-10-01' }, // ciclo 2026-10-01 → 2 d
    { ...base, id: 'g', estado: 'competencia', fechaFinVigencia: '2026-10-20' }, // ya avisada este ciclo
  ]
  const r = avisosOportunidadDeHoy(ops, new Set([claveAvisoOportunidad('g', '2026-10-20')]), HOY)
  assert.deepEqual(r, [{ id: 'f', vence: '2026-10-01', dias: 2 }, { id: 'a', vence: '2026-11-13', dias: 45 }])
  // El ciclo siguiente vuelve a sonar aunque el anterior se avisara.
  const r2 = avisosOportunidadDeHoy([ops[6]], new Set([claveAvisoOportunidad('g', '2025-10-20')]), HOY)
  assert.equal(r2.length, 1)
})

test('un lead de competencia no recibe el primer contacto antes de los 45 días', () => {
  assert.equal(siguientePasoLead(46, 0, null).accion, 'esperar')
  assert.equal(siguientePasoLead(45, 0, null).accion, 'primer_contacto')
})

test('vencimiento corregido: sin tarea se crea a 45 días; con una, se mueve; si ya cuadra, nada', () => {
  // Vespa: el escaneo dijo 08/03/2018; Alberto corrige a 15/01/2027 → llamada el 01/12/2026.
  assert.deepEqual(planTareaTrasVencimiento('2027-01-15', null, HOY), { accion: 'crear', fecha: '2026-12-01' })
  assert.deepEqual(planTareaTrasVencimiento('2027-01-15', { id: 't1', fecha: '2027-02-27' }, HOY),
    { accion: 'mover', tareaId: 't1', desde: '2027-02-27', fecha: '2026-12-01' })
  assert.deepEqual(planTareaTrasVencimiento('2027-01-15', { id: 't1', fecha: '2026-12-01' }, HOY), { accion: 'nada', motivo: 'ya_esta' })
  // A menos de 45 días: mañana, nunca en pasado. Una fecha ya pasada se corre a su ciclo.
  assert.deepEqual(planTareaTrasVencimiento('2026-10-20', null, HOY), { accion: 'crear', fecha: '2026-09-30' })
  assert.deepEqual(planTareaTrasVencimiento('2018-03-08', null, HOY), { accion: 'crear', fecha: '2027-01-22' })
  // Sin fecha legible no se inventa ninguna.
  assert.deepEqual(planTareaTrasVencimiento(null, { id: 't1', fecha: '2026-12-01' }, HOY), { accion: 'nada', motivo: 'sin_vencimiento' })
  assert.deepEqual(planTareaTrasVencimiento('2027-02-30', null, HOY), { accion: 'nada', motivo: 'sin_vencimiento' })
})

test('fecha leída que no cuadra: pasada o a más de 13 meses; la del año que viene, no', () => {
  assert.equal(fechaVencimientoDudosa('2027-03-08', HOY), null)
  assert.equal(fechaVencimientoDudosa(HOY, HOY), null)
  assert.equal(fechaVencimientoDudosa('2027-10-29', HOY), null, '13 meses justos todavía vale')
  assert.equal(fechaVencimientoDudosa('2027-10-30', HOY)?.motivo, 'lejana')
  assert.equal(fechaVencimientoDudosa('2018-03-08', HOY)?.motivo, 'pasada')
  assert.match(fechaVencimientoDudosa('2018-03-08', HOY)!.texto, /08\/03\/2018/)
  // Sin fecha legible no es «dudosa»: es «sin fecha», y se dice en otro sitio.
  assert.equal(fechaVencimientoDudosa(null, HOY), null)
  assert.equal(fechaVencimientoDudosa('2027-02-30', HOY), null)
})
