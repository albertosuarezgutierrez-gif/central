// Elección de UNA opción de una lista con IA inyectada (13/10/2026). Fixtures SINTÉTICAS: matrícula, fechas, CP,
// nombre y NIF inventados; catálogo de ejemplo.
import { describe, it, expect } from 'vitest'
import {
  codigoSinteticoDeEtiqueta,
  conCodigosSinteticos,
  contextoEleccionVersion,
  esCodigoSintetico,
  elegirDeLista,
  mensajesEleccion,
  peticionEleccionVersion,
  validarFormularioAuto,
  validarOpcionesVersion,
  type FormularioAuto,
  type PreguntarIa,
} from './index.ts'

const OPCIONES = [
  { codigo: 'V001', etiqueta: 'F 800 S 85 CV' },
  { codigo: 'V002', etiqueta: 'F 800 ST 85 CV' },
  { codigo: 'V003', etiqueta: 'F 800 GS 85 CV' },
]
const PETICION = { contexto: { marca: 'BMW', modelo: 'F 800' }, opciones: OPCIONES, instrucciones: 'Elige.' }
const responde = (texto: string): PreguntarIa => async () => texto

describe('elegirDeLista', () => {
  it('alta con un código de la lista → se devuelve tal cual', async () => {
    const r = await elegirDeLista(PETICION, responde('```json\n{"codigo":"V002","confianza":"alta","motivo":"ST en la descripción"}\n```'))
    expect(r).toEqual({ codigo: 'V002', confianza: 'alta', motivo: 'ST en la descripción' })
  })

  it('baja → codigo null aunque la IA proponga uno', async () => {
    const r = await elegirDeLista(PETICION, responde('{"codigo":"V001","confianza":"baja","motivo":"dudoso"}'))
    expect(r).toEqual({ codigo: null, confianza: 'baja', motivo: 'dudoso' })
  })

  it('código FUERA de la lista con confianza alta → baja (nunca se aplica un código inventado)', async () => {
    const r = await elegirDeLista(PETICION, responde('{"codigo":"V999","confianza":"alta","motivo":"seguro"}'))
    expect(r.confianza).toBe('baja')
    expect(r.codigo).toBeNull()
  })

  it('código que solo se parece (mayúsculas/espacios) → baja: la comparación es exacta', async () => {
    const r = await elegirDeLista(PETICION, responde('{"codigo":"v002 ","confianza":"alta","motivo":"x"}'))
    expect(r.confianza).toBe('baja')
  })

  it('la IA lanza → baja, sin propagar el error', async () => {
    const r = await elegirDeLista(PETICION, async () => { throw new Error('timeout') })
    expect(r).toMatchObject({ codigo: null, confianza: 'baja' })
    expect(r.motivo).toMatch(/timeout/)
  })

  it('respuesta ilegible o alta sin código → baja', async () => {
    expect((await elegirDeLista(PETICION, responde('no sé'))).confianza).toBe('baja')
    expect((await elegirDeLista(PETICION, responde('{"codigo":null,"confianza":"alta","motivo":"x"}'))).confianza).toBe('baja')
  })

  it('con menos de dos opciones no se llama a la IA', async () => {
    let llamadas = 0
    const r = await elegirDeLista({ ...PETICION, opciones: [OPCIONES[0]] }, async () => { llamadas++; return '{}' })
    expect(r.confianza).toBe('baja')
    expect(llamadas).toBe(0)
  })
})

describe('versión del vehículo: payload a la IA SIN datos personales', () => {
  const v = validarFormularioAuto({
    ramo: 'moto',
    matricula: '1234BCD',
    codigoPostal: '41003',
    conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01', sexo: 'mujer' },
    tomadorEsConductor: true,
    tomadorEsPropietario: true,
    aniosAseguradoAnterior: 3,
    siniestrosUltimos5Anios: 0,
    garajeNoche: true,
    tomador: { tipo: 'fisica', documentoIdentidad: '12345678Z', nombre: 'Persona', apellido1: 'Inventada', fechaNacimiento: '1980-05-17' },
    seleccionVehiculo: { marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion: 'BMW F 800 ST 85 CV' },
  })
  const riesgo = (v.ok ? v.formulario : null) as FormularioAuto

  it('el formulario de la fixture es válido (lleva matrícula, CP, fechas y tomador)', () => {
    expect(v.ok).toBe(true)
  })

  it('CONGELADO: el contexto son exactamente estos seis campos del vehículo', () => {
    expect(contextoEleccionVersion(riesgo)).toEqual({ ramo: 'moto', marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion: 'BMW F 800 ST 85 CV' })
  })

  it('CONGELADO: lo que recibe la IA no lleva matrícula, CP, fechas, sexo, nombre ni documento', async () => {
    const p = peticionEleccionVersion(riesgo, OPCIONES)
    expect(p).not.toBeNull()
    let enviado = ''
    await elegirDeLista(p!, async (system, prompt) => { enviado = system + '\n' + prompt; return '{"codigo":null,"confianza":"baja","motivo":"x"}' })
    const { prompt } = mensajesEleccion(p!)
    expect(JSON.parse(prompt)).toEqual({
      contexto: { ramo: 'moto', marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion: 'BMW F 800 ST 85 CV' },
      opciones: OPCIONES,
    })
    for (const personal of ['1234BCD', '41003', '1980-05-17', '2000-06-01', 'mujer', '12345678Z', 'Persona', 'Inventada']) {
      expect(enviado.includes(personal), `no se manda «${personal}»`).toBe(false)
    }
  })

  it('sin pedir: opción sin código, códigos repetidos o una sola opción → null (decide una persona)', () => {
    expect(peticionEleccionVersion(riesgo, [OPCIONES[0], { codigo: null, etiqueta: 'F 800 R' }])).toBeNull()
    expect(peticionEleccionVersion(riesgo, [OPCIONES[0], { ...OPCIONES[1], codigo: 'V001' }])).toBeNull()
    expect(peticionEleccionVersion(riesgo, [OPCIONES[0]])).toBeNull()
  })
})

