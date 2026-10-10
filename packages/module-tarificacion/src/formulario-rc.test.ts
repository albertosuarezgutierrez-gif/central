// Formulario canónico de RC, catálogo de garantías RC y ramo `rc` sin compañías (08/10/2026).
import { describe, it, expect } from 'vitest'
import { validarFormularioRC, normalizarCnae } from './formulario-rc.ts'
import { catalogoCotizacion, prepararSolicitud } from './capacidades.ts'
import { CATALOGO_FICHAS, claveDeLiteral, esRamoFicha, garantiaFicha, garantiasFicha, normalizarLiteral } from './fichas-catalogo.ts'
import { compararOfertas } from './comparador-fichas.ts'

const base = () => ({
  cnae: '5610',
  facturacionAnualEur: 250_000,
  numEmpleados: 4,
  limiteIndemnizacionEur: 600_000,
  ambitoTerritorial: 'espana',
})

describe('validarFormularioRC', () => {
  it('acepta lo mínimo y deja lo no preguntado en null (nunca 0/false)', () => {
    const v = validarFormularioRC(base())
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.formulario.ramo).toBe('rc')
      expect(v.formulario.actividadDescripcion).toBeNull()
      expect(v.formulario.superficieLocalM2).toBeNull()
      expect(v.formulario.quiereRcPatronal).toBeNull()
      expect(v.formulario.quiereRcProductosPostTrabajos).toBeNull()
      expect(v.formulario.quiereRcLocativa).toBeNull()
      expect(v.formulario.siniestrosUltimos3Anios).toBeNull()
      expect(v.formulario.importeSiniestrosUltimos3AniosEur).toBeNull()
    }
  })

  it('acepta descripción en vez de CNAE y normaliza «56.10»', () => {
    const { cnae: _c, ...sinCnae } = base()
    const a = validarFormularioRC({ ...sinCnae, actividadDescripcion: ' Bar con cocina ' })
    expect(a.ok && a.formulario.cnae).toBeNull()
    expect(a.ok && a.formulario.actividadDescripcion).toBe('Bar con cocina')
    const b = validarFormularioRC({ ...base(), cnae: '56.10' })
    expect(b.ok && b.formulario.cnae).toBe('5610')
    expect(normalizarCnae('561')).toBeNull()
  })

  it('exige actividad, facturación, empleados, límite y ámbito', () => {
    const v = validarFormularioRC({})
    expect(v.ok).toBe(false)
    if (!v.ok) {
      for (const campo of ['actividad', 'facturacionAnualEur', 'numEmpleados', 'limiteIndemnizacionEur', 'ambitoTerritorial']) {
        expect(v.errores.some((e) => e.startsWith(campo))).toBe(true)
      }
    }
  })

  it('rechaza CNAE mal formado, ámbito desconocido e importes en texto o ≤ 0', () => {
    const v = validarFormularioRC({ ...base(), cnae: 'ABC', ambitoTerritorial: 'luna', facturacionAnualEur: '250.000', limiteIndemnizacionEur: 0 })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.errores.some((e) => e.startsWith('cnae'))).toBe(true)
      expect(v.errores.some((e) => e.startsWith('ambitoTerritorial'))).toBe(true)
      expect(v.errores.some((e) => e.startsWith('facturacionAnualEur'))).toBe(true)
      expect(v.errores.some((e) => e.startsWith('limiteIndemnizacionEur'))).toBe(true)
    }
  })

  it('null ≠ 0: 0 empleados y 0 siniestros son datos; empleados ausente es error', () => {
    const cero = validarFormularioRC({ ...base(), numEmpleados: 0, siniestrosUltimos3Anios: 0, importeSiniestrosUltimos3AniosEur: 0 })
    expect(cero.ok).toBe(true)
    if (cero.ok) {
      expect(cero.formulario.numEmpleados).toBe(0)
      expect(cero.formulario.siniestrosUltimos3Anios).toBe(0)
      expect(cero.formulario.importeSiniestrosUltimos3AniosEur).toBe(0)
    }
    const { numEmpleados: _n, ...sin } = base()
    expect(validarFormularioRC(sin).ok).toBe(false)
    const nulos = validarFormularioRC({ ...base(), siniestrosUltimos3Anios: null, quiereRcLocativa: null })
    expect(nulos.ok && nulos.formulario.siniestrosUltimos3Anios).toBeNull()
    expect(nulos.ok && nulos.formulario.quiereRcLocativa).toBeNull()
  })

  it('false es un dato distinto de «no consta»', () => {
    const v = validarFormularioRC({ ...base(), quiereRcPatronal: false, quiereRcLocativa: true })
    expect(v.ok && v.formulario.quiereRcPatronal).toBe(false)
    expect(v.ok && v.formulario.quiereRcLocativa).toBe(true)
    expect(validarFormularioRC({ ...base(), quiereRcLocativa: 'si' }).ok).toBe(false)
  })

  it('detecta contradicciones: RC patronal sin empleados, importe de siniestros sin siniestros', () => {
    expect(validarFormularioRC({ ...base(), numEmpleados: 0, quiereRcPatronal: true }).ok).toBe(false)
    expect(validarFormularioRC({ ...base(), siniestrosUltimos3Anios: 0, importeSiniestrosUltimos3AniosEur: 1200 }).ok).toBe(false)
  })

  it('redondea a céntimos, descarta claves ajenas y rechaza lo que no es un objeto', () => {
    const v = validarFormularioRC({ ...base(), facturacionAnualEur: 250_000.456, tipoDocumento: 'NIF', comision: 'A' })
    expect(v.ok && v.formulario.facturacionAnualEur).toBe(250_000.46)
    expect(v.ok && 'tipoDocumento' in v.formulario).toBe(false)
    expect(validarFormularioRC(null).ok).toBe(false)
    expect(validarFormularioRC([]).ok).toBe(false)
  })
})

