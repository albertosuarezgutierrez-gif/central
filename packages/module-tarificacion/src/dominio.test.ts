import { describe, it, expect } from 'vitest'
import {
  ESTADOS_TRABAJO,
  MAX_INTENTOS,
  estadoTrasError,
  puedeReintentar,
  puedeTransitar,
  validarRiesgoComunidad,
  validarOfertas,
  importeEs,
  importePuntoDecimal,
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

describe('riesgo de comunidad (formulario ePAC «Comunidades 2020»)', () => {
  const hoy = new Date('2026-10-05T10:00:00Z')
  const base = {
    direccion: { codigoPostal: '41003', municipio: 'Sevilla' },
    fechaEfecto: '2026-10-05',
    fechaTermino: '2027-10-01',
    m2Construidos: 1800,
    anioConstruccion: 1975,
    tipoVivienda: 'Viviendas Pisos en Alto',
    uso: 'Habitual',
    plantas: 5,
    numEdificios: 1,
    numViviendasYLocales: 18,
    listaPropietarios: '> 50%',
    capitalContinente: 1_500_000,
  }
  it('con solo los obligatorios (*) valida y el resto queda null (no 0, no false)', () => {
    const r = validarRiesgoComunidad(base, hoy)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.riesgo.direccion.via).toBeNull()
    expect(r.riesgo.ascensor).toBeNull()
    expect(r.riesgo.anioRehabilitacion).toBeNull()
    expect(r.riesgo.sotanos).toBeNull()
    expect(r.riesgo.plantasBajoRasante).toBeNull()
    expect(r.riesgo.instalacionesAnexas).toBeNull()
    expect(r.riesgo.asistenciaPlagas).toBeNull()
    expect(r.riesgo.capitalContenido).toBeNull()
    expect(r.riesgo.polizaAReemplazar).toBeNull()
  })
  it.each([
    'fechaEfecto', 'fechaTermino', 'm2Construidos', 'anioConstruccion', 'tipoVivienda', 'uso',
    'plantas', 'numEdificios', 'numViviendasYLocales', 'listaPropietarios', 'capitalContinente',
  ])('falta el obligatorio %s → error', (campo) => {
    const r = validarRiesgoComunidad({ ...base, [campo]: undefined }, hoy)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toContain(campo)
  })
  it('falta el CP (C.P. *) → error', () => {
    expect(validarRiesgoComunidad({ ...base, direccion: {} }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, direccion: { codigoPostal: '4100' } }, hoy).ok).toBe(false)
  })
  it('un select vacío no cuenta como dato', () => {
    expect(validarRiesgoComunidad({ ...base, tipoVivienda: '  ' }, hoy).ok).toBe(false)
  })
  it('nº viviendas y locales: dado, o suma si vienen los dos; con solo uno NO se inventa', () => {
    const sin = { ...base, numViviendasYLocales: undefined }
    const suma = validarRiesgoComunidad({ ...sin, numViviendas: 16, numLocales: 2 }, hoy)
    expect(suma.ok && suma.riesgo.numViviendasYLocales).toBe(18)
    expect(validarRiesgoComunidad({ ...sin, numViviendas: 16 }, hoy).ok).toBe(false)
  })
  it('un valor presente pero inválido es error, no se convierte en null', () => {
    expect(validarRiesgoComunidad({ ...base, numEdificios: 'muchos' }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, instalacionesAnexas: 'si' }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, ite: 1 }, hoy).ok).toBe(false)
  })
  it('opcionales de ePAC se conservan cuando vienen', () => {
    const r = validarRiesgoComunidad(
      { ...base, anioRehabilitacion: 2005, sotanos: 1, plantasBajoRasante: 2, instalacionesAnexas: true, asistenciaPlagas: false, capitalContinente: 1_500_000, contiguos: 'x' },
      hoy,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.riesgo).toMatchObject({ anioRehabilitacion: 2005, sotanos: 1, plantasBajoRasante: 2, instalacionesAnexas: true, asistenciaPlagas: false, capitalContinente: 1_500_000, contiguos: 'x' })
  })
  it('fechas: efecto no pasada, término posterior al efecto, formato ISO', () => {
    expect(validarRiesgoComunidad({ ...base, fechaEfecto: '2026-10-01' }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, fechaEfecto: '2026-11-01', fechaTermino: '2026-11-01' }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, fechaTermino: '01/10/2027' }, hoy).ok).toBe(false)
    expect(validarRiesgoComunidad({ ...base, fechaEfecto: '2026-11-01', fechaTermino: '2027-11-01' }, hoy).ok).toBe(true)
  })
})

