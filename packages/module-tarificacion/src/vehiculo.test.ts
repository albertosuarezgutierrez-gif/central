// Vehículo canónico y formulario de auto (10/10/2026). Fixtures SINTÉTICAS: marcas/modelos de catálogo genéricos,
// matrículas y fechas inventadas.
import { describe, it, expect } from 'vitest'
import {
  esMatriculaEspanola,
  fechaIsoDesdeTexto,
  mensajeEleccionVersion,
  motivoLegible,
  normalizarCombustible,
  potenciaCvDesdeTexto,
  PREFIJO_ELECCION_VERSION,
  resolverVersion,
  validarFormularioAuto,
  vehiculoDesdeLectura,
  type LecturaVehiculoPortal,
} from './index.ts'

const V1 = { etiqueta: '1.5 TSI 150 CV Style', codigo: 'C001' }
const V2 = { etiqueta: '1.5 TSI 150 CV Sport', codigo: 'C002' }

describe('resolverVersion: nunca elige a ciegas', () => {
  it('una sola candidata (las vacías y duplicadas no cuentan) → unica', () => {
    const r = resolverVersion([{ etiqueta: 'Seleccione...', codigo: '' }, V1, { ...V1 }, { etiqueta: '  ', codigo: null }])
    expect(r).toEqual({ tipo: 'unica', candidato: V1 })
  })
  it('varias sin elección → ambigua con todas', () => {
    const r = resolverVersion([V1, V2])
    expect(r.tipo).toBe('ambigua')
    if (r.tipo === 'ambigua') expect(r.opciones).toEqual([V1, V2])
  })
  it('varias con elección por código o etiqueta exacta (salvo mayúsculas/tildes/espacios) → unica', () => {
    expect(resolverVersion([V1, V2], { codigo: 'C002' })).toEqual({ tipo: 'unica', candidato: V2 })
    expect(resolverVersion([V1, V2], { etiqueta: '1.5 tsi  150 cv STYLE' })).toEqual({ tipo: 'unica', candidato: V1 })
  })
  it('elección que no casa, o que es solo PARECIDA → sigue ambigua (sin «la más parecida»)', () => {
    expect(resolverVersion([V1, V2], { codigo: 'C999' }).tipo).toBe('ambigua')
    expect(resolverVersion([V1, V2], { etiqueta: '1.5 TSI 150 CV' }).tipo).toBe('ambigua')
    expect(resolverVersion([V1, V2], { etiqueta: 'Style' }).tipo).toBe('ambigua')
  })
  it('sin candidatas → ninguna', () => {
    expect(resolverVersion([{ etiqueta: '--', codigo: null }])).toEqual({ tipo: 'ninguna' })
  })
})

describe('lectura del portal → Vehiculo', () => {
  const base: LecturaVehiculoPortal = {
    marca: 'MARCA PRUEBA',
    modelo: 'MODELO X',
    versionSeleccionada: null,
    versiones: [V1, V2],
    combustible: 'Gasóleo',
    potencia: '110 kW',
    unidadPotencia: null,
    fechaMatriculacion: '05/03/2019',
    codigoCatalogo: null,
  }
  it('varias versiones sin elección → ambigua (para la bandeja), nunca ok', () => {
    expect(vehiculoDesdeLectura(base).tipo).toBe('ambigua')
  })
  it('con elección → ok con los datos normalizados; el código de catálogo sale de la versión si el portal no da otro', () => {
    const r = vehiculoDesdeLectura(base, { codigo: 'C001' })
    expect(r).toEqual({
      tipo: 'ok',
      vehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO X', version: V1.etiqueta, combustible: 'diesel', potenciaCv: 150, fechaMatriculacion: '2019-03-05', codigoCatalogo: 'C001' },
    })
  })
  it('versión ya fijada por el portal y sin elección → vale esa; lo que no se lee queda null', () => {
    const r = vehiculoDesdeLectura({ ...base, versionSeleccionada: V2, combustible: 'raro', potencia: '150', fechaMatriculacion: '31/02/2019', codigoCatalogo: 'H-77' })
    expect(r.tipo).toBe('ok')
    if (r.tipo === 'ok') {
      expect(r.vehiculo.version).toBe(V2.etiqueta)
      expect(r.vehiculo.combustible).toBeNull()
      expect(r.vehiculo.potenciaCv).toBeNull() // sin unidad ni unidad por defecto: no se asume
      expect(r.vehiculo.fechaMatriculacion).toBeNull() // 31/02 no existe
      expect(r.vehiculo.codigoCatalogo).toBe('H-77')
    }
  })
  it('sin marca o modelo (la consulta no devolvió nada) → incompleto', () => {
    expect(vehiculoDesdeLectura({ ...base, marca: 'Seleccione', modelo: null })).toEqual({ tipo: 'incompleto', faltan: ['marca', 'modelo'] })
    expect(vehiculoDesdeLectura({ ...base, versiones: [] })).toEqual({ tipo: 'incompleto', faltan: ['version'] })
  })
})

