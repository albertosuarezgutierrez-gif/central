import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Aviso, VehiculoFlota } from '@central/module-seguros-portal'

import {
  avisosConFecha,
  fechasDeFlota,
  fechasDePatrimonio,
  fechasDeRecordatorios,
  recibosPendientes,
  vencimientosDeSeguros,
  type PolizaCalendario,
  type TitularParaCalendario,
} from './calendario-portal.ts'
import type { SociedadFlotaInicio } from './flota-inicio.ts'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const pol = (id: string, extra: Partial<PolizaCalendario> = {}): PolizaCalendario => ({
  id,
  compania: 'Mapfre',
  vigencia: 'vigente',
  renovacionSinConfirmar: false,
  sustituidaPor: null,
  fechaVencimiento: d('2027-03-01'),
  recibos: null,
  ...extra,
})
const titular = (polizas: PolizaCalendario[], extra: Partial<TitularParaCalendario> = {}): TitularParaCalendario => ({
  nombre: 'Ana',
  ajeno: false,
  polizas,
  ...extra,
})
const titulo = (p: PolizaCalendario) => `póliza ${p.id}`

test('seguros: una póliza vigente da su vencimiento con la fecha en ISO', () => {
  const [f] = vencimientosDeSeguros([titular([pol('a')])], titulo)
  assert.equal(f!.fecha, '2027-03-01')
  assert.equal(f!.href, '/boveda/poliza/a')
  assert.match(f!.titulo, /Mapfre · póliza a/)
})

test('seguros: lo que la compañía da por terminado y lo sustituido no entran', () => {
  const r = vencimientosDeSeguros(
    [titular([pol('baja', { vigencia: 'no_vigente' }), pol('sust', { sustituidaPor: { compania: 'X', desde: null } }), pol('ok')])],
    titulo,
  )
  assert.deepEqual(r.map((x) => x.clave), ['seguro:ok'])
})

test('seguros: renovación sin confirmar va SIN fecha y no se dice vencida', () => {
  const [f] = vencimientosDeSeguros([titular([pol('r', { vigencia: 'no_vigente', renovacionSinConfirmar: true, fechaVencimiento: d('2026-08-01') })])], titulo)
  assert.equal(f!.fecha, null)
  assert.match(f!.detalle!, /aún no ha confirmado la renovación \(vencía el 01\/08\/2026\)/)
})

test('seguros: sin fecha de vencimiento se dice, no se inventa', () => {
  const [f] = vencimientosDeSeguros([titular([pol('s', { fechaVencimiento: null })])], titulo)
  assert.equal(f!.fecha, null)
  assert.match(f!.detalle!, /No tenemos la fecha de vencimiento/)
})

test('seguros: de un titular ajeno se dice de quién es', () => {
  const [f] = vencimientosDeSeguros([titular([pol('a')], { ajeno: true, nombre: 'José' })], titulo)
  assert.match(f!.detalle!, /De José/)
})

const recibo = (situacion: string, venc: string | null, importe: number | null = 73.39) => ({
  situacion,
  importe,
  fechaEmision: null,
  fechaVencimiento: venc ? d(venc) : null,
})

test('recibos: solo al cobro y devueltos; cobrado y anulado no', () => {
  const p = pol('a', {
    recibos: {
      historial: [recibo('cobrado', '2026-01-01'), recibo('anulado', '2026-02-01'), recibo('pendiente', '2026-11-15'), recibo('devuelto', '2026-09-01'), recibo('emitido', null)],
    },
  })
  const r = recibosPendientes([titular([p])], titulo)
  assert.equal(r.length, 3)
  assert.deepEqual(r.map((x) => x.urgente ?? false), [false, true, false])
  assert.equal(r[0]!.fecha, '2026-11-15')
  assert.equal(r[2]!.fecha, null, 'sin fecha de vencimiento: no se inventa')
  assert.match(r[0]!.detalle!, /73,39€/)
  assert.match(r[1]!.titulo, /Recibo devuelto/)
})

test('recibos: un bloque no visible (null) se omite; no se convierte en «sin recibos»', () => {
  assert.deepEqual(recibosPendientes([titular([pol('a', { recibos: null })])], titulo), [])
})

test('recibos: importe que no se sabe no se pinta como 0', () => {
  const p = pol('a', { recibos: { historial: [recibo('pendiente', '2026-11-15', null)] } })
  const [f] = recibosPendientes([titular([p])], titulo)
  assert.equal(f!.detalle, null)
})

const venc = (estado: string, extra: object = {}) => ({
  clave: `k-${estado}`,
  etiqueta: 'IBI',
  inmueble: 'Piso',
  vence: '2026-12-01',
  estado,
  falta: 'Falta la fecha de la última vez.',
  contratoId: null,
  inmuebleId: 'i1',
  ...extra,
})

test('patrimonio: lo cumplido no entra; sin dato dice qué falta; vencida es urgente', () => {
  const r = fechasDePatrimonio([venc('cumplida'), venc('sin_dato', { vence: null }), venc('vencida'), venc('al_dia', { contratoId: 'c1' })])
  assert.equal(r.length, 3)
  const sinDato = r.find((x) => x.clave === 'patrimonio:k-sin_dato')!
  assert.equal(sinDato.fecha, null)
  assert.match(sinDato.detalle!, /Falta la fecha/)
  assert.equal(r.find((x) => x.clave === 'patrimonio:k-vencida')!.urgente, true)
  assert.equal(r.find((x) => x.clave === 'patrimonio:k-al_dia')!.href, '/patrimonio/contrato/c1')
  assert.equal(r.find((x) => x.clave === 'patrimonio:k-vencida')!.href, '/patrimonio/inmueble/i1')
})

