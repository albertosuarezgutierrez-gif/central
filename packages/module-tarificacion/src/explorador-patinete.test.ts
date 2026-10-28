// Cepos de las exploraciones de PATINETE (28/10/2026): tomador = el MEDIADOR, solo en las dos entradas de patinete.
// Los datos del mediador NO viven aquí (ni en el módulo): asegura los pone en `riesgo.tomador` desde `MEDIADOR`
// (`apps/asegura/lib/tarificador-explorador-mediador.test.ts` prueba que salen de `MEDIADOR` y que no hay literales).
// Fixtures SINTÉTICAS: un NIF y una fecha inventados, claramente de prueba.
import { describe, it, expect } from 'vitest'
import { CATALOGO_EXPLORACION, ENTRADAS_EXPLORACION, entradaConTomadorMediador, esAvanceAutorizado, resolverDato } from './index.ts'

const ENTRADAS_PATINETE = ['allianz:autos:movilidad_personal', 'mapfre:automoviles:patinetes']
const RIESGO = { tomador: { nif: 'NIF-SINTETICO', nombre: 'Nombre', apellido1: 'Uno', apellido2: 'Dos', nombreCompleto: 'Nombre Uno Dos', fechaNacimiento: '1970-02-03' } }
const ctx = (ramo: string, tomadorMediador: boolean, riesgo: unknown = RIESGO) =>
  ({ ramo, conDatosReales: false, tomadorMediador, riesgo, env: {}, hoy: new Date('2026-10-28T10:00:00Z') })

describe('exploraciones de patinete: tomador = mediador', () => {
  it('SOLO las dos entradas de patinete (y de ramo patinete) llevan tomadorMediador', () => {
    const con = Object.entries(ENTRADAS_EXPLORACION).filter(([, e]) => e.tomadorMediador).map(([k]) => k).sort()
    expect(con).toEqual([...ENTRADAS_PATINETE].sort())
    for (const k of ENTRADAS_PATINETE) {
      expect(ENTRADAS_EXPLORACION[k].ramo).toBe('patinete')
      expect(entradaConTomadorMediador(k)).toBe(true)
    }
    for (const k of Object.keys(ENTRADAS_EXPLORACION).filter((x) => !ENTRADAS_PATINETE.includes(x))) expect(entradaConTomadorMediador(k), k).toBe(false)
    expect(entradaConTomadorMediador('no:existe:x')).toBe(false)
  })

  it('con la marca, tomador.* sale de riesgo.tomador (la fecha ISO, en dd/mm/aaaa)', () => {
    expect(resolverDato('tomador.nif', ctx('patinete', true))).toEqual({ ok: true, valor: RIESGO.tomador.nif })
    expect(resolverDato('tomador.nombre', ctx('patinete', true))).toEqual({ ok: true, valor: 'Nombre' })
    expect(resolverDato('tomador.apellido1', ctx('patinete', true))).toEqual({ ok: true, valor: 'Uno' })
    expect(resolverDato('tomador.nombre_completo', ctx('patinete', true))).toEqual({ ok: true, valor: 'Nombre Uno Dos' })
    expect(resolverDato('tomador.fecha_nacimiento', ctx('patinete', true))).toEqual({ ok: true, valor: '03/02/1970' })
  })

  it('un dato que falta en riesgo.tomador PARA (dato_sensible_requerido): nada inventado ni el valor de prueba', () => {
    const sinFecha = { tomador: { nif: 'NIF-SINTETICO' } }
    expect(resolverDato('tomador.fecha_nacimiento', ctx('patinete', true, sinFecha))).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
    expect(resolverDato('tomador.nif', ctx('patinete', true, {}))).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
    expect(resolverDato('tomador.nif', ctx('patinete', true, null))).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
  })

  it('SIN la marca el NIF no se resuelve nunca, aunque el riesgo traiga un tomador (ni en patinete ni en ningún ramo)', () => {
    for (const ramo of Object.keys(CATALOGO_EXPLORACION)) {
      expect(resolverDato('tomador.nif', ctx(ramo, false)), ramo).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
    }
  })

  it('el catálogo NO lleva ningún NIF de prueba escrito: tomador.nif no tiene valor sintético en ningún ramo', () => {
    for (const [ramo, datos] of Object.entries(CATALOGO_EXPLORACION)) {
      for (const d of datos.filter((x) => x.clave === 'tomador.nif')) expect(d.sintetico, ramo).toBeUndefined()
    }
  })

  it('Allianz: UN solo avance autorizado, el «Aceptar» de Datos Básicos; Mapfre: ninguno', () => {
    expect(ENTRADAS_EXPLORACION['allianz:autos:movilidad_personal'].avancesAutorizados).toHaveLength(1)
    expect(ENTRADAS_EXPLORACION['mapfre:automoviles:patinetes'].avancesAutorizados).toHaveLength(0)
    const aceptar = { tag: 'button', texto: 'Aceptar' } as never
    const en = (t: string) => ({ titulos: [], titulosPantalla: [t] }) as never
    expect(esAvanceAutorizado('allianz:autos:movilidad_personal', aceptar, en('Datos Básicos – Figuras Intervinientes'))).toBe(true)
    for (const t of ['Tarificar', 'Revisión y emisión', 'Contratación', 'Forma de pago']) expect(esAvanceAutorizado('allianz:autos:movilidad_personal', aceptar, en(t)), t).toBe(false)
    expect(esAvanceAutorizado('mapfre:automoviles:patinetes', aceptar, en('Datos Básicos'))).toBe(false)
  })
})
