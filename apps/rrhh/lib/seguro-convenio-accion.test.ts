/**
 * Cepo del ENVÍO del lead a la correduría (07/11/2026, revisión): un lead que pudo llegar a plataforma NUNCA se reenvía solo.
 *  - timeout / 5xx → 'incierto': el usuario lee «puede que ya se enviara», y un segundo clic NO vuelve a llamar a plataforma.
 *  - `cerrarLead` que falla tras un 2xx → el usuario recibe «hecho» y no se reenvía (la fila queda 'enviando' → 'incierto').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const repo = vi.hoisted(() => ({
  obligacionDe: vi.fn(), datosParaLead: vi.fn(), contarAfectados: vi.fn(), reservarLead: vi.fn(), cerrarLead: vi.fn(),
  borrarObligacion: vi.fn(), guardarCobertura: vi.fn(), guardarObligacion: vi.fn(), marcarSinObligacion: vi.fn(),
}))
const envio = vi.hoisted(() => ({ enviarLeadCorreduria: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }) }))
vi.mock('@/lib/tenant', () => ({
  AuthError: class AuthError extends Error {},
  getSesion: async () => ({ empresa_id: '00000000-0000-0000-0000-0000000000e1', usuario_id: '00000000-0000-0000-0000-0000000000a1' }),
}))
vi.mock('@/lib/seguro-convenio-repo', () => repo)
vi.mock('@/lib/lead-correduria', () => envio)

import { pedirRevisionAccion } from '../app/admin/nominas/convenio/seguro/actions'
import { MENSAJE_LEAD_INCIERTO, interpretarRespuestaLead, parsearObligacion } from './seguro-convenio'

const OB = '00000000-0000-0000-0000-000000000001'
const datos = { nombre: 'Ana', email: 'ana@x.es', telefono: '', consentimiento: true }

beforeEach(() => {
  vi.clearAllMocks()
  repo.obligacionDe.mockResolvedValue({
    ...parsearObligacion({
      convenio: 'Hostelería de Sevilla', tipo: 'accidentes', contingencias: ['muerte'], capital: '30.000', ambito: 'todas',
      articulo: 'Art. 42', fuenteUrl: 'https://www.boe.es/x', vigenteDesde: '2025-01-01', vigenteHasta: '',
    }),
    id: OB,
  })
  repo.datosParaLead.mockResolvedValue({ empresa: 'Bar Pepe', nif: '12345678Z', nombre: 'Ana', email: 'ana@x.es' })
  repo.contarAfectados.mockResolvedValue({ afectados: 3, sinCategoria: 0 })
  repo.reservarLead.mockResolvedValue({ id: 'lead-1' })
  repo.cerrarLead.mockResolvedValue(undefined)
})

describe('pedirRevisionAccion: sin reenvíos de un lead que pudo llegar', () => {
  it('timeout → incierto: «puede que ya se enviara», se apunta como incierto y no se reintenta', async () => {
    envio.enviarLeadCorreduria.mockResolvedValue(interpretarRespuestaLead(0, null))
    const r = await pedirRevisionAccion(OB, datos)
    expect(r).toEqual({ ok: true, mensaje: MENSAJE_LEAD_INCIERTO })
    expect(envio.enviarLeadCorreduria).toHaveBeenCalledTimes(1)
    expect(repo.cerrarLead).toHaveBeenCalledWith(expect.any(String), 'lead-1', 'incierto', 'sin respuesta')
  })
  it('segundo clic con un incierto vivo (< 24 h): no se llama a plataforma', async () => {
    repo.reservarLead.mockResolvedValue({ ya: 'incierto', at: '2026-11-07 10:00:00+00' })
    const r = await pedirRevisionAccion(OB, datos)
    expect(r).toEqual({ ok: true, mensaje: MENSAJE_LEAD_INCIERTO })
    expect(envio.enviarLeadCorreduria).not.toHaveBeenCalled()
  })
  it('2xx y cerrarLead falla → «hecho», un solo envío, y el log no lleva el mensaje del error', async () => {
    envio.enviarLeadCorreduria.mockResolvedValue(interpretarRespuestaLead(200, { ok: true }))
    repo.cerrarLead.mockRejectedValue(Object.assign(new Error('fila con Bar Pepe 12345678Z'), { code: 'P1001' }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await pedirRevisionAccion(OB, datos)
    expect(r.ok).toBe(true)
    expect(envio.enviarLeadCorreduria).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).not.toContain('12345678Z')
    expect(JSON.stringify(log.mock.calls)).toContain('P1001')
    log.mockRestore()
  })
  it('el resumen que se reserva y se envía no lleva el NIF', async () => {
    envio.enviarLeadCorreduria.mockResolvedValue(interpretarRespuestaLead(200, { ok: true }))
    await pedirRevisionAccion(OB, datos)
    expect(String(repo.reservarLead.mock.calls[0][4])).not.toContain('12345678Z')
    expect(JSON.stringify(envio.enviarLeadCorreduria.mock.calls[0][0])).not.toContain('12345678Z')
  })
  it('un fallo de BD inesperado: al log solo el código, nunca e.message', async () => {
    repo.obligacionDe.mockRejectedValue(Object.assign(new Error('Bar Pepe 12345678Z'), { code: 'P2010' }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await pedirRevisionAccion(OB, datos)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(log.mock.calls)).not.toContain('12345678Z')
    log.mockRestore()
  })
})
