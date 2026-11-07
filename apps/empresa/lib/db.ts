// Cliente Prisma del PANEL: schema `herramientas`, rol prisma_herramientas (NOBYPASSRLS, sin EXECUTE de op_*). Lecturas SOLO
// dentro de `conPersona` (RLS); escrituras SOLO por funciones SECURITY DEFINER de 0001. SQL con plantilla (parámetros enlazados).
// Las funciones del OPERADOR viven en `db-operador.ts` (otro rol y otra URL; solo las importan las rutas /api/operador/*).
import { PrismaClient } from '@prisma/client'
import { esHerramienta, type IdHerramienta, type Rol, type EstadoHerramienta, type EstadoVersion, type VariablesContrato } from '@central/core-herramientas'
import { crearConPersona, type ClienteConTx, type TxSql } from './rls.ts'
import type { RepoOtp, Proposito, EnvioCodigo } from './acceso.ts'
import type { RepoFirma, VersionParaFirmar } from './firma.ts'

const g = globalThis as unknown as { prismaHerramientas?: PrismaClient }
const prisma = g.prismaHerramientas ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') g.prismaHerramientas = prisma
const sql = prisma as unknown as TxSql & ClienteConTx<TxSql>

export const conPersona = crearConPersona<TxSql>(sql)
type Fila = Record<string, unknown>
const n = (v: unknown) => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0))

// ─── Login / sesión ────────────────────────────────────────────────────────────────────────────────────────────────
export const repoOtpBd: RepoOtp = {
  async contarRecientesPorClave(p: Proposito, claveHash, desde) {
    const f = await sql.$queryRaw<Fila[]>`SELECT count(*)::int AS n FROM herramientas.acceso_otp WHERE proposito = ${p} AND email_hash = ${claveHash} AND creado_en >= ${desde}`
    return n(f[0]?.n)
  },
  async contarRecientesPorIp(ip, desde) {
    const f = await sql.$queryRaw<Fila[]>`SELECT count(*)::int AS n FROM herramientas.acceso_otp WHERE ip = ${ip} AND creado_en >= ${desde}`
    return n(f[0]?.n)
  },
  async crearOtp(x: { proposito: Proposito; claveHash: string; codigoHash: string; ip: string; envio: EnvioCodigo }) {
    await sql.$executeRaw`INSERT INTO herramientas.acceso_otp (proposito, email_hash, codigo_hash, ip, envio) VALUES (${x.proposito}, ${x.claveHash}, ${x.codigoHash}, ${x.ip}, ${x.envio})`
  },
  async ultimoOtp(p, claveHash) {
    const f = await sql.$queryRaw<Fila[]>`SELECT id, codigo_hash, creado_en, intentos, usado_en FROM herramientas.acceso_otp
      WHERE proposito = ${p} AND email_hash = ${claveHash} ORDER BY creado_en DESC LIMIT 1`
    if (!f[0]) return null
    return { id: String(f[0].id), codigoHash: String(f[0].codigo_hash), creadoEn: f[0].creado_en as Date, intentos: n(f[0].intentos), usadoEn: (f[0].usado_en as Date | null) ?? null }
  },
  async reservarIntento(id, max) {
    return (await sql.$executeRaw`UPDATE herramientas.acceso_otp SET intentos = intentos + 1 WHERE id = ${id}::uuid AND usado_en IS NULL AND intentos < ${max}::int`) === 1
  },
  async gastarOtp(id) {
    return (await sql.$executeRaw`UPDATE herramientas.acceso_otp SET usado_en = now() WHERE id = ${id}::uuid AND usado_en IS NULL`) === 1
  },
}

export async function personaPorEmail(email: string): Promise<{ id: string; nombre: string; sv: number } | null> {
  const f = await sql.$queryRaw<Fila[]>`SELECT o_id, o_nombre, o_sv FROM herramientas.persona_por_email(${email}::text)`
  return f[0] ? { id: String(f[0].o_id), nombre: String(f[0].o_nombre), sv: n(f[0].o_sv) } : null
}
export async function marcarEmailVerificado(personaId: string) {
  await sql.$executeRaw`SELECT herramientas.marcar_email_verificado(${personaId}::uuid)`
}
export async function personaVigente(personaId: string, sv: number): Promise<boolean> {
  const f = await sql.$queryRaw<Fila[]>`SELECT herramientas.persona_vigente(${personaId}::uuid, ${sv}::int) AS ok`
  return f[0]?.ok === true
}
export async function cerrarSesiones(personaId: string) {
  await sql.$executeRaw`SELECT herramientas.cerrar_sesiones(${personaId}::uuid)`
}

// ─── Panel de la persona (todo bajo RLS) ───────────────────────────────────────────────────────────────────────────
export type CuentaPanel = {
  id: string; cif: string; razonSocial: string; acento: string | null; logoUrl: string | null; rol: Rol
  herramientas: { herramienta: IdHerramienta; estado: EstadoHerramienta }[]
  concedidas: IdHerramienta[]
  pendiente: { versionId: string; n: number; caducaEn: Date; emitidaEn: Date } | null
}

