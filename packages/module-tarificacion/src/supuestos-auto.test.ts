// Supuestos de un precio de coche por bot (15/10/2026). Fixtures SINTÉTICAS: ningún dato personal.
import { describe, it, expect } from 'vitest'
import { etiquetasSupuestos, hoyEspana, PREFIJO_SUPUESTOS, supuestosAuto, supuestosDeAvisos, textoSupuestos, validarFormularioAuto } from './index.ts'

const hoy = new Date('2026-10-15T10:00:00Z')
const vacio = { garajeNoche: null, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null }

describe('supuestosAuto: sin datos, todo supuesto salvo la dirección (hueco)', () => {
  const s = supuestosAuto(vacio, hoy)
  it('valores «no determinantes» marcados como supuestos', () => {
    expect(s.compra).toMatchObject({ valor: 'ya_lo_tenia', supuesto: true })
    expect(s.uso).toMatchObject({ valor: 'diario', supuesto: true })
    expect(s.fechaEfecto).toMatchObject({ valor: '2026-10-16', supuesto: true })
    expect(s.garaje).toMatchObject({ valor: 'colectivo', supuesto: true })
    expect(s.segundoConductor).toMatchObject({ valor: false, supuesto: true })
    expect(s.antecedentes).toMatchObject({ valor: { procedencia: 'otra_compania', aniosAsegurado: null, siniestrosUltimos5Anios: 0 }, supuesto: true })
  })
  it('la dirección no se inventa: hueco (valor null) y nunca supuesta', () => {
    expect(s.direccion).toMatchObject({ valor: null, supuesto: false })
  })
  it('texto para el precio, en orden', () => {
    expect(textoSupuestos(etiquetasSupuestos(s))).toBe(
      'Precio con supuestos: ya lo tenía (cambio de seguro), uso diario, efecto 16/10/2026, garaje colectivo, sin 2º conductor, procede de otra compañía, sin siniestros.',
    )
  })
})

describe('supuestosAuto: con datos del formulario, nada supuesto', () => {
  const s = supuestosAuto(
    {
      garajeNoche: true, tipoGaraje: 'individual', aniosAseguradoAnterior: 6, siniestrosUltimos5Anios: 1, companiaAnterior: 'COMPAÑÍA DE PRUEBA',
      fechaMatriculacion: '2019-03-01', usoFrecuencia: 'ocasional', fechaVencimiento: '2026-12-01', conductorOcasional: true,
      tomador: { direccion: 'CALLE FICTICIA 1' } as never,
    },
    hoy,
  )
  it('cada campo sale del formulario', () => {
    expect(s.compra).toMatchObject({ valor: 'ya_lo_tenia', supuesto: false })
    expect(s.uso).toMatchObject({ valor: 'ocasional', supuesto: false })
    expect(s.fechaEfecto).toMatchObject({ valor: '2026-12-01', supuesto: false })
    expect(s.garaje).toMatchObject({ valor: 'individual', supuesto: false })
    expect(s.segundoConductor).toMatchObject({ valor: true, supuesto: false })
    expect(s.antecedentes).toMatchObject({ valor: { procedencia: 'otra_compania', aniosAsegurado: 6, siniestrosUltimos5Anios: 1 }, supuesto: false })
    expect(s.direccion).toMatchObject({ valor: 'consta', supuesto: false })
    expect(etiquetasSupuestos(s)).toEqual([])
    expect(textoSupuestos(etiquetasSupuestos(s))).toBe(null)
  })
  it('ningún motivo ni etiqueta lleva la dirección ni el nombre de la compañía', () => {
    expect(JSON.stringify(s)).not.toMatch(/FICTICIA|PRUEBA/)
  })
})

