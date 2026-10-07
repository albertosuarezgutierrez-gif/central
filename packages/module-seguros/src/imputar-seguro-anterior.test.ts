import test from 'node:test'
import assert from 'node:assert/strict'
import {
  candidataPublica,
  codigoDgsPorNombre,
  decidirBloqueoBonus,
  elegirSeguroAnteriorParaImputar,
  historialParaImputar,
  maximoAniosSinSiniestros,
  verificacionBonusDe,
  type CandidataSeguroAnterior,
} from './imputar-seguro-anterior.ts'
import { seguroAnteriorDe } from './oportunidad-seguimiento.ts'

const HOY = '2026-10-03'
const seguro = (x: Partial<CandidataSeguroAnterior['seguro']> = {}) => ({
  codigoDgs: 'C0058', fechaEfecto: null, aniosSinSiniestros: null, siniestrosUltimos5: null, numeroPoliza: '1111111111', ...x,
})
const cand = (x: Partial<CandidataSeguroAnterior> & { id: string }): CandidataSeguroAnterior => ({
  origen: 'cartera', clienteId: 'c1', tipoVehiculo: 'turismo', compania: 'MAPFRE', seguro: seguro(), ...x,
})

// Datos sintéticos con la forma del caso real (clienta con coche financiado y moto, ambos en la misma compañía).
const coche = cand({ id: 'poliza:coche', seguro: seguro({ fechaEfecto: '2023-10-10', numeroPoliza: '5000000001', matricula: '0000AAA', canal: 'FINANCIERA X', cesionDerechos: true }) })
const moto = cand({ id: 'poliza:moto', tipoVehiculo: 'moto', seguro: seguro({ fechaEfecto: '2026-01-08', numeroPoliza: '4000000002' }) })

test('coche antes que moto: aunque la moto se pida para una moto, la regla es turismo primero', () => {
  for (const tipoNuevo of ['auto', 'moto'] as const) {
    const r = elegirSeguroAnteriorParaImputar([moto, coche], tipoNuevo, { clienteId: 'c1' })
    assert.equal(r.estado, 'ok')
    if (r.estado !== 'ok') return
    assert.equal(r.elegida?.id, 'poliza:coche')
    assert.deepEqual(r.alternativas.map(a => a.id), ['poliza:moto'], 'las demás quedan para que el corredor elija')
    assert.match(r.porque, /turismo antes que moto/)
  }
  const r = elegirSeguroAnteriorParaImputar([moto, coche], 'moto', { clienteId: 'c1' })
  assert.ok(r.estado === 'ok' && r.avisos.some(a => /TURISMO para una moto/.test(a)), 'avisa de que el historial de coche para moto no está documentado')
  assert.ok(r.estado === 'ok' && r.avisos.some(a => /cesión de derechos/.test(a)), 'avisa de la cesión a la financiera')
})

test('entre turismos: sin siniestros conocidos antes; luego el efecto más antiguo', () => {
  const viejoConSiniestro = cand({ id: 'poliza:a', siniestrosAnotados: 1, seguro: seguro({ fechaEfecto: '2015-01-01', numeroPoliza: '7777' }) })
  const medio = cand({ id: 'poliza:b', siniestrosAnotados: 0, seguro: seguro({ fechaEfecto: '2019-01-01', numeroPoliza: '6666' }) })
  const nuevo = cand({ id: 'oportunidad:c', origen: 'competencia', seguro: seguro({ fechaEfecto: '2024-01-01', numeroPoliza: '9999' }) })
  const sinFecha = cand({ id: 'poliza:d', seguro: seguro({ numeroPoliza: '8888' }) })
  const r = elegirSeguroAnteriorParaImputar([nuevo, sinFecha, viejoConSiniestro, medio], 'auto', { clienteId: 'c1' })
  assert.ok(r.estado === 'ok')
  assert.equal(r.elegida?.id, 'poliza:b')
  assert.deepEqual(r.alternativas.map(a => a.id), ['oportunidad:c', 'poliza:d', 'poliza:a'])
})

test('varios clientes no se mezclan: la de otra ficha (o sin ficha) no se imputa aunque sea mejor', () => {
  const ajena = cand({ id: 'poliza:ajena', clienteId: 'c2', seguro: seguro({ fechaEfecto: '2001-01-01' }) })
  const sinFicha = cand({ id: 'oportunidad:x', clienteId: null, seguro: seguro({ fechaEfecto: '2000-01-01' }) })
  const r = elegirSeguroAnteriorParaImputar([ajena, sinFicha, moto], 'auto', { clienteId: 'c1' })
  assert.ok(r.estado === 'ok')
  assert.equal(r.elegida?.id, 'poliza:moto')
  assert.deepEqual(r.descartadas.map(d => d.id).sort(), ['oportunidad:x', 'poliza:ajena'])
  // Y el corredor tampoco puede colar la de otra ficha.
  const o = elegirSeguroAnteriorParaImputar([ajena, moto], 'auto', { clienteId: 'c1', elegidaId: 'poliza:ajena' })
  assert.equal(o.estado, 'error')
})

