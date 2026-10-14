import { describe, expect, it } from 'vitest'
import { completarInmuebleConCatastro, etiquetaIdHogar, faltanDatosCatastro, fechaDdMmAaaa, inmuebleUnicoCatastro, normPlantaCatastro, normPlantaPuerta, normPuertaCatastro, riesgoExploracionDeOportunidad } from './riesgo-oportunidad.ts'
import { catalogoParaIA, resolverDato } from './explorador.ts'

// Valores SINTÉTICOS obvios: ninguna persona ni dirección real.
const ficha = { nif: '00000000T', nombre: 'Ficticio', apellido1: 'Deprueba', apellido2: 'Sintetico', fechaNacimiento: '1980-01-15' }
const vivienda = {
  cp: '00000', municipio: 'VILLAPRUEBA', provincia: 'PROVINCIA PRUEBA', tipoViaId: 'Calle', nombreVia: 'Inventada', numeroVia: '0',
  planta: '1', ocupacion: 'MainResidence', uso: 'Owner', tipoVivienda: 'MiddleFloor', capitalContinente: 100000, capitalContenido: 20000,
  metrosCuadrados: null, anioConstruccion: null, referenciaCatastral: null, direccion: 'texto libre que no se usa',
}

describe('riesgoExploracionDeOportunidad', () => {
  it('ficha + datosVivienda → {tomador, inmueble, hogar} con los nombres del catálogo', () => {
    const r = riesgoExploracionDeOportunidad(ficha, vivienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.riesgo.tomador).toEqual({ nif: '00000000T', nombre: 'Ficticio', apellido1: 'Deprueba', apellido2: 'Sintetico', nombreCompleto: 'Ficticio Deprueba Sintetico', fechaNacimiento: '15/01/1980' })
    expect(r.riesgo.inmueble).toEqual({ tipoVia: 'Calle', nombreVia: 'Inventada', numero: '0', codigoPostal: '00000', municipio: 'VILLAPRUEBA', provincia: 'PROVINCIA PRUEBA', planta: '1' })
    expect(r.riesgo.hogar).toEqual({ uso: 'MainResidence', regimen: 'Owner', tipoVivienda: 'MiddleFloor', capitalContinente: 100000, capitalContenido: 20000 })
  })

  it('año de construcción y m² ausentes se OMITEN (los autocompleta el portal desde el Catastro), nunca se inventan', () => {
    const r = riesgoExploracionDeOportunidad(ficha, vivienda)
    if (!r.ok) throw new Error('debía valer')
    expect('anioConstruccion' in r.riesgo.inmueble).toBe(false)
    expect('superficieM2' in r.riesgo.inmueble).toBe(false)
    const con = riesgoExploracionDeOportunidad(ficha, { ...vivienda, metrosCuadrados: 85.5, anioConstruccion: 1975 })
    if (!con.ok) throw new Error('debía valer')
    expect(con.riesgo.inmueble).toMatchObject({ superficieM2: 85.5, anioConstruccion: 1975 })
  })

  it('USO de la vivienda obligatorio: sin él, rechazo (nunca un valor por defecto)', () => {
    expect(riesgoExploracionDeOportunidad(ficha, { ...vivienda, ocupacion: null })).toEqual({ ok: false, faltan: ['datosVivienda.ocupacion'] })
    expect(riesgoExploracionDeOportunidad(ficha, { ...vivienda, ocupacion: '' })).toEqual({ ok: false, faltan: ['datosVivienda.ocupacion'] })
  })

  it('RÉGIMEN obligatorio: sin él, rechazo', () => {
    expect(riesgoExploracionDeOportunidad(ficha, { ...vivienda, uso: undefined })).toEqual({ ok: false, faltan: ['datosVivienda.uso'] })
  })

  it('con uso y régimen, ambos llegan al riesgo tal cual y los lee el worker por su clave', () => {
    const r = riesgoExploracionDeOportunidad(ficha, { ...vivienda, uso: 'Tenant' })
    if (!r.ok) throw new Error('debía valer')
    const ctx = { ramo: 'hogar', conDatosReales: true, riesgo: r.riesgo, env: {}, hoy: new Date('2026-10-13T10:00:00Z') }
    expect(resolverDato('hogar.uso', ctx)).toEqual({ ok: true, valor: 'MainResidence' })
    expect(resolverDato('hogar.regimen', ctx)).toEqual({ ok: true, valor: 'Tenant' })
    expect(resolverDato('tomador.nif', ctx)).toEqual({ ok: true, valor: '00000000T' })
    expect(resolverDato('tomador.fecha_nacimiento', ctx)).toEqual({ ok: true, valor: '15/01/1980' })
    expect(resolverDato('inmueble.codigo_postal', ctx)).toEqual({ ok: true, valor: '00000' })
  })

  it('id de uso/régimen/tipo de vivienda FUERA del mapa cerrado → rechazo (no reconocido), nunca se adivina', () => {
    expect(riesgoExploracionDeOportunidad(ficha, { ...vivienda, ocupacion: 'IdQueNoConocemos' })).toEqual({ ok: false, faltan: [], noReconocidos: ['datosVivienda.ocupacion'] })
    expect(riesgoExploracionDeOportunidad(ficha, { ...vivienda, uso: 'Propietario' })).toEqual({ ok: false, faltan: [], noReconocidos: ['datosVivienda.uso'] })
    expect(riesgoExploracionDeOportunidad(ficha, { ...vivienda, tipoVivienda: 7 })).toEqual({ ok: false, faltan: [], noReconocidos: ['datosVivienda.tipoVivienda'] })
    // tipoVivienda es opcional: AUSENTE no rechaza (la clave queda sinValor y no se puede elegir).
    const sin = riesgoExploracionDeOportunidad(ficha, { ...vivienda, tipoVivienda: null })
    expect(sin.ok && 'tipoVivienda' in sin.riesgo.hogar).toBe(false)
    expect(etiquetaIdHogar('regimen', 'Owner')).toBe('Propietario')
    expect(etiquetaIdHogar('regimen', 'toString')).toBeNull()
    expect(etiquetaIdHogar('uso', 'Owner')).toBeNull()
  })

  it('provincia y tipo de vía llegan al riesgo para que el worker los RELLENE, pero la IA no ve su valor', () => {
    const r = riesgoExploracionDeOportunidad(ficha, vivienda)
    if (!r.ok) throw new Error('debía valer')
    const ctx = { ramo: 'hogar', conDatosReales: true, riesgo: r.riesgo, env: {}, hoy: new Date('2026-10-13T10:00:00Z') }
    expect(resolverDato('inmueble.provincia', ctx)).toEqual({ ok: true, valor: 'PROVINCIA PRUEBA' })
    expect(resolverDato('inmueble.tipo_via', ctx)).toEqual({ ok: true, valor: 'Calle' })
    const ia = JSON.stringify(catalogoParaIA('hogar', { riesgo: r.riesgo }))
    expect(ia).not.toContain('PROVINCIA PRUEBA')
    expect(ia).not.toContain('VILLAPRUEBA')
    expect(ia).not.toContain('"Calle"')
  })

  it('sin datosVivienda o sin tomador identificable: rechazo con la lista de lo que falta', () => {
    expect(riesgoExploracionDeOportunidad(ficha, null)).toEqual({ ok: false, faltan: ['datosVivienda'] })
    expect(riesgoExploracionDeOportunidad({ nombre: 'Ficticio' }, vivienda)).toEqual({ ok: false, faltan: ['tomador.nif', 'tomador.apellido1'] })
  })

  it('un tipo de vía que es un código (no una palabra) se omite; un CP que no son 5 dígitos, también', () => {
    const r = riesgoExploracionDeOportunidad(ficha, { ...vivienda, tipoViaId: '12', cp: '123' })
    if (!r.ok) throw new Error('debía valer')
    expect(r.riesgo.inmueble.tipoVia).toBeUndefined()
    expect(r.riesgo.inmueble.codigoPostal).toBeUndefined()
  })

  it('fechaDdMmAaaa: ISO y dd/mm/aaaa; lo demás no se adivina', () => {
    expect(fechaDdMmAaaa('1980-01-15')).toBe('15/01/1980')
    expect(fechaDdMmAaaa('1980-01-15T00:00:00.000Z')).toBe('15/01/1980')
    expect(fechaDdMmAaaa('15/01/1980')).toBe('15/01/1980')
    expect(fechaDdMmAaaa('15-1-80')).toBeNull()
    expect(fechaDdMmAaaa(null)).toBeNull()
  })
})