describe('catálogo de garantías RC', () => {
  it('RC es un ramo de ficha, con claves únicas en slug y sinónimos normalizados', () => {
    expect(esRamoFicha('rc')).toBe(true)
    const gars = CATALOGO_FICHAS.rc
    const claves = gars.map((g) => g.clave)
    expect(new Set(claves).size).toBe(claves.length)
    for (const g of gars) {
      expect(g.clave).toMatch(/^[a-z][a-z0-9_]*$/)
      for (const s of g.sinonimos) expect(normalizarLiteral(s)).toBe(s)
    }
    for (const k of ['rc_explotacion', 'rc_patronal', 'sublimite_victima_patronal', 'rc_productos', 'rc_post_trabajos', 'rc_locativa', 'defensa_juridica', 'fianzas_judiciales', 'franquicia_general', 'limite_indemnizacion']) {
      expect(garantiaFicha('rc', k)).not.toBeNull()
    }
    expect(garantiaFicha('rc', 'limite_indemnizacion')?.tipoValor).toBe('capital')
  })

  it('casa literales de compañía con la clave correcta (gana el sinónimo más largo)', () => {
    expect(claveDeLiteral('rc', 'Responsabilidad Civil Patronal')).toBe('rc_patronal')
    expect(claveDeLiteral('rc', 'Sublímite por víctima')).toBe('sublimite_victima_patronal')
    expect(claveDeLiteral('rc', 'RC Post-Trabajos')).toBe('rc_post_trabajos')
    expect(claveDeLiteral('rc', 'Responsabilidad civil locativa')).toBe('rc_locativa')
    expect(claveDeLiteral('rc', 'Defensa y fianzas')).toBe('fianzas_judiciales')
    expect(claveDeLiteral('rc', 'Cobertura de jardinería exótica')).toBeNull()
  })

  it('no contamina comunidades', () => {
    expect(garantiasFicha('comunidades').some((g) => g.clave === 'rc_explotacion')).toBe(false)
    expect(claveDeLiteral('comunidades', 'RC patronal')).toBe('rc_patronal')
  })
})

describe('ramo rc sin compañías', () => {
  it('el registro devuelve lista vacía para rc y no toca comunidades', () => {
    const cat = catalogoCotizacion()
    expect(cat.deRamo('rc')).toEqual([])
    expect(cat.obtener('allianz', 'rc')).toBeNull()
    expect(cat.ramos()).toEqual(['comunidades'])
    expect(cat.deRamo('comunidades').length).toBeGreaterThan(0)
  })

  it('preparar una solicitud de rc falla cerrado, sin lanzar', () => {
    const r = prepararSolicitud(catalogoCotizacion(), 'occident', 'rc', base(), {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0]).toContain('no hay bot para el ramo «rc»')
  })

  it('el comparador de RC sin ofertas ni fichas no explota', () => {
    expect(compararOfertas([], [])).toMatchObject({ ramo: '', columnas: [], filas: [] })
    const t = compararOfertas([], [{ id: 'o1', compania: 'Occident', ramo: 'rc', producto: 'RC Empresas', version: null, presupuesto: { primaTotalEur: null, capitales: {} } as never }])
    expect(t.ramo).toBe('rc')
    expect(t.filas.length).toBe(garantiasFicha('rc').length)
    expect(t.filas.every((f) => f.celdas.every((c) => !c.consta))).toBe(true)
  })
})
