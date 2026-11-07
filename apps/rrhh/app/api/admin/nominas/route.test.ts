// «Aprobar lote»: cabe en maxDuration (como mucho 25 por llamada) y devuelve, por id, qué salió y qué queda sin tocar.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/tenant', () => ({ getSesion: vi.fn(async () => ({ empresa_id: 'emp-1' })), AuthError: class extends Error {} }))
vi.mock('@/lib/nominas', () => ({ listarNominas: vi.fn(), listarPeriodosConNominas: vi.fn(), periodoActual: vi.fn(), parsePeriodo: vi.fn() }))
const confirmadas: string[] = []
vi.mock('./[nominaId]/confirmar/route', () => ({
  POST: vi.fn(async (_r: Request, { params }: { params: Promise<{ nominaId: string }> }) => {
    const { nominaId } = await params
    confirmadas.push(nominaId)
    return nominaId.endsWith('0007')
      ? Response.json({ error: 'La nómina ya está confirmada' }, { status: 409 })
      : Response.json({ ok: true })
  }),
}))

const uuid = (i: number) => `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, '0')}`

describe('POST /api/admin/nominas (aprobar lote)', () => {
  it('procesa 25 como mucho, lista resultados por id y devuelve las que quedan', async () => {
    const { POST } = await import('./route')
    const ids = Array.from({ length: 30 }, (_, i) => uuid(i))
    const res = await POST(new Request('https://x.test/api/admin/nominas', { method: 'POST', body: JSON.stringify({ ids }) }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(confirmadas).toHaveLength(25)
    expect(j.resultados.map((r: { id: string }) => r.id)).toEqual(ids.slice(0, 25))
    expect(j.resultados.find((r: { id: string }) => r.id === uuid(7))).toEqual({ id: uuid(7), ok: false, error: 'La nómina ya está confirmada' })
    expect(j.confirmadas).toBe(24)
    expect(j.fallidas).toBe(1)
    expect(j.pendientes).toEqual(ids.slice(25))
  })

  it('declara maxDuration = 60', () => {
    expect(readFileSync(join(__dirname, 'route.ts'), 'utf8')).toMatch(/export const maxDuration = 60/)
  })
})
