/**
 * Guardián `regression-nomina-asiento` (N3, parte de la app; la contable —640+642, 465 a 0, descuadre— vive en
 * packages/module-nominas/src/regression-nomina-asiento.test.ts). Aquí: activación separada, outbox en la MISMA transacción,
 * idempotencia por ref y envío (patrón del taller).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clasificarRespuesta, enviarHechosNominas, esperaTrasIntento, leerConfigContabilidad, type DepsEnvio, type Fila } from './enviar-hechos-nominas'
import { validarCambioModulo } from './modulos-empresa-reglas'

const APP = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(APP, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')

describe('activación separada (contabilidad_nominas)', () => {
  const ok = { empresa_id: '11111111-1111-1111-1111-111111111111', modulo: 'contabilidad_nominas', activo: true, modo: 'calculo', activado_por: 'Alberto', contabilidad_empresa_id: '22222222-2222-2222-2222-222222222222' }
  it('el operador lo activa aparte de `nominas` y debe indicar la empresa de contabilidad', () => {
    const v = validarCambioModulo(ok)
    expect(v.ok && v.cambio.contabilidadEmpresaId).toBe(ok.contabilidad_empresa_id)
    expect(validarCambioModulo({ ...ok, contabilidad_empresa_id: undefined }).ok).toBe(false)
    expect(validarCambioModulo({ ...ok, contabilidad_empresa_id: 'x' }).ok).toBe(false)
    expect(validarCambioModulo({ ...ok, activo: false, contabilidad_empresa_id: undefined }).ok).toBe(true) // apagar no exige empresa
    const n = validarCambioModulo({ ...ok, modulo: 'nominas', contabilidad_empresa_id: undefined })
    expect(n.ok && n.cambio.contabilidadEmpresaId).toBeNull()
  })
  it('apagado por defecto: sin fila activa no se encola; ninguna ruta /api/admin lo escribe', () => {
    const lib = leer('lib/modulos-empresa.ts')
    const q = lib.slice(lib.indexOf('async function contabilidadDeNominas'))
    expect(q).toMatch(/modulo = 'contabilidad_nominas'/)
    expect(q).toMatch(/if \(!act\[0\]\?\.activo\) return null/)
  })
})

describe('confirmar nómina → outbox (misma transacción, idempotente)', () => {
  const r = leer('app/api/admin/nominas/[nominaId]/confirmar/route.ts')
  it('con el módulo activo, el hecho se calcula ANTES de tocar nada y un descuadre devuelve 422 sin confirmar', () => {
    expect(r.indexOf('nominaAHecho(')).toBeGreaterThan(0)
    expect(r.indexOf('nominaAHecho(')).toBeLessThan(r.indexOf('generarNominaPdf('))
    expect(r).toMatch(/if \(await contabilidadDeNominas\(empresa_id\)\)/)
    expect(r).toMatch(/e instanceof ErrorNominaHecho\) return NextResponse\.json\([^)]*status: 422/)
  })
  it('confirmar y encolar van en prisma.$transaction; sin módulo no se encola', () => {
    expect(r).toMatch(/prisma\.\$transaction\(\[confirmar, encolarHechoNomina\(empresa_id, nominaId, hecho\)\]\)/)
    expect(r).toMatch(/if \(hecho\)/)
  })
  it('la cola es idempotente por (empresa_id, tipo, ref): ON CONFLICT DO NOTHING + UNIQUE en la migración', () => {
    expect(leer('lib/hechos-nominas.ts')).toMatch(/ON CONFLICT \(empresa_id, tipo, ref\) DO NOTHING/)
    const sql = readFileSync(join(APP, 'prisma/migrations/0033_fichajes_nomina_hechos.sql'), 'utf8')
    expect(sql).toMatch(/UNIQUE \(empresa_id, tipo, ref\)/)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON rrhh\.hechos_nominas TO rrhh_app;/)
    expect(sql.replace(/^\s*--.*$/gm, '')).not.toMatch(/GRANT[^;]*DELETE/)
  })
  it('el cron exige CRON_SECRET y el envío solo cubre empresas con el módulo ACTIVO y vinculadas', () => {
    expect(leer('app/api/cron/enviar-hechos-nominas/route.ts')).toMatch(/autorizacionBearerValida\(req, 'CRON_SECRET'\)/)
    const q = leer('lib/hechos-nominas.ts')
    expect(q).toMatch(/m\.modulo = 'contabilidad_nominas' AND m\.activo = true/)
    expect(q).toMatch(/m\.contabilidad_empresa_id IS NOT NULL/)
    expect(JSON.parse(readFileSync(join(APP, 'vercel.json'), 'utf8')).crons.map((c: { path: string }) => c.path)).toContain('/api/cron/enviar-hechos-nominas')
  })
})

describe('envío a contabilidad', () => {
  it('clasifica como el taller: 2xx enviado · 401/5xx/red error · otros 4xx rechazado', () => {
    for (const s of [200, 201, 202]) expect(clasificarRespuesta(s).estado).toBe('enviado')
    for (const s of [null, 401, 429, 500, 302]) expect(clasificarRespuesta(s).estado).toBe('error')
    for (const s of [400, 403, 409, 422]) expect(clasificarRespuesta(s).estado).toBe('rechazado')
    expect(esperaTrasIntento(1)).toBe(5 * 60_000)
    expect(esperaTrasIntento(99)).toBe(12 * 60 * 60_000)
  })
  it('config: sin URL/https/secreto no envía', () => {
    const sec = () => 's3'
    expect(leerConfigContabilidad({}, sec)).toBeNull()
    expect(leerConfigContabilidad({ CONTABILIDAD_URL: 'http://contabilidad.example' }, sec)).toBeNull()
    expect(leerConfigContabilidad({ CONTABILIDAD_URL: 'https://c.example/x' }, () => { throw new Error('falta') })).toBeNull()
    expect(leerConfigContabilidad({ CONTABILIDAD_URL: 'https://c.example/x' }, sec)).toEqual({ url: 'https://c.example', secreto: 's3' })
  })
  const fila = (id: string, tipo: string, nomina: string): Fila => ({ id, empresa_id: 'E', nomina_id: nomina, tipo, hecho: { tipo, ref: id }, intentos: 0, contabilidad_empresa_id: 'C' })
  function deps(status: number | ((n: number) => number), cola: Fila[]) {
    const marcas: Record<string, string> = {}; const peticiones: { cabeceras: Record<string, string>; cuerpo: any }[] = []
    const d: DepsEnvio = {
      config: { url: 'https://c.example', secreto: 's3' },
      leerCola: async () => cola,
      marcar: async (id, _e, v) => { marcas[id] = v.estado },
      fetch: async (_u, init) => { peticiones.push({ cabeceras: init.headers, cuerpo: JSON.parse(init.body) }); return { status: typeof status === 'function' ? status(peticiones.length) : status, text: async () => '' } },
      ahora: () => new Date('2026-05-02T10:00:00Z'),
    }
    return { d, marcas, peticiones }
  }
  it('envía con el origen «rrhh», la empresa de contabilidad y el hecho; marca enviado', async () => {
    const { d, marcas, peticiones } = deps(201, [fila('h1', 'nomina', 'n1')])
    expect(await enviarHechosNominas(d)).toMatchObject({ enviados: 1, errores: 0 })
    expect(marcas.h1).toBe('enviado')
    expect(peticiones[0].cabeceras['x-origen-app']).toBe('rrhh')
    expect(peticiones[0].cuerpo).toEqual({ empresaId: 'C', hecho: { tipo: 'nomina', ref: 'h1' } })
  })
  it('un pago no viaja antes que su nómina: si la nómina falla, el pago se aplaza', async () => {
    const { d, marcas } = deps(n => (n === 1 ? 500 : 201), [fila('h1', 'nomina', 'n1'), fila('p1', 'pago', 'n1'), fila('h2', 'nomina', 'n2')])
    expect(await enviarHechosNominas(d)).toMatchObject({ enviados: 1, errores: 1, aplazados: 1 })
    expect(marcas).toEqual({ h1: 'error', h2: 'enviado' })
  })
  it('sin configuración no se lee ni se envía nada', async () => {
    const { d, peticiones } = deps(201, [fila('h1', 'nomina', 'n1')])
    expect(await enviarHechosNominas({ ...d, config: null })).toMatchObject({ configurado: false, enviados: 0 })
    expect(peticiones).toHaveLength(0)
  })
})
