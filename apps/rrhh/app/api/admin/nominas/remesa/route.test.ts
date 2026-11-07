// Contra el DOBLE PAGO de la remesa: la segunda descarga sin confirmar responde 409 y NO entrega fichero; con
// `confirmar_repeticion: true` (booleano exacto) sí, y el MsgId es el mismo si el contenido no ha cambiado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const EMP = '11111111-1111-1111-1111-111111111111'
const IBAN_EMPRESA = 'ES9121000418450200051332'
const IBAN_A = 'ES7921000813610123456789'
// Fechas relativas a hoy (sin bomba de tiempo): el periodo y el cargo, en enero del año que viene.
const ANIO = new Date().getUTCFullYear() + 1
const PERIODO = `${ANIO}-01`

vi.mock('@/lib/tenant', () => ({ getSesion: vi.fn(async () => ({ empresa_id: EMP })), AuthError: class extends Error {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

// BD simulada: el sello por nómina vive aquí, como `nominas.remesa_generada_at/remesa_msg_id`.
const sellos = new Map<string, { at: string; id: string }>()
vi.mock('@/lib/remesa-nominas-datos', () => ({
  cargarDatosRemesa: vi.fn(async () => ({
    empresa: { id: EMP, nombre: 'Empresa SL', nif: 'B12345678', iban: IBAN_EMPRESA, bic: null },
    empleados: [{ id: 'e1', empresa_id: EMP, nombre: 'Ana', apellidos: null, iban: IBAN_A }],
    nominas: [{ id: 'aaaaaaaa-0000-0000-0000-000000000001', empresa_id: EMP, empleado_id: 'e1', periodo: PERIODO, estado: 'confirmada', liquido_centimos: 150000 }],
  })),
  sellarRemesa: vi.fn(async (p: { nominaIds: string[]; idMensaje: string; confirmarRepeticion: boolean }) => {
    const previas = p.nominaIds.filter(id => sellos.has(id))
      .map(id => ({ nomina_id: id, remesa_generada_at: sellos.get(id)!.at, remesa_msg_id: sellos.get(id)!.id }))
    if (previas.length && !p.confirmarRepeticion) return { ok: false, previas }
    for (const id of p.nominaIds) sellos.set(id, { at: new Date().toISOString(), id: p.idMensaje })
    return { ok: true, previas }
  }),
}))

const pedir = async (extra: Record<string, unknown> = {}) => {
  const { POST } = await import('./route')
  return POST(new Request('https://x.test/api/admin/nominas/remesa', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ periodo: PERIODO, fecha_ejecucion: `${ANIO}-01-28`, ...extra }),
  }))
}
const msgId = async (res: Response) => /<MsgId>([^<]+)<\/MsgId>/.exec(await res.text())?.[1]

describe('POST /api/admin/nominas/remesa: contra el doble pago', () => {
  beforeEach(() => sellos.clear())

  it('primera descarga 200 y sella; segunda sin confirmar → 409 con aviso y sin XML', async () => {
    const r1 = await pedir()
    expect(r1.status).toBe(200)
    const id1 = await msgId(r1)
    expect(id1).toMatch(new RegExp(`^NOM${ANIO}01[0-9A-F]{22}$`))
    expect(sellos.size).toBe(1)

    const r2 = await pedir()
    expect(r2.status).toBe(409)
    const j = await r2.json()
    expect(j.error).toBe('remesa_ya_generada')
    expect(j.aviso).toMatch(/PAGA DOS VECES/)
    expect(j.ya_generadas).toBe(1)
    expect(j.mismo_fichero).toBe(true)
    expect(JSON.stringify(j)).not.toContain(IBAN_A)
  })

  it('solo `confirmar_repeticion: true` exacto repite, y con el MISMO MsgId (mismo contenido)', async () => {
    const id1 = await msgId(await pedir())
    expect((await pedir({ confirmar_repeticion: 'true' })).status).toBe(409)
    expect((await pedir({ confirmar_repeticion: 1 })).status).toBe(409)
    const r = await pedir({ confirmar_repeticion: true })
    expect(r.status).toBe(200)
    expect(r.headers.get('X-Remesa-Repetida')).toBe('1')
    expect(await msgId(r)).toBe(id1)
  })

  it('no hay GET: una descarga que sella no puede dispararse con un enlace o una precarga', async () => {
    const mod = await import('./route') as Record<string, unknown>
    expect(mod.GET).toBeUndefined()
  })
})
