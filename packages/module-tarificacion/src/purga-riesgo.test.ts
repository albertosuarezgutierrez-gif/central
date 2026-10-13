import { describe, it, expect } from 'vitest'
import {
  ESTADOS_TRABAJO,
  ESTADOS_PURGA_RIESGO,
  planPurgaRiesgo,
  riesgoSinDatosPersonales,
  esOrigenDeEmision,
  origenEmisionLiberado,
  DIAS_ORIGEN_EMISION,
} from './index.ts'

// Datos personales de mentira, pero con la forma de los de verdad: el cepo busca CLAVES y VALORES.
const MOTO = {
  ramo: 'moto',
  matricula: '1234BCD',
  codigoPostal: '41003',
  poblacion: 'Sevilla',
  conductor: { fechaNacimiento: '1980-05-01', fechaCarne: '2000-06-01', sexo: 'hombre' },
  tomadorEsConductor: true,
  tomadorEsPropietario: true,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: true,
  tomador: {
    tipo: 'fisica', nombre: 'Juana', apellido1: 'Pérez', apellido2: 'Gómez', razonSocial: null,
    documentoIdentidad: '12345678Z', fechaNacimiento: '1980-05-01', codigoPostal: '41003', poblacion: 'Sevilla',
    direccion: 'Calle Falsa 1', telefono: '600111222', email: 'juana@example.com',
  },
  seleccionVehiculo: { marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion: 'BMW F 800 S', bastidor: 'WBA00000000000000' },
  eleccionVersion: { codigo: 'X1', etiqueta: 'F 800 S 85 CV' },
  eleccionVersionIa: { origen: 'ia', clave: 'bmw|f 800|4|798|bmw f 800 s' },
  eleccionPoblacion: 'SEVILLA',
  polizaAnterior: 'POL-998877',
}

const COMUNIDAD = {
  ramo: 'comunidades',
  direccion: { via: 'Calle Socorro', numero: '24', codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
  referenciaCatastral: '1234567TG3413S0001AB',
  polizaAReemplazar: '0123456789',
  documentoIdentidad: 'H12345678',
  tipoDocumento: 'Dispone NIF/CIF/NIE',
  fechaEfecto: '2026-11-01',
  fechaTermino: '2027-11-01',
  m2Construidos: 1200,
  anioConstruccion: 1975,
  tipoVivienda: 'Viviendas Pisos en Alto',
  uso: 'Habitual',
  plantas: 5,
  numEdificios: 1,
  numViviendasYLocales: 20,
  numViviendas: 18,
  numLocales: 2,
  listaPropietarios: '> 50%',
  capitalContinente: 900000,
  capitalContenido: null,
  ascensor: true,
  companiaActual: 'mapfre',
  presidente: { nombre: 'Juan', telefono: '600333444' },
}

/** Claves y valores que NUNCA pueden quedar en un trabajo cerrado. */
const CLAVES_PERSONALES = ['matricula', 'conductor', 'tomador', 'fechaNacimiento', 'fechaCarne', 'documentoIdentidad', 'tipoDocumento', 'polizaAReemplazar', 'referenciaCatastral', 'via', 'numero', 'bastidor', 'polizaAnterior', 'presidente', 'telefono', 'email', 'nombre']
const VALORES_PERSONALES = ['1234BCD', '1980-05-01', '2000-06-01', '12345678Z', '600111222', 'juana@example.com', 'Calle Falsa 1', 'Juana', 'H12345678', '0123456789', 'Calle Socorro', '1234567TG3413S0001AB', 'WBA00000000000000', 'POL-998877', '600333444']

function quedaAlgoPersonal(x: unknown): string[] {
  const hallado: string[] = []
  const recorrer = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(recorrer)
    if (v && typeof v === 'object') {
      for (const [k, s] of Object.entries(v)) {
        if (CLAVES_PERSONALES.includes(k)) hallado.push(`clave ${k}`)
        recorrer(s)
      }
      return
    }
    if (typeof v === 'string' && VALORES_PERSONALES.includes(v)) hallado.push(`valor ${v}`)
  }
  recorrer(x)
  return hallado
}

const plan = (estado: string, riesgo: unknown, ramo: string, compania = 'allianz', modo: string | null = null) =>
  planPurgaRiesgo({ estado, modo, compania, ramo, riesgo })

