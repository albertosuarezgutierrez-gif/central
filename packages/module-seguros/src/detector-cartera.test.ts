import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosAnulacion, detectarCambios, esFugaSinExplicar, fotoSospechosa, leerAnulacion, planRetencionPorMotivo, textoFechaAnulacion, textoMotivoAnulacion, textoUltimoRecibo, type Foto, type HuellaPoliza } from './detector-cartera.ts'

const pol = (id: string, o: Partial<HuellaPoliza> = {}): HuellaPoliza => ({
  id, clienteId: 'c-' + id, estado: 'en_vigor', vencimiento: '2027-01-10', sustituida: false, fusionada: false, ...o,
})
const foto = (polizas: HuellaPoliza[], extra: Partial<Foto> = {}): Foto => ({
  polizas: Object.fromEntries(polizas.map((p) => [p.id, p])), recibos: {}, siniestros: {}, ...extra,
})
const tipos = (f: Foto | null, g: Foto) => {
  const d = detectarCambios(f, g)
  return d.eventos.map((e) => e.tipo)
}

test('sin foto anterior solo ancla: no se inventa «todo es nuevo»', () => {
  const d = detectarCambios(null, foto([pol('a'), pol('b')]))
  assert.equal(d.primeraVez, true)
  assert.equal(d.eventos.length, 0)
  assert.equal(detectarCambios(foto([]), foto([pol('a')])).primeraVez, true)
})

test('alta, renovación y ninguna novedad', () => {
  const antes = foto([pol('a')])
  assert.deepEqual(tipos(antes, foto([pol('a'), pol('b')])), ['POLIZA_CREADA'])
  assert.deepEqual(tipos(antes, foto([pol('a', { vencimiento: '2028-01-10' })])), ['POLIZA_RENOVADA'])
  assert.deepEqual(tipos(antes, foto([pol('a')])), [])
})

test('vigente → anula al vencimiento es el preaviso de fuga; vigente → cancelada es baja', () => {
  const antes = foto([pol('a'), pol('b')])
  const d = detectarCambios(antes, foto([pol('a', { estado: 'anula_al_vencimiento' }), pol('b', { estado: 'cancelada' })]))
  assert.deepEqual(d.eventos.map((e) => e.tipo), ['POLIZA_ANULA_AL_VENCIMIENTO', 'POLIZA_BAJA'])
  assert.deepEqual(d.eventos[1].datos, { antes: 'en_vigor', despues: 'cancelada', vencimiento: '2027-01-10', sustituida: false })
  // una que ya estaba de baja y cambia de estado no-vigente a otro no-vigente no es una baja nueva
  assert.deepEqual(tipos(foto([pol('c', { estado: 'cancelada' })]), foto([pol('c', { estado: 'fin_riesgo' })])), [])
})

test('desaparecida solo si era vigente y no es una lápida de fusión', () => {
  assert.deepEqual(tipos(foto([pol('a'), pol('x')]), foto([pol('x')])), ['POLIZA_DESAPARECIDA'])
  assert.deepEqual(tipos(foto([pol('a', { fusionada: true }), pol('x')]), foto([pol('x')])), [])
  assert.deepEqual(tipos(foto([pol('a', { estado: 'cancelada' }), pol('x')]), foto([pol('x')])), [])
})

test('recibos: devuelto siempre avisa; cobrado solo si venía de otra situación', () => {
  const r = (situacion: string | null) => ({ r1: { id: 'r1', polizaId: 'a', clienteId: 'c', situacion } })
  const base = [pol('a')]
  assert.deepEqual(tipos(foto(base, { recibos: r('pendiente') }), foto(base, { recibos: r('devuelto') })), ['RECIBO_DEVUELTO'])
  assert.deepEqual(tipos(foto(base, { recibos: r('devuelto') }), foto(base, { recibos: r('cobrado') })), ['RECIBO_COBRADO'])
  assert.deepEqual(tipos(foto(base), foto(base, { recibos: r('cobrado') })), [], 'un recibo nuevo ya cobrado es lo normal')
  assert.deepEqual(tipos(foto(base), foto(base, { recibos: r('devuelto') })), ['RECIBO_DEVUELTO'])
})

test('siniestros: nuevo y cierre', () => {
  const s = (estado: string) => ({ s1: { id: 's1', clienteId: 'c', polizaId: 'a', estado } })
  const base = [pol('a')]
  assert.deepEqual(tipos(foto(base), foto(base, { siniestros: s('abierto') })), ['SINIESTRO_ABIERTO'])
  assert.deepEqual(tipos(foto(base, { siniestros: s('abierto') }), foto(base, { siniestros: s('rechazado') })), ['SINIESTRO_CERRADO'])
  assert.deepEqual(tipos(foto(base, { siniestros: s('cerrado') }), foto(base, { siniestros: s('rechazado') })), [])
})

test('la clave de idempotencia es estable para la misma transición y distinta entre transiciones', () => {
  const antes = foto([pol('a')])
  const k1 = detectarCambios(antes, foto([pol('a', { estado: 'cancelada' })])).eventos[0].clave
  const k2 = detectarCambios(antes, foto([pol('a', { estado: 'cancelada' })])).eventos[0].clave
  const k3 = detectarCambios(antes, foto([pol('a', { estado: 'fin_riesgo' })])).eventos[0].clave
  assert.equal(k1, k2)
  assert.notEqual(k1, k3)
})

test('una baja con sustitución registrada no es una pérdida sin explicar', () => {
  assert.equal(esFugaSinExplicar({ tipo: 'POLIZA_BAJA', datos: { sustituida: false } }), true)
  assert.equal(esFugaSinExplicar({ tipo: 'POLIZA_BAJA', datos: { sustituida: true } }), false)
  assert.equal(esFugaSinExplicar({ tipo: 'RECIBO_DEVUELTO', datos: {} }), false)
})

