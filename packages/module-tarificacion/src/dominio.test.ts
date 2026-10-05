import { describe, it, expect } from 'vitest'
import {
  ESTADOS_TRABAJO,
  MAX_INTENTOS,
  estadoTrasError,
  puedeReintentar,
  puedeTransitar,
  validarRiesgoComunidad,
  validarOfertas,
  franquiciaGeneral,
  garantiasComoRegistro,
  crearRegistro,
  claveCompania,
  type TarificadorAdapter,
} from './index.ts'

describe('transiciones', () => {
  it('el camino feliz y los de error', () => {
    expect(puedeTransitar('pendiente', 'en_curso')).toBe(true)
    expect(puedeTransitar('en_curso', 'ok')).toBe(true)
    expect(puedeTransitar('en_curso', 'requiere_humano')).toBe(true)
    expect(puedeTransitar('error_reintentable', 'pendiente')).toBe(true)
  })
  it('los terminales no se mueven (salvo requiere_humano → cancelado)', () => {
    for (const a of ESTADOS_TRABAJO) {
      expect(puedeTransitar('ok', a)).toBe(false)
      expect(puedeTransitar('error_definitivo', a)).toBe(false)
      expect(puedeTransitar('cancelado', a)).toBe(false)
    }
    expect(puedeTransitar('requiere_humano', 'pendiente')).toBe(false)
    expect(puedeTransitar('requiere_humano', 'cancelado')).toBe(true)
  })
  it('no se salta en_curso ni acepta estados inventados', () => {
    expect(puedeTransitar('pendiente', 'ok')).toBe(false)
    expect(puedeTransitar('en_curso', 'pendiente')).toBe(false)
    expect(puedeTransitar('pendiente', 'hecho')).toBe(false)
    expect(puedeTransitar(null, 'en_curso')).toBe(false)
  })
})

describe('política de reintento: UNO solo, solo infra', () => {
  it('MAX_INTENTOS es 2 (el primero + uno)', () => expect(MAX_INTENTOS).toBe(2))
  it('infra en el primer intento → reintentable; en el segundo → definitivo', () => {
    expect(estadoTrasError('infra', 1)).toBe('error_reintentable')
    expect(estadoTrasError('infra', 2)).toBe('error_definitivo')
  })
  it.each(['portal', 'credenciales', 'datos', 'emision', 'loquesea', undefined])('%s nunca se reintenta', (t) => {
    expect(estadoTrasError(t, 1)).toBe('error_definitivo')
  })
  it('captcha → requiere_humano, siempre', () => {
    expect(estadoTrasError('captcha', 1)).toBe('requiere_humano')
    expect(estadoTrasError('captcha', 2)).toBe('requiere_humano')
  })
  it('puedeReintentar solo desde error_reintentable y bajo el tope', () => {
    expect(puedeReintentar('error_reintentable', 1)).toBe(true)
    expect(puedeReintentar('error_reintentable', 2)).toBe(false)
    expect(puedeReintentar('error_definitivo', 0)).toBe(false)
    expect(puedeReintentar('error_reintentable', -1)).toBe(false)
    expect(puedeReintentar('error_reintentable', 1.5)).toBe(false)
  })
})

describe('riesgo de comunidad', () => {
  const hoy = new Date('2026-10-05T10:00:00Z')
  const base = {
    direccion: { via: 'Calle Feria', numero: '12', codigoPostal: '41003', municipio: 'Sevilla' },
    anioConstruccion: 1975,
    m2Construidos: 1800,
    numViviendas: 16,
    plantas: 5,
  }
  it('lo que no viene queda null (no 0, no false)', () => {
    const r = validarRiesgoComunidad(base, hoy)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.riesgo.ascensor).toBeNull()
    expect(r.riesgo.numLocales).toBeNull()
    expect(r.riesgo.capitalContenido).toBeNull()
    expect(r.riesgo.siniestrosUltimos3Anios).toBeNull()
  })
  it('un valor presente pero inválido es error, no se convierte en null', () => {
    const r = validarRiesgoComunidad({ ...base, numViviendas: 'muchas', ascensor: 'si' }, hoy)
    expect(r.ok).toBe(false)
  })
  it('exige CP de 5 dígitos y algo con que dimensionar', () => {
    expect(validarRiesgoComunidad({ ...base, direccion: { via: 'x', codigoPostal: '4100' } }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, m2Construidos: undefined }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, m2Construidos: undefined, capitalContinente: 1_500_000 }, hoy).ok).toBe(true)
  })
  it('una fecha de efecto pasada no se tarifica', () => {
    expect(validarRiesgoComunidad({ ...base, fechaEfecto: '2026-10-01' }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, fechaEfecto: '2026-11-01' }, hoy).ok).toBe(true)
  })
})

describe('ofertas', () => {
  const oferta = {
    compania: 'Allianz',
    producto: 'Comunidades Plus',
    primaAnualEur: 1234.567,
    fraccionamiento: 'anual',
    coberturas: [
      { clave: 'danos_agua', literal: 'Daños por agua', estado: 'incluida', limite: 3000 },
      { literal: 'Responsabilidad civil', capital: 600000 },
      { literal: '' },
    ],
    franquicias: [{ ambito: 'general', importeEur: 150 }, { ambito: 'danos_agua', literal: '10%' }, { ambito: 'x' }],
    pdf: { indice: 0, nombre: 'proyecto.pdf' },
  }
  it('valida, redondea y conserva null donde no hay dato', () => {
    const r = validarOfertas([oferta], 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const o = r.ofertas[0]
    expect(o.primaAnualEur).toBe(1234.57)
    expect(o.primaNetaEur).toBeNull()
    expect(o.validaHasta).toBeNull()
    expect(o.coberturas).toHaveLength(2)
    expect(o.coberturas[1].clave).toBe('Responsabilidad civil')
    expect(o.franquicias).toHaveLength(2)
    expect(franquiciaGeneral(o)).toBe(150)
  })
  it('sin prima, sin ofertas o con PDF inexistente es error', () => {
    expect(validarOfertas([{ ...oferta, primaAnualEur: 0 }], 1).ok).toBe(false)
    expect(validarOfertas([], 0).ok).toBe(false)
    expect(validarOfertas([oferta], 0).ok).toBe(false)
  })
  it('franquicia general no declarada = null, nunca 0', () => {
    const r = validarOfertas([{ ...oferta, franquicias: [] }], 1)
    expect(r.ok && franquiciaGeneral(r.ofertas[0])).toBeNull()
  })
  it('garantías con la forma del modelo de ofertas (PR #4305)', () => {
    const r = validarOfertas([oferta], 1)
    if (!r.ok) throw new Error('debería validar')
    const g = garantiasComoRegistro(r.ofertas[0])
    expect(g.danos_agua).toMatchObject({ estado: 'incluida', limite: 3000, capital: null })
    expect(g['Responsabilidad civil'].estado).toBeNull()
  })
})

describe('registro de adaptadores', () => {
  const a: TarificadorAdapter = { compania: 'Allianz', ramo: 'comunidades', tarificar: async () => ({ ofertas: [] }) }
  it('casa por compañía normalizada y ramo; lo que no hay es null', () => {
    const r = crearRegistro()
    r.registrar(a)
    expect(r.obtener(' ALLIANZ ', 'comunidades')).toBe(a)
    expect(r.obtener('Mapfre', 'comunidades')).toBeNull()
    expect(r.obtener('Allianz', 'hogar')).toBeNull()
    expect(() => r.registrar(a)).toThrow(/ya hay/)
    expect(claveCompania('Mútua  Madrileña')).toBe('mutua madrilena')
  })
})
