// Quién puede ver la CARTERA de Grupo ASegura desde plataforma.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Hasta hoy la única guarda de las ~45 rutas de `/api/correduria/**` era
// «¿hay sesión?». Como `/api/auth/register` era público, creaba la cuenta con
// `rol = null` y devolvía la cookie de sesión EN LA MISMA RESPUESTA, cualquiera
// con un navegador podía registrarse y pedir
// `/api/correduria/cartera-lista?formato=csv`: hasta 2.000 fichas con DNI,
// teléfono, correo y dirección DESCIFRADOS. No hacía falta romper nada.
//
// ─── Por qué NO se gatea por rol ─────────────────────────────────────────────
// Medido contra la BD (public.cuentas, 3 filas): las TRES tienen `rol = null`,
// incluida la de Alberto. Un `if (session.rol !== 'correduria')` dejaría fuera
// al único usuario legítimo — el rol no discrimina nada hoy.
//
// ─── El criterio ─────────────────────────────────────────────────────────────
// El mismo que ya escribe `apps/asegura/lib/tenant.ts`, y a propósito no otro:
// la cuenta de la casa (`public.cuentas`) se casa con el usuario del CRM
// (`seguros.usuarios`) POR EMAIL en minúsculas, solo si el usuario está
// `activo` y tiene `correduria_id`. Es el único dato común entre los dos lados
// (el `auth_user_id` de origen es de Supabase Auth y aquí no significa nada).
//
// 🚨 PERO: medido el 20/09/2026 contra la BD compartida, el rol de esta app
// (`prisma_plataforma`) NO tiene USAGE sobre el schema `seguros` ni SELECT
// sobre `seguros.usuarios` — plataforma nunca ha leído esa cartera por SQL:
// habla con asegura por su puerto HTTP, que se autentica con un secreto de
// OPERADOR (el mismo para todos) y por tanto no dice NADA sobre quién es el
// humano que está delante. Conceder ese GRANT es una decisión de Alberto, no
// de este fichero. Así que el criterio canónico se INTENTA igual (el día que
// exista el GRANT esto se cura solo) y, mientras no se pueda leer, manda una
// lista blanca explícita de correos en `CORREDURIA_EMAILS`.
//
// ─── Fail-closed, con los TRES estados de siempre ────────────────────────────
// `autorizado` · `no-autorizado` (comprobado: NO es de la casa) ·
// `sin-comprobar` (no se ha podido mirar). Los dos últimos DENIEGAN, pero no
// son lo mismo y no se colapsan: un fallo de BD o una env sin poner no puede
// leerse como «este señor no es de la casa». Por eso `no-autorizado` sale como
// 403 y `sin-comprobar` como 503 con su motivo.

import { NextResponse } from 'next/server'
import { getSession } from './session'
import { prisma } from './db'

export type SesionPlataforma = NonNullable<Awaited<ReturnType<typeof getSession>>>

/** Nombre de la env con la lista blanca. Una sola copia, para el cepo y el mensaje. */
export const ENV_LISTA_CORREDURIA = 'CORREDURIA_EMAILS'

export type MotivoSinComprobar =
  /** Ni el schema `seguros` es legible desde aquí ni hay lista blanca puesta. */
  | 'sin_fuente'

export type AccesoCorreduria =
  | { estado: 'autorizado'; correduriaId: string | null; fuente: 'seguros' | 'lista' }
  | { estado: 'no-autorizado' }
  | { estado: 'sin-comprobar'; motivo: MotivoSinComprobar; detalle: string }

/**
 * Lee la lista blanca de la env. `null` = NO configurada («no se sabe quién es
 * de la casa»), que NO es lo mismo que una lista vacía de gente autorizada:
 * por eso una env presente pero en blanco devuelve `null` y acaba en
 * `sin-comprobar`, no en «no autorizado».
 */
export function listaCorreduria(valor: string | undefined = process.env[ENV_LISTA_CORREDURIA]): string[] | null {
  if (typeof valor !== 'string') return null
  const emails = valor
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return emails.length > 0 ? emails : null
}

