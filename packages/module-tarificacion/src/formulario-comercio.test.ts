// Formulario canónico de Comercio, catálogo de garantías y ramo `comercio` sin compañías (08/10/2026).
import { describe, it, expect } from 'vitest'
import { validarFormularioComercio } from './formulario-comercio.ts'
import { catalogoCotizacion, prepararSolicitud } from './capacidades.ts'
import { CATALOGO_FICHAS, RAMOS_FICHA, claveDeLiteral, esRamoFicha, garantiaFicha, garantiasFicha, normalizarLiteral } from './fichas-catalogo.ts'
import { compararOfertas } from './comparador-fichas.ts'

const HOY = new Date('2026-10-08T10:00:00Z')
const base = () => ({
  cnae: '4771',
  regimen: 'alquiler',
  codigoPostal: '41003',
  superficieM2: 80,
  capitalContenidoEur: 30_000,
  numEmpleados: 2,
})
const errDe = (entrada: unknown, prefijo: string) => {
  const v = validarFormularioComercio(entrada, HOY)
  return !v.ok && v.errores.some((e) => e.startsWith(prefijo))
}

describe('validarFormularioComercio', () => {
  it('acepta lo mínimo y deja lo no preguntado en null (nunca 0/false)', () => {
    const v = validarFormularioComercio(base(), HOY)
    expect(v.ok).toBe(true)
    if (v.ok) {
      const f = v.formulario
      expect(f.ramo).toBe('comercio')
      for (const k of ['actividadDescripcion', 'poblacion', 'direccion', 'anioConstruccion', 'capitalContinenteEur', 'capitalExistenciasEur', 'tieneEscaparates', 'tieneRotulos', 'alarmaConectada', 'rejasOCierreMetalico', 'limiteRcExplotacionEur', 'facturacionAnualEur'] as const) {
        expect(f[k]).toBeNull()
      }
    }
  })

  it('propietario completo con redondeo a céntimos y claves ajenas descartadas', () => {
    const v = validarFormularioComercio({
      ...base(), regimen: 'propiedad', capitalContinenteEur: 120_000.456, capitalExistenciasEur: 15_000, poblacion: ' Sevilla ',
      direccion: 'C/ Sierpes 1', anioConstruccion: 1985, tieneEscaparates: true, tieneRotulos: false, alarmaConectada: true,
      rejasOCierreMetalico: false, limiteRcExplotacionEur: 300_000, facturacionAnualEur: 180_000, comision: 'A',
    }, HOY)
    expect(v.ok && v.formulario.capitalContinenteEur).toBe(120_000.46)
    expect(v.ok && v.formulario.poblacion).toBe('Sevilla')
    expect(v.ok && v.formulario.tieneRotulos).toBe(false)
    expect(v.ok && 'comision' in v.formulario).toBe(false)
  })

  it('exige actividad, régimen, CP, superficie y empleados', () => {
    const v = validarFormularioComercio({}, HOY)
    expect(v.ok).toBe(false)
    if (!v.ok) for (const campo of ['actividad', 'regimen', 'codigoPostal', 'superficieM2', 'numEmpleados']) expect(v.errores.some((e) => e.startsWith(campo))).toBe(true)
  })

  it('CNAE: normaliza «47.71», acepta descripción sola y rechaza mal formado', () => {
    const a = validarFormularioComercio({ ...base(), cnae: '47.71' }, HOY)
    expect(a.ok && a.formulario.cnae).toBe('4771')
    const { cnae: _c, ...sin } = base()
    const b = validarFormularioComercio({ ...sin, actividadDescripcion: 'Tienda de ropa' }, HOY)
    expect(b.ok && b.formulario.cnae).toBeNull()
    expect(errDe({ ...base(), cnae: 'ABC' }, 'cnae')).toBe(true)
  })

  it('CP: 5 dígitos y provincia 01-52; acepta número con cero perdido', () => {
    for (const cp of ['4100', '99999', '00123', 'abcde', '41 003']) expect(errDe({ ...base(), codigoPostal: cp }, 'codigoPostal')).toBe(true)
    const v = validarFormularioComercio({ ...base(), codigoPostal: 1001 }, HOY)
    expect(v.ok && v.formulario.codigoPostal).toBe('01001')
  })

  it('superficie 0, negativa, en texto o absurda se rechaza', () => {
    for (const s of [0, -5, '80', 100_001]) expect(errDe({ ...base(), superficieM2: s }, 'superficieM2')).toBe(true)
  })

  it('año de construcción dentro de rango (no futuro lejano)', () => {
    expect(errDe({ ...base(), anioConstruccion: 1200 }, 'anioConstruccion')).toBe(true)
    expect(errDe({ ...base(), anioConstruccion: 2040 }, 'anioConstruccion')).toBe(true)
    expect(validarFormularioComercio({ ...base(), anioConstruccion: 2027 }, HOY).ok).toBe(true)
  })

  it('null ≠ 0: 0 empleados y 0 existencias son datos; empleados ausente es error', () => {
    const v = validarFormularioComercio({ ...base(), numEmpleados: 0, capitalExistenciasEur: 0 }, HOY)
    expect(v.ok && v.formulario.numEmpleados).toBe(0)
    expect(v.ok && v.formulario.capitalExistenciasEur).toBe(0)
    const { numEmpleados: _n, ...sin } = base()
    expect(errDe(sin, 'numEmpleados')).toBe(true)
    const nulos = validarFormularioComercio({ ...base(), capitalExistenciasEur: null, alarmaConectada: null }, HOY)
    expect(nulos.ok && nulos.formulario.capitalExistenciasEur).toBeNull()
    expect(nulos.ok && nulos.formulario.alarmaConectada).toBeNull()
  })

  it('false es un dato distinto de «no consta»; un booleano en texto se rechaza', () => {
    const v = validarFormularioComercio({ ...base(), alarmaConectada: false, rejasOCierreMetalico: true }, HOY)
    expect(v.ok && v.formulario.alarmaConectada).toBe(false)
    expect(v.ok && v.formulario.rejasOCierreMetalico).toBe(true)
    expect(errDe({ ...base(), alarmaConectada: 'si' }, 'alarmaConectada')).toBe(true)
  })

  it('contradicciones: propietario sin continente, capital de contenido 0, sin ningún capital', () => {
    expect(errDe({ ...base(), regimen: 'propiedad' }, 'capitalContinenteEur')).toBe(true)
    expect(errDe({ ...base(), capitalContenidoEur: 0 }, 'capitalContenidoEur')).toBe(true)
    const { capitalContenidoEur: _c, ...sin } = base()
    expect(errDe(sin, 'capitales')).toBe(true)
    // Inquilino sin continente pero con existencias: válido.
    expect(validarFormularioComercio({ ...sin, capitalExistenciasEur: 5000 }, HOY).ok).toBe(true)
    // Con 0 existencias no cuenta como capital.
    expect(errDe({ ...sin, capitalExistenciasEur: 0 }, 'capitales')).toBe(true)
  })

  it('rechaza régimen desconocido, importes en texto y lo que no es un objeto', () => {
    expect(errDe({ ...base(), regimen: 'usufructo' }, 'regimen')).toBe(true)
    expect(errDe({ ...base(), capitalContenidoEur: '30.000' }, 'capitalContenidoEur')).toBe(true)
    expect(validarFormularioComercio(null, HOY).ok).toBe(false)
    expect(validarFormularioComercio([], HOY).ok).toBe(false)
  })
})

