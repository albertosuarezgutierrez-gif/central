// UN SOLO camino nóminas → contabilidad (07/11/2026, Alberto): #5590 (outbox `rrhh.hechos_nominas`, destino fijado al encolar) y
// #5588 (emisor directo `lib/hechos-contabilidad.ts` + cron reenviar-contabilidad) llegaron a main a la vez. Se queda el OUTBOX; de
// #5588 se conservan el perceptor/clave del 190, el certificado de retenciones, el botón de reintento (ahora sobre la cola) y el
// estado visible por nómina (leído de la cola). Vínculo de empresa: SOLO `empresa_modulos.contabilidad_empresa_id`.
// Cepos vistos fallar (rompo, miro rojo, restauro): (1) volver a importar un emisor HTTP en confirmar → rojo «sin HTTP al confirmar»;
// (2) quitar `perceptor` de la llamada a nominaAHecho en confirmar → rojo «perceptor en el hecho encolado»;
// (3) leer `em.contabilidad_empresa_id` en cualquier lib → rojo «una sola fuente del vínculo».
import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { calcularModelo190 } from '@central/module-contabilidad'
import { nominaAHecho } from '@central/module-nominas'
import { ENV_SECRETO, clasificarRespuesta } from './enviar-hechos-nominas'
import { anioPedido, certificadoDeNominas, eurosEs } from './hechos-contabilidad-certificado'
import type { FilaNominaCertificado } from './certificado-retenciones-datos'
import { etiquetaContabilidad } from '../app/admin/nominas/formato'
import { envSecretoHechos } from '../../contabilidad/lib/secretos.ts'
import { datosFiscalesDeHechos } from '../../contabilidad/lib/impuestos-datos.ts'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const APP = join(__dirname, '..')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/\s--.*$/, '')).join('\n')
const leer = (p: string) => sinComentarios(readFileSync(join(APP, p), 'utf8'))
function listar(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...listar(p))
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
  }
  return out
}
const CODIGO = [...listar(join(APP, 'lib')), ...listar(join(APP, 'app'))]

const desglose = (bruto: number, irpf: number, ssT: number, ssE: number) => ({
  devengos: { total: bruto }, deducciones: { irpf, total: Math.round((irpf + ssT) * 100) / 100 }, cuotaPatronal: { total: ssE },
  netoAPagar: Math.round((bruto - irpf - ssT) * 100) / 100, costeTotalEmpresa: Math.round((bruto + ssE) * 100) / 100, cifrasPendientes: [],
})
const fila = (id: string, periodo: string, dni: string | null, nombre: string, d: unknown): FilaNominaCertificado => ({
  id, empleado_id: 'emp-00000001', periodo, datos_calculo: d, empleado_nombre: nombre, empleado_apellidos: 'Pérez', empleado_dni: dni, empleado_provincia: '41',
})