// El GRANT sobre `seguros` no existe hoy, así que la consulta canónica falla
// SIEMPRE. Sin esto, cada llamada de las ~45 rutas pagaría un error de permisos
// contra Postgres. Se recuerda solo la CAPACIDAD («no se puede leer»), nunca una
// autorización, y caduca sola para que el día del GRANT no haya que redesplegar.
const TTL_ILEGIBLE_MS = 60_000
let segurosIlegibleHasta = 0

/** Solo para los tests: olvida lo aprendido sobre la legibilidad de `seguros`. */
export function olvidarCapacidadSeguros(): void {
  segurosIlegibleHasta = 0
}

/**
 * Resuelve si esta cuenta pertenece a la correduría. Nunca lanza: cualquier
 * duda se convierte en un estado que DENIEGA.
 */
export async function resolverAccesoCorreduria(
  sesion: Pick<SesionPlataforma, 'id' | 'email'>,
): Promise<AccesoCorreduria> {
  const email = (sesion.email ?? '').trim().toLowerCase()

  // 1) Fuente canónica: el MISMO cruce que `apps/asegura/lib/tenant.ts`.
  if (Date.now() >= segurosIlegibleHasta) {
    try {
      const filas = await prisma.$queryRaw<{ correduria_id: string | null }[]>`
        select u.correduria_id::text as correduria_id
        from seguros.usuarios u
        join public.cuentas c on lower(c.email) = lower(u.email)
        where c.id = ${sesion.id}::uuid
          and u.activo
          and u.correduria_id is not null
        order by u.rol = 'admin' desc, u.created_at asc
        limit 1
      `
      const correduriaId = filas[0]?.correduria_id ?? null
      // La fuente canónica ha CONTESTADO: si no hay fila, es una ausencia
      // comprobada y no se consulta la lista blanca (que es el sucedáneo).
      if (correduriaId) return { estado: 'autorizado', correduriaId, fuente: 'seguros' }
      return { estado: 'no-autorizado' }
    } catch {
      // No se ha podido mirar. NO se degrada a «no autorizado» todavía: se cae
      // al sucedáneo, y si tampoco lo hay se dirá que no se sabe.
      segurosIlegibleHasta = Date.now() + TTL_ILEGIBLE_MS
    }
  }

  // 2) Sucedáneo mientras `seguros` no sea legible desde este rol.
  const lista = listaCorreduria()
  if (!lista) {
    return {
      estado: 'sin-comprobar',
      motivo: 'sin_fuente',
      detalle:
        `no se puede leer seguros.usuarios con el rol de plataforma y ${ENV_LISTA_CORREDURIA} no está configurada`,
    }
  }
  if (email && lista.includes(email)) {
    // La lista dice QUIÉN, no de qué correduría: `null` = «no se sabe», nunca 0.
    return { estado: 'autorizado', correduriaId: null, fuente: 'lista' }
  }
  return { estado: 'no-autorizado' }
}

/** La respuesta HTTP de una denegación. 403 ≠ 503 a propósito (ver cabecera). */
export function respuestaSinAccesoCorreduria(
  acceso: Exclude<AccesoCorreduria, { estado: 'autorizado' }>,
): NextResponse {
  if (acceso.estado === 'sin-comprobar') {
    return NextResponse.json(
      {
        error: 'No se ha podido comprobar el acceso a la correduría',
        motivo: acceso.motivo,
        detalle: acceso.detalle,
      },
      { status: 503 },
    )
  }
  return NextResponse.json({ error: 'Sin acceso a la correduría' }, { status: 403 })
}

export type GuardaCorreduria =
  | { ok: true; session: SesionPlataforma; acceso: Extract<AccesoCorreduria, { estado: 'autorizado' }> }
  | { ok: false; respuesta: NextResponse }

/**
 * Guarda de las rutas de `/api/correduria/**`. Uso:
 *
 *   const guarda = await exigirCorreduria()
 *   if (!guarda.ok) return guarda.respuesta
 *   const session = guarda.session
 *
 * 401 = no hay sesión · 403 = hay sesión y NO es de la correduría ·
 * 503 = no se ha podido comprobar.
 */
export async function exigirCorreduria(): Promise<GuardaCorreduria> {
  const session = await getSession()
  if (!session) {
    return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }
  const acceso = await resolverAccesoCorreduria(session)
  if (acceso.estado === 'autorizado') return { ok: true, session, acceso }
  return { ok: false, respuesta: respuestaSinAccesoCorreduria(acceso) }
}
