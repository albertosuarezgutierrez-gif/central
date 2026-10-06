// Registro de capacidades, formulario canónico y mapeo canónico → Allianz (07/10/2026).
import { describe, it, expect } from 'vitest'
import {
  CAPACIDAD_ALLIANZ_COMUNIDADES,
  catalogoCotizacion,
  crearCatalogo,
  prepararSolicitud,
  validarExtras,
  validarFormularioComunidad,
  type CapacidadCotizacion,
} from './capacidades.ts'

const HOY = new Date('2026-10-07T10:00:00Z')

const comun = () => ({
  ramo: 'comunidades',
  direccion: { via: 'Calle Feria', numero: '10', codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
  fechaEfecto: '2026-10-08',
  fechaTermino: '2027-10-08',
  m2Construidos: 1200,
  anioConstruccion: 1975,
  plantas: 5,
  numEdificios: 1,
  numViviendasYLocales: 20,
  capitalContinente: 1_500_000,
  ascensor: true,
})

const extrasAllianz = { tipoVivienda: 'Viviendas Pisos en Alto', uso: 'Habitual', listaPropietarios: '> 50%' }

describe('validarFormularioComunidad', () => {
  it('acepta el formulario común sin los desplegables del portal', () => {
    const v = validarFormularioComunidad(comun(), HOY)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.formulario.capitalContinente).toBe(1_500_000)
      // Lo no preguntado queda null («no se sabe»), nunca 0/false.
      expect(v.formulario.piscina).toBeNull()
      expect(v.formulario.capitalContenido).toBeNull()
    }
  })

  it('descarta las claves de una compañía aunque vengan', () => {
    const v = validarFormularioComunidad({ ...comun(), tipoVivienda: 'X', comision: 'A' }, HOY)
    expect(v.ok && 'tipoVivienda' in v.formulario).toBe(false)
    expect(v.ok && 'comision' in v.formulario).toBe(false)
  })

  it('exige los obligatorios comunes (capital de edificación, CP)', () => {
    const { capitalContinente: _c, ...sinCapital } = comun()
    const v = validarFormularioComunidad({ ...sinCapital, direccion: { ...comun().direccion, codigoPostal: '410' } }, HOY)
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.errores.some((e) => e.startsWith('capitalContinente'))).toBe(true)
      expect(v.errores.some((e) => e.includes('codigoPostal'))).toBe(true)
    }
  })

  it('rechaza una fecha de efecto ya pasada', () => {
    const v = validarFormularioComunidad({ ...comun(), fechaEfecto: '2026-10-01' }, HOY)
    expect(v.ok).toBe(false)
  })
})

