// Vehículo confirmado por Mapfre (14/10/2026). Fixtures SINTÉTICAS: denominaciones de catálogo genéricas, matrículas y
// bastidores inventados. Cada brazo se ha visto FALLAR rompiendo lo que protege.
import { describe, it, expect } from 'vitest'
import {
  CLAVES_RIESGO_VEHICULO,
  CLAVES_VEHICULO_CONFIRMADO,
  anioEnRango,
  SUBCLAVES_RIESGO,
  comprobarBoton,
  datosDesdeEtiquetaVersion,
  datosEquivalenciaDesdeEtiqueta,
  elegirVersionAutomaticamente,
  referenciaRiesgoVersion,
  supuestoVersionAutomatica,
  eleccionPorVehiculoConfirmado,
  eleccionPorVehiculoConfirmadoDeEtiquetas,
  EmisionBloqueadaError,
  riesgoSinDatosPersonales,
  validarFormularioAuto,
  validarVehiculoConfirmado,
  vehiculoConfirmadoDesdeMapfre,
  type CandidataConDatos,
  type VehiculoConfirmado,
} from './index.ts'

const VC: VehiculoConfirmado = { origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X 1.6 ACABADO Y', cv: 110, cc: 1598, puertas: 5, fechaInicio: '2019-03-01' }
const HOY = new Date('2026-10-14T10:00:00Z')
const BASE = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '41001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2000-06-07' },
}

describe('VehiculoConfirmado · tipo y validación', () => {
  it('acepta el objeto completo y con nulls («no consta»), puertas 0 (moto) y cc 0 (eléctrico) son DATO', () => {
    expect(validarVehiculoConfirmado(VC)).toEqual({ ok: true, valor: VC })
    const moto = { ...VC, puertas: 0, cc: 0, cv: null, fechaInicio: null }
    expect(validarVehiculoConfirmado(moto)).toEqual({ ok: true, valor: moto })
  })
  it('las claves son EXACTAMENTE las siete (sin matrícula ni bastidor)', () => {
    expect([...CLAVES_VEHICULO_CONFIRMADO]).toEqual(['origen', 'denominacion', 'cv', 'cc', 'puertas', 'fechaInicio', 'combustible'])
  })
  it('rechaza matrícula, bastidor o cualquier clave extra, sin repetir el valor', () => {
    for (const extra of [{ matricula: '1234BCD' }, { bastidor: 'VF1AAAAAA00000001' }, { otra: 1 }]) {
      const r = validarVehiculoConfirmado({ ...VC, ...extra })
      expect(r.ok).toBe(false)
      expect(JSON.stringify(r)).not.toMatch(/1234BCD|VF1AAAAAA00000001/)
    }
  })
  it('rechaza una denominación con forma de dato personal, sin repetirla', () => {
    const r = validarVehiculoConfirmado({ ...VC, denominacion: 'MODELO X 1234BCD' })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('1234BCD')
  })
  it('rechaza origen desconocido, denominación vacía, números fuera de rango y fechas malas', () => {
    for (const malo of [{ origen: 'allianz' }, { denominacion: ' ' }, { cv: 0 }, { cv: 1.5 }, { cc: -1 }, { puertas: 10 }, { fechaInicio: '01/03/2019' }, { fechaInicio: '2019-02-30' }]) {
      expect(validarVehiculoConfirmado({ ...VC, ...malo }).ok, JSON.stringify(malo)).toBe(false)
    }
  })
  it('formulario de auto/moto: viaja validado; uno malo invalida el formulario; ausente no aparece', () => {
    const ok = validarFormularioAuto({ ...BASE, vehiculoConfirmado: VC }, HOY)
    expect(ok.ok && ok.formulario.vehiculoConfirmado).toEqual(VC)
    const moto = validarFormularioAuto({ ...BASE, ramo: 'moto', seleccionVehiculo: { marca: 'M', modelo: 'X', cilindradaCc: 600 }, vehiculoConfirmado: { ...VC, puertas: 0, cc: 600 } }, HOY)
    expect(moto.ok).toBe(true)
    const malo = validarFormularioAuto({ ...BASE, vehiculoConfirmado: { ...VC, matricula: '1234BCD' } }, HOY)
    expect(malo.ok).toBe(false)
    const sin = validarFormularioAuto(BASE, HOY)
    expect(sin.ok && 'vehiculoConfirmado' in sin.formulario).toBe(false)
  })
})

