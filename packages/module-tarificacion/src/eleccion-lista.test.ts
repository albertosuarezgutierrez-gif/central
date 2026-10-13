// Elección de UNA opción de una lista con IA inyectada (13/10/2026). Fixtures SINTÉTICAS: matrícula, fechas, CP,
// nombre y NIF inventados; catálogo de ejemplo.
import { describe, it, expect } from 'vitest'
import {
  contextoEleccionVersion,
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
  })

  it('más de 200, matrícula actual o NIF/NIE → error, sin repetir el valor', () => {
    expect(con('x'.repeat(201)).ok).toBe(false)
    for (const malo of ['BMW F 800 1234 BCD', 'BMW F 800 matr. 1234-BCD', 'F 800 de 12345678Z', 'F 800 X1234567L']) {
      const r = con(malo)
      expect(r.ok, malo).toBe(false)
      if (!r.ok) expect(r.errores.join(' ')).not.toMatch(/1234|12345678Z|X1234567L/)
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