describe('purga del riesgo · CEPO: en un trabajo CERRADO no queda ningún dato personal', () => {
  for (const estado of ESTADOS_PURGA_RIESGO) {
    it(`moto en ${estado}`, () => {
      const p = plan(estado, MOTO, 'moto')
      expect(p.purgar, estado).toBe(true)
      if (p.purgar) expect(quedaAlgoPersonal(p.riesgo)).toEqual([])
    })
    // Comunidades de OTRA compañía (Allianz Comunidades `ok` es origen de emisión: ver abajo).
    it(`comunidades en ${estado}`, () => {
      const p = plan(estado, COMUNIDAD, 'comunidades', 'occident')
      expect(p.purgar, estado).toBe(true)
      if (p.purgar) expect(quedaAlgoPersonal(p.riesgo)).toEqual([])
    })
  }
})

describe('purga del riesgo · CEPO: un trabajo que espera reintento CONSERVA el riesgo entero', () => {
  for (const estado of ['requiere_humano', 'error_reintentable', 'pendiente', 'en_curso', 'pendiente_autorizacion_emision', 'autorizado_emision']) {
    it(`${estado}: no se toca`, () => {
      expect(plan(estado, MOTO, 'moto')).toEqual({ purgar: false, motivo: 'estado_vivo' })
      expect(plan(estado, COMUNIDAD, 'comunidades', 'occident')).toEqual({ purgar: false, motivo: 'estado_vivo' })
    })
  }
  it('los estados de purga son exactamente los cerrados que no se reintentan', () => {
    expect([...ESTADOS_PURGA_RIESGO].sort()).toEqual(['cancelado', 'emitido', 'error_definitivo', 'ok'])
    for (const e of ESTADOS_PURGA_RIESGO) expect(ESTADOS_TRABAJO).toContain(e)
  })
  it('estado desconocido o ausente → no se toca (la duda conserva)', () => {
    expect(plan('inventado', MOTO, 'moto').purgar).toBe(false)
    expect(planPurgaRiesgo({ estado: undefined, modo: null, compania: 'allianz', ramo: 'moto', riesgo: MOTO }).purgar).toBe(false)
  })
})

