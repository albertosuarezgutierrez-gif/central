// Cliente Prisma del OPERADOR: rol `prisma_herramientas_op` (NOBYPASSRLS, sin tablas; SOLO EXECUTE de las funciones op_*),
// con su PROPIA URL `HERRAMIENTAS_OP_DATABASE_URL` (requireSecret, sin fallback). Lo importan ÚNICAMENTE las rutas
// app/api/operador/*, que exigen antes el Bearer HERRAMIENTAS_OPERADOR_SECRET (cepo: test/separacion-operador.test.ts).
// El cliente del panel (db.ts, rol prisma_herramientas) NO puede ejecutar op_*: un fallo en el panel no equivale a operador.
import { PrismaClient } from '@prisma/client'
import { requireSecret } from '@central/core-identity'
import type { IdHerramienta } from '@central/core-herramientas'
import type { TxSql } from './rls.ts'
import type { RepoOperador, DatosEmision } from './operador.ts'

export const ENV_OP_DATABASE_URL = 'HERRAMIENTAS_OP_DATABASE_URL'

/** Sin la env (o vacía) → lanza `sin_bd_operador` (statusDeErrorBd → 503). Perezoso: el panel nunca lo instancia. */
export class SinBdOperadorError extends Error {
  constructor() { super('sin_bd_operador'); this.name = 'SinBdOperadorError' }
}

const g = globalThis as unknown as { prismaHerramientasOp?: PrismaClient }
function cliente(): TxSql {
  if (!g.prismaHerramientasOp) {
    let url: string
    try { url = requireSecret(ENV_OP_DATABASE_URL).trim() } catch { throw new SinBdOperadorError() }
    if (!url) throw new SinBdOperadorError()
    g.prismaHerramientasOp = new PrismaClient({ datasourceUrl: url })
  }
  return g.prismaHerramientasOp as unknown as TxSql
}
const sql: TxSql = {
  $queryRaw: (c, ...v) => cliente().$queryRaw(c, ...v),
  $executeRaw: (c, ...v) => cliente().$executeRaw(c, ...v),
}

type Fila = Record<string, unknown>
const n = (v: unknown) => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0))

// ─── Funciones op_* (la ruta ya comprobó el Bearer) ──────────────────────────────────────────────────────
export const repoOperadorBd: RepoOperador = {
  async datosEmision(cuentaId) {
    const f = await sql.$queryRaw<Fila[]>`SELECT herramientas.op_datos_emision(${cuentaId}::uuid) AS d`
    return (f[0]?.d as DatosEmision | null) ?? null
  },
  async emitirVersion(e) {
    const f = await sql.$queryRaw<Fila[]>`SELECT o_version, o_n, o_envio FROM herramientas.op_emitir_version(${e.cuentaId}::uuid, ${e.herramientas}::text[],
      ${e.plantillaId}::uuid, ${JSON.stringify(e.variables)}::jsonb, ${e.html}::text, ${e.sha}::text, ${e.confirmo}::text, ${e.caduca}::timestamptz, ${e.actor}::text)`
    return { versionId: String(f[0].o_version), n: n(f[0].o_n), envioId: String(f[0].o_envio) }
  },
  async reservarEnvio(versionId, tipo, confirmo, actor) {
    const f = await sql.$queryRaw<Fila[]>`SELECT o_envio, o_destinatario, o_razon FROM herramientas.op_reservar_envio(${versionId}::uuid, ${tipo}::text, ${confirmo}::text, ${actor}::text)`
    return { envioId: String(f[0].o_envio), destinatario: String(f[0].o_destinatario), razonSocial: String(f[0].o_razon) }
  },
  async resolverEnvio(envioId, estado, proveedorId, error) {
    await sql.$executeRaw`SELECT herramientas.op_resolver_envio(${envioId}::uuid, ${estado}::text, ${proveedorId}::text, ${error}::text)`
  },
}