test('override del corredor: manda sobre la regla si es suya y declarable', () => {
  const r = elegirSeguroAnteriorParaImputar([coche, moto], 'auto', { clienteId: 'c1', elegidaId: 'poliza:moto' })
  assert.ok(r.estado === 'ok' && r.elegidaPorCorredor && r.elegida?.id === 'poliza:moto')
  const sinNumero = cand({ id: 'poliza:sinnum', seguro: seguro({ numeroPoliza: null }) })
  const e = elegirSeguroAnteriorParaImputar([sinNumero], 'auto', { clienteId: 'c1', elegidaId: 'poliza:sinnum' })
  assert.ok(e.estado === 'error' && e.causa === 'elegida_no_declarable')
})

test('sin código DGS o sin nº no se elige solo: se dice y se pasa a la siguiente', () => {
  const sinDgs = cand({ id: 'oportunidad:sindgs', origen: 'competencia', seguro: seguro({ codigoDgs: null, fechaEfecto: '2010-01-01' }) })
  const r = elegirSeguroAnteriorParaImputar([sinDgs, coche], 'auto', { clienteId: 'c1' })
  assert.ok(r.estado === 'ok' && r.elegida?.id === 'poliza:coche')
  assert.ok(r.estado === 'ok' && r.avisos.some(a => /falta el código DGS/.test(a)))
  const ninguna = elegirSeguroAnteriorParaImputar([sinDgs], 'auto', { clienteId: 'c1' })
  assert.ok(ninguna.estado === 'ok' && ninguna.elegida === null && ninguna.alternativas.length === 1)
  const vacio = elegirSeguroAnteriorParaImputar([], 'auto', { clienteId: 'c1' })
  assert.ok(vacio.estado === 'ok' && vacio.elegida === null && /no conocemos ninguna/.test(vacio.porque))
})

test('la misma póliza en cartera y leída de su PDF se funde: el bonus del PDF rellena el hueco', () => {
  const pdf = cand({ id: 'oportunidad:pdf', origen: 'competencia', seguro: seguro({ numeroPoliza: '05000000001', aniosSinSiniestros: 7, codigoDgs: null }) })
  const cartera = cand({ id: 'poliza:cart', seguro: seguro({ numeroPoliza: '5000000001', fechaEfecto: '2020-01-01' }) })
  const r = elegirSeguroAnteriorParaImputar([pdf, cartera], 'auto', { clienteId: 'c1' })
  assert.ok(r.estado === 'ok')
  assert.equal(r.elegida?.id, 'poliza:cart')
  assert.equal(r.elegida?.seguro.aniosSinSiniestros, 7)
  assert.equal(r.elegida?.seguro.codigoDgs, 'C0058', 'lo de cartera no se pisa')
  assert.equal(r.alternativas.length, 0)
})

test('años sin siniestros desconocidos → el MÁXIMO, marcado bonusSupuesto (nunca 0 ni hueco)', () => {
  const r = elegirSeguroAnteriorParaImputar([coche], 'auto', { clienteId: 'c1' })
  assert.ok(r.estado === 'ok' && r.elegida)
  const h = historialParaImputar(r.elegida!, { fechaCarnet: '2001-05-01', hoy: HOY })
  assert.equal(h.bonusSupuesto, true)
  assert.equal(h.datos.aniosSinSiniestros, 10)
  assert.equal(h.datos.aniosAsegurado, 10)
  assert.equal(h.datos.aniosEnCompania, 2, 'efecto 10/10/2023 → 2 años completos en esa compañía (dato)')
  assert.equal(h.supuestos.some(s => s.campo === 'aniosEnCompania'), false, 'los años en la compañía salen del efecto real, no se suponen')
  assert.ok(h.supuestos.some(s => s.campo === 'aniosAsegurado' && /CONDICIONADO/.test(s.porque)), 'los 10 asegurado son supuestos')
  assert.equal(h.datos.polizaAnterior, '5000000001')
  assert.equal(h.datos.matriculaAnterior, '0000AAA', 'la matrícula de ESA póliza, no la del vehículo nuevo')
  assert.ok(h.supuestos.some(s => s.campo === 'aniosSinSiniestros' && s.optimista && /CONDICIONADO/.test(s.porque)))
  // Carné reciente: no más años limpios que de carné.
  const corto = historialParaImputar(r.elegida!, { fechaCarnet: '2023-06-01', hoy: HOY })
  assert.equal(corto.datos.aniosSinSiniestros, 3)
  assert.equal(corto.bonusSupuesto, true)
})

