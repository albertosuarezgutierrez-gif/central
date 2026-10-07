// Máquina de fases de ePAC: «Aceptar» y el radio solo en Datos Básicos, una vez, con la pestaña verificada.
// Cepos vistos en rojo (05/10/2026): (a) Aceptar en fase tarificar, (b) segundo Aceptar en datos_basicos,
// (c) «Emitir»/«Archivar»/«Proyecto Ampliado» (estos últimos, por texto, en guardianes.test.ts).
import { describe, it, expect } from 'vitest'
import { EmisionBloqueadaError, MaquinaFases } from './index.ts'

function enTarificar(): MaquinaFases {
  const m = new MaquinaFases()
  m.autorizarOpcion('datos_basicos')
  m.autorizarAceptar('datos_basicos')
  m.confirmarTarificar('tarificar')
  return m
}

describe('máquina de fases', () => {
  it('camino feliz: opción → Aceptar → Tarificar → Proyecto', () => {
    const m = new MaquinaFases()
    expect(m.fase()).toBe('datos_basicos')
    m.autorizarOpcion('datos_basicos')
    m.autorizarAceptar('datos_basicos')
    expect(m.aceptarEnVuelo()).toBe(true)
    m.confirmarTarificar('tarificar')
    expect(m.aceptarEnVuelo()).toBe(false)
    expect(m.fase()).toBe('tarificar')
    m.autorizarProyecto('tarificar')
    expect(m.fase()).toBe('proyecto')
  })

  it('(a) «Aceptar» en fase tarificar aborta (avanzaría a EMITIR)', () => {
    const m = enTarificar()
    expect(() => m.autorizarAceptar('tarificar')).toThrow(EmisionBloqueadaError)
    expect(() => m.autorizarAceptar('datos_basicos')).toThrow(/solo se permite en Datos Básicos/)
  })

  it('(a2) «Aceptar» en fase proyecto aborta', () => {
    const m = enTarificar()
    m.autorizarProyecto('tarificar')
    expect(() => m.autorizarAceptar('proyecto')).toThrow(EmisionBloqueadaError)
  })

  it('(b) un segundo «Aceptar» en datos_basicos aborta', () => {
    const m = new MaquinaFases()
    m.autorizarOpcion('datos_basicos')
    m.autorizarAceptar('datos_basicos')
    expect(() => m.autorizarAceptar('datos_basicos')).toThrow(/ya se pulsó/)
  })

  it('el radio de opción: una sola vez y solo en Datos Básicos', () => {
    const m = new MaquinaFases()
    m.autorizarOpcion('datos_basicos')
    expect(() => m.autorizarOpcion('datos_basicos')).toThrow(EmisionBloqueadaError)
    expect(() => enTarificar().autorizarOpcion('tarificar')).toThrow(EmisionBloqueadaError)
  })

  it('sin pestaña verificada en el DOM (o distinta) no se pulsa nada', () => {
    expect(() => new MaquinaFases().autorizarOpcion(null)).toThrow(/desconocida/)
    expect(() => new MaquinaFases().autorizarOpcion('tarificar')).toThrow(EmisionBloqueadaError)
    const m = new MaquinaFases()
    m.autorizarOpcion('datos_basicos')
    expect(() => m.autorizarAceptar(null)).toThrow(EmisionBloqueadaError)
    expect(() => m.autorizarAceptar('tarificar')).toThrow(EmisionBloqueadaError)
  })

  it('«Aceptar» sin haber elegido modalidad aborta', () => {
    expect(() => new MaquinaFases().autorizarAceptar('datos_basicos')).toThrow(/modalidad/)
  })

  it('un permiso consumido no se recupera aunque el clic fallara (fail-closed)', () => {
    const m = new MaquinaFases()
    m.autorizarOpcion('datos_basicos')
    m.autorizarAceptar('datos_basicos') // el clic «falla» y no se confirma el avance
    expect(() => m.autorizarAceptar('datos_basicos')).toThrow(EmisionBloqueadaError)
  })

  it('el avance solo se confirma tras un Aceptar autorizado y con la pestaña Tarificar', () => {
    expect(() => new MaquinaFases().confirmarTarificar('tarificar')).toThrow(EmisionBloqueadaError)
    const m = new MaquinaFases()
    m.autorizarOpcion('datos_basicos')
    m.autorizarAceptar('datos_basicos')
    expect(() => m.confirmarTarificar('datos_basicos')).toThrow(EmisionBloqueadaError)
  })

  it('«Proyecto» solo desde Tarificar y con esa pestaña activa', () => {
    expect(() => new MaquinaFases().autorizarProyecto('datos_basicos')).toThrow(EmisionBloqueadaError)
    expect(() => enTarificar().autorizarProyecto(null)).toThrow(EmisionBloqueadaError)
  })

  it('el error lleva tipo emision y donde fase (el orquestador lo vuelve error_definitivo)', () => {
    try {
      enTarificar().autorizarAceptar('tarificar')
      expect.unreachable()
    } catch (e) {
      expect((e as EmisionBloqueadaError).tipo).toBe('emision')
      expect((e as EmisionBloqueadaError).donde).toBe('fase')
    }
  })
})
