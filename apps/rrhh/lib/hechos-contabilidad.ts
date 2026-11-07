// Emisor rrhh → contabilidad: cada nómina CONFIRMADA viaja como `HechoNomina` a `POST {CONTABILIDAD_URL}/api/hechos` (puerto de
// apps/contabilidad/lib/puerto-hechos.ts), con `x-origen-app: rrhh` y `Authorization: Bearer <CONTABILIDAD_HECHOS_SECRET_RRHH>`.
//
// Reglas:
//   · `ref = nomina:<id>` → idempotente: reenviar la misma nómina responde 200 «duplicado», nunca la asienta dos veces.
//   · Empresa emparejada SOLO por `rrhh.empresas.contabilidad_empresa_id` (migración 0033). NULL → no se envía: «pendiente de vincular».
//   · NUNCA bloquea ni deshace la confirmación: `enviarNominaAContabilidad` no lanza; el resultado se anota en la nómina para reintento.
//   · Secreto con `requireSecret` SIN fallback (regla del monorepo): sin él no se envía («sin configurar»), jamás con un literal.
//   · Los logs llevan el id de la nómina y el estado; NUNCA el NIF, el nombre ni importes del empleado.
// `hechoDeNomina` es PURO y es también la base del certificado de retenciones del portal /e: lo que ve el empleado sale de los MISMOS
// hechos que contabilidad usa para el 111/190 (`retencionDeNomina` de @central/module-contabilidad).
import { requireSecret } from '@central/core-identity'
import { eurosACentimos } from '@central/module-nominas'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const ENV_URL = 'CONTABILIDAD_URL'
/** El mismo nombre que contabilidad espera para rrhh: `envSecretoHechos('rrhh')` de apps/contabilidad/lib/secretos.ts. */
export const ENV_SECRETO = 'CONTABILIDAD_HECHOS_SECRET_RRHH'
export const APP_ORIGEN = 'rrhh'
/** Clave de percepción del 190 para rendimientos del trabajo (trabajadores por cuenta ajena). */
export const CLAVE_TRABAJO = 'A'

export type HechoNominaRrhh = {
  tipo: 'nomina'
  fecha: string
  ref: string
  concepto: string
  bruto: number
  ssEmpresa: number
  irpf: number
  ssTrabajador: number
  liquido: number
  perceptor: { nif?: string; nombre: string; provincia?: string }
  clave: string
}

export type FilaNominaEnvio = {
  id: string
  periodo: string
  datos_calculo: unknown
  empleado_nombre: string | null
  empleado_apellidos: string | null
  empleado_dni: string | null
  empleado_provincia: string | null
}

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const NIF_RE = /^[A-Z0-9]{8,10}$/

/** «AAAA-MM» → último día del mes (fecha de devengo/pago habitual de la nómina). null si el periodo no es válido. */
export function fechaDePeriodo(periodo: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodo ?? '')
  if (!m) return null
  const ultimo = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  return `${m[1]}-${m[2]}-${String(ultimo).padStart(2, '0')}`
}

function centimos(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return eurosACentimos(v)
}

/** Desglose de la nómina (euros, `datos_calculo`) → hecho del puerto (céntimos). PURO. Lo que no cuadra NO se envía. */
export function hechoDeNomina(n: FilaNominaEnvio): { ok: true; hecho: HechoNominaRrhh } | { ok: false; motivo: string } {
  const fecha = fechaDePeriodo(n.periodo)
  if (!fecha) return { ok: false, motivo: 'periodo de la nómina no válido' }
  const d = obj(n.datos_calculo)
  const dev = obj(d?.devengos)
  const ded = obj(d?.deducciones)
  const pat = obj(d?.cuotaPatronal)
  const bruto = centimos(dev?.total)
  const irpf = centimos(ded?.irpf)
  const totalTrabajador = centimos(ded?.total)
  const ssEmpresa = centimos(pat?.total)
  const liquido = centimos(d?.netoAPagar)
  if (bruto === null || irpf === null || totalTrabajador === null || ssEmpresa === null || liquido === null) {
    return { ok: false, motivo: 'desglose de la nómina incompleto (bruto, IRPF, SS o líquido)' }
  }
  const ssTrabajador = totalTrabajador - irpf
  if (ssTrabajador < 0) return { ok: false, motivo: 'deducciones del trabajador menores que el IRPF' }
  // El núcleo contable exige bruto − IRPF − SS trabajador = líquido (si no, 422). Se comprueba antes de enviar.
  if (bruto - irpf - ssTrabajador !== liquido) return { ok: false, motivo: 'la nómina no cuadra: bruto − IRPF − SS trabajador ≠ líquido (¿embargo o anticipo?)' }
  const nombre = [n.empleado_nombre, n.empleado_apellidos].map((x) => (x ?? '').trim()).filter(Boolean).join(' ').slice(0, 200)
  if (!nombre) return { ok: false, motivo: 'empleado sin nombre' }
  const nif = (n.empleado_dni ?? '').toUpperCase().replace(/[\s.-]/g, '')
  const provincia = (n.empleado_provincia ?? '').trim()
  return {
    ok: true,
    hecho: {
      tipo: 'nomina', fecha, ref: `nomina:${n.id}`, concepto: `Nómina ${n.periodo}`,
      bruto, ssEmpresa, irpf, ssTrabajador, liquido,
      // Sin NIF válido no se inventa: viaja solo el nombre y el 190 lo lista como incompleto.
      perceptor: { ...(NIF_RE.test(nif) ? { nif } : {}), nombre, ...(/^\d{2}$/.test(provincia) ? { provincia } : {}) },
      clave: CLAVE_TRABAJO,
    },
  }
}

