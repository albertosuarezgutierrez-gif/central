import { describe, expect, it } from 'vitest'
import { entidad } from './catalogo'
import { calcularInforme, claveGrupo, recortarParaVista, semanaIso } from './motor'

const FICHAJES = entidad('fichajes')!
const NOMINAS = entidad('nominas')!

// Dos empleados con el MISMO nombre (ids distintos): nunca se funden al agrupar.
const filasFichajes = () => [
  { empleado_id: 'e1', empleado_etiqueta: 'Ana Pérez · 111A', empleado: 'Ana Pérez', fecha: '2026-03-02', entrada: new Date('2026-03-02T07:00:00Z'), salida: new Date('2026-03-02T15:00:00Z'), horas: 8, obra_id: 'o1', obra: 'Obra Norte', estado: 'Cerrado' },
  { empleado_id: 'e2', empleado_etiqueta: 'Ana Pérez · 222B', empleado: 'Ana Pérez', fecha: '2026-03-03', entrada: new Date('2026-03-03T07:00:00Z'), salida: new Date('2026-03-03T11:30:00Z'), horas: 4.5, obra_id: 'o1', obra: 'Obra Norte', estado: 'Cerrado' },
  { empleado_id: 'e1', empleado_etiqueta: 'Ana Pérez · 111A', empleado: 'Ana Pérez', fecha: '2026-03-09', entrada: new Date('2026-03-09T07:00:00Z'), salida: null, horas: null, obra_id: null, obra: null, estado: 'En curso' },
  { empleado_id: 'e1', empleado_etiqueta: 'Ana Pérez · 111A', empleado: 'Ana Pérez', fecha: '2026-04-01', entrada: new Date('2026-04-01T07:00:00Z'), salida: new Date('2026-04-01T13:15:00Z'), horas: 6.25, obra_id: 'o2', obra: 'Obra Sur', estado: 'Cerrado' },
]
const pet = (agrupacion: string | null, columnas = ['empleado', 'fecha', 'horas']) => ({ entidad: 'fichajes', columnas, filtros: {}, agrupacion })
const m = (ms: { clave: string; valor: number | null; sinDato: number }[], clave: string) => ms.find(x => x.clave === clave)!

describe('motor de informes · totales', () => {
  it('sin agrupar: total general, y los fichajes en curso NO suman 0 h (se excluyen y se cuentan aparte)', () => {
    const r = calcularInforme(FICHAJES, pet(null), filasFichajes())
    expect(r.grupos).toBeNull()
    expect(r.total.n).toBe(4)
    expect(m(r.total.metricas, 'horas').valor).toBe(18.75)
    expect(m(r.total.metricas, 'horas').sinDato).toBe(1)
    expect(m(r.total.metricas, 'en_curso').valor).toBe(1)
    // Media sobre los 3 cerrados (18,75 / 3), no sobre 4 (eso sería contar el en curso como 0).
    expect(m(r.total.metricas, 'media_horas').valor).toBe(6.25)
  })

  it('un grupo solo con fichajes en curso tiene horas null («—»), nunca 0', () => {
    const r = calcularInforme(FICHAJES, pet('obra'), filasFichajes())
    const sinObra = r.grupos!.find(g => g.etiqueta === '(sin dato)')!
    expect(m(sinObra.metricas, 'horas').valor).toBeNull()
    expect(m(sinObra.metricas, 'en_curso').valor).toBe(1)
  })

  it('una nómina sin cálculo queda «sin dato», no suma 0€', () => {
    const r = calcularInforme(NOMINAS, { entidad: 'nominas', columnas: ['empleado', 'neto'], filtros: {}, agrupacion: null }, [
      { empleado_id: 'e1', empleado: 'A', periodo: '2026-01', neto: 1000.1, bruto: 1200 },
      { empleado_id: 'e1', empleado: 'A', periodo: '2026-02', neto: null, bruto: null },
    ])
    expect(m(r.total.metricas, 'neto').valor).toBe(1000.1)
    expect(m(r.total.metricas, 'neto').sinDato).toBe(1)
    expect(m(r.total.metricas, 'sin_calculo').valor).toBe(1)
  })
})