describe('VehiculoConfirmado · purga del riesgo (lista blanca)', () => {
  it('se CONSERVA al cerrar el trabajo, y la matrícula y el bastidor se BORRAN (también dentro del objeto)', () => {
    expect(CLAVES_RIESGO_VEHICULO).toContain('vehiculoConfirmado')
    expect([...SUBCLAVES_RIESGO.vehiculoConfirmado]).toEqual([...CLAVES_VEHICULO_CONFIRMADO])
    const riesgo = { ...BASE, vehiculoConfirmado: { ...VC, matricula: '1234BCD', bastidor: 'VF1AAAAAA00000001' } }
    const p = riesgoSinDatosPersonales(riesgo, 'auto')
    expect(p.vehiculoConfirmado).toEqual(VC)
    expect(JSON.stringify(p)).not.toMatch(/1234BCD|0000BBB|VF1AAAAAA00000001|matricula|bastidor/)
    expect(riesgoSinDatosPersonales({ ramo: 'moto', vehiculoConfirmado: VC }, 'moto')).toEqual({ ramo: 'moto', vehiculoConfirmado: VC })
  })
})

describe('VehiculoConfirmado · desde la fila de Mapfre', () => {
  const fila = { denominacion: ' MARCA PRUEBA  MODELO X ', cvKw: '110', cc: '1598', puertas: '5', fechaInicio: '01/03/2019' }
  it('lee CV, CC, puertas y fecha; la denominación es el texto de catálogo', () => {
    expect(vehiculoConfirmadoDesdeMapfre(fila)).toEqual({ origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X', cv: 110, cc: 1598, puertas: 5, fechaInicio: '2019-03-01' })
    expect(vehiculoConfirmadoDesdeMapfre({ ...fila, cvKw: '110,00' })?.cv).toBe(110)
  })
  it('ilegible → null («no consta»), nunca 0; moto con 0 puertas; sin denominación → no hay vehículo', () => {
    const v = vehiculoConfirmadoDesdeMapfre({ ...fila, cvKw: '-', cc: '', puertas: '0', fechaInicio: 'xx' })
    expect(v).toEqual({ origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X', cv: null, cc: null, puertas: 0, fechaInicio: null })
    expect(vehiculoConfirmadoDesdeMapfre({ ...fila, cvKw: '85,5' })?.cv).toBeNull()
    expect(vehiculoConfirmadoDesdeMapfre({ ...fila, denominacion: '  ' })).toBeNull()
  })
})

describe('elección de versión por SIMILITUD con el vehículo de Mapfre (CV ±10 %, CC ±5 %)', () => {
  const c = (codigo: string, cv: number | null, cc: number | null, puertas: number | null = null, etiqueta = `VERSION ${codigo}`): CandidataConDatos =>
    ({ etiqueta, codigo, datos: { cv, cc, puertas, fechaInicio: null } })
  const elige = (codigo: string, etiqueta = `VERSION ${codigo}`) => ({ tipo: 'unica', porSimilitud: true, eleccion: { codigo, etiqueta } })
  it('exacta → esa, aunque haya cercanas', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 105, 1598), c('B', 110, 1598), c('C', 115, 1600)])).toEqual(elige('B'))
  })
  it('cercana dentro de tolerancia (sin exacta) → se elige', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 150, 2000), c('B', 105, 1620)])).toEqual(elige('B'))
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 99, null)])).toEqual(elige('A')) // límite del 10 %
  })
  it('dos cercanas → gana la más próxima', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 100, 1560), c('B', 108, 1590), c('C', 118, 1650)])).toEqual(elige('B'))
  })
  it('empate de distancia → desempatan las palabras de la denominación; si siguen iguales, la PRIMERA de la lista', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598), c('B', 110, 1598)])).toEqual(elige('A'))
    expect(
      eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, null, 'OTRO 110 CV'), c('B', 110, 1598, null, 'MODELO X ACABADO Y 110 CV')]),
    ).toEqual(elige('B', 'MODELO X ACABADO Y 110 CV'))
  })
  it('fuera de tolerancia (CV o CC) o puertas que contradicen → no elige', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 90, 1598), c('B', 125, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1800)])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, 3)])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, 3), c('B', 112, 1600, 5)])).toEqual(elige('B'))
  })
  it('sin datos legibles (ni CV ni CC en la lista, o solo puertas) → no elige', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', null, null), c('B', null, null, 5)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_datos' })
    expect(eleccionPorVehiculoConfirmado({ ...VC, cv: null, cc: null }, [c('A', 110, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_datos' })
  })
  it('una candidata sin datos no impide elegir otra legible dentro de tolerancia', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', null, null), c('B', 112, null)])).toEqual(elige('B'))
  })
  it('sin vehículo confirmado o sin candidatas → sin decidir; las opciones vacías no cuentan', () => {
    expect(eleccionPorVehiculoConfirmado(null, [c('A', 110, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_vehiculo' })
    expect(eleccionPorVehiculoConfirmado(VC, [{ etiqueta: 'Seleccione…', codigo: '', datos: { cv: null, cc: null, puertas: null, fechaInicio: null } }])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_candidatas' })
    expect(eleccionPorVehiculoConfirmado(VC, [{ etiqueta: '', codigo: null, datos: { cv: null, cc: null, puertas: null, fechaInicio: null } }, c('B', 110, 1598)]).tipo).toBe('unica')
  })
})

describe('elección por similitud · combustible exacto y años en rango (19/10/2026); tolerancias CV ±10 % / CC ±5 % intactas', () => {
  const cd = (codigo: string, extra: Partial<CandidataConDatos['datos']>): CandidataConDatos =>
    ({ etiqueta: `VERSION ${codigo}`, codigo, datos: { cv: 110, cc: 1598, puertas: null, fechaInicio: null, ...extra } })
  const VCG: VehiculoConfirmado = { ...VC, combustible: 'gasolina' }
  it('mismos CV/CC pero gasolina contra diésel → no casa; si el combustible coincide, sí', () => {
    expect(eleccionPorVehiculoConfirmado(VCG, [cd('A', { combustible: 'diesel' })])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VCG, [cd('A', { combustible: 'diesel' }), cd('B', { combustible: 'gasolina' })])).toMatchObject({ tipo: 'unica', eleccion: { codigo: 'B' } })
  })
  it('si uno de los dos no trae combustible, NO descarta (null ≠ distinto)', () => {
    expect(eleccionPorVehiculoConfirmado(VCG, [cd('A', { combustible: null })]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado(VCG, [cd('A', {})]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado({ ...VC, combustible: null }, [cd('A', { combustible: 'diesel' })]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { combustible: 'diesel' })]).tipo).toBe('unica')
  })
  it('fecha de inicio fuera del rango de la candidata (con ±1 año de holgura) → no casa; dentro o en el borde, sí', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { anioDesde: 2012, anioHasta: 2016 })])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { anioDesde: 2021, anioHasta: 2024 })])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { anioDesde: 2012, anioHasta: 2018 })]).tipo).toBe('unica') // 2019 = hasta + 1
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { anioDesde: 2018, anioHasta: 2022 })]).tipo).toBe('unica')
  })
  it('sin rango o sin fecha de inicio, los años no descartan', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', {})]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { anioDesde: null, anioHasta: null })]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado({ ...VC, fechaInicio: null }, [cd('A', { anioDesde: 2000, anioHasta: 2005 })]).tipo).toBe('unica')
  })
  it('rango abierto por un lado', () => {
    expect(anioEnRango('2019-03-01', 2021, null)).toBe(false)
    expect(anioEnRango('2019-03-01', 2020, null)).toBe(true)
    expect(anioEnRango('2019-03-01', null, 2017)).toBe(false)
    expect(anioEnRango('basura', 2030, 2031)).toBe(true)
  })
  it('las tolerancias del 14/10 siguen: CV 99 pasa, 98 no; CC +5 % pasa, +6 % no', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { cv: 99 })]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { cv: 98 })]).tipo).toBe('sin_decidir')
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { cc: 1677 })]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado(VC, [cd('A', { cc: 1700 })]).tipo).toBe('sin_decidir')
  })
  it('el validador admite el combustible (solo los conocidos) y sin él el objeto no lo lleva', () => {
    expect(validarVehiculoConfirmado({ ...VC, combustible: 'diesel' })).toEqual({ ok: true, valor: { ...VC, combustible: 'diesel' } })
    expect(validarVehiculoConfirmado({ ...VC, combustible: null })).toEqual({ ok: true, valor: VC })
    expect(validarVehiculoConfirmado({ ...VC, combustible: 'agua' }).ok).toBe(false)
    const p = riesgoSinDatosPersonales({ ...BASE, vehiculoConfirmado: { ...VC, combustible: 'diesel' } }, 'auto')
    expect(p.vehiculoConfirmado).toEqual({ ...VC, combustible: 'diesel' }) // sobrevive a la purga
  })
})

