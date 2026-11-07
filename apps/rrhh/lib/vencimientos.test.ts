import { describe, it, expect } from 'vitest'
import { avisosDeHoy, claveAvisoVencimiento, diasEntreFechas, estadoFinContrato, hoyMadrid, textoAvisoVencimiento, umbralQueToca } from './vencimientos'

// `hoy` inyectado y fechas RELATIVAS a él: sin bomba de tiempo (regla del monorepo).
const HOY = '2026-11-07'
const mas = (d: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)

describe('umbralQueToca (30 y 15 días)', () => {
  it('avisa a 30 y a 15, y entre medias se queda en el umbral alcanzado', () => {
    expect(umbralQueToca(HOY, mas(31))).toBeNull()
    expect(umbralQueToca(HOY, mas(30))).toBe(30)
    expect(umbralQueToca(HOY, mas(16))).toBe(30)
    expect(umbralQueToca(HOY, mas(15))).toBe(15)
    expect(umbralQueToca(HOY, mas(0))).toBe(15)
  })
  it('fin ya pasado o sin fecha → no avisa', () => {
    expect(umbralQueToca(HOY, mas(-1))).toBeNull()
    expect(umbralQueToca(HOY, null)).toBeNull()
  })
})

describe('estadoFinContrato: NULL = «no se sabe», no «indefinido»', () => {
  it('sin fecha de fin y sin duración explícita → no_se_sabe', () => {
    expect(estadoFinContrato({ duracion: null, fechaFin: null }, HOY)).toEqual({ tipo: 'no_se_sabe' })
    expect(estadoFinContrato({ duracion: 'temporal', fechaFin: null }, HOY)).toEqual({ tipo: 'no_se_sabe' })
  })
  it('indefinido solo con duración explícita', () => {
    expect(estadoFinContrato({ duracion: 'indefinido', fechaFin: null }, HOY)).toEqual({ tipo: 'indefinido' })
  })
  it('con fecha → días restantes', () => {
    expect(estadoFinContrato({ duracion: 'temporal', fechaFin: mas(10) }, HOY)).toEqual({ tipo: 'fecha', fechaFin: mas(10), dias: 10 })
  })
})

describe('avisosDeHoy', () => {
  const c = (id: string, fechaFin: string | null) => ({ contratoId: id, empresaId: `e-${id}`, empleadoId: `p-${id}`, fechaFin })
  it('solo los que tocan, cada uno con SU empresa y una clave que cambia si se prorroga', () => {
    const r = avisosDeHoy([c('a', mas(20)), c('b', mas(40)), c('c', null), c('d', mas(5))], HOY)
    expect(r.map(x => [x.contratoId, x.empresaId, x.umbral])).toEqual([['a', 'e-a', 30], ['d', 'e-d', 15]])
    expect(r[0].clave).toBe(claveAvisoVencimiento('a', mas(20), 30))
    expect(claveAvisoVencimiento('a', mas(20), 30)).not.toBe(claveAvisoVencimiento('a', mas(25), 30))
    expect(claveAvisoVencimiento('a', mas(20), 30)).not.toBe(claveAvisoVencimiento('a', mas(20), 15))
  })
})

describe('utilidades', () => {
  it('días entre fechas y fecha de Madrid', () => {
    expect(diasEntreFechas('2026-12-31', '2027-01-01')).toBe(1)
    expect(diasEntreFechas('2026-03-28', '2026-03-30')).toBe(2) // cambio de hora: días naturales, no 47 h
    expect(hoyMadrid(new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08')
    expect(() => diasEntreFechas('07/11/2026', HOY)).toThrow()
  })
  it('texto en español con dd/mm/aaaa y neutro (sin afirmar que no se renueva)', () => {
    const t = textoAvisoVencimiento({ fechaFin: '2026-12-01', dias: 24 })
    expect(t.titulo).toContain('01/12/2026')
    expect(t.cuerpo).toContain('dentro de 24 días')
    expect(t.cuerpo).toMatch(/renovación o finalización/)
  })
})
