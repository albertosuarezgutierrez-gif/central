// Cepo (07/11/2026): un error de Prisma en el alta rápida NO se relanza (Next lo volcaría al log con DNI/IBAN de la fila):
// al log solo el código, y al cliente un 500 genérico.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/solicitudes', () => ({ saldoVacacionesEmpleados: vi.fn() }))
vi.mock('@/lib/tenant', () => ({ AuthError: class AuthError extends Error {}, getSesion: async () => ({ empresa_id: 'e1' }) }))
vi.mock('@/lib/alta-empleado-repo', () => ({
  darDeAltaLote: vi.fn(async () => { throw Object.assign(new Error('Unique constraint (dni)=(12345678Z) iban ES9121000418450200051332'), { code: 'P2002' }) }),
}))
vi.mock('@/lib/alta-empleado', () => ({ validarAltaRapida: () => ({ ok: true, alta: { nombre: 'Ana', apellidos: 'G' } }) }))

import { POST } from '../app/api/admin/empleados/route'

describe('POST /api/admin/empleados', () => {
  it('error de BD → 500 genérico, log solo con el código', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(new Request('http://x/api/admin/empleados', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(500)
    const cuerpo = JSON.stringify(await res.json())
    const logs = JSON.stringify(log.mock.calls)
    for (const s of [cuerpo, logs]) { expect(s).not.toContain('12345678Z'); expect(s).not.toContain('ES91') }
    expect(logs).toContain('P2002')
    log.mockRestore()
  })
})