// ── Envío ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ConfigContabilidad = { url: string; secreto: string }

/** null = sin configurar. Sin fallback: si `requireSecret` lanza (falta la variable), no se envía. URL https (o http en localhost). */
export function leerConfigContabilidad(env: Record<string, string | undefined> = process.env, secretoDe: (n: string) => string = requireSecret): ConfigContabilidad | null {
  const crudo = (env[ENV_URL] ?? '').trim()
  if (!crudo) return null
  let u: URL
  try { u = new URL(crudo) } catch { return null }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
  let secreto: string
  try { secreto = secretoDe(ENV_SECRETO) } catch { return null }
  if (!secreto) return null
  return { url: u.origin, secreto }
}

/**
 * Estado del envío (columna `rrhh.nominas.contabilidad_estado`; NULL = nunca intentado / no se sabe):
 *   enviado            201/200 asentado (o duplicado idempotente)        · no se reintenta
 *   pendiente_regla    202: contabilidad lo guardó pero falta regla/ejercicio · no se reintenta (lo resuelve contabilidad)
 *   pendiente_vincular la empresa no tiene contabilidad_empresa_id       · se reintenta al vincular
 *   sin_configurar     falta CONTABILIDAD_URL o el secreto                · se reintenta
 *   error              red, timeout, 401, 429, 5xx                         · se reintenta
 *   rechazado          400/403/409/422: hay que mirarlo                    · NO se reintenta solo
 *   no_enviable        el desglose no permite construir el hecho          · NO se reintenta solo
 */
export type EstadoEnvio = 'enviado' | 'pendiente_regla' | 'pendiente_vincular' | 'sin_configurar' | 'error' | 'rechazado' | 'no_enviable'
export type ResultadoEnvio = { estado: EstadoEnvio; detalle: string | null }

export const SE_REINTENTA: readonly EstadoEnvio[] = ['pendiente_vincular', 'sin_configurar', 'error']

