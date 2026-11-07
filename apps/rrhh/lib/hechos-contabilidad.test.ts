// Emisor rrhh → contabilidad (HechoNomina) y certificado de retenciones del portal /e.
// Cepos vistos fallar el 07/11/2026 (rompo, miro rojo, restauro):
//   (1) `requireSecret(ENV_SECRETO, 'x')` en leerConfigContabilidad → rojo en «sin secreto no se envía»;
//   (2) quitar el `if (!datos.contabilidadEmpresaId)` → rojo en «pendiente de vincular»;
//   (3) volver a saltar IRPF 0 en impuestos-datos.ts → rojo en «certificado = 190» (Bruno desaparece del 190).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularModelo190 } from '@central/module-contabilidad'
import {
  ENV_SECRETO, LOTE_REENVIO, SE_REINTENTA, clasificarRespuesta, enviarNominaAContabilidad, fechaDePeriodo, hechoDeNomina,
  leerConfigContabilidad, reenviarLote, type DatosEnvio, type DepsEnvio, type FilaNominaEnvio,
} from './hechos-contabilidad'
import { anioPedido, certificadoDeNominas, eurosEs } from './hechos-contabilidad-certificado'
import { envSecretoHechos } from '../../contabilidad/lib/secretos.ts'
import { datosFiscalesDeHechos } from '../../contabilidad/lib/impuestos-datos.ts'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const desglose = (bruto: number, irpf: number, ssT: number, ssE: number) => ({
  devengos: { total: bruto }, deducciones: { irpf, total: Math.round((irpf + ssT) * 100) / 100 }, cuotaPatronal: { total: ssE },
  netoAPagar: Math.round((bruto - irpf - ssT) * 100) / 100,
})
const fila = (id: string, periodo: string, dni: string | null, nombre: string, d: unknown): FilaNominaEnvio => ({
  id, periodo, datos_calculo: d, empleado_nombre: nombre, empleado_apellidos: 'Pérez', empleado_dni: dni, empleado_provincia: '41',
})