test('años SABIDOS mandan; si el máximo pone años asegurado por encima de lo sabido, también es bonus supuesto', () => {
  // 10 años limpios leídos y carné de 2001: todo lo declarado es dato → no supuesto.
  const diez = cand({ id: 'poliza:d', seguro: seguro({ aniosSinSiniestros: 10, siniestrosUltimos5: 0 }) })
  const h0 = historialParaImputar({ ...diez, faltan: [], conSiniestrosConocidos: false }, { fechaCarnet: '2001-01-01', hoy: HOY })
  assert.equal(h0.bonusSupuesto, false)
  assert.equal(h0.supuestos.some(s => s.campo === 'aniosAsegurado'), false)
  // 3 limpios leídos: los 10 asegurado son supuestos → condicionado.
  const leido = cand({ id: 'poliza:l', seguro: seguro({ aniosSinSiniestros: 3, siniestrosUltimos5: 1 }) })
  const h = historialParaImputar({ ...leido, faltan: [], conSiniestrosConocidos: true }, { fechaCarnet: null, hoy: HOY })
  assert.equal(h.datos.aniosSinSiniestros, 3)
  assert.equal(h.datos.siniestrosUltimos5, 1)
  assert.equal(h.datos.aniosAsegurado, 10)
  assert.equal(h.bonusSupuesto, true, 'totalYearsInsured al máximo también es supuesto')
  const conSiniestro = cand({ id: 'poliza:s', siniestrosAnotados: 2 })
  const h2 = historialParaImputar({ ...conSiniestro, faltan: [], conSiniestrosConocidos: true }, { fechaCarnet: null, hoy: HOY })
  assert.equal(h2.datos.aniosSinSiniestros, 0, 'con siniestros conocidos no se supone a su favor')
  assert.equal(h2.datos.siniestrosUltimos5, 2)
})

test('años limpios SABIDOS < 5 y < asegurado: hubo un siniestro en 5 años → nunca se declaran 0 y se condiciona', () => {
  // Carné de hace 4 años (máximo = 4), póliza con efecto hace 4 años y el PDF dice 2 años limpios
  // pero no cuántos siniestros: 4 asegurado y 2 limpios implican al menos UNO en los últimos 5.
  const joven = cand({ id: 'poliza:j', seguro: seguro({ fechaEfecto: '2022-09-01', aniosSinSiniestros: 2 }) })
  const h = historialParaImputar({ ...joven, faltan: [], conSiniestrosConocidos: false }, { fechaCarnet: '2022-06-01', hoy: HOY })
  assert.equal(h.datos.aniosAsegurado, 4)
  assert.equal(h.datos.aniosSinSiniestros, 2)
  assert.ok(h.datos.siniestrosUltimos5 >= 1, 'declarar 0 contradice los años leídos')
  assert.equal(h.bonusSupuesto, true, 'el nº de siniestros no consta: no se emite sin verificar')
  // Sin contradicción (tantos limpios como asegurado) se mantiene el 0 de siempre.
  const limpio = cand({ id: 'poliza:k', seguro: seguro({ fechaEfecto: '2022-09-01', aniosSinSiniestros: 4 }) })
  const h2 = historialParaImputar({ ...limpio, faltan: [], conSiniestrosConocidos: false }, { fechaCarnet: '2022-06-01', hoy: HOY })
  assert.equal(h2.datos.siniestrosUltimos5, 0)
  assert.equal(h2.bonusSupuesto, false)
})

test('el máximo: menor entre años de carné y 10; sin carné, 10 y se dice', () => {
  assert.equal(maximoAniosSinSiniestros('2020-10-04', HOY).valor, 5)
  assert.equal(maximoAniosSinSiniestros('1990-01-01', HOY).valor, 10)
  assert.match(maximoAniosSinSiniestros(null, HOY).porque, /no consta la fecha del carné/)
})

