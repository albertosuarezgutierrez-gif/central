// Alta de empresa con un correo que YA es responsable: sin flag 409 (no se vincula por error); con
// `vincular_existente: true` se añade la fila de usuario_empresas y NO se crea un usuario nuevo.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Llamada = { sql: string }
const log: Llamada[] = []
let existente: { id: string } | null = null
const texto = (q: unknown) => ((q as { strings?: string[]; sql?: string }).sql ?? (q as { strings: string[] }).strings.join('?'))
const raw = vi.fn(async (q: unknown) => {
  const t = texto(q); log.push({ sql: t })
  if (/FROM rrhh\.usuarios_rrhh WHERE lower/.test(t)) return existente ? [existente] : []
  if (/INSERT INTO rrhh\.empresas/.test(t)) return [{ id: 'emp-nueva' }]
  if (/INSERT INTO rrhh\.usuarios_rrhh/.test(t)) return [{ id: 'usuario-nuevo' }]
  return []
})
const exec = vi.fn(async (q: unknown) => { log.push({ sql: texto(q) }); return 1 })
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: (q: unknown) => raw(q), $transaction: (f: (tx: unknown) => unknown) => f({ $queryRaw: (q: unknown) => raw(q), $executeRaw: (q: unknown) => exec(q) }) } }))
vi.mock('@/lib/logo-empresa', () => ({ guardarLogoEmpresa: async () => ({ ok: true }) }))

import { POST } from '@/app/api/operador/empresas/route'

const alta = (b: Record<string, unknown>) => POST(new Request('https://x/api/operador/empresas', {
  method: 'POST', headers: { authorization: 'Bearer op', 'content-type': 'application/json' }, body: JSON.stringify(b),
}))
const base = { empresa: 'Nueva SL', responsable_nombre: 'Ana', responsable_email: 'Ana@Ejemplo.es' }

beforeEach(() => { process.env.RRHH_OPERADOR_SECRET = 'op'; log.length = 0; existente = null; raw.mockClear(); exec.mockClear() })

describe('POST /api/operador/empresas — vincular responsable existente', () => {
  it('correo existente SIN flag: 409 y nada se escribe', async () => {
    existente = { id: 'u-viejo' }
    const r = await alta(base)
    expect(r.status).toBe(409)
    expect(log.some(l => /INSERT/.test(l.sql))).toBe(false)
  })

  it('correo existente CON flag: 201 «vinculado», empresa nueva + fila usuario_empresas del usuario VIEJO, sin usuario nuevo', async () => {
    existente = { id: 'u-viejo' }
    const r = await alta({ ...base, vincular_existente: true })
    expect(r.status).toBe(201)
    expect(await r.json()).toMatchObject({ id: 'emp-nueva', vinculado: true, responsable_email: 'ana@ejemplo.es' })
    expect(log.some(l => /INSERT INTO rrhh\.usuarios_rrhh/.test(l.sql))).toBe(false)
    expect(exec.mock.calls).toHaveLength(1)
    const q = exec.mock.calls[0][0] as { values: unknown[] }
    expect(q.values).toEqual(['u-viejo', 'emp-nueva'])
  })

  it('correo nuevo con flag: 404 (no se inventa un responsable) y nada se escribe', async () => {
    const r = await alta({ ...base, vincular_existente: true })
    expect(r.status).toBe(404)
    expect(log.some(l => /INSERT/.test(l.sql))).toBe(false)
  })

  it('correo nuevo sin flag: alta normal (usuario nuevo, sin «vinculado»)', async () => {
    const r = await alta(base)
    expect(r.status).toBe(201)
    expect((await r.json()).vinculado).toBeUndefined()
    expect(log.some(l => /INSERT INTO rrhh\.usuarios_rrhh/.test(l.sql))).toBe(true)
  })

  it('el flag solo vale como booleano true (la cadena "true" no vincula)', async () => {
    existente = { id: 'u-viejo' }
    expect((await alta({ ...base, vincular_existente: 'true' })).status).toBe(409)
  })
})