describe('hechoDeNomina (puro)', () => {
  it('ref nomina:<id>, céntimos, perceptor con NIF y clave A; cuadra bruto − IRPF − SS = líquido', () => {
    const r = hechoDeNomina(fila('n1', '2026-02', '12345678-z', 'Ana', desglose(2000, 300, 127, 640.5)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.hecho).toMatchObject({ tipo: 'nomina', ref: 'nomina:n1', fecha: '2026-02-28', bruto: 200000, irpf: 30000, ssTrabajador: 12700, ssEmpresa: 64050, liquido: 157300, clave: 'A' })
    expect(r.hecho.perceptor).toEqual({ nif: '12345678Z', nombre: 'Ana Pérez', provincia: '41' })
  })
  it('no inventa: DNI inválido viaja sin NIF; desglose incompleto o que no cuadra NO se envía', () => {
    const sinNif = hechoDeNomina(fila('n2', '2026-01', 'xx', 'Ana', desglose(1000, 0, 63.5, 300)))
    expect(sinNif.ok && sinNif.hecho.perceptor.nif).toBe(undefined)
    expect(hechoDeNomina(fila('n3', '2026-01', null, 'Ana', {})).ok).toBe(false)
    expect(hechoDeNomina(fila('n4', '2026-01', null, 'Ana', { ...desglose(1000, 0, 63.5, 300), netoAPagar: 900 })).ok).toBe(false)
    expect(hechoDeNomina(fila('n5', '2026-13', null, 'Ana', desglose(1000, 0, 63.5, 300))).ok).toBe(false)
    expect(fechaDePeriodo('2028-02')).toBe('2028-02-29')
  })
})

describe('envío a contabilidad', () => {
  const datos = (vinculada: string | null): DatosEnvio => ({ contabilidadEmpresaId: vinculada, nomina: fila('n1', '2026-02', '12345678Z', 'Ana', desglose(2000, 300, 127, 640.5)) })
  let registrados: { estado: string }[]
  let fetchMock: ReturnType<typeof vi.fn>
  const deps = (over: Partial<DepsEnvio> = {}): DepsEnvio => ({
    leer: async () => datos('00000000-0000-4000-8000-0000000000c0'),
    registrar: async (_e, _n, r) => { registrados.push(r) },
    config: () => ({ url: 'https://conta.example.test', secreto: 's3' }),
    fetch: fetchMock as unknown as DepsEnvio['fetch'],
    ...over,
  })
  beforeEach(() => { registrados = []; fetchMock = vi.fn(async () => ({ status: 201, text: async () => '{}' })) })

  it('usa el MISMO nombre de secreto que contabilidad espera para rrhh', () => {
    expect(ENV_SECRETO).toBe(envSecretoHechos('rrhh'))
  })

  it('sin secreto la llamada no sale (requireSecret sin fallback; nunca un literal)', async () => {
    const env = { CONTABILIDAD_URL: 'https://conta.example.test' }
    delete process.env[ENV_SECRETO]
    expect(leerConfigContabilidad(env)).toBeNull()
    const src = readFileSync(join(__dirname, 'hechos-contabilidad.ts'), 'utf8')
    expect(src).not.toMatch(/requireSecret\([^)]*,/)
    expect(src).not.toMatch(/process\.env\.CONTABILIDAD_HECHOS_SECRET_RRHH\s*(\|\||\?\?)/)
    const r = await enviarNominaAContabilidad('e1', 'n1', deps({ config: () => leerConfigContabilidad(env) }))
    expect(r.estado).toBe('sin_configurar')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(registrados.map((x) => x.estado)).toEqual(['sin_configurar'])
    expect(leerConfigContabilidad(env, () => 'valor')).toEqual({ url: 'https://conta.example.test', secreto: 'valor' })
    expect(leerConfigContabilidad({ CONTABILIDAD_URL: 'http://conta.example.test' }, () => 'valor')).toBeNull()
  })

  it('empresa sin contabilidad_empresa_id → pendiente de vincular, no se envía y queda anotado', async () => {
    const r = await enviarNominaAContabilidad('e1', 'n1', deps({ leer: async () => datos(null) }))
    expect(r.estado).toBe('pendiente_vincular')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(registrados).toHaveLength(1)
  })

  it('envía Bearer + x-origen-app rrhh + empresa de contabilidad; ref idempotente', async () => {
    const r = await enviarNominaAContabilidad('e1', 'n1', deps())
    expect(r.estado).toBe('enviado')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://conta.example.test/api/hechos')
    expect(init.headers).toMatchObject({ authorization: 'Bearer s3', 'x-origen-app': 'rrhh' })
    const body = JSON.parse(init.body)
    expect(body.empresaId).toBe('00000000-0000-4000-8000-0000000000c0')
    expect(body.hecho.ref).toBe('nomina:n1')
  })

  it('nunca lanza: red caída, BD caída o anotación fallida → estado reintentable', async () => {
    const red = await enviarNominaAContabilidad('e1', 'n1', deps({ fetch: async () => { throw new Error('ECONNRESET') } }))
    expect(red.estado).toBe('error')
    const bd = await enviarNominaAContabilidad('e1', 'n1', deps({ leer: async () => { throw new Error('column does not exist') } }))
    expect(bd.estado).toBe('error')
    const anota = await enviarNominaAContabilidad('e1', 'n1', deps({ registrar: async () => { throw new Error('x') } }))
    expect(anota.estado).toBe('enviado')
  })

  it('clasifica las respuestas del puerto', () => {
    expect([200, 201, 202, 400, 401, 403, 409, 422, 429, 500].map((s) => clasificarRespuesta(s).estado)).toEqual(
      ['enviado', 'enviado', 'pendiente_regla', 'rechazado', 'error', 'rechazado', 'rechazado', 'rechazado', 'error', 'error'])
  })
})

describe('certificado de retenciones', () => {
  const ana = [
    fila('a1', '2026-01', '12345678Z', 'Ana', desglose(2000, 300, 127, 640.5)),
    fila('a2', '2026-02', '12345678Z', 'Ana', desglose(2000, 300, 127, 640.5)),
  ]
  const bruno = [fila('b1', '2026-01', '87654321X', 'Bruno', desglose(900, 0, 57.15, 288))]

  it('certificado = fila del 190 que calcula contabilidad con los MISMOS hechos (IRPF 0 incluido)', () => {
    const hechos = [...ana, ...bruno].map((n) => { const h = hechoDeNomina(n); if (!h.ok) throw new Error(h.motivo); return h.hecho })
    const d = datosFiscalesDeHechos(hechos.map((h) => ({ hechoId: h.ref, tipo: 'nomina' as const, ref: h.ref, fecha: h.fecha, payload: h, asientoRef: null, proveedorNif: null, proveedorNombre: null, facturaNumero: null })))
    const c190 = calcularModelo190(d.retenciones, 2026)
    for (const [nominas, nif] of [[ana, '12345678Z'], [bruno, '87654321X']] as const) {
      const r = certificadoDeNominas({ empresa: { nombre: 'Emp', nif: 'B00000000' }, empleado: { nombre: 'x', dni: nif }, nominas: [...nominas] }, 2026)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const f = c190.perceptores.find((p) => p.nif === nif)!
      expect(f, `${nif} debe estar en el 190`).toBeTruthy()
      expect(r.certificado.lineas.map((l) => [l.clave, l.percepcionDineraria, l.retencionDineraria, l.refs])).toEqual([[f.clave, f.percepcionDineraria, f.retencionDineraria, f.refs]])
    }
    const rA = certificadoDeNominas({ empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: '12345678Z' }, nominas: ana }, 2026)
    expect(rA.ok && [rA.certificado.totales.percepciones, rA.certificado.totales.retenciones, rA.certificado.totales.gastosDeducibles]).toEqual([400000, 60000, 25400])
  })

  it('el empleado A nunca obtiene cifras de B aunque le llegaran nóminas ajenas; sin DNI no se emite', () => {
    const r = certificadoDeNominas({ empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: '12345678Z' }, nominas: [...ana, ...bruno] }, 2026)
    expect(r.ok && r.certificado.lineas.flatMap((l) => l.refs)).toEqual(['nomina:a1', 'nomina:a2'])
    expect(certificadoDeNominas({ empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: null }, nominas: ana }, 2026)).toEqual({ ok: false, motivo: 'sin_dni' })
  })

  it('formato y año', () => {
    expect(eurosEs(216249)).toBe('2.162,49€')
    expect(eurosEs(5)).toBe('0,05€')
    const hoy = new Date('2026-11-07T00:00:00Z')
    expect([anioPedido(null, hoy), anioPedido('2026', hoy), anioPedido('2027', hoy), anioPedido('20x6', hoy)]).toEqual([2025, 2026, null, null])
  })
})