describe('datos de la etiqueta de una versión (solo cifras con unidad explícita)', () => {
  it('lee CV, CC y puertas con su unidad', () => {
    expect(datosDesdeEtiquetaVersion('MODELO X 1.6 TDI 110CV 5P 1598 CC')).toEqual({ cv: 110, cc: 1598, puertas: 5, fechaInicio: null })
    expect(datosDesdeEtiquetaVersion('F 800 S 85 CV')).toEqual({ cv: 85, cc: null, puertas: null, fechaInicio: null })
  })
  it('sin unidad, kW, decimales o valores contradictorios → null', () => {
    expect(datosDesdeEtiquetaVersion('MODELO X 1.6 110')).toEqual({ cv: null, cc: null, puertas: null, fechaInicio: null })
    expect(datosDesdeEtiquetaVersion('MODELO 81 KW')).toEqual({ cv: null, cc: null, puertas: null, fechaInicio: null })
    expect(datosDesdeEtiquetaVersion('MODELO 85,5 CV').cv).toBeNull()
    expect(datosDesdeEtiquetaVersion('MODELO 110 CV / 120 CV').cv).toBeNull()
    expect(datosDesdeEtiquetaVersion('X5 PREMIUM').puertas).toBeNull()
  })
  it('atajo por etiquetas (Allianz): la más próxima dentro de tolerancia, con su origen; fuera de tolerancia → null', () => {
    const versiones = [{ etiqueta: 'MODELO X 90 CV', codigo: 'V1' }, { etiqueta: 'MODELO X 110 CV', codigo: 'V2' }, { etiqueta: 'MODELO X 150 CV', codigo: 'V3' }]
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, versiones)).toEqual({ codigo: 'V2', etiqueta: 'MODELO X 110 CV' })
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, [{ etiqueta: 'MODELO X 108 CV', codigo: 'V9' }, ...versiones.slice(0, 1)])).toEqual({ codigo: 'V9', etiqueta: 'MODELO X 108 CV' })
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, [versiones[0]!, versiones[2]!])).toBeNull()
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, [{ etiqueta: 'MODELO X ACABADO Z', codigo: 'V4' }])).toBeNull()
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(null, versiones)).toBeNull()
  })
})