describe('normalizadores', () => {
  it.each([
    ['Gasolina', 'gasolina'], ['DIESEL', 'diesel'], ['gasóleo', 'diesel'], ['Eléctrico', 'electrico'], ['Híbrido', 'hibrido'],
    ['Híbrido enchufable', 'hibrido_enchufable'], ['GLP', 'glp'], ['', null], ['xyz', null],
  ])('combustible «%s» → %s', (t, c) => expect(normalizarCombustible(t)).toBe(c))
  it('potencia', () => {
    expect(potenciaCvDesdeTexto('110 CV')).toBe(110)
    expect(potenciaCvDesdeTexto('81 kW')).toBe(110)
    expect(potenciaCvDesdeTexto('110', 'cv')).toBe(110)
    expect(potenciaCvDesdeTexto('110')).toBeNull()
    expect(potenciaCvDesdeTexto('0 CV')).toBeNull()
  })
  it('fechas', () => {
    expect(fechaIsoDesdeTexto('5/3/2019')).toBe('2019-03-05')
    expect(fechaIsoDesdeTexto('2019-03-05')).toBe('2019-03-05')
    expect(fechaIsoDesdeTexto('2019-02-30')).toBeNull()
  })
  it('matrículas', () => {
    for (const ok of ['1234BCD', '1234 bcd', '1234-BCD', 'C1234BCD', 'SE1234AB', 'M1234Z']) expect(esMatriculaEspanola(ok), ok).toBe(true)
    for (const ko of ['1234ABC', '1234BCÑ', '123BCD', 'BCD1234', '']) expect(esMatriculaEspanola(ko), ko).toBe(false)
  })
})

describe('mensaje de elección de versión → bandeja', () => {
  it('lleva el prefijo, las opciones y no más de 12', () => {
    const muchas = Array.from({ length: 15 }, (_, i) => ({ etiqueta: `Versión ${i}`, codigo: `K${i}` }))
    const m = mensajeEleccionVersion(muchas)
    expect(m.startsWith(PREFIJO_ELECCION_VERSION)).toBe(true)
    expect(m).toContain('Versión 11 [K11]')
    expect(m).not.toContain('Versión 12 ')
    expect(m).toContain('(+3 más)')
  })
  it('motivoLegible lo enseña a la persona (no la frase genérica de captcha)', () => {
    const m = motivoLegible({ tipo: 'captcha', mensaje: mensajeEleccionVersion([V1, V2]) }, 'requiere_humano')
    expect(m).toMatch(/^Hay que elegir la versión del vehículo/)
    expect(m).toContain(V2.etiqueta)
  })
})

describe('validarFormularioAuto', () => {
  const hoy = new Date('2026-10-10T12:00:00Z')
  const ok = { ramo: 'auto', matricula: '1234-bcd', codigoPostal: '41003', conductor: { fechaNacimiento: '1985-04-02', fechaCarne: '2004-06-01', sexo: 'mujer' }, siniestrosUltimos5Anios: 0 }
  it('acepta y normaliza; null = no consta; 0 siniestros es dato', () => {
    const r = validarFormularioAuto(ok, hoy)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.formulario.matricula).toBe('1234BCD')
      expect(r.formulario.siniestrosUltimos5Anios).toBe(0)
      expect(r.formulario.garajeNoche).toBeNull()
      expect(r.formulario.eleccionVersion).toBeNull()
    }
  })
  it('rechaza matrícula mala SIN repetir su valor en el error (dato personal)', () => {
    const r = validarFormularioAuto({ ...ok, matricula: 'ZZ-999-QQQ' }, hoy)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).not.toContain('ZZ-999')
  })
  it('carné anterior al nacimiento, CP fuera de España, ramo raro y elección vacía → errores', () => {
    const r = validarFormularioAuto({ ...ok, ramo: 'camion', codigoPostal: '99000', conductor: { fechaNacimiento: '1985-04-02', fechaCarne: '1980-01-01' }, eleccionVersion: {} }, hoy)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores.some((e) => e.startsWith('ramo'))).toBe(true)
      expect(r.errores.some((e) => e.startsWith('codigoPostal'))).toBe(true)
      expect(r.errores.some((e) => e.startsWith('conductor.fechaCarne'))).toBe(true)
      expect(r.errores.some((e) => e.startsWith('eleccionVersion'))).toBe(true)
    }
  })
})