// Referencias SINTÉTICAS (20 caracteres con forma válida, no son de ningún inmueble real).
const inm = (sufijo: string, planta: string | null, puerta: string | null, cp: string | null = '00000') =>
  ({ refCompleta: `0000000XX0000X${sufijo}`, planta, puerta, codigoPostal: cp })

describe('inmuebleUnicoCatastro (año/m² del Catastro: solo si es inequívoco)', () => {
  const portal = [inm('0001AA', '00', '01'), inm('0002AA', '01', 'A'), inm('0003AA', '01', 'B'), inm('0004AA', '02', 'A')]
  it('planta + puerta que casan con UNO → único (normalizando ceros y «º»)', () => {
    expect(inmuebleUnicoCatastro(portal, { planta: '1º', puerta: 'a' })).toEqual({ estado: 'unico', refCompleta: '0000000XX0000X0002AA' })
    expect(inmuebleUnicoCatastro(portal, { planta: 'Bajo', puerta: '1' })).toEqual({ estado: 'unico', refCompleta: '0000000XX0000X0001AA' })
  })
  it('solo planta con dos puertas en ella → varios (no se elige)', () => {
    expect(inmuebleUnicoCatastro(portal, { planta: '1' })).toEqual({ estado: 'varios' })
  })
  it('sin planta ni puerta: único solo si el portal tiene un inmueble', () => {
    expect(inmuebleUnicoCatastro(portal, {})).toEqual({ estado: 'varios' })
    expect(inmuebleUnicoCatastro([inm('0009AA', null, null)], {}).estado).toBe('unico')
  })
  it('nada casa, CP distinto o lista vacía → ninguno', () => {
    expect(inmuebleUnicoCatastro(portal, { planta: '7', puerta: 'Z' })).toEqual({ estado: 'ninguno' })
    expect(inmuebleUnicoCatastro(portal, { planta: '1', puerta: 'A', codigoPostal: '99999' })).toEqual({ estado: 'ninguno' })
    expect(inmuebleUnicoCatastro([], { planta: '1' })).toEqual({ estado: 'ninguno' })
  })
  // 🪤 14/10/2026: un piso con planta «1» y puerta «Izquierda» dio `ninguno` contra el Catastro («01» + «IZ»).
  describe('planta/puerta como las codifica el Catastro', () => {
    const edificio = [
      inm('0001AA', '00', 'IZ'), inm('0002AA', '00', 'DR'), inm('0003AA', '01', 'IZ'), inm('0004AA', '01', 'DR'),
      inm('0005AA', '02', 'IZ'), inm('0006AA', '02', 'DR'), inm('0007AA', 'AT', 'A'), inm('0008AA', '-1', '01'),
    ]
    it('«1» + «Izquierda» → UNO (01/IZ); con «1º», «primero», «01» y «Izq», «I», «IZQ» igual', () => {
      const uno = { estado: 'unico', refCompleta: '0000000XX0000X0003AA' }
      for (const planta of ['1', '1º', 'primero', 'Primera', '01', 1]) {
        for (const puerta of ['Izquierda', 'izq', 'I', 'IZQ', 'Izda', 'iz']) {
          expect(inmuebleUnicoCatastro(edificio, { planta, puerta }), `${planta}/${puerta}`).toEqual(uno)
        }
      }
    })
    it('«Derecha»/«Dcha»/«D» ↔ DR; bajo/«0» ↔ 00; ático ↔ AT', () => {
      for (const puerta of ['Derecha', 'dcha', 'D', 'DR', 'Dcho']) {
        expect(inmuebleUnicoCatastro(edificio, { planta: '2', puerta }), puerta).toEqual({ estado: 'unico', refCompleta: '0000000XX0000X0006AA' })
      }
      for (const planta of ['Bajo', 'bajo', '0', 'BJ', 'PB']) {
        expect(inmuebleUnicoCatastro(edificio, { planta, puerta: 'Izquierda' }), planta).toEqual({ estado: 'unico', refCompleta: '0000000XX0000X0001AA' })
      }
      expect(inmuebleUnicoCatastro(edificio, { planta: 'Ático', puerta: 'A' })).toEqual({ estado: 'unico', refCompleta: '0000000XX0000X0007AA' })
      expect(inmuebleUnicoCatastro(edificio, { planta: 'Ático' })).toEqual({ estado: 'unico', refCompleta: '0000000XX0000X0007AA' })
    })
    it('el sótano («-1») no se confunde con la primera', () => {
      expect(normPlantaCatastro('-1')).toBe('-1')
      expect(inmuebleUnicoCatastro(edificio, { planta: '1', puerta: '1' })).toEqual({ estado: 'ninguno' })
    })
    it('varios y ninguno siguen igual: solo planta con dos puertas → varios; puerta que no existe → ninguno', () => {
      expect(inmuebleUnicoCatastro(edificio, { planta: '1' })).toEqual({ estado: 'varios' })
      expect(inmuebleUnicoCatastro(edificio, { planta: '1', puerta: 'B' })).toEqual({ estado: 'ninguno' })
      expect(inmuebleUnicoCatastro(edificio, { planta: '3', puerta: 'Izquierda' })).toEqual({ estado: 'ninguno' })
      // «D» letra y «DR» en el mismo portal: los dos casan → varios, nunca uno a dedo.
      expect(inmuebleUnicoCatastro([inm('0011AA', '01', 'D'), inm('0012AA', '01', 'DR')], { planta: '1', puerta: 'Derecha' })).toEqual({ estado: 'varios' })
    })
    it('normalizadores', () => {
      expect(normPlantaCatastro('1º')).toBe('1')
      expect(normPlantaCatastro('Séptimo')).toBe('7')
      expect(normPlantaCatastro('00')).toBe('0')
      expect(normPlantaCatastro('ático')).toBe('AT')
      expect(normPlantaCatastro('')).toBe(null)
      expect(normPuertaCatastro('Izquierda')).toBe('IZ')
      expect(normPuertaCatastro('DCHA.')).toBe('DR')
      expect(normPuertaCatastro('Centro')).toBe('CT')
      expect(normPuertaCatastro('b')).toBe('B')
      expect(normPuertaCatastro('07')).toBe('7')
      expect(normPuertaCatastro(null)).toBe(null)
    })
  })
  it('normPlantaPuerta', () => {
    expect(normPlantaPuerta('01')).toBe('1')
    expect(normPlantaPuerta('BJ')).toBe('0')
    expect(normPlantaPuerta(' iz ')).toBe('IZ')
    expect(normPlantaPuerta('')).toBe(null)
    expect(normPlantaPuerta(null)).toBe(null)
  })
})