describe('guard · botones del diálogo «Selección de vehículo» de Mapfre', () => {
  it.each(['No es el vehículo.', 'No es el vehiculo', 'Vehículo NO catalogado', 'Vehiculo NO catalogado'])('bloquea «%s» aunque se permita «Aceptar»', (t) => {
    expect(() => comprobarBoton([t], { permitirAceptar: true })).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton([t])).toThrow(EmisionBloqueadaError)
  })
  it.each(['Ir a generar', 'IR A GENERAR', 'Generar Proyecto', 'Generar proyecto', 'generarProyecto()', 'btn_ir_a_generar'])('Coberturas (grabación 15/10/2026): bloquea «%s» siempre, también con «Aceptar» permitido', (t) => {
    expect(() => comprobarBoton([t], { permitirAceptar: true })).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton([t])).toThrow(EmisionBloqueadaError)
  })
  it('lo que el bot SÍ pulsa sigue pasando («Continuar», un mat-select de licencia)', () => {
    for (const t of ['Continuar', 'Clase de permiso', 'Valido desde', 'Compañía anterior']) expect(() => comprobarBoton([t])).not.toThrow()
  })
  it('«Aceptar» solo pasa con la opción de la función guardada', () => {
    expect(() => comprobarBoton(['Aceptar'])).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton(['Aceptar'], { permitirAceptar: true })).not.toThrow()
  })
})

