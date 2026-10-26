// La RUTA de pedir código del responsable responde byte a byte lo mismo sea o no responsable, no espera
// al correo (va en `after()`) y a quien no es responsable no le programa envío. Nada se manda de verdad.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tareas: (() => Promise<void>)[] = []
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (f: () => Promise<void>) => { tareas.push(f) } }))
const enviar = vi.fn(async (_c: unknown) => true)
vi.mock('@/lib/acceso-responsable-repo', () => ({
  enviarCodigoResponsable: (c: unknown) => enviar(c),
  repoResponsable: {
    contarRecientesPorEmail: async () => 0, contarRecientesPorIp: async () => 0, crearOtp: async () => {},
    responsablePorEmail: async (e: string) => e === 'pilar@ejemplo.es' ? { usuario_id: 'u1', nombre: 'Pilar', empresas: [{ id: 'a', nombre: 'A' }] } : null,
  },
}))

import { POST } from '@/app/api/auth/acceso/solicitar/route'
import { _resetRateLimit } from './rate-limit'

const pedir = (email: string, ip: string, host = 'empleados.grupoasegura.es') => POST(new Request('https://empleados.grupoasegura.es/api/auth/acceso/solicitar', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'x-forwarded-host': host }, body: JSON.stringify({ email }),
}))

beforeEach(() => { tareas.length = 0; enviar.mockClear(); _resetRateLimit(); delete process.env.RRHH_PUBLIC_URL })

describe('POST /api/auth/acceso/solicitar', () => {
  it('misma respuesta para responsable y desconocido; solo el responsable tiene envío, y sale DESPUÉS', async () => {
    const a = await pedir('pilar@ejemplo.es', '1.1.1.1')
    const b = await pedir('nadie@ejemplo.es', '1.1.1.2')
    expect(a.status).toBe(200); expect(b.status).toBe(200)
    expect(await a.text()).toBe(await b.text())
    expect(enviar).not.toHaveBeenCalled()
    expect(tareas).toHaveLength(1)
    await tareas[0]()
    expect(enviar.mock.calls[0][0]).toMatchObject({ to: 'pilar@ejemplo.es', marcaAsegura: true, url: 'https://empleados.grupoasegura.es/login' })
  })

  it('host ajeno → sin marca; RRHH_PUBLIC_URL manda en el enlace', async () => {
    process.env.RRHH_PUBLIC_URL = 'https://rrhh.ejemplo.es/'
    await pedir('pilar@ejemplo.es', '1.1.1.3', 'central-rrhh.vercel.app')
    await tareas[0]()
    expect(enviar.mock.calls[0][0]).toMatchObject({ marcaAsegura: false, url: 'https://rrhh.ejemplo.es/login' })
  })

  it('tope en memoria por IP antes de tocar la BD', async () => {
    for (let i = 0; i < 10; i++) expect((await pedir(`x${i}@ejemplo.es`, '7.7.7.7')).status).toBe(200)
    expect((await pedir('y@ejemplo.es', '7.7.7.7')).status).toBe(429)
  })
})
