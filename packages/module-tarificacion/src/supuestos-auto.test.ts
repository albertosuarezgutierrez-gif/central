// Supuestos de un precio de coche por bot (15/10/2026). Fixtures SINTÉTICAS: ningún dato personal.
import { describe, it, expect } from 'vitest'
import { ANIOS_ASEGURADO_FAVORABLE, conAntecedentesFavorables, SUPUESTO_CONDUCTOR_TOMADOR, supuestoConductorTomador, etiquetasSupuestos, hoyEspana, PREFIJO_SUPUESTOS, SUPUESTO_FAVORABLE_ANIOS, SUPUESTO_FAVORABLE_SINIESTROS, supuestosAuto, supuestosDeAvisos, textoSupuestos, validarFormularioAuto } from './index.ts'

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
    expect(supuestosDeAvisos([`${PREFIJO_SUPUESTOS}${'x'.repeat(600)}`])!.length).toBe(500)
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

// 18/10/2026, decisión de Alberto «supuesto favorable en todo» (vehículo, todas las compañías).
describe('conAntecedentesFavorables: lo que falta, al tramo más favorable y DECLARADO', () => {
  it('sin años ni siniestros → 5 o más (6 = «más de 5») y ninguno, los dos supuestos y en orden', () => {
    const r = conAntecedentesFavorables({ ramo: 'moto', aniosAseguradoAnterior: null, siniestrosUltimos5Anios: undefined })
    expect(r.formulario).toEqual({ ramo: 'moto', aniosAseguradoAnterior: ANIOS_ASEGURADO_FAVORABLE, siniestrosUltimos5Anios: 0 })
    expect(ANIOS_ASEGURADO_FAVORABLE).toBeGreaterThan(5)
    expect(r.supuestos).toEqual([SUPUESTO_FAVORABLE_ANIOS, SUPUESTO_FAVORABLE_SINIESTROS])
    expect(r.claves).toEqual(['aniosAseguradoAnterior', 'siniestrosUltimos5Anios'])
    expect(textoSupuestos(r.supuestos)).toBe(`${PREFIJO_SUPUESTOS}${SUPUESTO_FAVORABLE_ANIOS}, ${SUPUESTO_FAVORABLE_SINIESTROS}.`)
    for (const e of r.supuestos) expect(e).toMatch(/supuesto favorable, no consta/)
  })
  it('un dato es dato (0 incluido): no se toca ni se declara', () => {
    const r = conAntecedentesFavorables({ aniosAseguradoAnterior: 0, siniestrosUltimos5Anios: 2 })
    expect(r.formulario).toEqual({ aniosAseguradoAnterior: 0, siniestrosUltimos5Anios: 2 })
    expect(r.supuestos).toEqual([])
  })
  it('solo lo que falta: años dato, siniestros supuestos', () => {
    const r = conAntecedentesFavorables({ aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: null })
    expect(r.formulario).toEqual({ aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0 })
    expect(r.claves).toEqual(['siniestrosUltimos5Anios'])
  })
  it('basura (texto, negativo, decimal) no es dato: se supone', () => {
    expect(conAntecedentesFavorables({ aniosAseguradoAnterior: '4', siniestrosUltimos5Anios: -1 }).claves).toEqual(['aniosAseguradoAnterior', 'siniestrosUltimos5Anios'])
    expect(conAntecedentesFavorables({ aniosAseguradoAnterior: 2.5, siniestrosUltimos5Anios: 0 }).claves).toEqual(['aniosAseguradoAnterior'])
  })
  it('idempotente: aplicada dos veces no declara nada la segunda', () => {
    const una = conAntecedentesFavorables({ aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null })
    expect(conAntecedentesFavorables(una.formulario).supuestos).toEqual([])
  })
})

describe('conductor habitual = tomador: supuesto declarado solo si no consta', () => {
  it('null/ausente → supuesto; true/false → dato (nada)', () => {
    expect(supuestoConductorTomador({ tomadorEsConductor: null })).toBe(SUPUESTO_CONDUCTOR_TOMADOR)
    expect(supuestoConductorTomador({})).toBe(SUPUESTO_CONDUCTOR_TOMADOR)
    expect(supuestoConductorTomador({ tomadorEsConductor: true })).toBeNull()
    expect(supuestoConductorTomador({ tomadorEsConductor: false })).toBeNull()
    expect(SUPUESTO_CONDUCTOR_TOMADOR).toBe('conductor habitual: el tomador (supuesto)')
  })
})

