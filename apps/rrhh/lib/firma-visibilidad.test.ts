// Un documento OCULTO al empleado no se puede firmar ni pedir código OTP (cargarDoc no lo encuentra).
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@prisma/client', () => ({
  Prisma: { sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ sql: s.join('?'), values }) },
}))
const { queryRaw, cargas } = vi.hoisted(() => ({ queryRaw: vi.fn(), cargas: [] as unknown[] }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: vi.fn(), $transaction: vi.fn() } }))
vi.mock('@central/core-firma', () => ({ FirmaPropia: class {} }))
vi.mock('@central/module-rrhh', () => ({
  solicitarCodigoFirma: vi.fn(async (d: any, id: string) => { cargas.push(await d.repo.cargarDoc(id)) }),
  solicitarFirma: vi.fn(async (d: any, id: string) => { cargas.push(await d.repo.cargarDoc(id)) }),
  firmarDocumento: vi.fn(async (d: any, id: string) => { cargas.push(await d.repo.cargarDoc(id)) }),
}))
vi.mock('@/lib/storage', () => ({ descargarObjeto: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ getTransporter: () => null, MAIL_FROM: 'x' }))
vi.mock('@/lib/avisos-admin', () => ({ registrarFalloEnvio: vi.fn() }))

import { firmarDocumento } from '@/lib/firma'

beforeEach(() => { vi.clearAllMocks(); cargas.length = 0 })

describe('firma del empleado sobre un documento oculto', () => {
  it('cargarDoc filtra visible_empleado (y las nóminas siguen firmables)', async () => {
    queryRaw.mockResolvedValue([])
    await firmarDocumento('e', 'p', 'd', { nombre_confirmado: 'x' })
    const q = queryRaw.mock.calls[0][0] as { sql: string }
    expect(q.sql).toMatch(/visible_empleado/)
    expect(q.sql).toMatch(/carpeta\s*=\s*'nominas'/)
    expect(cargas[0]).toBeNull() // el módulo lo trata como «Documento no encontrado»
  })
})