test('recordatorios: la fecha es el día del evento y el enlace va al editor', () => {
  const [f] = fechasDeRecordatorios([{ id: 'r1', titulo: 'ITV del Ibiza', fechaEvento: d('2027-02-10'), repiteCadaMeses: 12 }])
  assert.equal(f!.fecha, '2027-02-10')
  assert.equal(f!.href, '#tus-recordatorios')
  assert.match(f!.detalle!, /se repite/)
})

const aviso = (tipo: Aviso['tipo'], id: string): Aviso => ({ tipo, id, titulo: tipo, detalle: 'd', href: '/x', descartable: false, clave: `${tipo}:${id}` })

test('avisos: solo los que son una fecha', () => {
  const r = avisosConFecha([
    aviso('itv_en_ventana', '1'),
    aviso('autorizacion_pendiente', '2'),
    aviso('felicitacion', '3'),
    aviso('carnet_caducado', '4'),
    aviso('patrimonio_en_ventana', '5'),
    aviso('obligacion_en_ventana', '6'),
    aviso('carnet_en_ventana', '7'),
  ])
  assert.deepEqual(r.map((x) => x.clave), ['aviso:itv_en_ventana:1', 'aviso:carnet_caducado:4', 'aviso:patrimonio_en_ventana:5', 'aviso:obligacion_en_ventana:6', 'aviso:carnet_en_ventana:7'])
})

test('recibos: una póliza sin bloque visible no corta las demás y de un ajeno se dice de quién es', () => {
  const sinBloque = pol('a', { recibos: null })
  const conBloque = pol('b', { recibos: { historial: [recibo('pendiente', '2026-11-15')] } })
  const r = recibosPendientes([titular([sinBloque, conBloque], { ajeno: true, nombre: 'José' })], titulo)
  assert.equal(r.length, 1)
  assert.match(r[0]!.detalle!, /De José/)
})

test('seguros: «Revisar mi seguro» solo en una póliza PROPIA, en vigor, con fecha y con nivel que opera', () => {
  const t = (polizas: PolizaCalendario[], extra: Partial<TitularParaCalendario> = {}) => titular(polizas, { nivel: 'gestionar', ...extra })
  const accion = (x: TitularParaCalendario) => vencimientosDeSeguros([x], titulo)[0]!.accion
  assert.deepEqual(accion(t([pol('a')])), { texto: 'Revisar mi seguro', href: '/boveda/mejorar/a' })
  assert.equal(accion(t([pol('a')], { ajeno: true })), undefined, 'ajena: no es suya')
  assert.equal(accion(titular([pol('a')])), undefined, 'sin nivel: no se ofrece')
  assert.equal(accion(t([pol('a', { fechaVencimiento: null })])), undefined, 'sin fecha: la página no la atendería')
  assert.equal(accion(t([pol('a', { sustituidaAt: d('2026-01-01') })])), undefined)
  assert.equal(accion(t([pol('a', { vigencia: 'no_vigente', renovacionSinConfirmar: true })])), undefined, 'renovación sin confirmar')
})

const vehFlota = (id: string, itv: VehiculoFlota['itv']): VehiculoFlota => ({
  polizaId: id, etiqueta: `Matrícula ${id}`, matricula: id, clave: id, compania: 'Mapfre', ramo: 'auto',
  vencimiento: { fecha: '2027-01-01', diasHasta: 100, estado: 'vigente' }, itv, numeroPoliza: null, matriculacionDeclarada: null,
})
const itvCalculada = { estado: 'calculada', fecha: '2026-12-15', fiabilidad: 'primera', fuente: 'compania', diasHasta: 49, pronto: false, periodicidadMeses: 12, calculadaComoTurismo: true } as VehiculoFlota['itv']

test('calendario: la ITV calculada de la flota es una fecha; la que no sabemos NO es una fecha', () => {
  const sociedades: SociedadFlotaInicio[] = [
    { id: 's1', nombre: 'Transportes SL', recortada: false, vehiculos: [vehFlota('1111ABC', itvCalculada), vehFlota('2222DEF', { estado: 'desconocida', motivo: 'sin_matriculacion' })] },
  ]
  const r = fechasDeFlota(sociedades)!
  assert.equal(r.length, 1)
  assert.equal(r[0]!.fecha, '2026-12-15')
  assert.equal(r[0]!.href, '/flota?empresa=s1')
  assert.match(r[0]!.titulo, /Primera ITV · Matrícula 1111ABC/)
  assert.match(r[0]!.detalle ?? '', /fecha calculada/)
})

test('calendario: una sociedad cuya flota no se pudo leer da null (no se dice «sin ITV»); sin sociedades es [] (se miró)', () => {
  assert.equal(fechasDeFlota([{ id: 's1', nombre: 'A', recortada: false, vehiculos: null }]), null)
  assert.deepEqual(fechasDeFlota([]), [])
})
