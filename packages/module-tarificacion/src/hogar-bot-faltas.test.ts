// Cepos de `faltasHogarBot` (05/11/2026): la lista de campos que FALTAN para el bot de hogar es la MISMA que dice
// `formularioBotHogar` (una sola fuente; la solicitud de datos de la renovación pregunta solo esto) y las elecciones
// DECLARADAS por el cliente (`usoDeclarado`…) solo cuentan sin un id de catálogo que diga otra cosa. Datos sintéticos.
import { describe, it, expect } from 'vitest'
import { datosViviendaParaBot, eleccionesInicialesHogar, faltasHogarBot, formularioBotHogar, type EntradaBotHogar } from './hogar-bot-formulario.ts'

const HOY = new Date('2026-11-05T10:00:00Z')
const VACIA: EntradaBotHogar = {
  codigoPostal: null, municipio: null, nombreVia: null, numero: null, planta: null, puerta: null, anioConstruccion: null, anioReforma: null,
  superficieM2: null, referenciaCatastral: null, capitalContinenteEur: null, capitalContenidoEur: null, protecciones: null, objetosValor: null,
  tomadorEmpresa: false,
}
const COMPLETA: EntradaBotHogar = {
  ...VACIA, codigoPostal: '41003', municipio: 'SEVILLA', nombreVia: 'EJEMPLO', numero: '1', anioConstruccion: 1990, superficieM2: 80,
  uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: 'no',
}

describe('faltasHogarBot', () => {
  it('vacía: falta todo salvo empresa, con las MISMAS frases que formularioBotHogar', () => {
    const f = faltasHogarBot(VACIA)
    expect(f.map((x) => x.campo)).toEqual(['codigoPostal', 'nombreVia', 'numero', 'anioConstruccion', 'superficieM2', 'uso', 'regimen', 'tipoVivienda', 'conMadera'])
    const r = formularioBotHogar(VACIA, HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.faltan).toEqual(f.map((x) => x.etiqueta))
  })

  it('completa: no falta nada y el formulario sale', () => {
    expect(faltasHogarBot(COMPLETA)).toEqual([])
    expect(formularioBotHogar(COMPLETA, HOY).ok).toBe(true)
  })

  it('solo lo que falta: uso y madera', () => {
    expect(faltasHogarBot({ ...COMPLETA, uso: '', conMadera: null }).map((x) => x.campo)).toEqual(['uso', 'conMadera'])
  })

  it('empresa: se dice (no tiene arreglo por el cliente)', () => {
    expect(faltasHogarBot({ ...COMPLETA, tomadorEmpresa: true }).map((x) => x.campo)).toEqual(['empresa'])
  })

  it('m² con decimales: falta (el bot pide entero)', () => {
    expect(faltasHogarBot({ ...COMPLETA, superficieM2: 80.5 }).map((x) => x.campo)).toEqual(['superficieM2'])
  })
})

describe('eleccionesInicialesHogar con lo DECLARADO por el cliente', () => {
  const riesgo = (datos: Record<string, unknown>) => ({ datosRiesgo: { clave: 'datosVivienda', datos }, figuras: [] })

  it('sin id de catálogo, la declarada (en la lista cerrada) vale', () => {
    const e = eleccionesInicialesHogar(riesgo({ usoDeclarado: 'secundaria', regimenDeclarado: 'inquilino', tipoViviendaDeclarado: 'adosada' }))
    expect(e).toMatchObject({ uso: 'secundaria', regimen: 'inquilino', tipoVivienda: 'adosada' })
  })

  it('una declarada fuera de la lista no vale (nada de valores de cajón)', () => {
    expect(eleccionesInicialesHogar(riesgo({ usoDeclarado: 'otro', tipoViviendaDeclarado: 'castillo' }))).toMatchObject({ uso: '', tipoVivienda: '' })
  })

  it('id reconocido e igual a la declarada → vale; distinta → nada (lo decide una persona)', () => {
    expect(eleccionesInicialesHogar(riesgo({ uso: 'Owner', regimenDeclarado: 'propietario' })).regimen).toBe('propietario')
    expect(eleccionesInicialesHogar(riesgo({ uso: 'Owner', regimenDeclarado: 'inquilino' })).regimen).toBe('')
  })

  it('id guardado sin traducir (sin catálogo vivo) → nada, aunque haya declarada', () => {
    expect(eleccionesInicialesHogar(riesgo({ ocupacion: 'SecondResidence', usoDeclarado: 'secundaria' })).uso).toBe('')
  })

  it('de punta a punta: la vivienda con lo declarado ya no echa en falta uso/régimen/tipo', () => {
    const r = riesgo({ cp: '41003', nombreVia: 'EJEMPLO', numeroVia: '1', anioConstruccion: 1990, metrosCuadrados: 80, conMadera: false, usoDeclarado: 'secundaria', regimenDeclarado: 'propietario', tipoViviendaDeclarado: 'independiente' })
    expect(faltasHogarBot({ ...datosViviendaParaBot(r), ...eleccionesInicialesHogar(r) })).toEqual([])
  })
})
