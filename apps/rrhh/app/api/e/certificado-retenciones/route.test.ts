// La ruta da SOLO el certificado del empleado de la sesión: ni la query ni nada de la petición elige empleado o empresa.
// Cepo visto fallar el 07/11/2026: leer `empleado_id` de la query en route.ts → rojo; restaurado → verde.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sesion = { empleado_id: 'emp-A', empresa_id: 'empresa-1', v: 0 }
const leer = vi.fn()
vi.mock('@/lib/empleado-tenant', () => ({ getSesionEmpleado: vi.fn(async () => sesion) }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/certificado-retenciones-datos', async (orig) => ({ ...(await orig<object>()), leerDatosCertificado: (...a: unknown[]) => leer(...a) }))
vi.mock('./certificado-pdf', () => ({ generarCertificadoPdf: vi.fn(async (p: unknown) => Buffer.from(JSON.stringify(p))) }))

const nomina = (id: string, dni: string) => ({
  id, empleado_id: 'emp-00000001', periodo: '2026-01', empleado_nombre: 'X', empleado_apellidos: null, empleado_dni: dni, empleado_provincia: null,
  datos_calculo: { devengos: { total: 1000 }, deducciones: { irpf: 100, total: 163.5 }, cuotaPatronal: { total: 300 }, netoAPagar: 836.5, costeTotalEmpresa: 1300, cifrasPendientes: [] },
})

describe('GET /api/e/certificado-retenciones', () => {
  beforeEach(() => {
    leer.mockReset()
    leer.mockImplementation(async (empresa: string, empleado: string) =>
      empleado === 'emp-A' && empresa === 'empresa-1'
        ? { empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: '12345678Z' }, nominas: [nomina('nom-000000a1', '12345678Z')] }
        : { empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Bruno', dni: '87654321X' }, nominas: [nomina('nom-000000b1', '87654321X')] })
  })

  it('el empleado A no obtiene el de B aunque lo pida por la query', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('https://x.test/api/e/certificado-retenciones?anio=2026&empleado_id=emp-B&empresa_id=empresa-2'))
    expect(res.status).toBe(200)
    expect(leer).toHaveBeenCalledWith('empresa-1', 'emp-A', 2026)
    const cuerpo = JSON.parse(Buffer.from(await res.arrayBuffer()).toString())
    expect(cuerpo.certificado.perceptor.nif).toBe('12345678Z')
    expect(JSON.stringify(cuerpo)).not.toContain('nomina:nom-000000b1')
  })

  it('la ruta no lee de la petición más que el año', () => {
    const src = readFileSync(join(__dirname, 'route.ts'), 'utf8')
    expect(src).not.toMatch(/empleado_?id['"]?\s*\)|get\(\s*['"](empleado|empresa)/i)
    expect([...src.matchAll(/searchParams\.get\(\s*'([^']+)'/g)].map((m) => m[1])).toEqual(['anio'])
  })

  it('año fuera de rango → 400', async () => {
    const { GET } = await import('./route')
    expect((await GET(new Request('https://x.test/api/e/certificado-retenciones?anio=1999'))).status).toBe(400)
  })
})
