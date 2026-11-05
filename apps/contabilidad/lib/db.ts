// Cliente Prisma del schema `contabilidad` (rol prisma_contabilidad, NOBYPASSRLS). Las tablas de negocio, SOLO por `conEmpresa`.
// Fuera de `conEmpresa` solo se llama a las funciones SECURITY DEFINER de 0001 (alta, login, selector, revalidación de sesión),
// que devuelven ids/roles y nunca datos contables, y a `acceso_otps` (hashes del código; sin empresa todavía).
import { PrismaClient } from '@prisma/client'
import { crearConEmpresa, type ClienteConTx, type TxSql } from './rls.ts'
import { repoSql, type RepoContable } from './repo.ts'
import type { RepoAcceso, EmpresaDeUsuario, EnvioCodigo } from './acceso.ts'
import type { Forma, Sector } from './alta-empresa.ts'
import { enteroDeBd } from './importes.ts'

const globalForPrisma = globalThis as unknown as { prismaContabilidad?: PrismaClient }
const prisma = globalForPrisma.prismaContabilidad ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaContabilidad = prisma

const sql = prisma as unknown as TxSql & ClienteConTx<TxSql>

/** `conEmpresa(empresaId, tx => …)`: abre transacción, fija la empresa para RLS y ejecuta. Sin empresa válida → lanza. */
export const conEmpresa = crearConEmpresa<TxSql>(sql)

/** Repositorio de la empresa dentro de su transacción RLS. */
export const conRepo = <R>(empresaId: string, fn: (repo: RepoContable) => Promise<R>, opciones?: { timeout?: number }) =>
  conEmpresa(empresaId, (tx) => fn(repoSql(tx, empresaId.toLowerCase())), opciones)

type Fila = Record<string, unknown>

export async function altaEmpresaBd(d: { nif: string; razonSocial: string; forma: Forma; sector: Sector; logoUrl: string | null; colorPrimario: string | null }) {
  const f = await sql.$queryRaw<Fila[]>`
    SELECT o_id, o_creado FROM contabilidad.alta_empresa(${d.nif}::text, ${d.razonSocial}::text, ${d.forma}::text, ${d.sector}::text,
                                                         ${d.logoUrl}::text, ${d.colorPrimario}::text)`
  if (!f[0]) throw new Error('alta_empresa no devolvió fila')
  return { id: String(f[0].o_id), creado: f[0].o_creado === true }
}

export async function altaUsuarioBd(email: string, nombre: string): Promise<string> {
  const f = await sql.$queryRaw<Fila[]>`SELECT contabilidad.alta_usuario(${email}::text, ${nombre}::text) AS id`
  if (!f[0]?.id) throw new Error('alta_usuario no devolvió id')
  return String(f[0].id)
}

/** Rol vigente del usuario en la empresa (o null): usuario activo, misma versión de sesión, vínculo y empresa activos. */
export async function sesionVigenteBd(usuarioId: string, empresaId: string, sv: number): Promise<'dueno' | 'gestor' | null> {
  const f = await sql.$queryRaw<Fila[]>`SELECT contabilidad.sesion_vigente(${usuarioId}::uuid, ${empresaId}::uuid, ${sv}::int) AS rol`
  const rol = f[0]?.rol
  return rol === 'dueno' || rol === 'gestor' ? rol : null
}

export async function usuarioVigenteBd(usuarioId: string, sv: number): Promise<boolean> {
  const f = await sql.$queryRaw<Fila[]>`SELECT contabilidad.usuario_vigente(${usuarioId}::uuid, ${sv}::int) AS ok`
  return f[0]?.ok === true
}

export async function empresasDeUsuarioBd(usuarioId: string): Promise<EmpresaDeUsuario[]> {
  const f = await sql.$queryRaw<Fila[]>`SELECT o_empresa, o_razon_social, o_rol FROM contabilidad.empresas_de_usuario(${usuarioId}::uuid)`
  return f.map((x) => ({ empresaId: String(x.o_empresa), razonSocial: String(x.o_razon_social), rol: x.o_rol as 'dueno' | 'gestor' }))
}

export async function cerrarSesionesBd(usuarioId: string): Promise<void> {
  await sql.$executeRaw`SELECT contabilidad.cerrar_sesiones(${usuarioId}::uuid)`
}

/** Puerto de acceso (OTP) sobre `contabilidad.acceso_otps` y las funciones de login. */
export const repoAccesoBd: RepoAcceso = {
  async contarRecientesPorEmail(emailHash, desde) {
    const f = await sql.$queryRaw<Fila[]>`SELECT count(*)::int AS n FROM contabilidad.acceso_otps WHERE email_hash = ${emailHash} AND creado_en >= ${desde}`
    return enteroDeBd(f[0]?.n ?? 0)
  },
  async contarRecientesPorIp(ip, desde) {
    const f = await sql.$queryRaw<Fila[]>`SELECT count(*)::int AS n FROM contabilidad.acceso_otps WHERE ip = ${ip} AND creado_en >= ${desde}`
    return enteroDeBd(f[0]?.n ?? 0)
  },
  async crearOtp(x: { emailHash: string; codigoHash: string; ip: string; envio: EnvioCodigo }) {
    await sql.$executeRaw`INSERT INTO contabilidad.acceso_otps (email_hash, codigo_hash, ip, envio) VALUES (${x.emailHash}, ${x.codigoHash}, ${x.ip}, ${x.envio})`
  },
  async ultimoOtp(emailHash) {
    const f = await sql.$queryRaw<Fila[]>`
      SELECT id, codigo_hash, creado_en, intentos, usado_en FROM contabilidad.acceso_otps
       WHERE email_hash = ${emailHash} ORDER BY creado_en DESC LIMIT 1`
    if (!f[0]) return null
    return { id: String(f[0].id), codigoHash: String(f[0].codigo_hash), creadoEn: f[0].creado_en as Date, intentos: enteroDeBd(f[0].intentos), usadoEn: (f[0].usado_en as Date | null) ?? null }
  },
  async reservarIntento(id, max) {
    const n = await sql.$executeRaw`
      UPDATE contabilidad.acceso_otps SET intentos = intentos + 1 WHERE id = ${id}::uuid AND usado_en IS NULL AND intentos < ${max}::int`
    return n === 1
  },
  async gastarOtp(id) {
    const n = await sql.$executeRaw`UPDATE contabilidad.acceso_otps SET usado_en = now() WHERE id = ${id}::uuid AND usado_en IS NULL`
    return n === 1
  },
  async usuarioPorEmail(email) {
    const f = await sql.$queryRaw<Fila[]>`SELECT o_id, o_nombre, o_sv FROM contabilidad.usuario_por_email(${email}::text)`
    return f[0] ? { id: String(f[0].o_id), nombre: String(f[0].o_nombre), sv: enteroDeBd(f[0].o_sv) } : null
  },
  empresasDeUsuario: empresasDeUsuarioBd,
}