export async function opListar(): Promise<unknown> {
  const f = await sql.$queryRaw<Fila[]>`SELECT herramientas.op_listar() AS d`
  return f[0]?.d ?? []
}
export async function opFicha(cuentaId: string): Promise<unknown> {
  const f = await sql.$queryRaw<Fila[]>`SELECT herramientas.op_ficha(${cuentaId}::uuid) AS d`
  return f[0]?.d ?? null
}
export async function opAltaCuenta(d: { cif: string; razon: string; via: string | null; numero: string | null; resto: string | null; cp: string | null; municipio: string | null; provincia: string | null; acento: string | null; logo: string | null }, actor: string) {
  const f = await sql.$queryRaw<Fila[]>`SELECT o_id, o_creada FROM herramientas.op_alta_cuenta(${d.cif}::text, ${d.razon}::text, ${d.via}::text, ${d.numero}::text,
    ${d.resto}::text, ${d.cp}::text, ${d.municipio}::text, ${d.provincia}::text, ${d.acento}::text, ${d.logo}::text, ${actor}::text)`
  return { id: String(f[0].o_id), creada: f[0].o_creada === true }
}
export async function opFijarDueno(cuentaId: string, d: { email: string; nombre: string; nif: string | null; titulo: string | null }, actor: string): Promise<string> {
  const f = await sql.$queryRaw<Fila[]>`SELECT herramientas.op_fijar_dueno(${cuentaId}::uuid, ${d.email}::text, ${d.nombre}::text, ${d.nif}::text, ${d.titulo}::text, ${actor}::text) AS id`
  return String(f[0].id)
}
export async function opFijarRef(cuentaId: string, h: IdHerramienta, ref: string, actor: string) {
  await sql.$executeRaw`SELECT herramientas.op_fijar_ref(${cuentaId}::uuid, ${h}::text, ${ref}::uuid, ${actor}::text)`
}
export async function opDarAcceso(cuentaId: string, d: { email: string; nombre: string; rol: 'admin' | 'consulta' | 'empleado'; herramientas: IdHerramienta[] }, actor: string): Promise<string> {
  const f = await sql.$queryRaw<Fila[]>`SELECT herramientas.op_dar_acceso(${cuentaId}::uuid, ${d.email}::text, ${d.nombre}::text, ${d.rol}::text, ${d.herramientas}::text[], ${actor}::text) AS id`
  return String(f[0].id)
}
export async function opQuitarAcceso(cuentaId: string, personaId: string, h: IdHerramienta | null, actor: string) {
  await sql.$executeRaw`SELECT herramientas.op_quitar_acceso(${cuentaId}::uuid, ${personaId}::uuid, ${h}::text, ${actor}::text)`
}
export async function opFijarOrigen(cuentaId: string, personaId: string, origen: Record<string, unknown>, actor: string) {
  await sql.$executeRaw`SELECT herramientas.op_fijar_origen(${cuentaId}::uuid, ${personaId}::uuid, ${JSON.stringify(origen)}::jsonb, ${actor}::text)`
}
export async function opFijarRolApp(cuentaId: string, personaId: string, h: IdHerramienta, rolApp: string | null, actor: string) {
  await sql.$executeRaw`SELECT herramientas.op_fijar_rol_app(${cuentaId}::uuid, ${personaId}::uuid, ${h}::text, ${rolApp}::text, ${actor}::text)`
}
export async function opAnular(versionId: string, actor: string) {
  await sql.$executeRaw`SELECT herramientas.op_anular_version(${versionId}::uuid, ${actor}::text)`
}
export async function opDocumento(versionId: string, tipo: 'contrato' | 'certificado'): Promise<{ html: string; sha: string } | null> {
  const f = await sql.$queryRaw<Fila[]>`SELECT o_html, o_sha FROM herramientas.op_documento(${versionId}::uuid, ${tipo}::text)`
  return f[0]?.o_html ? { html: String(f[0].o_html), sha: String(f[0].o_sha) } : null
}
