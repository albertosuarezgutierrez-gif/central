import { describe, it, expect } from 'vitest'
import {
  aceptaUso, avisoInfraseguro, capitalContinenteSugerido, discrepanciasCatastro, filtrarBotsPorUso, preguntasPorAntiguedad, zonaCostePorProvincia,
} from './hogar-asesor.ts'

const HOY = new Date('2026-10-20T10:00:00Z')

describe('capitalContinenteSugerido', () => {
  it('m² × €/m² de la zona, redondeado a la centena', () => {
    expect(capitalContinenteSugerido(100, 'Madrid')).toMatchObject({ capitalEur: 140_000, eurPorM2: 1400, zona: 'alta', estimacion: true })
    expect(capitalContinenteSugerido(87, 'Sevilla')).toMatchObject({ capitalEur: 100_100, zona: 'media' })
    expect(capitalContinenteSugerido(100, 'Jaén')).toMatchObject({ capitalEur: 100_000, zona: 'baja' })
  })
  it('sin m² (o no positivos) no hay sugerencia: nunca 0', () => {
    for (const m of [null, undefined, 0, -5, Number.NaN]) expect(capitalContinenteSugerido(m, 'Madrid')).toBeNull()
  })
  it('provincia desconocida o ausente → zona media, sin inventar otra', () => {
    expect(zonaCostePorProvincia(null)).toBe('media')
    expect(zonaCostePorProvincia('Atlantida')).toBe('media')
    expect(zonaCostePorProvincia('  ÁLAVA ')).toBe('alta')
  })
})

describe('avisoInfraseguro', () => {
  it('avisa por debajo del 80% y no en el 80% exacto', () => {
    expect(avisoInfraseguro(79_999, 100_000)).toMatchObject({ infraseguro: true })
    expect(avisoInfraseguro(80_000, 100_000)).toMatchObject({ infraseguro: false })
    expect(avisoInfraseguro(150_000, 100_000)?.infraseguro).toBe(false)
  })
  it('sin capital tecleado o sin sugerido no compara', () => {
    expect(avisoInfraseguro(null, 100_000)).toBeNull()
    expect(avisoInfraseguro(0, 100_000)).toBeNull()
    expect(avisoInfraseguro(50_000, null)).toBeNull()
  })
})

describe('discrepanciasCatastro', () => {
  it('m² con más del 10% de diferencia y año distinto', () => {
    const r = discrepanciasCatastro({ metrosCuadrados: 100, anioConstruccion: 1990 }, { metrosCuadrados: 120, anioConstruccion: 1985 })
    expect(r.map((x) => x.campo)).toEqual(['metrosCuadrados', 'anioConstruccion'])
  })
  it('hasta el 10% de diferencia y año igual: nada', () => {
    expect(discrepanciasCatastro({ metrosCuadrados: 108, anioConstruccion: 1990 }, { metrosCuadrados: 120, anioConstruccion: 1990 })).toEqual([])
  })
  it('un lado sin dato no genera aviso', () => {
    expect(discrepanciasCatastro({ metrosCuadrados: null, anioConstruccion: null }, { metrosCuadrados: 120, anioConstruccion: 1985 })).toEqual([])
    expect(discrepanciasCatastro({ metrosCuadrados: 100, anioConstruccion: 1990 }, { metrosCuadrados: null, anioConstruccion: null })).toEqual([])
  })
})

describe('preguntasPorAntiguedad', () => {
  it('más de 40 años pregunta por tuberías y electricidad; justo 40 no', () => {
    expect(preguntasPorAntiguedad(1985, HOY)).toEqual({ antiguedad: 41, preguntarReformaTuberias: true, preguntarReformaElectrica: true })
    expect(preguntasPorAntiguedad(1986, HOY)).toMatchObject({ antiguedad: 40, preguntarReformaTuberias: false, preguntarReformaElectrica: false })
  })
  it('sin año (o año absurdo) no se sabe la antigüedad: no pregunta', () => {
    expect(preguntasPorAntiguedad(null, HOY)).toEqual({ antiguedad: null, preguntarReformaTuberias: false, preguntarReformaElectrica: false })
    expect(preguntasPorAntiguedad(12, HOY).antiguedad).toBeNull()
  })
})

describe('filtrarBotsPorUso', () => {
  it('uso sin contestar: no se lanza nada', () => {
    for (const u of [null, undefined, '', '  ']) expect(filtrarBotsPorUso(u, ['allianz', 'mapfre'])).toEqual({ usoPendiente: true, lanzar: [], excluidas: [], sinConfirmar: [] })
  })
  it('habitual: se lanzan todos y ninguno queda sin confirmar', () => {
    expect(filtrarBotsPorUso('habitual', ['allianz', 'mapfre'])).toEqual({ usoPendiente: false, lanzar: ['allianz', 'mapfre'], excluidas: [], sinConfirmar: [] })
  })
  it('turístico/alquiler/deshabitada: hoy NINGUNA exclusión inventada, todo sin confirmar', () => {
    for (const u of ['turistico', 'alquiler', 'deshabitada']) {
      const r = filtrarBotsPorUso(u, ['allianz', 'mapfre', 'reale'])
      expect(r.excluidas).toEqual([])
      expect(r.lanzar).toEqual(['allianz', 'mapfre', 'reale'])
      expect(r.sinConfirmar).toEqual(['allianz', 'mapfre', 'reale'])
    }
  })
  it('compañía y uso fuera de la tabla: sin confirmar, nunca excluida', () => {
    expect(aceptaUso('desconocida', 'habitual')).toBe('sin_confirmar')
    expect(aceptaUso('Allianz', 'uso-raro')).toBe('sin_confirmar')
    expect(aceptaUso(' MAPFRE ', 'habitual')).toBe('acepta')
  })
})