/** `status` null = sin respuesta (red caída, timeout). PURO. */
export function clasificarRespuesta(status: number | null, cuerpo = ''): ResultadoEnvio {
  const det = (t: string) => `${t}${cuerpo ? `: ${cuerpo.slice(0, 300)}` : ''}`
  if (status === null) return { estado: 'error', detalle: det('sin respuesta de contabilidad') }
  if (status === 200 || status === 201) return { estado: 'enviado', detalle: null }
  if (status === 202) return { estado: 'pendiente_regla', detalle: det('202: contabilidad lo guardó pendiente de regla o de ejercicio') }
  if (status === 401) return { estado: 'error', detalle: det('401: contabilidad no acepta el secreto de rrhh (revisar configuración)') }
  if (status === 408 || status === 425 || status === 429 || status >= 500 || status < 200 || (status >= 203 && status < 400)) return { estado: 'error', detalle: det(`HTTP ${status}`) }
  const motivo = status === 409 ? '409: ya existe un hecho con esa referencia y contenido distinto'
    : status === 403 ? '403: el origen «rrhh» no está autorizado en esa empresa de contabilidad' : `HTTP ${status}`
  return { estado: 'rechazado', detalle: det(motivo) }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'manual'; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>

export type DatosEnvio = { contabilidadEmpresaId: string | null; nomina: FilaNominaEnvio }

export interface DepsEnvio {
  /** Lee nómina + empleado + empresa, SIEMPRE filtrando por empresa_id. null = no existe en esa empresa. */
  leer(empresaId: string, nominaId: string): Promise<DatosEnvio | null>
  registrar(empresaId: string, nominaId: string, r: ResultadoEnvio): Promise<void>
  config(): ConfigContabilidad | null
  fetch: FetchLike
  timeoutMs?: number
}

/** Envía una nómina confirmada. NUNCA lanza: cualquier fallo queda como estado reintentable y se anota. */
export async function enviarNominaAContabilidad(empresaId: string, nominaId: string, deps: DepsEnvio = depsReales()): Promise<ResultadoEnvio> {
  let r: ResultadoEnvio
  try {
    r = await intentar(empresaId, nominaId, deps)
  } catch (e) {
    r = { estado: 'error', detalle: `fallo interno: ${e instanceof Error ? e.name : 'error'}` }
  }
  try {
    await deps.registrar(empresaId, nominaId, r)
  } catch (e) {
    console.error('[hechos-contabilidad] no se pudo anotar el envío', nominaId, r.estado, e instanceof Error ? e.message : e)
  }
  if (r.estado !== 'enviado') console.warn('[hechos-contabilidad]', nominaId, r.estado)
  return r
}

async function intentar(empresaId: string, nominaId: string, deps: DepsEnvio): Promise<ResultadoEnvio> {
  const datos = await deps.leer(empresaId, nominaId)
  if (!datos) return { estado: 'no_enviable', detalle: 'nómina no encontrada en la empresa' }
  if (!datos.contabilidadEmpresaId) return { estado: 'pendiente_vincular', detalle: 'la empresa no está vinculada a contabilidad (contabilidad_empresa_id vacío)' }
  const h = hechoDeNomina(datos.nomina)
  if (!h.ok) return { estado: 'no_enviable', detalle: h.motivo }
  const config = deps.config()
  if (!config) return { estado: 'sin_configurar', detalle: `falta ${ENV_URL} o ${ENV_SECRETO}` }
  try {
    const res = await deps.fetch(`${config.url}/api/hechos`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.secreto}`, 'x-origen-app': APP_ORIGEN },
      body: JSON.stringify({ empresaId: datos.contabilidadEmpresaId, hecho: h.hecho }),
    })
    return clasificarRespuesta(res.status, await res.text().catch(() => ''))
  } catch (e) {
    return clasificarRespuesta(null, e instanceof Error ? e.name : 'error')
  }
}

// ── Adaptadores reales (Prisma, SQL con empresa_id: rrhh_app tiene BYPASSRLS) ───────────────────────────────────────

export async function leerNominaParaEnvio(empresaId: string, nominaId: string): Promise<DatosEnvio | null> {
  const rows = await prisma.$queryRaw<(FilaNominaEnvio & { contabilidad_empresa_id: string | null })[]>(Prisma.sql`
    SELECT n.id::text AS id, n.periodo, n.datos_calculo,
           e.nombre AS empleado_nombre, e.apellidos AS empleado_apellidos, e.dni AS empleado_dni, e.provincia AS empleado_provincia,
           em.contabilidad_empresa_id::text AS contabilidad_empresa_id
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    JOIN rrhh.empresas em ON em.id = n.empresa_id
    WHERE n.id = ${nominaId}::uuid AND n.empresa_id = ${empresaId}::uuid AND n.estado = 'confirmada' LIMIT 1`)
  const f = rows[0]
  if (!f) return null
  const { contabilidad_empresa_id, ...nomina } = f
  return { contabilidadEmpresaId: contabilidad_empresa_id, nomina }
}

/** Anota el resultado en la nómina (columnas contabilidad_estado/_detalle/_intento_at). Si aún no existen, el catch del llamador lo registra. */
export async function registrarEnvioNomina(empresaId: string, nominaId: string, r: ResultadoEnvio): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.nominas SET contabilidad_estado = ${r.estado}, contabilidad_detalle = ${r.detalle}, contabilidad_intento_at = now()
    WHERE id = ${nominaId}::uuid AND empresa_id = ${empresaId}::uuid`)
}

function depsReales(): DepsEnvio {
  return {
    leer: leerNominaParaEnvio,
    registrar: registrarEnvioNomina,
    config: () => leerConfigContabilidad(),
    fetch: (url, init) => fetch(url, init),
  }
}

// ── Certificado de retenciones (portal /e) ──────────────────────────────────────────────────────────────────────────

export type DatosCertificado = {
  empresa: { nombre: string; nif: string | null }
  empleado: { nombre: string; dni: string | null }
  nominas: FilaNominaEnvio[]
}

/**
 * Nóminas CONFIRMADAS del año de UN empleado de UNA empresa (ambos de la sesión del empleado, nunca de la petición).
 * null = el empleado no existe en esa empresa.
 */
export async function leerDatosCertificado(empresaId: string, empleadoId: string, anio: number): Promise<DatosCertificado | null> {
  const emp = await prisma.$queryRaw<{ empresa_nombre: string; empresa_nif: string | null; nombre: string | null; apellidos: string | null; dni: string | null }[]>(Prisma.sql`
    SELECT em.nombre AS empresa_nombre, em.nif AS empresa_nif, e.nombre, e.apellidos, e.dni
    FROM rrhh.empleados e JOIN rrhh.empresas em ON em.id = e.empresa_id
    WHERE e.id = ${empleadoId}::uuid AND e.empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!emp[0]) return null
  const delAnio = `${anio}-%`
  const nominas = await prisma.$queryRaw<FilaNominaEnvio[]>(Prisma.sql`
    SELECT n.id::text AS id, n.periodo, n.datos_calculo,
           e.nombre AS empleado_nombre, e.apellidos AS empleado_apellidos, e.dni AS empleado_dni, e.provincia AS empleado_provincia
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    WHERE n.empresa_id = ${empresaId}::uuid AND n.empleado_id = ${empleadoId}::uuid AND n.estado = 'confirmada'
      AND n.periodo LIKE ${delAnio}
    ORDER BY n.periodo`)
  const e = emp[0]
  return {
    empresa: { nombre: e.empresa_nombre, nif: e.empresa_nif },
    empleado: { nombre: [e.nombre, e.apellidos].map((x) => (x ?? '').trim()).filter(Boolean).join(' '), dni: e.dni },
    nominas,
  }
}