test('la misma baja otro año es otra pérdida (la clave lleva el vencimiento)', () => {
  const k2026 = detectarCambios(foto([pol('a')]), foto([pol('a', { estado: 'anula_al_vencimiento' })])).eventos[0].clave
  const k2027 = detectarCambios(foto([pol('a', { vencimiento: '2028-01-10' })]), foto([pol('a', { estado: 'anula_al_vencimiento', vencimiento: '2028-01-10' })])).eventos[0].clave
  assert.notEqual(k2026, k2027)
})

test('freno de cordura: desaparecer más del 20 % de golpe es una foto rota, no una fuga masiva', () => {
  const muchas = Array.from({ length: 50 }, (_, i) => pol(`p${i}`))
  assert.equal(fotoSospechosa(foto(muchas), foto(muchas.slice(0, 45))), false) // 10 %
  assert.equal(fotoSospechosa(foto(muchas), foto(muchas.slice(0, 30))), true) // 40 %
  assert.equal(fotoSospechosa(foto(muchas), foto([])), true)
  assert.equal(fotoSospechosa(null, foto([])), false)
  assert.equal(fotoSospechosa(foto(muchas.slice(0, 5)), foto([])), false, 'con pocas pólizas no se juzga')
})

test('la baja guarda el motivo CIMA en el evento; sin motivo no añade claves', () => {
  const antes = foto([pol('a'), pol('b')])
  const d = detectarCambios(antes, foto([
    pol('a', { estado: 'cancelada', anulacion: { fecha: '2026-08-25', motivo: 'IM', detalle: 'Impago' } }),
    pol('b', { estado: 'cancelada' }),
  ]))
  const a = d.eventos.find((e) => e.id === 'a')!
  const b = d.eventos.find((e) => e.id === 'b')!
  assert.equal(a.datos.motivoCima, 'IM')
  assert.equal(a.datos.fechaAnulacion, '2026-08-25')
  assert.equal('motivoCima' in b.datos, false)
})

test('motivo legible: conocido, desconocido con detalle, desconocido sin detalle y ausente', () => {
  assert.equal(textoMotivoAnulacion({ fecha: null, motivo: 'IM', detalle: null }), 'impago')
  assert.equal(textoMotivoAnulacion({ fecha: null, motivo: 'ex', detalle: null }), 'se va a otra compañía (mejor precio o venta)')
  assert.equal(textoMotivoAnulacion({ fecha: null, motivo: 'SI', detalle: null }), 'siniestralidad (la compañía no renueva)')
  assert.equal(textoMotivoAnulacion({ fecha: null, motivo: 'ZZ', detalle: 'Fallecimiento del tomador' }), 'Fallecimiento del tomador')
  assert.equal(textoMotivoAnulacion({ fecha: null, motivo: 'ZZ', detalle: null }), 'motivo CIMA «ZZ»')
  assert.equal(textoMotivoAnulacion(null), null)
  assert.equal(textoMotivoAnulacion({ fecha: '2026-01-01', motivo: null, detalle: null }), null)
})

test('leerAnulacion no se fía de la forma y datosAnulacion solo emite lo que hay', () => {
  assert.equal(leerAnulacion(null), null)
  assert.equal(leerAnulacion('x'), null)
  assert.deepEqual(leerAnulacion({ fecha: '25/08/2026', motivo: 7 }), { fecha: null, motivo: '7', detalle: null })
  assert.deepEqual(datosAnulacion(null), {})
})

test('fecha de anulación: solo si es más de 7 días anterior a hoy', () => {
  assert.equal(textoFechaAnulacion('2026-08-25', '2026-09-24'), 'anulada el 25/08/2026')
  assert.equal(textoFechaAnulacion('2026-09-20', '2026-09-24'), null)
  assert.equal(textoFechaAnulacion('2026-09-17', '2026-09-24'), null)
  assert.equal(textoFechaAnulacion('2026-09-16', '2026-09-24'), 'anulada el 16/09/2026')
  assert.equal(textoFechaAnulacion(null, '2026-09-24'), null)
  assert.equal(textoFechaAnulacion('basura', '2026-09-24'), null)
})

test('último recibo: solo si añade; devuelto con impago es redundante; sin dato = nada', () => {
  assert.equal(textoUltimoRecibo('devuelto', null), 'último recibo devuelto')
  assert.equal(textoUltimoRecibo('devuelto', 'impago'), null)
  assert.equal(textoUltimoRecibo('cobrado', 'impago'), 'último recibo cobrado')
  assert.equal(textoUltimoRecibo('anulado', null), 'último recibo anulado')
  assert.equal(textoUltimoRecibo(null, null), null)
})

test('retención según motivo: SI no abre, IM y EX abren con nota, sin motivo como siempre', () => {
  assert.equal(planRetencionPorMotivo('SI').abrir, false)
  assert.match(planRetencionPorMotivo('SI').nota ?? '', /no recuperable con esa compañía; ofrecer otra/)
  assert.equal(planRetencionPorMotivo('IM').abrir, true)
  assert.match(planRetencionPorMotivo('IM').nota ?? '', /recuperable si paga/)
  assert.equal(planRetencionPorMotivo('EX').abrir, true)
  assert.match(planRetencionPorMotivo('EX').nota ?? '', /mejorar precio/)
  assert.deepEqual(planRetencionPorMotivo(null), { abrir: true, nota: null })
  assert.deepEqual(planRetencionPorMotivo('ZZ'), { abrir: true, nota: null })
})