describe('reenvío a contabilidad (cron diario y botón): SE_REINTENTA tiene quien lo use', () => {
  const cand = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, empresa_id: i % 2 ? 'emp-B' : 'emp-A' }))

  it('cada envío va con la empresa de SU fila, y el lote está limitado (quedan si llega una de más)', async () => {
    const llamadas: [string, string][] = []
    const enviar = async (e: string, n: string) => { llamadas.push([e, n]); return { estado: 'enviado' as const, detalle: null } }
    const r = await reenviarLote(cand(LOTE_REENVIO + 1), LOTE_REENVIO, { presupuestoMs: 60_000, enviar })
    expect(r.procesadas).toBe(LOTE_REENVIO)
    expect(r.quedan).toBe(true)
    expect(llamadas[0]).toEqual(['emp-A', 'n0'])
    expect(llamadas[1]).toEqual(['emp-B', 'n1'])
    expect(r.porEstado).toEqual({ enviado: LOTE_REENVIO })
    const corto = await reenviarLote(cand(3), LOTE_REENVIO, { presupuestoMs: 60_000, enviar })
    expect(corto.quedan).toBe(false)
  })

  it('se para al agotar el presupuesto de tiempo (no se corta a mitad por maxDuration)', async () => {
    let t = 0
    const enviar = async () => { t += 20_000; return { estado: 'error' as const, detalle: 'HTTP 503' } }
    const r = await reenviarLote(cand(10), LOTE_REENVIO, { presupuestoMs: 45_000, ahora: () => t, enviar })
    expect(r.procesadas).toBe(3)
    expect(r.quedan).toBe(true)
    expect(r.porEstado).toEqual({ error: 3 })
  })

  it('las consultas de candidatas piden SE_REINTENTA o NULL de confirmadas; el cron está en vercel.json y pide CRON_SECRET', () => {
    expect([...SE_REINTENTA]).toEqual(['pendiente_vincular', 'sin_configurar', 'error'])
    const lib = readFileSync(join(__dirname, 'hechos-contabilidad.ts'), 'utf8')
    for (const f of ['candidatasReenvioTodas', 'candidatasReenvioEmpresa']) {
      const cuerpo = lib.slice(lib.indexOf(`export async function ${f}`), lib.indexOf('LIMIT', lib.indexOf(`export async function ${f}`)))
      expect(cuerpo, f).toMatch(/n\.estado = 'confirmada'/)
      expect(cuerpo, f).toMatch(/n\.contabilidad_estado IS NULL OR n\.contabilidad_estado = ANY\(\$\{\[\.\.\.SE_REINTENTA\]\}/)
    }
    const ruta = readFileSync(join(__dirname, '..', 'app/api/cron/reenviar-contabilidad/route.ts'), 'utf8')
    expect(ruta).toMatch(/autorizacionBearerValida\(req, 'CRON_SECRET'\)/)
    expect(ruta).toMatch(/export const maxDuration = 60/)
    const vercel = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
    const cron = vercel.crons.find(c => c.path === '/api/cron/reenviar-contabilidad')
    expect(cron?.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
  })
})