describe('completarInmuebleConCatastro', () => {
  const base = { tomador: {}, inmueble: { codigoPostal: '00000' } as Record<string, string | number>, hogar: {} }
  it('rellena SOLO lo que falta y solo con valores válidos; dice qué (sin valores)', () => {
    expect(faltanDatosCatastro(base)).toEqual(['anioConstruccion', 'superficieM2'])
    const r = completarInmuebleConCatastro(base, { anioConstruccion: 1975, metrosCuadrados: 85 })
    expect(r.riesgo.inmueble).toMatchObject({ anioConstruccion: 1975, superficieM2: 85 })
    expect(r.anadidos).toEqual(['anioConstruccion', 'superficieM2'])
    expect('anioConstruccion' in base.inmueble).toBe(false)
  })
  it('nunca pisa lo que trae la oportunidad', () => {
    const r = completarInmuebleConCatastro({ ...base, inmueble: { anioConstruccion: 2001 } }, { anioConstruccion: 1975, metrosCuadrados: 85 })
    expect(r.riesgo.inmueble.anioConstruccion).toBe(2001)
    expect(r.anadidos).toEqual(['superficieM2'])
  })
  it('null o fuera de rango → no se añade (null = no se sabe)', () => {
    const r = completarInmuebleConCatastro(base, { anioConstruccion: null, metrosCuadrados: 0 })
    expect(r.anadidos).toEqual([])
    expect(completarInmuebleConCatastro(base, { anioConstruccion: 1200, metrosCuadrados: null }).anadidos).toEqual([])
  })
})
