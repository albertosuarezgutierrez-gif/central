// Población de un CP con varias localidades (13/10/2026). Fixtures INVENTADAS (CP y nombres sintéticos).
import { describe, it, expect } from 'vitest'
import {
  clavePoblacion,
  leerCeldaPoblacion,
  mensajeEleccionPoblacion,
  motivoLegible,
  opcionesPoblacionDesdeCeldas,
  resolverPoblacion,
  validarFormularioAuto,
  validarOpcionesPoblacion,
} from './index.ts'

const CELDAS = ['00001- VILLA ÁLAMO', '00001- PUEBLO NUEVO', '00001-  Puebloviejo de Abajo ']
const OPC = opcionesPoblacionDesdeCeldas(CELDAS)

describe('celdas del buscador de poblaciones', () => {
  it('«CP- NOMBRE» → opción con el texto exacto como código; otra forma → fuera', () => {
    expect(leerCeldaPoblacion('00001- VILLA ÁLAMO')).toEqual({ cp: '00001', nombre: 'VILLA ÁLAMO' })
    expect(leerCeldaPoblacion('VILLA')).toBeNull()
    expect(opcionesPoblacionDesdeCeldas([...CELDAS, 'basura', CELDAS[0]]).map((o) => o.etiqueta)).toEqual(['VILLA ÁLAMO', 'PUEBLO NUEVO', 'Puebloviejo de Abajo'])
    expect(OPC[0].codigo).toBe('00001- VILLA ÁLAMO')
  })
  it('clavePoblacion: sin tildes, mayúsculas y espacios colapsados', () => {
    expect(clavePoblacion('  villa   alamo ')).toBe(clavePoblacion('VILLA ÁLAMO'))
    expect(clavePoblacion('Villa Alamos')).not.toBe(clavePoblacion('VILLA ÁLAMO'))
  })
})

describe('resolverPoblacion: exacta y única, o pide persona', () => {
  it('una sola → esa; ninguna → ninguna', () => {
    expect(resolverPoblacion(OPC.slice(0, 1), {})).toMatchObject({ tipo: 'elegida', por: 'unica' })
    expect(resolverPoblacion([], { poblacion: 'x' })).toEqual({ tipo: 'ninguna' })
  })
  it('varias + poblacion que casa (mayúsculas/tildes/espacios) → esa', () => {
    const r = resolverPoblacion(OPC, { poblacion: ' villa  alamo' })
    expect(r).toMatchObject({ tipo: 'elegida', por: 'poblacion', opcion: { codigo: '00001- VILLA ÁLAMO' } })
  })
  it('varias sin poblacion, o que no casa, o parecida → ambigua con TODAS', () => {
    for (const poblacion of [undefined, null, '', 'VILLA', 'PUEBLO', 'Otra']) {
      const r = resolverPoblacion(OPC, { poblacion })
      expect(r.tipo).toBe('ambigua')
      if (r.tipo === 'ambigua') expect(r.opciones).toHaveLength(3)
    }
  })
  it('varias con el mismo nombre normalizado → ambigua (no elige una al azar)', () => {
    const dup = opcionesPoblacionDesdeCeldas(['00001- SAN JUAN', '00001- San Juán'])
    expect(resolverPoblacion(dup, { poblacion: 'san juan' }).tipo).toBe('ambigua')
  })
  it('eleccionPoblacion de la bandeja (texto exacto de la celda) manda; fuera de la lista → se ignora', () => {
    expect(resolverPoblacion(OPC, { eleccionPoblacion: '00001- PUEBLO NUEVO', poblacion: 'villa alamo' })).toMatchObject({ tipo: 'elegida', por: 'eleccion', opcion: { etiqueta: 'PUEBLO NUEVO' } })
    expect(resolverPoblacion(OPC, { eleccionPoblacion: '00001- OTRA' }).tipo).toBe('ambigua')
  })
  it('eleccionPoblacion que no casa NO cae a la poblacion de la ficha: ambigua', () => {
    const r = resolverPoblacion(OPC, { eleccionPoblacion: '00001- OTRA', poblacion: 'villa alamo' })
    expect(r.tipo).toBe('ambigua')
  })
})

describe('mensaje, motivo y cable', () => {
  it('mensaje con prefijo → motivo legible de la bandeja', () => {
    const m = mensajeEleccionPoblacion(OPC)
    expect(m).toMatch(/^requiere_eleccion_poblacion: el código postal tiene 3 poblaciones/)
    expect(motivoLegible({ tipo: 'captcha', mensaje: m })).toMatch(/^Hay que elegir la población del código postal: /)
  })
  it('validarOpcionesPoblacion: una mala invalida la lista', () => {
    expect(validarOpcionesPoblacion(OPC)).toHaveLength(3)
    expect(validarOpcionesPoblacion([])).toBeNull()
    expect(validarOpcionesPoblacion([...OPC, { codigo: '', etiqueta: 'x' }])).toBeNull()
    expect(validarOpcionesPoblacion([{ codigo: 'x'.repeat(121), etiqueta: 'x' }])).toBeNull()
    expect(validarOpcionesPoblacion('x')).toBeNull()
  })
  it('validarOpcionesPoblacion: descarta opciones con caracteres que validarFormularioAuto rechaza', () => {
    const mala = { codigo: '00001- <B>', etiqueta: '<B>' }
    expect(validarOpcionesPoblacion([...OPC, mala])).toHaveLength(3)
    expect(validarOpcionesPoblacion([mala])).toBeNull()
  })
})

describe('formulario: poblacion y eleccionPoblacion opcionales y validadas', () => {
  const base = { ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' } }
  const hoy = new Date('2026-10-13T00:00:00Z')
  it('ausentes → no aparecen; presentes → espacios colapsados', () => {
    const a = validarFormularioAuto(base, hoy)
    expect(a.ok && 'poblacion' in a.formulario).toBe(false)
    const b = validarFormularioAuto({ ...base, poblacion: ' Villa   Álamo ', eleccionPoblacion: '00001- VILLA ÁLAMO' }, hoy)
    expect(b.ok && b.formulario.poblacion).toBe('Villa Álamo')
    expect(b.ok && b.formulario.eleccionPoblacion).toBe('00001- VILLA ÁLAMO')
  })
  it('tipo, longitud o caracteres raros → error sin repetir el valor', () => {
    for (const [campo, v] of [['poblacion', 7], ['poblacion', 'x'.repeat(81)], ['eleccionPoblacion', 'y'.repeat(121)], ['poblacion', '<b>Z</b>']] as const) {
      const r = validarFormularioAuto({ ...base, [campo]: v }, hoy)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.errores.join(' ')).toMatch(new RegExp(`^${campo}:`))
        expect(r.errores.join(' ')).not.toContain(String(v))
      }
    }
  })
})