describe('catálogo de garantías Comercio', () => {
  it('comercio es un ramo de ficha, con claves únicas en slug y sinónimos normalizados', () => {
    expect(esRamoFicha('comercio')).toBe(true)
    expect(RAMOS_FICHA).toContain('comercio')
    const gars = CATALOGO_FICHAS.comercio
    const claves = gars.map((g) => g.clave)
    expect(new Set(claves).size).toBe(claves.length)
    for (const g of gars) {
      expect(g.clave).toMatch(/^[a-z][a-z0-9_]*$/)
      for (const s of g.sinonimos) expect(normalizarLiteral(s)).toBe(s)
    }
    for (const k of ['incendio', 'danos_agua', 'robo_continente', 'robo_contenido', 'expoliacion', 'rotura_cristales', 'rotulos', 'danos_electricos', 'averia_maquinaria', 'perdida_beneficios', 'bienes_refrigerados', 'rc_explotacion', 'rc_patronal', 'rc_locativa', 'defensa_juridica', 'asistencia', 'franquicia_general']) {
      expect(garantiaFicha('comercio', k)).not.toBeNull()
    }
    for (const k of ['continente', 'contenido', 'existencias']) expect(garantiaFicha('comercio', k)?.tipoValor).toBe('capital')
  })

  it('casa literales de compañía con la clave correcta', () => {
    expect(claveDeLiteral('comercio', 'Robo del contenido')).toBe('robo_contenido')
    expect(claveDeLiteral('comercio', 'Expoliación')).toBe('expoliacion')
    expect(claveDeLiteral('comercio', 'Rótulos y letreros luminosos')).toBe('rotulos')
    expect(claveDeLiteral('comercio', 'Pérdida de beneficios')).toBe('perdida_beneficios')
    expect(claveDeLiteral('comercio', 'Bienes refrigerados')).toBe('bienes_refrigerados')
    expect(claveDeLiteral('comercio', 'RC Patronal')).toBe('rc_patronal')
    expect(claveDeLiteral('comercio', 'Cobertura de jardinería exótica')).toBeNull()
  })

  it('no contamina comunidades ni rc', () => {
    expect(garantiasFicha('comunidades').some((g) => g.clave === 'perdida_beneficios')).toBe(false)
    expect(garantiasFicha('rc').some((g) => g.clave === 'rotulos')).toBe(false)
    expect(claveDeLiteral('comunidades', 'Rótulos')).toBeNull()
  })
})

describe('ramo comercio sin compañías', () => {
  it('el registro devuelve lista vacía para comercio y no toca comunidades', () => {
    const cat = catalogoCotizacion()
    expect(cat.deRamo('comercio')).toEqual([])
    expect(cat.obtener('allianz', 'comercio')).toBeNull()
    expect(cat.ramos()).toEqual(['comunidades'])
  })

  it('preparar una solicitud de comercio falla cerrado, sin lanzar', () => {
    const r = prepararSolicitud(catalogoCotizacion(), 'allianz', 'comercio', base(), {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0]).toContain('no hay bot para el ramo «comercio»')
  })

  it('el comparador sin fichas no explota y con una oferta vacía no afirma nada', () => {
    expect(compararOfertas([], [])).toMatchObject({ ramo: '', columnas: [], filas: [] })
    const t = compararOfertas([], [{ id: 'o1', compania: 'Allianz', ramo: 'comercio', producto: 'Negocio', version: null, presupuesto: { primaTotalEur: null, capitales: {} } as never }])
    expect(t.ramo).toBe('comercio')
    expect(t.filas.length).toBe(garantiasFicha('comercio').length)
    expect(t.filas.every((f) => f.celdas.every((c) => !c.consta))).toBe(true)
  })
})