export async function cuentasDePersona(personaId: string): Promise<CuentaPanel[]> {
  return conPersona(personaId, async (tx) => {
    const cuentas = await tx.$queryRaw<Fila[]>`
      SELECT c.id, c.cif, c.razon_social, c.marca_acento, c.marca_logo_url, m.rol
        FROM herramientas.cuenta c JOIN herramientas.cuenta_miembro m ON m.cuenta_id = c.id
       WHERE m.persona_id = herramientas.persona_actual() AND m.estado = 'activo' AND c.activo ORDER BY c.razon_social`
    const hs = await tx.$queryRaw<Fila[]>`SELECT cuenta_id, herramienta, estado FROM herramientas.cuenta_herramienta`
    const cs = await tx.$queryRaw<Fila[]>`SELECT cuenta_id, herramienta FROM herramientas.miembro_herramienta WHERE persona_id = herramientas.persona_actual()`
    const pend = await tx.$queryRaw<Fila[]>`SELECT ct.cuenta_id, cv.id, cv.n, cv.caduca_en, cv.emitida_en FROM herramientas.contrato ct
      JOIN herramientas.contrato_version cv ON cv.contrato_id = ct.id WHERE cv.estado = 'enviado'`
    return cuentas.map((c) => {
      const id = String(c.id)
      const p = pend.find((x) => String(x.cuenta_id) === id)
      return {
        id, cif: String(c.cif), razonSocial: String(c.razon_social), acento: (c.marca_acento as string | null) ?? null,
        logoUrl: (c.marca_logo_url as string | null) ?? null, rol: c.rol as Rol,
        herramientas: hs.filter((h) => String(h.cuenta_id) === id && esHerramienta(h.herramienta)).map((h) => ({ herramienta: h.herramienta as IdHerramienta, estado: h.estado as EstadoHerramienta })),
        concedidas: cs.filter((x) => String(x.cuenta_id) === id && esHerramienta(x.herramienta)).map((x) => x.herramienta as IdHerramienta),
        pendiente: p ? { versionId: String(p.id), n: n(p.n), caducaEn: p.caduca_en as Date, emitidaEn: p.emitida_en as Date } : null,
      }
    })
  })
}

export async function rolEn(personaId: string, cuentaId: string): Promise<Rol | null> {
  return conPersona(personaId, async (tx) => {
    const f = await tx.$queryRaw<Fila[]>`SELECT herramientas.rol_en(${cuentaId}::uuid) AS rol`
    return (f[0]?.rol as Rol | null) ?? null
  })
}

export type VersionLista = { id: string; n: number; estado: EstadoVersion; emitidaEn: Date; caducaEn: Date; sha: string; herramientas: string[]; firmadaEn: Date | null; certificadoSha: string | null }
export async function versionesDeCuenta(personaId: string, cuentaId: string): Promise<VersionLista[]> {
  return conPersona(personaId, async (tx) => {
    const f = await tx.$queryRaw<Fila[]>`SELECT cv.id, cv.n, cv.estado, cv.emitida_en, cv.caduca_en, cv.documento_sha256, cv.herramientas, fi.firmado_en, fi.certificado_sha256
      FROM herramientas.contrato ct JOIN herramientas.contrato_version cv ON cv.contrato_id = ct.id
      LEFT JOIN herramientas.firma fi ON fi.contrato_version_id = cv.id WHERE ct.cuenta_id = ${cuentaId}::uuid ORDER BY cv.n DESC`
    return f.map((x) => ({ id: String(x.id), n: n(x.n), estado: x.estado as EstadoVersion, emitidaEn: x.emitida_en as Date, caducaEn: x.caduca_en as Date,
      sha: String(x.documento_sha256), herramientas: (x.herramientas as string[]) ?? [], firmadaEn: (x.firmado_en as Date | null) ?? null, certificadoSha: (x.certificado_sha256 as string | null) ?? null }))
  })
}

/** Documento (contrato o certificado) de una versión VISIBLE para la persona (RLS). */
export async function documentoDePersona(personaId: string, versionId: string, tipo: 'contrato' | 'certificado'): Promise<{ html: string; sha: string; cuentaId: string } | null> {
  return conPersona(personaId, async (tx) => {
    const f = tipo === 'contrato'
      ? await tx.$queryRaw<Fila[]>`SELECT cv.documento_html AS html, cv.documento_sha256 AS sha, ct.cuenta_id FROM herramientas.contrato_version cv
          JOIN herramientas.contrato ct ON ct.id = cv.contrato_id WHERE cv.id = ${versionId}::uuid`
      : await tx.$queryRaw<Fila[]>`SELECT fi.certificado_html AS html, fi.certificado_sha256 AS sha, ct.cuenta_id FROM herramientas.firma fi
          JOIN herramientas.contrato_version cv ON cv.id = fi.contrato_version_id JOIN herramientas.contrato ct ON ct.id = cv.contrato_id
          WHERE fi.contrato_version_id = ${versionId}::uuid`
    return f[0] ? { html: String(f[0].html), sha: String(f[0].sha), cuentaId: String(f[0].cuenta_id) } : null
  })
}