describe('motor de informes · agrupación y subtotales', () => {
  it('por empleado agrupa por IDENTIDAD: dos «Ana Pérez» con id distinto son dos grupos', () => {
    const r = calcularInforme(FICHAJES, pet('empleado'), filasFichajes())
    expect(r.grupos!.map(g => g.etiqueta)).toEqual(['Ana Pérez · 111A', 'Ana Pérez · 222B'])
    const [g1, g2] = r.grupos!
    expect(g1.n).toBe(3)
    expect(m(g1.metricas, 'horas').valor).toBe(14.25)
    expect(m(g1.metricas, 'en_curso').valor).toBe(1)
    expect(m(g2.metricas, 'horas').valor).toBe(4.5)
    // Subtotales suman el total general.
    expect((m(g1.metricas, 'horas').valor ?? 0) + (m(g2.metricas, 'horas').valor ?? 0)).toBe(m(r.total.metricas, 'horas').valor)
    // Las filas quedan contiguas por grupo y los rangos apuntan a ellas.
    expect([g1.desde, g1.hasta, g2.desde, g2.hasta]).toEqual([0, 3, 3, 4])
    expect(r.filas.slice(g1.desde, g1.hasta).every(f => f.empleado === 'Ana Pérez')).toBe(true)
  })

  it('por mes y por semana ISO', () => {
    const porMes = calcularInforme(FICHAJES, pet('mes'), filasFichajes())
    expect(porMes.grupos!.map(g => [g.etiqueta, g.n])).toEqual([['marzo 2026', 3], ['abril 2026', 1]])
    const porSemana = calcularInforme(FICHAJES, pet('semana'), filasFichajes())
    expect(porSemana.grupos!.map(g => g.clave)).toEqual(['2026-W10', '2026-W11', '2026-W14'])
    expect(m(porSemana.grupos![0].metricas, 'horas').valor).toBe(12.5)
  })

  it('semana ISO en el cambio de año', () => {
    expect(semanaIso('2027-01-01')).toEqual({ anio: 2026, semana: 53, lunes: '2026-12-28' })
    expect(semanaIso('2026-01-01')).toEqual({ anio: 2026, semana: 1, lunes: '2025-12-29' })
  })

  it('valor null agrupa al final como «(sin dato)»', () => {
    expect(claveGrupo(null, 'valor').etiqueta).toBe('(sin dato)')
    expect(claveGrupo(true, 'valor').etiqueta).toBe('Sí')
  })
})

describe('motor de informes · proyección y límites', () => {
  it('solo devuelve las columnas pedidas (en orden de catálogo) y normaliza fechas', () => {
    const r = calcularInforme(FICHAJES, pet(null, ['horas', 'entrada']), filasFichajes())
    expect(r.columnas.map(c => c.clave)).toEqual(['entrada', 'horas'])
    expect(Object.keys(r.filas[0])).toEqual(['entrada', 'horas'])
    expect(r.filas[0].entrada).toBe('2026-03-02T07:00:00.000Z')
    expect(r.filas[0]).not.toHaveProperty('empleado_id')
  })

  it('trunca al límite y lo avisa; la vista previa recorta filas pero no totales', () => {
    const r = calcularInforme(FICHAJES, pet(null), filasFichajes(), 3)
    expect(r.truncado).toBe(true)
    expect(r.total.n).toBe(3)
    const v = recortarParaVista(r, 2)
    expect(v.filas).toHaveLength(2)
    expect(v.filasTotales).toBe(3)
    expect(v.total.n).toBe(3)
    expect(calcularInforme(FICHAJES, pet(null), filasFichajes(), 4).truncado).toBe(false)
  })
})
