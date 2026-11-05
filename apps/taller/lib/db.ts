// Cliente Prisma del schema `taller` (rol prisma_taller, NOBYPASSRLS). Úsalo SOLO a través de `conTaller`.
import { PrismaClient, type Prisma } from '@prisma/client'
import { crearConTaller, type ClienteConTx } from './rls.ts'
import { resolverCodigoLimitado, type StoreCodigo } from './limite-codigo.ts'
import { resolverEnlaceLimitado, resolverProveedorLimitado } from './limite-enlace.ts'
import { formatoTokenValido, hashToken, type Proposito } from '@central/module-portal-proveedor'
import { invitacionVigente, type TxCitas } from './citas.ts'
import { tallerDeToken } from './presupuestos.ts'

const globalForPrisma = globalThis as unknown as { prismaTaller?: PrismaClient }

const prisma = globalForPrisma.prismaTaller ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaTaller = prisma

export type Tx = Prisma.TransactionClient

/** `conTaller(tallerId, tx => …)`: abre transacción, fija el taller para RLS y ejecuta. Sin taller → lanza. */
export const conTaller = crearConTaller<Tx>(prisma as unknown as ClienteConTx<Tx>)

/**
 * Alta de la FILA del taller (solo el operador, 0004): `taller.alta_taller()` es SECURITY DEFINER porque el rol de la app no tiene
 * INSERT en `talleres`. Idempotente por NIF (`creado: false` si ya existía). Es la única consulta fuera de `conTaller`: no lee
 * datos de ningún taller, solo crea/localiza el id.
 */
export async function altaTallerBd(d: { razonSocial: string; nombreComercial: string; nif: string | null }): Promise<{ id: string; creado: boolean }> {
  const filas = await prisma.$queryRaw<Array<{ o_id: string; o_creado: boolean }>>`
    SELECT o_id, o_creado FROM taller.alta_taller(${d.razonSocial}::text, ${d.nombreComercial}::text, ${d.nif}::text)`
  if (!filas[0]) throw new Error('alta_taller no devolvió fila')
  return { id: filas[0].o_id, creado: filas[0].o_creado }
}

/**
 * Código de acceso → id del taller (0006): `taller.taller_por_codigo()` es SECURITY DEFINER porque aún no hay taller (sin RLS) y
 * devuelve SOLO el id. null = código desconocido o taller inactivo.
 */
export async function tallerPorCodigoBd(codigo: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{ id: string | null }>>`SELECT taller.taller_por_codigo(${codigo}::text) AS id`
  return filas[0]?.id ?? null
}

/**
 * Ids de los talleres activos (0008) para el cron de purga: `taller.talleres_activos()` es SECURITY DEFINER porque sin taller
 * fijado RLS no deja listar `talleres`. Devuelve SOLO ids; cada taller se trabaja después con `conTaller`.
 */
export async function talleresActivosBd(): Promise<string[]> {
  const filas = await prisma.$queryRaw<Array<{ id: string }>>`SELECT taller.talleres_activos() AS id`
  return filas.map((f) => f.id)
}

/** Vínculo con la empresa de rrhh: SOLO el operador (0006). Devuelve false si el taller no existe. */
export async function fijarRrhhEmpresaBd(tallerId: string, empresaId: string | null): Promise<boolean> {
  const filas = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT taller.fijar_rrhh_empresa(${tallerId}::uuid, ${empresaId}::uuid) AS ok`
  return filas[0]?.ok === true
}

/** Vínculo con la empresa de contabilidad: SOLO el operador (0010). Devuelve false si el taller no existe. */
export async function fijarContabilidadEmpresaBd(tallerId: string, empresaId: string | null): Promise<boolean> {
  const filas = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT taller.fijar_contabilidad_empresa(${tallerId}::uuid, ${empresaId}::uuid) AS ok`
  return filas[0]?.ok === true
}

type TxRaw = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>