test('emisión: bonus supuesto o desconocido sin verificar BLOQUEA; dato o verificado, no', () => {
  const base = { ramo: 'auto', previamenteAsegurado: true as boolean | null, verificacion: null }
  assert.equal(decidirBloqueoBonus({ ...base, bonusSupuesto: true }).bloquea, true)
  assert.equal(decidirBloqueoBonus({ ...base, bonusSupuesto: null }).bloquea, true, 'NULL = no se sabe, no «no se supuso»')
  assert.equal(decidirBloqueoBonus({ ...base, previamenteAsegurado: null, bonusSupuesto: false }).bloquea, true)
  assert.equal(decidirBloqueoBonus({ ...base, bonusSupuesto: false }).bloquea, false)
  assert.equal(decidirBloqueoBonus({ ...base, previamenteAsegurado: false, bonusSupuesto: null }).bloquea, false, 'de calle no declara bonus')
  assert.equal(decidirBloqueoBonus({ ...base, ramo: 'hogar', bonusSupuesto: true }).bloquea, false)
  assert.equal(decidirBloqueoBonus({ ...base, bonusSupuesto: true, verificacion: { fuente: 'certificado', nota: null } }).bloquea, false)
  assert.equal(verificacionBonusDe({ fuente: 'me lo creo' }), null)
  assert.equal(verificacionBonusDe(true), null)
  assert.deepEqual(verificacionBonusDe({ fuente: 'sinco', nota: ' ok ' }), { fuente: 'sinco', nota: 'ok' })
})

test('lo publicado de una candidata no lleva la ficha', () => {
  const r = elegirSeguroAnteriorParaImputar([coche], 'auto', { clienteId: 'c1' })
  const p = candidataPublica(r.estado === 'ok' ? r.elegida! : (null as never))
  assert.equal('clienteId' in p, false)
  assert.equal(p.canal, 'FINANCIERA X')
  assert.equal(p.cesionDerechos, true)
})

test('SeguroAnterior: los campos nuevos son opcionales y null = no se sabe', () => {
  assert.deepEqual(seguroAnteriorDe({ codigoDgs: 'c0058', numeroPoliza: ' 123456 ', matricula: '0000-aaa', canal: 'RCI', cesionDerechos: true, modalidad: 'Todo riesgo' }), {
    codigoDgs: 'C0058', fechaEfecto: null, aniosSinSiniestros: null, siniestrosUltimos5: null,
    numeroPoliza: '123456', matricula: '0000AAA', canal: 'RCI', cesionDerechos: true, modalidad: 'Todo riesgo',
  })
  assert.deepEqual(seguroAnteriorDe({ aniosSinSiniestros: 4 }), { codigoDgs: null, fechaEfecto: null, aniosSinSiniestros: 4, siniestrosUltimos5: null })
  assert.equal(seguroAnteriorDe({ cesionDerechos: 'si' }), null, 'basura no es dato')
})

test('código DGS por nombre: solo si encaja con UNA', () => {
  const cat = [{ codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'MAPFRE ESPAÑA' }, { codigoDgs: 'C0109', nombreComun: 'Allianz' }]
  assert.equal(codigoDgsPorNombre(cat, 'MAPFRE ESPAÑA'), 'C0058')
  assert.equal(codigoDgsPorNombre(cat, 'Generali'), null)
  assert.equal(codigoDgsPorNombre([...cat, { codigoDgs: 'M0083', nombreComun: 'Mapfre' }], 'Mapfre'), null)
})

test('cónyuge: se ofrece, pero la regla automática NUNCA la elige; solo si la elige el corredor', () => {
  const suya = cand({ id: 'poliza:suya', clienteId: 'c2', delConyuge: 'Ana Ruiz', seguro: seguro({ fechaEfecto: '2005-01-01', numeroPoliza: '7000000003' }) })
  const ajena = cand({ id: 'poliza:ajena', clienteId: 'c3', seguro: seguro({ fechaEfecto: '2001-01-01' }) })
  const auto = elegirSeguroAnteriorParaImputar([suya, ajena, coche], 'auto', { clienteId: 'c1' })
  assert.ok(auto.estado === 'ok')
  if (auto.estado !== 'ok') return
  assert.equal(auto.elegida?.id, 'poliza:coche', 'aunque la del cónyuge sea más antigua')
  assert.deepEqual(auto.alternativas.map(a => a.id), ['poliza:suya'], 'la ajena sin vínculo no entra')
  assert.deepEqual(auto.descartadas.map(d => d.id), ['poliza:ajena'])
  assert.equal(candidataPublica(auto.alternativas[0]).delConyuge, 'Ana Ruiz')

  const sola = elegirSeguroAnteriorParaImputar([suya], 'auto', { clienteId: 'c1' })
  assert.ok(sola.estado === 'ok' && sola.elegida === null && sola.alternativas.length === 1, 'sin propias: no se imputa la del cónyuge sola')

  const a_mano = elegirSeguroAnteriorParaImputar([suya, coche], 'auto', { clienteId: 'c1', elegidaId: 'poliza:suya' })
  assert.ok(a_mano.estado === 'ok' && a_mano.elegida?.id === 'poliza:suya' && a_mano.avisos.some(a => /cónyuge/.test(a)))
})