export type MiembroVista = { personaId: string; nombre: string; email: string; rol: Rol; herramientas: IdHerramienta[] }
export async function miembrosDeCuenta(personaId: string, cuentaId: string): Promise<MiembroVista[]> {
  return conPersona(personaId, async (tx) => {
    const f = await tx.$queryRaw<Fila[]>`SELECT p.id, p.nombre, p.email, m.rol,
        coalesce((SELECT array_agg(mh.herramienta) FROM herramientas.miembro_herramienta mh WHERE mh.cuenta_id = m.cuenta_id AND mh.persona_id = m.persona_id), '{}') AS hs
      FROM herramientas.cuenta_miembro m JOIN herramientas.persona p ON p.id = m.persona_id
      WHERE m.cuenta_id = ${cuentaId}::uuid AND m.estado = 'activo' ORDER BY m.rol DESC, p.nombre`
    return f.map((x) => ({ personaId: String(x.id), nombre: String(x.nombre), email: String(x.email), rol: x.rol as Rol, herramientas: ((x.hs as string[]) ?? []).filter(esHerramienta) }))
  })
}

export async function darAcceso(personaId: string, cuentaId: string, email: string, nombre: string, rol: 'admin' | 'consulta' | 'empleado', herramientas: IdHerramienta[]) {
  return conPersona(personaId, async (tx) => {
    await tx.$executeRaw`SELECT herramientas.dar_acceso(${cuentaId}::uuid, ${email}::text, ${nombre}::text, ${rol}::text, ${herramientas}::text[])`
  })
}
export async function quitarAcceso(personaId: string, cuentaId: string, otra: string, herramienta: IdHerramienta | null) {
  return conPersona(personaId, async (tx) => {
    await tx.$executeRaw`SELECT herramientas.quitar_acceso(${cuentaId}::uuid, ${otra}::uuid, ${herramienta}::text)`
  })
}

export async function registrarTraspaso(personaId: string, cuentaId: string, herramienta: IdHerramienta, jti: string, aud: string, exp: Date): Promise<{ ref: string; email: string }> {
  return conPersona(personaId, async (tx) => {
    const f = await tx.$queryRaw<Fila[]>`SELECT o_ref, o_email FROM herramientas.registrar_traspaso(${cuentaId}::uuid, ${herramienta}::text, ${jti}::uuid, ${aud}::text, ${exp})`
    if (!f[0]) throw new Error('sin_acceso')
    return { ref: String(f[0].o_ref), email: String(f[0].o_email) }
  })
}

/** Repositorio de firma de UNA persona: todo en la MISMA transacción RLS (lectura + firmar_version). */
export function conRepoFirma<R>(personaId: string, fn: (repo: RepoFirma) => Promise<R>): Promise<R> {
  return conPersona(personaId, (tx) => fn({
    async version(versionId) {
      const f = await tx.$queryRaw<Fila[]>`SELECT cv.id, cv.n, cv.estado, cv.caduca_en, cv.documento_html, cv.documento_sha256, cv.destinatario_persona_id, cv.variables, ct.cuenta_id
        FROM herramientas.contrato_version cv JOIN herramientas.contrato ct ON ct.id = cv.contrato_id WHERE cv.id = ${versionId}::uuid`
      const x = f[0]
      if (!x) return null
      return { id: String(x.id), n: n(x.n), estado: x.estado as EstadoVersion, caducaEn: x.caduca_en as Date, documentoHtml: String(x.documento_html),
        documentoSha256: String(x.documento_sha256), destinatarioPersonaId: String(x.destinatario_persona_id), cuentaId: String(x.cuenta_id),
        variables: x.variables as VariablesContrato } satisfies VersionParaFirmar
    },
    async rol(cuentaId) {
      const f = await tx.$queryRaw<Fila[]>`SELECT herramientas.rol_en(${cuentaId}::uuid) AS rol`
      return (f[0]?.rol as Rol | null) ?? null
    },
    async firmar(a) {
      const f = await tx.$queryRaw<Fila[]>`SELECT herramientas.firmar_version(${a.versionId}::uuid, ${a.nombre}::text, ${a.titulo}::text, ${a.ip}::text, ${a.ua}::text,
        ${a.shaVisto}::text, ${a.firmadoEn}::timestamptz, ${JSON.stringify(a.evidencia)}::jsonb, ${a.certificadoHtml}::text, ${a.certificadoSha}::text) AS id`
      return String(f[0]?.id)
    },
  }), { timeout: 15_000 })
}

export async function personaPropia(personaId: string): Promise<{ id: string; email: string; nombre: string } | null> {
  return conPersona(personaId, async (tx) => {
    const f = await tx.$queryRaw<Fila[]>`SELECT id, email, nombre FROM herramientas.persona WHERE id = herramientas.persona_actual()`
    return f[0] ? { id: String(f[0].id), email: String(f[0].email), nombre: String(f[0].nombre) } : null
  })
}