describe('importeEs (formato español)', () => {
  it.each([
    ['12.000,00', 12000], ['347,55', 347.55], ['300.000,00', 300000], ['250', 250], ['600,00 €', 600],
    ['1.234', 1234], ['1.234.567,89', 1234567.89], ['-5,5', -5.5], ['0,00', 0],
  ])('«%s» → %s', (t, n) => expect(importeEs(t)).toBe(n))
  it.each(['', '  ', 'Incluida', 'Excluida', '1,2,3', '12.5', '1.23.456', 'abc 12', '12,', null, undefined])('«%s» → null', (t) => {
    expect(importeEs(t as string)).toBeNull()
  })
})

describe('importePuntoDecimal (pestaña Tarificar de ePAC)', () => {
  it.each([['296.71', 296.71], ['343.74', 343.74], ['300.00', 300], ['47.55', 47.55], ['1234.5', 1234.5], ['250', 250]])(
    '«%s» → %s',
    (t, n) => expect(importePuntoDecimal(t)).toBe(n),
  )
  it.each(['', 'Incluida', '1,5', '1.234,56', '12.345.6', '1.234.567', '-', null, undefined])('«%s» → null', (t) => {
    expect(importePuntoDecimal(t as string)).toBeNull()
  })
  it('no rompe importeEs: «296.71» no es un importe español', () => {
    expect(importeEs('296.71')).toBeNull()
    expect(importeEs('12.000,00')).toBe(12000)
  })
})

describe('modalidad del riesgo', () => {
  const hoy = new Date('2026-10-05T10:00:00Z')
  const base = {
    direccion: { codigoPostal: '41003' }, fechaEfecto: '2026-10-05', fechaTermino: '2027-10-01', m2Construidos: 1800, anioConstruccion: 1975,
    tipoVivienda: 'Viviendas Pisos en Alto', uso: 'Habitual', plantas: 5, numEdificios: 1, numViviendasYLocales: 18, listaPropietarios: '> 50%', capitalContinente: 1_500_000,
  }
  it('ausente → null (el adaptador usa estandar); valores válidos pasan; otros, error', () => {
    const r = validarRiesgoComunidad(base, hoy)
    expect(r.ok && r.riesgo.modalidad).toBeNull()
    const p = validarRiesgoComunidad({ ...base, modalidad: 'personalizado' }, hoy)
    expect(p.ok && p.riesgo.modalidad).toBe('personalizado')
    expect(validarRiesgoComunidad({ ...base, modalidad: 'ambas' }, hoy).ok).toBe(false)
  })
  it('opciones (variantes): ausente → null (apagado); booleano pasa; otra cosa, error', () => {
    const r = validarRiesgoComunidad(base, hoy)
    expect(r.ok && r.riesgo.opciones).toBeNull()
    const s = validarRiesgoComunidad({ ...base, opciones: true }, hoy)
    expect(s.ok && s.riesgo.opciones).toBe(true)
    expect(validarRiesgoComunidad({ ...base, opciones: 'si' }, hoy).ok).toBe(false)
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
  it('fecha de término del portal: ISO válida pasa; ausente o mal formada = null', () => {
    const r = validarOfertas([{ ...oferta, fechaTerminoPortal: '2027-10-01' }], 1)
    expect(r.ok && r.ofertas[0].fechaTerminoPortal).toBe('2027-10-01')
    const s = validarOfertas([oferta], 1)
    expect(s.ok && s.ofertas[0].fechaTerminoPortal).toBeNull()
    const t = validarOfertas([{ ...oferta, fechaTerminoPortal: '01/10/2027' }], 1)
    expect(t.ok && t.ofertas[0].fechaTerminoPortal).toBeNull()
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
