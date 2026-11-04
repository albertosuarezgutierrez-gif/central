// Pelayo (03/11/2026) · entradas del explorador: lista cerrada, explorables (0.3.36: ya no de solo lectura), sin avances ni excepciones de ningún tipo.
import { describe, expect, it } from 'vitest'
import { ENTRADAS_EXPLORACION, entradaConTomadorMediador, entradaSoloLectura, esEntradaExploracion, loginAsistidoDe, resolverDato, riesgoTomadorDeMediador, valoresSensiblesExploracion } from './index.ts'

const PELAYO = ['pelayo:presupuestos:auto', 'pelayo:presupuestos:hogar']

describe('Pelayo · entradas del explorador', () => {
  it('exactamente auto y hogar, casadas con su ramo', () => {
    expect(Object.keys(ENTRADAS_EXPLORACION).filter((k) => k.startsWith('pelayo:')).sort()).toEqual(PELAYO)
    expect(ENTRADAS_EXPLORACION['pelayo:presupuestos:auto']).toMatchObject({ compania: 'pelayo', ramo: 'auto', producto: 'auto' })
    expect(ENTRADAS_EXPLORACION['pelayo:presupuestos:hogar']).toMatchObject({ compania: 'pelayo', ramo: 'hogar', producto: 'hogar' })
  })
  it('explorables (no solo lectura), sin avances; excepciones solo las de Auto (wizard + «Nueva contratación»); sin login asistido', () => {
    for (const k of PELAYO) {
      const e = ENTRADAS_EXPLORACION[k]
      expect(esEntradaExploracion(k)).toBe(true)
      expect(e.soloLectura).toBeUndefined()
      expect(entradaSoloLectura(k)).toBe(false)
      expect([...e.avancesAutorizados]).toEqual([])
      expect(e.avancesPorId ?? []).toEqual([])
      expect(e.avancesSinTexto ?? []).toEqual([])
      expect(e.guardadosEnDialogo ?? []).toEqual([])
      expect(e.neutralizacionesOnclick ?? []).toEqual([])
      // 0.3.41: Auto tolera SOLO el wizard de apps.pelayo.com con restos exactos (pelayo-contratacion.test.ts); Hogar, nada.
      expect((e.rutasAppTolerables ?? []).map((r) => r.origen)).toEqual(k.endsWith(':auto') ? ['https://apps.pelayo.com'] : [])
      expect(e.nuevaContratacionPelayo).toBe(k.endsWith(':auto') ? true : undefined)
      // 0.3.41: la primera pantalla es «Datos del Tomador» (NIF obligatorio): tomador = el MEDIADOR (solo sintético).
      expect(e.tomadorMediador).toBe(true)
      expect(entradaConTomadorMediador(k)).toBe(true)
      expect(loginAsistidoDe(k)).toBeNull()
      expect(k).toMatch(/^[a-z_]+:[a-z_]+:[a-z_]+$/)
    }
  })
  it('ninguna entrada es de solo lectura hoy; una desconocida tampoco', () => {
    expect(Object.keys(ENTRADAS_EXPLORACION).filter(entradaSoloLectura)).toEqual([])
    expect(entradaSoloLectura('pelayo:presupuestos:vida')).toBe(false)
    expect(entradaSoloLectura('__proto__')).toBe(false)
  })

  // Identidad de MENTIRA (el mapeo es el mismo que con `MEDIADOR`; los datos reales no se escriben en tests).
  const ID = { nombre: 'Nombre Uno Dos', nif: 'NIF-FALSO', fechaNacimiento: '1970-02-03', telefono: '+34 600 000 000', email: 'prueba@ejemplo.test' }
  const ctx = (ramo: string, riesgo: unknown, env: Record<string, string | undefined> = {}) => ({ ramo, conDatosReales: false, tomadorMediador: true, riesgo, env, hoy: new Date('2026-11-04T10:00:00Z') })
  it('0.3.41: con la marca, «Datos del Tomador» sale del riesgo del mediador en AUTO (NIF por documentoIdentidad) y en HOGAR', () => {
    const r = riesgoTomadorDeMediador(ID)
    for (const ramo of ['auto', 'hogar']) {
      expect(resolverDato('tomador.nif', ctx(ramo, r)), ramo).toEqual({ ok: true, valor: 'NIF-FALSO' })
      expect(resolverDato('tomador.nombre', ctx(ramo, r)), ramo).toEqual({ ok: true, valor: 'Nombre' })
      expect(resolverDato('tomador.apellido1', ctx(ramo, r)), ramo).toEqual({ ok: true, valor: 'Uno' })
      expect(resolverDato('tomador.apellido2', ctx(ramo, r)), ramo).toEqual({ ok: true, valor: 'Dos' })
      // Contacto: el del MEDIADOR (9 dígitos nacionales) antes que el de entorno.
      expect(resolverDato('contacto.telefono', ctx(ramo, r, { TARIFICADOR_EXPLORADOR_TELEFONO: '611111111' })), ramo).toEqual({ ok: true, valor: '600000000' })
      expect(resolverDato('contacto.email', ctx(ramo, r)), ramo).toEqual({ ok: true, valor: 'prueba@ejemplo.test' })
      // Sin riesgo (`{}`, el del trabajo de pilotaje) el NIF PARA: nada inventado.
      expect(resolverDato('tomador.nif', ctx(ramo, {})), ramo).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
      expect(resolverDato('contacto.telefono', ctx(ramo, {}, { TARIFICADOR_EXPLORADOR_TELEFONO: '611111111' })), ramo).toEqual({ ok: true, valor: '611111111' })
    }
  })
  it('0.3.41: los valores a redactar con la marca incluyen NIF, nombre, apellidos, teléfono y correo del mediador', () => {
    const v = valoresSensiblesExploracion({ conDatosReales: false, riesgo: riesgoTomadorDeMediador(ID), env: {}, tomadorMediador: true })
    for (const x of ['NIF-FALSO', 'Nombre', 'Uno', 'Dos', 'Nombre Uno Dos', '600000000', 'prueba@ejemplo.test', '03/02/1970']) expect(v, x).toContain(x)
  })
})