describe('validarFormularioAuto: fechaAdquisicion, fotocopiaAnterior y póliza anterior (Allianz moto)', () => {
  const base = { ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' } }
  it('viajan al formulario validado; ausentes no aparecen', () => {
    const r = validarFormularioAuto({ ...base, fechaMatriculacion: '2020-01-01', fechaAdquisicion: '2021-03-04', fotocopiaAnterior: 'dos_ultimos_anios', polizaAnteriorUltimos5: '12345' }, hoy)
    expect(r.ok && [r.formulario.fechaAdquisicion, r.formulario.fotocopiaAnterior, r.formulario.polizaAnteriorUltimos5]).toEqual(['2021-03-04', 'dos_ultimos_anios', '12345'])
    const sin = validarFormularioAuto(base, hoy)
    expect(sin.ok && ['fechaAdquisicion', 'fotocopiaAnterior'].some((k) => k in sin.formulario)).toBe(false)
  })
  it('fechaAdquisicionPorDefecto: viaja solo con fechaAdquisicion; no booleano → error', () => {
    const r = validarFormularioAuto({ ...base, fechaAdquisicion: '2021-03-04', fechaAdquisicionPorDefecto: true }, hoy)
    expect(r.ok && r.formulario.fechaAdquisicionPorDefecto).toBe(true)
    const f = validarFormularioAuto({ ...base, fechaAdquisicion: '2021-03-04', fechaAdquisicionPorDefecto: false }, hoy)
    expect(f.ok && f.formulario.fechaAdquisicionPorDefecto).toBe(false)
    const sinFecha = validarFormularioAuto({ ...base, fechaAdquisicionPorDefecto: true }, hoy)
    expect(sinFecha.ok && 'fechaAdquisicionPorDefecto' in sinFecha.formulario).toBe(false)
    expect(validarFormularioAuto({ ...base, fechaAdquisicion: '2021-03-04', fechaAdquisicionPorDefecto: 'si' }, hoy).ok).toBe(false)
  })
  it('0.7.20 · clienteAltoPotencialAllianz / capAllianz: opcionales, viajan si vienen; fuera de formato → error sin repetir el valor', () => {
    const r = validarFormularioAuto({ ...base, clienteAltoPotencialAllianz: 'SI', capAllianz: '10' }, hoy)
    expect(r.ok && [r.formulario.clienteAltoPotencialAllianz, r.formulario.capAllianz]).toEqual(['si', '10'])
    const sin = validarFormularioAuto(base, hoy)
    expect(sin.ok && ['clienteAltoPotencialAllianz', 'capAllianz'].some((k) => k in sin.formulario)).toBe(false)
    expect(validarFormularioAuto({ ...base, clienteAltoPotencialAllianz: 'quizá' }, hoy).ok).toBe(false)
    const malo = validarFormularioAuto({ ...base, capAllianz: 'Pepe Ficticio 123' }, hoy)
    expect(malo.ok).toBe(false)
    expect(JSON.stringify(malo)).not.toContain('Pepe')
  })
  it('fechaAdquisicion: futura, <1900, anterior a la matriculación o mal formada → error; igual a la matriculación vale', () => {
    for (const extra of [{ fechaAdquisicion: '2030-01-01' }, { fechaAdquisicion: '1899-12-31' }, { fechaAdquisicion: '04/03/2021' }, { fechaMatriculacion: '2020-01-01', fechaAdquisicion: '2019-12-31' }]) {
      expect(validarFormularioAuto({ ...base, ...extra }, hoy).ok).toBe(false)
    }
    expect(validarFormularioAuto({ ...base, fechaMatriculacion: '2020-01-01', fechaAdquisicion: '2020-01-01' }, hoy).ok).toBe(true)
  })
  it('fotocopiaAnterior fuera del enum → error', () => {
    expect(validarFormularioAuto({ ...base, fotocopiaAnterior: 'otro' }, hoy).ok).toBe(false)
    expect(validarFormularioAuto({ ...base, fotocopiaAnterior: 'proximo_anio' }, hoy).ok).toBe(true)
  })
})
