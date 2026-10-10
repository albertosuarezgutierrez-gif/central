// La RUTA de pedir código responde byte a byte lo mismo exista o no el email, y no espera al
// correo (va en `after()`). Repo y envío mockeados: aquí no se toca BD ni se manda nada.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tareas: (() => Promise<void>)[] = []
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (f: () => Promise<void>) => { tareas.push(f) } }))
const enviar = vi.fn(async () => true)
vi.mock('@/lib/acceso-email-repo', () => ({
  enviarCodigoAcceso: (...a: unknown[]) => enviar(...(a as [])),
  repoAcceso: {
    contarRecientesPorEmail: async () => 0, contarRecientesPorIp: async () => 0, crearOtp: async () => {},
    candidatosPorEmail: async (e: string) => e === 'ana@ejemplo.es'
      ? [{ empleado_id: 'e1', empresa_id: 'x', empresa_nombre: 'Mariscos González', nombre: 'Ana', pin_hash: null, sesion_version: 0 }]
      : [],
  },
}))

import { POST } from '@/app/api/e/acceso/solicitar/route'
import { _resetRateLimit } from './rate-limit'

const pedir = (email: string, ip: string) => POST(new Request('http://x/api/e/acceso/solicitar', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email }),
}))

beforeEach(() => { tareas.length = 0; enviar.mockClear(); _resetRateLimit() })

describe('POST /api/e/acceso/solicitar', () => {
  it('misma respuesta para un empleado y para un desconocido; el correo sale DESPUÉS', async () => {
    const a = await pedir('ana@ejemplo.es', '1.1.1.1')
    const b = await pedir('nadie@ejemplo.es', '1.1.1.2')
    expect(a.status).toBe(200); expect(b.status).toBe(200)
    expect(await a.text()).toBe(await b.text())
    expect(enviar).not.toHaveBeenCalled()       // aún no: la respuesta no esperó al correo
    expect(tareas).toHaveLength(1)             // solo el empleado real tiene envío programado
    await tareas[0]()
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(enviar.mock.calls[0]).toMatchObject([{ to: 'ana@ejemplo.es', empresas: ['Mariscos González'] }])
  })

  it('tope en memoria por IP antes de tocar la BD', async () => {
    for (let i = 0; i < 10; i++) expect((await pedir(`x${i}@ejemplo.es`, '7.7.7.7')).status).toBe(200)
    expect((await pedir('y@ejemplo.es', '7.7.7.7')).status).toBe(429)
  })
})