describe('seleccionVehiculo.descripcion', () => {
  const base = {
    ramo: 'moto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' },
  }
  const con = (descripcion: unknown) => validarFormularioAuto({ ...base, seleccionVehiculo: { marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion } })

  it('texto del vehículo → se guarda (espacios normalizados); modelos con forma de matrícula antigua pasan', () => {
    const r = con('  BMW  F 800 S 85 CV ')
    expect(r.ok && r.formulario.seleccionVehiculo?.descripcion).toBe('BMW F 800 S 85 CV')
    expect(con('BMW R1250GS Adventure').ok).toBe(true)
    for (const modelo of ['BMW F 800 S 85 CV', 'Yamaha MT-07 2006 798 cc', 'Honda CBR600RR 2006 85 CV', 'BMW R1250GS 2006 85 CV']) {
      expect(con(modelo).ok, modelo).toBe(true)
    }
  })

  it('más de 200, matrícula actual o NIF/NIE → error, sin repetir el valor', () => {
    expect(con('x'.repeat(201)).ok).toBe(false)
    for (const malo of ['BMW F 800 1234 BCD', 'BMW F 800 matr. 1234-BCD', 'F 800 de 12345678Z', 'F 800 X1234567L']) {
      const r = con(malo)
      expect(r.ok, malo).toBe(false)
      if (!r.ok) expect(r.errores.join(' ')).not.toMatch(/1234|12345678Z|X1234567L/)
    }
  })

  it('email, teléfono, IBAN y bastidor → error (cada patrón nuevo por separado)', () => {
    const malos = [
      'BMW F 800 juan.perez@correo.es',           // email
      'BMW F 800 612 345 678',                    // teléfono con espacios
      'BMW F 800 +34 612-345-678',                // teléfono con +34
      'BMW F 800 0034612345678',                  // teléfono con 0034
      'BMW F 800 600123456',                      // teléfono sin separadores
      'BMW F 800 ES12 1234 5678 9012 3456 7890',  // IBAN con espacios
      'BMW F 800 ES9121000418450200051332',       // IBAN sin espacios
      'BMW F 800 WVWZZZ1JZXW000001',              // bastidor (17, sin I/O/Q)
    ]
    for (const malo of malos) {
      const r = con(malo)
      expect(r.ok, malo).toBe(false)
      if (!r.ok) expect(r.errores.join(' ')).not.toMatch(/juan|612|600123456|ES12|ES91|WVWZZZ/)
    }
  })
})

describe('validarOpcionesVersion (lista del cable)', () => {
  it('lista válida → normalizada; ausente, vacía o con una opción mala → null', () => {
    expect(validarOpcionesVersion([{ codigo: ' V1 ', etiqueta: ' F  800 S ' }, { codigo: null, etiqueta: 'F 800 R' }])).toEqual([
      { codigo: 'V1', etiqueta: 'F 800 S' },
      { codigo: null, etiqueta: 'F 800 R' },
    ])
    expect(validarOpcionesVersion(undefined)).toBeNull()
    expect(validarOpcionesVersion([])).toBeNull()
    expect(validarOpcionesVersion([{ codigo: 'V1', etiqueta: '' }])).toBeNull()
    expect(validarOpcionesVersion([{ codigo: 7, etiqueta: 'x' }])).toBeNull()
    expect(validarOpcionesVersion(Array.from({ length: 201 }, (_, i) => ({ codigo: `V${i}`, etiqueta: `v${i}` })))).toBeNull()
  })
})