/** Almacén del límite por IP (`taller.bloqueos_codigo`) bajo candado de transacción. */
function almacenLimiteBd(tx: TxRaw): StoreCodigo {
  return {
    async leer(clave) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`
      const f = await tx.$queryRaw<Array<{ intentos: number; bloqueado_hasta: Date | null; creado_en: Date }>>`
        SELECT intentos, bloqueado_hasta, creado_en FROM taller.bloqueos_codigo WHERE clave = ${clave}`
      return f[0] ? { intentos: f[0].intentos, bloqueadoHasta: f[0].bloqueado_hasta, creadoEn: f[0].creado_en } : null
    },
    async guardar(clave, f) {
      await tx.$executeRaw`INSERT INTO taller.bloqueos_codigo (clave, intentos, bloqueado_hasta, creado_en) VALUES (${clave}, ${f.intentos}, ${f.bloqueadoHasta}, ${f.creadoEn})
        ON CONFLICT (clave) DO UPDATE SET intentos = EXCLUDED.intentos, bloqueado_hasta = EXCLUDED.bloqueado_hasta, creado_en = EXCLUDED.creado_en`
    },
    async borrar(clave) {
      await tx.$executeRaw`DELETE FROM taller.bloqueos_codigo WHERE clave = ${clave}`
    },
  }
}

/** Código → taller con límite de intentos por IP (`taller.bloqueos_codigo`, candado de transacción). null = inexistente o IP bloqueada. */
export function tallerPorCodigoLimitado(codigo: string, ip: string, ahora: Date): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const porCodigo = async (c: string) => {
      const f = await tx.$queryRaw<Array<{ id: string | null }>>`SELECT taller.taller_por_codigo(${c}::text) AS id`
      return f[0]?.id ?? null
    }
    return resolverCodigoLimitado(almacenLimiteBd(tx), { codigo, ip, ahora, porCodigo })
  })
}

/**
 * Enlace público de cita `/c/<token>` → taller, con límite de fallos por IP. null = token inexistente, caducado, usado, mal formado
 * O IP bloqueada (indistinguible: 404). El contador va en su propia transacción; la consulta de la invitación, bajo RLS del taller del token.
 */
export function tallerPorEnlaceLimitado(token: unknown, ip: string | null, ahora: Date): Promise<string | null> {
  return prisma.$transaction(async (tx) =>
    resolverEnlaceLimitado(almacenLimiteBd(tx), {
      ip, ahora,
      resolver: async () => {
        const tallerId = tallerDeToken(token)
        if (!tallerId) return null
        const vigente = await conTaller(tallerId, (t) => invitacionVigente(t as unknown as TxCitas, tallerId, token as string, ahora))
        return vigente ? tallerId : null
      },
    }),
  )
}

export type EnlaceProveedorResuelto = { tallerId: string; enlaceId: string; proposito: Proposito }

/**
 * Portal del proveedor `/prov/<token>` → (taller, enlace, propósito), con límite de fallos por IP. La BD recibe SOLO el HASH
 * (`taller.enlace_proveedor_por_hash`, SECURITY DEFINER de 0012: valida hash, caducidad, revocación, cierre y taller activo).
 * null = inexistente, caducado, revocado, cerrado, mal formado O IP bloqueada (indistinguible: 404).
 */
export function enlaceProveedorLimitado(token: unknown, ip: string | null, ahora: Date): Promise<EnlaceProveedorResuelto | null> {
  return prisma.$transaction(async (tx) =>
    resolverProveedorLimitado<EnlaceProveedorResuelto>(almacenLimiteBd(tx), {
      ip, ahora,
      resolver: async () => {
        if (!formatoTokenValido(token)) return null
        const f = await tx.$queryRaw<Array<{ o_taller: string; o_enlace: string; o_proposito: Proposito }>>`
          SELECT o_taller, o_enlace, o_proposito FROM taller.enlace_proveedor_por_hash(${hashToken(token)}::text)`
        return f[0] ? { tallerId: f[0].o_taller, enlaceId: f[0].o_enlace, proposito: f[0].o_proposito } : null
      },
    }),
  )
}