describe('validarExtras', () => {
  it('obligatorio vacío → error con el nombre de la compañía', () => {
    const v = validarExtras(CAPACIDAD_ALLIANZ_COMUNIDADES, { tipoVivienda: ' ', uso: 'Habitual', listaPropietarios: '> 50%' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errores).toEqual(['Allianz · Tipo de vivienda: obligatorio'])
  })

  it('opción fuera de la lista cerrada → error; opcional vacío → null', () => {
    expect(validarExtras(CAPACIDAD_ALLIANZ_COMUNIDADES, { ...extrasAllianz, modalidad: 'premium' }).ok).toBe(false)
    const v = validarExtras(CAPACIDAD_ALLIANZ_COMUNIDADES, extrasAllianz)
    expect(v.ok && v.extras.modalidad).toBeNull()
  })
})

describe('catálogo de capacidades', () => {
  it('hoy: Allianz cotiza comunidades y nadie más', () => {
    const cat = catalogoCotizacion()
    expect(cat.ramos()).toEqual(['comunidades'])
    expect(cat.deRamo('comunidades').map((c) => c.compania)).toEqual(['allianz'])
    expect(cat.obtener(' Allianz ', 'Comunidades')?.nombre).toBe('Allianz')
    // Sin bot no se cae a «el de otra compañía».
    expect(cat.obtener('mapfre', 'comunidades')).toBeNull()
    expect(cat.obtener('allianz', 'hogar')).toBeNull()
  })

  it('un bot nuevo se añade registrándolo, sin tocar el formulario común', () => {
    const otro: CapacidadCotizacion = {
      compania: 'mapfre', nombre: 'Mapfre', ramo: 'comunidades', producto: 'Mapfre · Comunidades',
      extras: [{ clave: 'zona', etiqueta: 'Zona', tipo: 'entero', obligatorio: true }],
      validar: (_f, x) => ((x.zona as number) > 9 ? ['zona de 0 a 9'] : []),
      mapear: (f, x) => ({ ...f, tipoVivienda: 'Edificio', uso: 'Habitual', listaPropietarios: 'Sí', comision: String(x.zona) }),
    }
    const cat = crearCatalogo([CAPACIDAD_ALLIANZ_COMUNIDADES, otro])
    expect(cat.deRamo('comunidades').map((c) => c.nombre)).toEqual(['Allianz', 'Mapfre'])
    const ok = prepararSolicitud(cat, 'Mapfre', 'comunidades', comun(), { zona: '3' }, HOY)
    expect(ok.ok && ok.riesgo.comision).toBe('3')
    const mal = prepararSolicitud(cat, 'mapfre', 'comunidades', comun(), { zona: '12' }, HOY)
    expect(!mal.ok && mal.errores).toEqual(['Mapfre · zona de 0 a 9'])
  })

  it('rechaza duplicados, compañía no canónica y opción sin opciones', () => {
    const cat = catalogoCotizacion()
    expect(() => cat.registrar(CAPACIDAD_ALLIANZ_COMUNIDADES)).toThrow(/ya hay/)
    expect(() => cat.registrar({ ...CAPACIDAD_ALLIANZ_COMUNIDADES, compania: 'Allianz' })).toThrow(/canónica/)
    expect(() => crearCatalogo([{ ...CAPACIDAD_ALLIANZ_COMUNIDADES, extras: [{ clave: 'm', etiqueta: 'M', tipo: 'opcion', obligatorio: false }] }])).toThrow(/opciones/)
  })
})

describe('prepararSolicitud · mapeo canónico → Allianz', () => {
  it('común + extras → RiesgoComunidad válido para el worker', () => {
    const r = prepararSolicitud(catalogoCotizacion(), 'allianz', 'comunidades', comun(), { ...extrasAllianz, modalidad: 'estandar' }, HOY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.compania).toBe('allianz')
      expect(r.riesgo.tipoVivienda).toBe('Viviendas Pisos en Alto')
      expect(r.riesgo.uso).toBe('Habitual')
      expect(r.riesgo.listaPropietarios).toBe('> 50%')
      expect(r.riesgo.modalidad).toBe('estandar')
      expect(r.riesgo.capitalContinente).toBe(1_500_000)
      expect(r.riesgo.direccion.codigoPostal).toBe('41003')
      expect(r.riesgo.ascensor).toBe(true)
      expect(r.riesgo.piscina).toBeNull()
    }
  })

  it('sin los extras de Allianz no hay riesgo (todo o nada)', () => {
    const r = prepararSolicitud(catalogoCotizacion(), 'allianz', 'comunidades', comun(), {}, HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toHaveLength(3)
  })

  it('compañía sin bot para el ramo → error legible', () => {
    const r = prepararSolicitud(catalogoCotizacion(), 'Generali', 'comunidades', comun(), {}, HOY)
    expect(!r.ok && r.errores[0]).toMatch(/no hay bot/)
  })

  it('si el mapeo deja fuera un obligatorio del portal, la puerta final lo para', () => {
    const roto: CapacidadCotizacion = { ...CAPACIDAD_ALLIANZ_COMUNIDADES, mapear: (f) => ({ ...f }) }
    const r = prepararSolicitud(crearCatalogo([roto]), 'allianz', 'comunidades', comun(), extrasAllianz, HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.includes('tipoVivienda'))).toBe(true)
  })
})