describe('ramo auto (coche): elección de lista y contexto', () => {
  const COCHE = [
    { codigo: 'C001', etiqueta: 'MODELO X 1.5 110 CV' },
    { codigo: 'C002', etiqueta: 'MODELO X 1.6 TDI 115 CV' },
  ]
  const peticion = { contexto: { ramo: 'auto', marca: 'MARCA PRUEBA', modelo: 'MODELO X' }, opciones: COCHE, instrucciones: 'Elige.' }
  const resp = (t: string): PreguntarIa => async () => t

  it('alta con código de la lista → elige', async () => {
    expect(await elegirDeLista(peticion, resp('{"codigo":"C002","confianza":"alta","motivo":"TDI en la descripción"}'))).toEqual({ codigo: 'C002', confianza: 'alta', motivo: 'TDI en la descripción' })
  })
  it('baja → no elige', async () => {
    expect(await elegirDeLista(peticion, resp('{"codigo":"C001","confianza":"baja","motivo":"dudoso"}'))).toMatchObject({ codigo: null, confianza: 'baja' })
  })
  it('código fuera de la lista (p. ej. uno de moto) → no elige', async () => {
    const r = await elegirDeLista(peticion, resp('{"codigo":"V001","confianza":"alta","motivo":"x"}'))
    expect(r).toMatchObject({ codigo: null, confianza: 'baja' })
  })
  it('contexto de coche con clase y cc nulos: sin datos personales y con nulos como null (no 0)', () => {
    const v = validarFormularioAuto({
      ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
      conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01', sexo: 'mujer' },
      tomador: { tipo: 'fisica', documentoIdentidad: '12345678Z', nombre: 'Persona', apellido1: 'Inventada', fechaNacimiento: '1980-05-17' },
      seleccionVehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO X' },
    })
    expect(v.ok).toBe(true)
    const ctx = contextoEleccionVersion((v.ok ? v.formulario : null) as FormularioAuto)
    expect(ctx).toEqual({ ramo: 'auto', marca: 'MARCA PRUEBA', modelo: 'MODELO X', clase: null, cilindradaCc: null, descripcion: null })
    const dump = JSON.stringify(ctx)
    for (const personal of ['1234BCD', '41003', '1980', '2000', 'mujer', '12345678Z', 'Persona', 'Inventada']) expect(dump.includes(personal)).toBe(false)
  })
})

describe('código sintético para portales sin código (Mapfre, v0.8.61)', () => {
  const SIN = [
    { codigo: null, etiqueta: 'Marca Prueba Modelo 2.9 Gl · 163 CV · 2902 cc · 01/01/2004' },
    { codigo: null, etiqueta: 'Marca Prueba Modelo 2.9 Gls · 163 CV · 2902 cc · 01/09/2004' },
  ]
  const RIESGO = { ramo: 'auto' as const, seleccionVehiculo: { marca: 'MARCA', modelo: 'PRUEBA', clase: null, cilindradaCc: null, descripcion: '2.9 GLS' } }
  it('es estable, ≤60 caracteres, insensible a tildes/mayúsculas/espacios y distinto entre etiquetas', () => {
    const a = codigoSinteticoDeEtiqueta(SIN[0].etiqueta)
    expect(a).toBe(codigoSinteticoDeEtiqueta('  MARCA  prueba modelo 2.9 GL · 163 cv · 2902 CC · 01/01/2004'))
    expect(a).not.toBe(codigoSinteticoDeEtiqueta(SIN[1].etiqueta))
    expect(a).toMatch(/^et:[0-9a-f]{8}$/)
    expect(esCodigoSintetico(a)).toBe(true)
    expect(esCodigoSintetico('V001')).toBe(false)
    expect(esCodigoSintetico(null)).toBe(false)
  })
  it('sin ningún código → todas lo reciben y la petición a la IA ya es posible; antes era null', () => {
    expect(peticionEleccionVersion(RIESGO, SIN)).toBeNull()
    const con = conCodigosSinteticos(SIN)
    expect(con.every((o) => esCodigoSintetico(o.codigo))).toBe(true)
    expect(con.map((o) => o.etiqueta)).toEqual(SIN.map((o) => o.etiqueta))
    const p = peticionEleccionVersion(RIESGO, con)
    expect(p?.opciones.map((o) => o.codigo)).toEqual(con.map((o) => o.codigo))
  })
  it('con códigos reales no se toca; con mezcla tampoco (sigue sin petición: decide una persona); dos etiquetas iguales no se adivinan', () => {
    expect(conCodigosSinteticos(OPCIONES)).toEqual(OPCIONES)
    const mezcla = [{ codigo: 'V1', etiqueta: 'A' }, { codigo: null, etiqueta: 'B' }]
    expect(conCodigosSinteticos(mezcla)).toEqual(mezcla)
    expect(peticionEleccionVersion(RIESGO, conCodigosSinteticos(mezcla))).toBeNull()
    const repetida = [SIN[0], { codigo: null, etiqueta: SIN[0].etiqueta.toUpperCase() }]
    expect(peticionEleccionVersion(RIESGO, conCodigosSinteticos(repetida))).toBeNull()
    expect(conCodigosSinteticos([])).toEqual([])
  })
})