// ───────────────────────── elección AUTOMÁTICA por equivalencia (19/10/2026, Alberto) ─────────────────────────
// Caso real «Terracan»: 5 versiones 2.9 CRDI 163 GL/GLS/Full, 163 CV, 2902 cc, diésel → antes requiere_humano; ahora se elige sola.
describe('elegirVersionAutomaticamente · equivalentes → elige y declara; material → pregunta; bandeja → exacta', () => {
  const dato = (o: Partial<{ cv: number; cc: number; fechaInicio: string; combustible: 'diesel' | 'gasolina' | 'electrico' }> = {}) => ({ cv: 163, cc: 2902, puertas: null, fechaInicio: null, combustible: 'diesel' as const, ...o })
  const TERRACAN = ['HYUNDAI TERRACAN 2.9 CRDI 163 GL', 'HYUNDAI TERRACAN 2.9 CRDI 163 GLS', 'HYUNDAI TERRACAN 2.9 CRDI 163 FULL', 'HYUNDAI TERRACAN 2.9 CRDI 163 GLS AUT', 'HYUNDAI TERRACAN 2.9 CRDI 163 FULL AUT'].map((e, i) => ({ etiqueta: e, codigo: `C${i}`, datos: dato() }))

  it('equivalentes (GL/GLS/Full: mismo combustible, CV y cc) → elige la PRIMERA del portal y declara el supuesto', () => {
    const r = elegirVersionAutomaticamente(TERRACAN)
    expect(r.tipo).toBe('automatica')
    if (r.tipo !== 'automatica') return
    expect(r.indice).toBe(0)
    expect(r.eleccion).toEqual({ codigo: 'C0', etiqueta: 'HYUNDAI TERRACAN 2.9 CRDI 163 GL' })
    expect(r.equivalentes).toBe(5)
    expect(r.supuesto).toBe('Versión elegida automáticamente: HYUNDAI TERRACAN 2.9 CRDI 163 GL (había 5 equivalentes; revisar en la emisión)')
    expect(supuestoVersionAutomatica('A, B', 1)).toBe('Versión elegida automáticamente: A B (había 1 equivalente; revisar en la emisión)')
  })
  it('dentro de tolerancia respecto a la PRIMERA (CV ±10 %, cc ±5 %) sigue siendo equivalente; fuera, material', () => {
    const base = { etiqueta: 'A', codigo: null, datos: dato({ cv: 100, cc: 1500 }) }
    expect(elegirVersionAutomaticamente([base, { etiqueta: 'B', codigo: null, datos: dato({ cv: 110, cc: 1575 }) }]).tipo).toBe('automatica')
    expect(elegirVersionAutomaticamente([base, { etiqueta: 'B', codigo: null, datos: dato({ cv: 111, cc: 1500 }) }]).tipo).toBe('preguntar')
    expect(elegirVersionAutomaticamente([base, { etiqueta: 'B', codigo: null, datos: dato({ cv: 100, cc: 1576 }) }]).tipo).toBe('preguntar')
  })
  it('MATERIAL: combustible distinto → pregunta con TODAS (motivo material)', () => {
    const r = elegirVersionAutomaticamente([TERRACAN[0]!, { etiqueta: 'HYUNDAI TERRACAN 3.5 V6', codigo: 'G', datos: dato({ combustible: 'gasolina' }) }])
    expect(r.tipo).toBe('preguntar')
    if (r.tipo === 'preguntar') {
      expect(r.motivo).toBe('material')
      expect(r.opciones.map((o) => o.codigo)).toEqual(['C0', 'G'])
    }
  })
  it('lo que una candidata no dice no cuenta (sin CV/cc/combustible → equivalente); sin nada que comparar elige la primera', () => {
    const r = elegirVersionAutomaticamente([{ etiqueta: 'X UNO', datos: null }, { etiqueta: 'X DOS' }, { etiqueta: 'X TRES', datos: dato() }])
    expect(r.tipo === 'automatica' && r.indice === 0).toBe(true)
  })
  it('con fechas: la de inicio más cercana (≤) a la matriculación; si ninguna es ≤, la primera del portal', () => {
    const c = ['2015-01-01', '2018-06-01', '2020-03-01', '2023-01-01'].map((f, i) => ({ etiqueta: `V${i}`, codigo: null, datos: dato({ fechaInicio: f }) }))
    const a = elegirVersionAutomaticamente(c, { riesgo: { fechaMatriculacion: '2019-05-10' } })
    expect(a.tipo === 'automatica' && a.indice === 1).toBe(true)
    const b = elegirVersionAutomaticamente(c, { riesgo: { fechaMatriculacion: '2010-01-01' } })
    expect(b.tipo === 'automatica' && b.indice === 0).toBe(true)
    // Determinista: mismo resultado si se repite, y desempate de fechas iguales → la primera.
    const d = [{ etiqueta: 'A', datos: dato({ fechaInicio: '2018-01-01' }) }, { etiqueta: 'B', datos: dato({ fechaInicio: '2018-01-01' }) }]
    expect(elegirVersionAutomaticamente(d, { riesgo: { fechaMatriculacion: '2019-01-01' } })).toEqual(elegirVersionAutomaticamente(d, { riesgo: { fechaMatriculacion: '2019-01-01' } }))
    expect((elegirVersionAutomaticamente(d, { riesgo: { fechaMatriculacion: '2019-01-01' } }) as { indice: number }).indice).toBe(0)
  })
  it('filtra por el riesgo: la única compatible gana; ninguna compatible → pregunta (sin_compatibles)', () => {
    const c = [{ etiqueta: 'D', datos: dato({ cv: 90, cc: 1400 }) }, { etiqueta: 'E', datos: dato({ cv: 163, cc: 2902 }) }, { etiqueta: 'F', datos: dato({ cv: 300, cc: 5000 }) }]
    const uno = elegirVersionAutomaticamente(c, { riesgo: { cv: 163, cc: 2902 } })
    expect(uno.tipo === 'automatica' && uno.indice === 1 && uno.equivalentes === 1).toBe(true)
    const ninguna = elegirVersionAutomaticamente(c, { riesgo: { cv: 500, cc: 8000 } })
    expect(ninguna.tipo === 'preguntar' && ninguna.motivo === 'sin_compatibles').toBe(true)
    // Combustible del riesgo exacto cuando ambos lo traen, aunque no haya CV ni cc.
    const comb = elegirVersionAutomaticamente([{ etiqueta: 'G1', datos: dato({ combustible: 'gasolina' }) }, { etiqueta: 'D1', datos: dato({ combustible: 'diesel' }) }], { riesgo: { combustible: 'diesel' } })
    expect(comb.tipo === 'automatica' && comb.indice === 1).toBe(true)
  })
  it('la ELECCIÓN DE LA BANDEJA manda y se usa EXACTA (código o etiqueta); si no casa con UNA, se vuelve a preguntar (nunca se elige otra)', () => {
    const porCodigo = elegirVersionAutomaticamente(TERRACAN, { eleccion: { codigo: 'C3', etiqueta: null } })
    expect(porCodigo.tipo === 'bandeja' && porCodigo.indice === 3 && porCodigo.supuesto === null).toBe(true)
    const porEtiqueta = elegirVersionAutomaticamente(TERRACAN, { eleccion: { etiqueta: ' hyundai terracan 2.9 crdi 163 full ' } })
    expect(porEtiqueta.tipo === 'bandeja' && porEtiqueta.indice === 2).toBe(true)
    const noCasa = elegirVersionAutomaticamente(TERRACAN, { eleccion: { etiqueta: 'OTRO COCHE' } })
    expect(noCasa.tipo === 'preguntar' && noCasa.motivo === 'eleccion_no_casa' && noCasa.opciones.length === 5).toBe(true)
  })
  it('una sola candidata → esa, sin supuesto; vacías y duplicadas fuera; ninguna → ninguna', () => {
    expect(elegirVersionAutomaticamente([{ etiqueta: 'Seleccione', datos: null }, { etiqueta: 'SOLA', codigo: 'S' }, { etiqueta: 'sola', codigo: 'S' }])).toEqual({ tipo: 'unica', indice: 1, eleccion: { codigo: 'S', etiqueta: 'SOLA' }, supuesto: null })
    expect(elegirVersionAutomaticamente([{ etiqueta: '' }, { etiqueta: '--' }])).toEqual({ tipo: 'ninguna' })
  })
  it('referenciaRiesgoVersion: vehículo confirmado + cilindrada de la selección + matriculación válida', () => {
    expect(referenciaRiesgoVersion({ vehiculoConfirmado: { ...VC, combustible: 'diesel' }, fechaMatriculacion: '2019-05-10' })).toEqual({ cv: 110, cc: 1598, puertas: 5, combustible: 'diesel', fechaInicio: '2019-03-01', fechaMatriculacion: '2019-05-10' })
    expect(referenciaRiesgoVersion({ seleccionVehiculo: { marca: 'A', modelo: 'B', cilindradaCc: 798 }, fechaMatriculacion: 'basura' })).toMatchObject({ cc: 798, cv: null, fechaMatriculacion: null })
    expect(referenciaRiesgoVersion(null)).toMatchObject({ cv: null, cc: null })
  })
  it('datosEquivalenciaDesdeEtiqueta: CV, cc, kW («Potencia (kW) 163») y combustible solo si el texto lo dice; nada parseable → todo null', () => {
    expect(datosEquivalenciaDesdeEtiqueta('Versión 2.9 CRDI 163 CV 2902 cc Diésel')).toMatchObject({ cv: 163, cc: 2902, combustible: 'diesel', kw: null })
    expect(datosEquivalenciaDesdeEtiqueta('Combustible Gasolina Potencia (kW) 163 GLS')).toMatchObject({ kw: 163, cv: null, combustible: 'gasolina' })
    expect(datosEquivalenciaDesdeEtiqueta('Versión 120 kW Eléctrico')).toMatchObject({ kw: 120, combustible: 'electrico' })
    expect(datosEquivalenciaDesdeEtiqueta('Híbrido enchufable 1.6')).toMatchObject({ combustible: 'hibrido_enchufable' })
    expect(datosEquivalenciaDesdeEtiqueta('Gasolina Eléctrico')).toMatchObject({ combustible: 'hibrido' })
    expect(datosEquivalenciaDesdeEtiqueta('2.9 CRDI 163 GL')).toMatchObject({ cv: null, cc: null, kw: null, combustible: null })
  })
  it('etiquetas de Allianz con kW: mismas kW/diésel → equivalentes; combustible distinto en el texto → material; kW fuera de tolerancia → material', () => {
    const e = (t: string) => ({ etiqueta: t, datos: datosEquivalenciaDesdeEtiqueta(t) })
    expect(elegirVersionAutomaticamente([e('Tipo de combustible Diésel Versión 2.9 CRDI 163 GL Potencia (kW) 163'), e('Tipo de combustible Diésel Versión 2.9 CRDI 163 FULL Potencia (kW) 163')]).tipo).toBe('automatica')
    expect(elegirVersionAutomaticamente([e('Tipo de combustible Diésel Versión A'), e('Tipo de combustible Gasolina Versión B')]).tipo).toBe('preguntar')
    expect(elegirVersionAutomaticamente([e('Versión A Potencia (kW) 100'), e('Versión B Potencia (kW) 140')]).tipo).toBe('preguntar')
    expect(elegirVersionAutomaticamente([e('Versión A'), e('Versión B')]).tipo).toBe('automatica')
  })
})