describe('un solo camino', () => {
  it('el emisor directo y su cron ya no existen; vercel.json solo programa el envío del outbox', () => {
    expect(existsSync(join(APP, 'lib/hechos-contabilidad.ts'))).toBe(false)
    expect(existsSync(join(APP, 'app/api/cron/reenviar-contabilidad'))).toBe(false)
    const crons = (JSON.parse(readFileSync(join(APP, 'vercel.json'), 'utf8')) as { crons: { path: string }[] }).crons.map(c => c.path)
    expect(crons).toContain('/api/cron/enviar-hechos-nominas')
    expect(crons).not.toContain('/api/cron/reenviar-contabilidad')
  })
  it('sin HTTP al confirmar: confirmar solo encola (misma transacción) y no importa ningún emisor', () => {
    const r = leer('app/api/admin/nominas/[nominaId]/confirmar/route.ts')
    expect(r).not.toMatch(/fetch\(|enviarNominaAContabilidad|enviarHechosNominas|hechos-contabilidad'/)
    expect(r).toMatch(/encolarHechoNomina\(/)
  })
  it('una sola fuente del vínculo: nadie lee `empresas.contabilidad_empresa_id` ni `nominas.contabilidad_estado` (columnas sin uso, pendientes de DROP)', () => {
    const malas: string[] = []
    for (const f of CODIGO) {
      const s = sinComentarios(readFileSync(f, 'utf8'))
      if (!/\$queryRaw|\$executeRaw|Prisma\.sql/.test(s)) continue // solo SQL (la UI usa `n.contabilidad_estado` del JSON de listarNominas)
      if (/\b(em|empresas)\.contabilidad_empresa_id\b/.test(s)) malas.push(`${relative(APP, f)}: empresas.contabilidad_empresa_id`)
      if (/\bn\.contabilidad_(estado|detalle|intento_at)\b|nominas SET contabilidad_/.test(s)) malas.push(`${relative(APP, f)}: nominas.contabilidad_*`)
    }
    expect(malas).toEqual([])
    expect(leer('lib/modulos-empresa.ts')).toMatch(/SELECT contabilidad_empresa_id::text AS cid FROM rrhh\.empresa_modulos/)
  })
  it('el botón reintenta SOLO la cola de la empresa de la sesión, con el mismo envío que el cron', () => {
    const r = leer('app/api/admin/nominas/reenviar-contabilidad/route.ts')
    expect(r).toMatch(/\{ empresa_id \} = await getSesion\(\)/)
    expect(r).toMatch(/leerColaHechosNominasEmpresa\(empresa_id,/)
    expect(r).toMatch(/enviarHechosNominas\(/)
    const q = leer('lib/hechos-nominas.ts')
    const cuerpo = q.slice(q.indexOf('async function leerColaHechosNominasEmpresa'), q.indexOf('LIMIT', q.indexOf('async function leerColaHechosNominasEmpresa')))
    expect(cuerpo).toMatch(/WHERE h\.empresa_id = \$\{empresaId\}::uuid/)
    expect(cuerpo).toMatch(/h\.estado IN \('pendiente', 'error'\)/)
  })
  it('mismo nombre de secreto que contabilidad espera para rrhh; el 202 queda visible como «pendiente de regla»', () => {
    expect(ENV_SECRETO).toBe(envSecretoHechos('rrhh'))
    const v = clasificarRespuesta(202)
    expect(v.estado).toBe('enviado')
    expect(etiquetaContabilidad(v.estado, v.detalle)?.texto).toMatch(/pendiente de regla/)
    expect(etiquetaContabilidad('enviado', null)?.tono).toBe('ok')
    expect(etiquetaContabilidad(null, null)).toBeNull() // sin fila = no consta: no se afirma «no enviada»
  })
})

describe('perceptor en el hecho encolado (190)', () => {
  it('confirmar pasa el perceptor a nominaAHecho', () => {
    expect(leer('app/api/admin/nominas/[nominaId]/confirmar/route.ts')).toMatch(/nominaAHecho\(\{[\s\S]*?perceptor: \{ nombre: nomina\.empleado_nombre/)
  })
  it('NIF normalizado y clave A; DNI inválido viaja sin NIF (no se inventa); sin nombre no se asienta', () => {
    const h = nominaAHecho({ nominaId: 'nom-00000001', empleadoId: 'emp-00000001', periodo: '2026-02', desglose: desglose(2000, 300, 127, 640.5), perceptor: { nombre: 'Ana', apellidos: 'Pérez', dni: '12345678-z', provincia: '41' } })
    expect(h).toMatchObject({ ref: 'nomina:nom-00000001', fecha: '2026-02-28', bruto: 200000, irpf: 30000, ssTrabajador: 12700, liquido: 157300, clave: 'A' })
    expect(h.perceptor).toEqual({ nif: '12345678Z', nombre: 'Ana Pérez', provincia: '41' })
    const sinNif = nominaAHecho({ nominaId: 'nom-00000002', empleadoId: 'emp-00000001', periodo: '2026-02', desglose: desglose(1000, 0, 63.5, 300), perceptor: { nombre: 'Ana', dni: 'xx' } })
    expect(sinNif.perceptor).toEqual({ nombre: 'Ana' })
    expect(() => nominaAHecho({ nominaId: 'nom-00000003', empleadoId: 'emp-00000001', periodo: '2026-02', desglose: desglose(1000, 0, 63.5, 300), perceptor: { nombre: ' ' } })).toThrow(/sin nombre/)
    expect(nominaAHecho({ nominaId: 'nom-00000004', empleadoId: 'emp-00000001', periodo: '2026-02', desglose: desglose(1000, 0, 63.5, 300) })).not.toHaveProperty('perceptor')
  })
})

describe('certificado de retenciones = fila del 190 (mismos hechos)', () => {
  const ana = [fila('nom-000000a1', '2026-01', '12345678Z', 'Ana', desglose(2000, 300, 127, 640.5)), fila('nom-000000a2', '2026-02', '12345678Z', 'Ana', desglose(2000, 300, 127, 640.5))]
  const bruno = [fila('nom-000000b1', '2026-01', '87654321X', 'Bruno', desglose(900, 0, 57.15, 288))]

  it('IRPF 0 incluido; cifras idénticas a las del 190 de contabilidad', () => {
    const hechos = [...ana, ...bruno].map(n => nominaAHecho({ nominaId: n.id, empleadoId: n.empleado_id, periodo: n.periodo, desglose: n.datos_calculo, perceptor: { nombre: n.empleado_nombre, apellidos: n.empleado_apellidos, dni: n.empleado_dni, provincia: n.empleado_provincia } }))
    const d = datosFiscalesDeHechos(hechos.map(h => ({ hechoId: h.ref, tipo: 'nomina' as const, ref: h.ref, fecha: h.fecha, payload: h, asientoRef: null, proveedorNif: null, proveedorNombre: null, facturaNumero: null })))
    const c190 = calcularModelo190(d.retenciones, 2026)
    for (const [nominas, nif] of [[ana, '12345678Z'], [bruno, '87654321X']] as const) {
      const r = certificadoDeNominas({ empresa: { nombre: 'Emp', nif: 'B00000000' }, empleado: { nombre: 'x', dni: nif }, nominas: [...nominas] }, 2026)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const f = c190.perceptores.find(p => p.nif === nif)!
      expect(f, `${nif} debe estar en el 190`).toBeTruthy()
      expect(r.certificado.lineas.map(l => [l.clave, l.percepcionDineraria, l.retencionDineraria, l.refs])).toEqual([[f.clave, f.percepcionDineraria, f.retencionDineraria, f.refs]])
    }
    const rA = certificadoDeNominas({ empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: '12345678Z' }, nominas: ana }, 2026)
    expect(rA.ok && [rA.certificado.totales.percepciones, rA.certificado.totales.retenciones, rA.certificado.totales.gastosDeducibles]).toEqual([400000, 60000, 25400])
  })
  it('A nunca obtiene cifras de B; sin DNI no se emite; una nómina no asentable se avisa, no se cuenta', () => {
    const r = certificadoDeNominas({ empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: '12345678Z' }, nominas: [...ana, ...bruno] }, 2026)
    expect(r.ok && r.certificado.lineas.flatMap(l => l.refs)).toEqual(['nomina:nom-000000a1', 'nomina:nom-000000a2'])
    expect(certificadoDeNominas({ empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: null }, nominas: ana }, 2026)).toEqual({ ok: false, motivo: 'sin_dni' })
    const vieja = fila('nom-000000a3', '2026-03', '12345678Z', 'Ana', { devengos: { total: 1 } })
    const rv = certificadoDeNominas({ empresa: { nombre: 'Emp', nif: null }, empleado: { nombre: 'Ana', dni: '12345678Z' }, nominas: [...ana, vieja] }, 2026)
    expect(rv.ok && rv.noIncluidas.map(x => x.periodo)).toEqual(['2026-03'])
  })
  it('formato y año', () => {
    expect(eurosEs(216249)).toBe('2.162,49€')
    const hoy = new Date('2026-11-07T00:00:00Z')
    expect([anioPedido(null, hoy), anioPedido('2026', hoy), anioPedido('2027', hoy)]).toEqual([2025, 2026, null])
  })
})
