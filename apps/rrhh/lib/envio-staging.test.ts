import { describe, it, expect } from 'vitest'
import { pathStaging, esPathStagingDe, nombreConExtension, carpetaAdmiteFirma, stagingCaducados } from './envio-staging'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const U = '33333333-3333-3333-3333-333333333333'

describe('staging: aislamiento por empresa', () => {
  it('acepta solo el staging de la empresa de la sesión', () => {
    const p = pathStaging(A, 'Contrato.PDF', U)
    expect(p).toBe(`staging/${A}/${U}.pdf`)
    expect(esPathStagingDe(A, p)).toBe(true)
    expect(esPathStagingDe(B, p)).toBe(false)
  })
  it('rechaza rutas fuera del staging o con trucos', () => {
    expect(esPathStagingDe(A, `empleado/${U}/contratos/${U}.pdf`)).toBe(false)
    expect(esPathStagingDe(A, `staging/${A}/../${B}/${U}.pdf`)).toBe(false)
    expect(esPathStagingDe(A, `staging/${A}/${U}.pdf/../../x`)).toBe(false)
    expect(esPathStagingDe(A, null)).toBe(false)
  })
})

describe('nombreConExtension', () => {
  it('añade la extensión del original si falta', () => {
    expect(nombreConExtension('Contrato indefinido', 'scan_001.pdf')).toBe('Contrato indefinido.pdf')
    expect(nombreConExtension('Contrato.pdf', 'scan_001.pdf')).toBe('Contrato.pdf')
    expect(nombreConExtension('a/b', 'x.pdf')).toBe('a-b.pdf')
  })
})

describe('carpetaAdmiteFirma (misma regla que el expediente)', () => {
  it('formacion y datos_personales no admiten firma; el resto sí', () => {
    expect(carpetaAdmiteFirma('formacion')).toBe(false)
    expect(carpetaAdmiteFirma('datos_personales')).toBe(false)
    expect(carpetaAdmiteFirma('contratos')).toBe(true)
    expect(carpetaAdmiteFirma('nominas')).toBe(true)
  })
})

describe('stagingCaducados (limpieza del cron, solo staging/<empresa>/)', () => {
  const AHORA = new Date('2026-10-20T08:00:00Z')
  const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
  const U2 = '44444444-4444-4444-4444-444444444444'
  it('borra solo lo de más de 48 h', () => {
    const viejo = pathStaging(A, 'a.pdf', U)
    const nuevo = pathStaging(A, 'b.pdf', U2)
    expect(stagingCaducados(A, [{ path: viejo, creado_at: hace(49) }, { path: nuevo, creado_at: hace(47) }], AHORA)).toEqual([viejo])
  })
  it('nunca devuelve rutas de otra empresa ni fuera del staging', () => {
    const otra = pathStaging(B, 'a.pdf', U)
    const fuera = `empleado/${U}/contratos/${U}.pdf`
    expect(stagingCaducados(A, [{ path: otra, creado_at: hace(100) }, { path: fuera, creado_at: hace(100) }], AHORA)).toEqual([])
  })
  it('sin fecha (o ilegible) no se borra: no se sabe su edad', () => {
    const p = pathStaging(A, 'a.pdf', U)
    expect(stagingCaducados(A, [{ path: p, creado_at: null }, { path: p, creado_at: 'basura' }], AHORA)).toEqual([])
  })
})