describe('purga del riesgo · lista BLANCA', () => {
  it('moto: conserva vehículo de catálogo, CP, población y elecciones; nada más', () => {
    expect(riesgoSinDatosPersonales(MOTO, 'moto')).toEqual({
      ramo: 'moto',
      codigoPostal: '41003',
      poblacion: 'Sevilla',
      seleccionVehiculo: { marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion: 'BMW F 800 S' },
      eleccionVersion: { codigo: 'X1', etiqueta: 'F 800 S 85 CV' },
      eleccionVersionIa: { origen: 'ia', clave: 'bmw|f 800|4|798|bmw f 800 s' },
      eleccionPoblacion: 'SEVILLA',
    })
  })
  it('comunidades: conserva el edificio y CP/municipio/provincia; fuera vía, número, NIF, catastro y póliza anterior', () => {
    const r = riesgoSinDatosPersonales(COMUNIDAD, 'comunidades')
    expect(r.direccion).toEqual({ codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' })
    expect(r).toMatchObject({ m2Construidos: 1200, anioConstruccion: 1975, plantas: 5, capitalContinente: 900000, capitalContenido: null, companiaActual: 'mapfre', fechaEfecto: '2026-11-01' })
    for (const k of ['documentoIdentidad', 'tipoDocumento', 'polizaAReemplazar', 'referenciaCatastral', 'presidente']) expect(r).not.toHaveProperty(k)
  })
  it('una clave NUEVA que nadie conoce se borra por defecto (también dentro de un objeto de la lista)', () => {
    const r = riesgoSinDatosPersonales({ ramo: 'moto', codigoPostal: '41003', dniConductor: '12345678Z', seleccionVehiculo: { marca: 'BMW', modelo: 'X', propietario: 'Juana' } }, 'moto')
    expect(r).toEqual({ ramo: 'moto', codigoPostal: '41003', seleccionVehiculo: { marca: 'BMW', modelo: 'X' } })
  })
  it('una clave de la lista con un OBJETO donde va un valor simple se borra', () => {
    expect(riesgoSinDatosPersonales({ ramo: 'moto', codigoPostal: { cp: '41003', telefono: '600111222' } }, 'moto')).toEqual({ ramo: 'moto' })
    expect(riesgoSinDatosPersonales({ ramo: 'comunidades', direccion: 'Calle Socorro 24' }, 'comunidades')).toEqual({ ramo: 'comunidades' })
  })
  it('manda el ramo de la COLUMNA: un riesgo de moto en un trabajo de comunidades no conserva la matrícula ni el vehículo', () => {
    expect(riesgoSinDatosPersonales(MOTO, 'comunidades')).toEqual({ ramo: 'moto' })
  })
  it('ramo sin lista (exploración de Hogar) → solo el ramo; un riesgo que no es objeto → {}', () => {
    expect(riesgoSinDatosPersonales({ ramo: 'hogar', nombre: 'Juana', cp: '41003' }, 'hogar')).toEqual({ ramo: 'hogar' })
    expect(riesgoSinDatosPersonales(null, 'moto')).toEqual({})
    expect(riesgoSinDatosPersonales(['x'], 'moto')).toEqual({})
  })
  it('idempotente: lo purgado ya no se vuelve a escribir', () => {
    const una = riesgoSinDatosPersonales(MOTO, 'moto')
    expect(riesgoSinDatosPersonales(una, 'moto')).toEqual(una)
    expect(plan('ok', una, 'moto')).toEqual({ purgar: false, motivo: 'ya_purgado' })
  })
})

describe('purga del riesgo · origen de una emisión (Allianz Comunidades `ok`) se conserva', () => {
  it('ok + tarificar + allianz/comunidades → no se purga (solicitarEmision copia su riesgo con el CIF)', () => {
    expect(esOrigenDeEmision({ estado: 'ok', modo: null, compania: 'allianz', ramo: 'comunidades' })).toBe(true)
    expect(plan('ok', COMUNIDAD, 'comunidades', 'allianz')).toEqual({ purgar: false, motivo: 'origen_de_emision' })
  })
  it('pero sí se purgan: el mismo en cancelado/error_definitivo, una moto de Allianz y el propio trabajo de EMISIÓN', () => {
    expect(plan('cancelado', COMUNIDAD, 'comunidades', 'allianz').purgar).toBe(true)
    expect(plan('error_definitivo', COMUNIDAD, 'comunidades', 'allianz').purgar).toBe(true)
    expect(plan('ok', MOTO, 'moto', 'allianz').purgar).toBe(true)
    expect(plan('emitido', COMUNIDAD, 'comunidades', 'allianz', 'emision').purgar).toBe(true)
    expect(plan('ok', COMUNIDAD, 'comunidades', 'allianz', 'exploracion').purgar).toBe(true)
  })
})

describe('purga del riesgo · cuándo se LIBERA el origen de una emisión', () => {
  const AHORA = new Date('2026-12-01T12:00:00Z')
  const hace = (d: number) => new Date(AHORA.getTime() - d * 86_400_000)
  it('con una emisión abierta (también requiere_humano) → no, aunque haya pasado el plazo', () => {
    for (const abierta of ['pendiente', 'en_curso', 'pendiente_autorizacion_emision', 'autorizado_emision', 'requiere_humano']) {
      expect(origenEmisionLiberado({ terminadoAt: hace(90), ahora: AHORA, emisiones: ['cancelado', abierta] }), abierta).toBe(false)
    }
  })
  it('con su emisión cerrada (emitida, rechazada o caducada = cancelado) → sí, aunque sea de ayer', () => {
    expect(origenEmisionLiberado({ terminadoAt: hace(1), ahora: AHORA, emisiones: ['emitido'] })).toBe(true)
    expect(origenEmisionLiberado({ terminadoAt: hace(1), ahora: AHORA, emisiones: ['cancelado'] })).toBe(true)
  })
  it(`sin emisiones → a los ${DIAS_ORIGEN_EMISION} días del ok; sin fecha de fin → no (la duda conserva)`, () => {
    expect(origenEmisionLiberado({ terminadoAt: hace(DIAS_ORIGEN_EMISION - 1), ahora: AHORA, emisiones: [] })).toBe(false)
    expect(origenEmisionLiberado({ terminadoAt: hace(DIAS_ORIGEN_EMISION), ahora: AHORA, emisiones: [] })).toBe(true)
    expect(origenEmisionLiberado({ terminadoAt: null, ahora: AHORA, emisiones: [] })).toBe(false)
  })
  it('liberado → el origen se purga como cualquier ok', () => {
    const p = planPurgaRiesgo({ estado: 'ok', modo: null, compania: 'allianz', ramo: 'comunidades', riesgo: COMUNIDAD, origenLiberado: true })
    expect(p.purgar).toBe(true)
    if (p.purgar) expect(quedaAlgoPersonal(p.riesgo)).toEqual([])
  })
})