describe('supuestosAuto: reglas campo a campo', () => {
  it('compra: póliza actual → ya lo tenía (dato); >12 meses → ya lo tenía (supuesto); ≤12 meses sin póliza → nuevo (supuesto); nunca 2ª mano', () => {
    expect(supuestosAuto({ ...vacio, fechaVencimiento: '2026-12-01', fechaMatriculacion: '2026-09-01' }, hoy).compra).toMatchObject({ valor: 'ya_lo_tenia', supuesto: false })
    expect(supuestosAuto({ ...vacio, fechaVencimiento: '2025-01-01' }, hoy).compra).toMatchObject({ valor: 'ya_lo_tenia', supuesto: false })
    expect(supuestosAuto({ ...vacio, fechaMatriculacion: '2025-10-14' }, hoy).compra).toMatchObject({ valor: 'ya_lo_tenia', supuesto: true, etiqueta: 'ya lo tenía (cambio de seguro)' })
    expect(supuestosAuto({ ...vacio, fechaMatriculacion: '2025-10-15' }, hoy).compra).toMatchObject({ valor: 'nuevo', supuesto: true, etiqueta: 'vehículo nuevo' })
    expect(supuestosAuto({ ...vacio, fechaMatriculacion: '2026-09-01' }, hoy).compra).toMatchObject({ valor: 'nuevo', supuesto: true })
    expect(supuestosAuto({ ...vacio, fechaMatriculacion: '2026-11-01' }, hoy).compra).toMatchObject({ valor: 'ya_lo_tenia', supuesto: true }) // futura = sin fecha
    expect(supuestosAuto({ ...vacio, fechaMatriculacion: '2026-02-30' }, hoy).compra).toMatchObject({ valor: 'ya_lo_tenia', supuesto: true })
  })
  it('fecha de efecto: vencimiento pasado u hoy → mañana (supuesto)', () => {
    expect(supuestosAuto({ ...vacio, fechaVencimiento: '2026-10-15' }, hoy).fechaEfecto).toMatchObject({ valor: '2026-10-16', supuesto: true, motivo: 'el vencimiento de la póliza actual ya pasó' })
    expect(supuestosAuto({ ...vacio, fechaVencimiento: '2026-10-16' }, hoy).fechaEfecto).toMatchObject({ valor: '2026-10-16', supuesto: false })
  })
  it('fecha de efecto: «mañana» es en hora de España (el worker corre en UTC)', () => {
    // 23:30 UTC del 15 = 01:30 del 16 en Madrid (horario de verano): mañana es el 17.
    expect(hoyEspana(new Date('2026-10-15T23:30:00Z'))).toBe('2026-10-16')
    expect(supuestosAuto(vacio, new Date('2026-10-15T23:30:00Z')).fechaEfecto.valor).toBe('2026-10-17')
  })
  it('garaje: la calle manda; garaje sin tipo → colectivo supuesto; tipo contradictorio → colectivo supuesto', () => {
    expect(supuestosAuto({ ...vacio, garajeNoche: false }, hoy).garaje).toMatchObject({ valor: 'calle', supuesto: false })
    expect(supuestosAuto({ ...vacio, garajeNoche: false, tipoGaraje: 'individual' }, hoy).garaje).toMatchObject({ valor: 'calle', supuesto: false })
    expect(supuestosAuto({ ...vacio, garajeNoche: true }, hoy).garaje).toMatchObject({ valor: 'colectivo', supuesto: true })
    expect(supuestosAuto({ ...vacio, garajeNoche: true, tipoGaraje: 'calle' }, hoy).garaje).toMatchObject({ valor: 'colectivo', supuesto: true })
    expect(supuestosAuto({ ...vacio, tipoGaraje: 'colectivo' }, hoy).garaje).toMatchObject({ valor: 'colectivo', supuesto: false })
  })
  it('segundo conductor confirmado que no → dato, no supuesto', () => {
    expect(supuestosAuto({ ...vacio, conductorOcasional: false }, hoy).segundoConductor).toMatchObject({ valor: false, supuesto: false })
  })
  it('antecedentes: 0 años = sin seguro anterior (dato); siniestros sin dato → supuesto 0 con su etiqueta', () => {
    expect(supuestosAuto({ ...vacio, aniosAseguradoAnterior: 0, siniestrosUltimos5Anios: 0 }, hoy).antecedentes).toMatchObject({ valor: { procedencia: 'sin_seguro_anterior' }, supuesto: false })
    const a = supuestosAuto({ ...vacio, aniosAseguradoAnterior: 4 }, hoy).antecedentes
    expect(a).toMatchObject({ valor: { aniosAsegurado: 4, siniestrosUltimos5Anios: 0 }, supuesto: true, etiqueta: 'sin siniestros en los últimos 5 años' })
    expect(supuestosAuto({ ...vacio, siniestrosUltimos5Anios: 0 }, hoy).antecedentes).toMatchObject({ supuesto: true, etiqueta: 'procede de otra compañía' })
  })
})

describe('aviso de supuestos en la oferta', () => {
  it('supuestosDeAvisos encuentra solo el aviso con el prefijo y lo recorta', () => {
    expect(supuestosDeAvisos(['Vehículo según el catálogo…', `${PREFIJO_SUPUESTOS}uso diario.`])).toBe('Precio con supuestos: uso diario.')
    expect(supuestosDeAvisos(['otra cosa'])).toBe(null)
    expect(supuestosDeAvisos(null)).toBe(null)
    expect(supuestosDeAvisos([`${PREFIJO_SUPUESTOS}${'x'.repeat(400)}`])!.length).toBe(300)
  })
})

describe('validarFormularioAuto: los campos nuevos son opcionales y cerrados', () => {
  const base = { ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' } }
  it('pasan si son válidos; ausentes no aparecen', () => {
    const r = validarFormularioAuto({ ...base, fechaMatriculacion: '2020-01-01', fechaVencimiento: '2027-01-01', tipoGaraje: 'Colectivo', usoFrecuencia: 'diario', conductorOcasional: false }, hoy)
    expect(r.ok && [r.formulario.fechaMatriculacion, r.formulario.fechaVencimiento, r.formulario.tipoGaraje, r.formulario.usoFrecuencia, r.formulario.conductorOcasional]).toEqual(['2020-01-01', '2027-01-01', 'colectivo', 'diario', false])
    const sin = validarFormularioAuto(base, hoy)
    expect(sin.ok && ['fechaMatriculacion', 'fechaVencimiento', 'tipoGaraje', 'usoFrecuencia', 'conductorOcasional'].some((k) => k in sin.formulario)).toBe(false)
  })
  it('fuera de la lista o con forma rara → error', () => {
    for (const extra of [{ tipoGaraje: 'parking' }, { usoFrecuencia: 'mucho' }, { fechaMatriculacion: '2030-01-01' }, { fechaVencimiento: '01/01/2027' }, { conductorOcasional: 'no' }]) {
      expect(validarFormularioAuto({ ...base, ...extra }, hoy).ok).toBe(false)
    }
  })
})
