import { describe, it, expect } from 'vitest'
import { pathStaging, esPathStagingDe, nombreConExtension } from './envio-staging'

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
