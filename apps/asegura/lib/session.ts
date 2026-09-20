import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySessionToken } from './auth'
import { prisma } from './db'
import { ambitoActual } from './tenant'
import { denegacionAmbito, type DenegacionAmbito } from './tenant-ambito'

// ─── Por qué esta verificación sigue siendo STATELESS (20/09/2026) ───────────
//
// Lo que decía aquí antes —«no valida `session_jti` para no acoplarse a la
// sesión de plataforma»— describía el mundo en que `public.cuentas` tenía UNA
// columna escalar `session_jti`: escribirla desde dos apps era pisarse, sí.
// Ese mundo ya no existe: desde el 19/09/2026 la columna viva es
// `session_jtis` **text[] NOT NULL default '{}'** (una entrada por dispositivo,
// tope 5), así que compartirla NO sería pisarse.
//
// 🚨 Lo que lo impide hoy es otra cosa, y está MEDIDA contra la base
// (20/09/2026): **el rol `prisma_seguros` solo tiene SELECT sobre
// `public.cuentas`** — `has_table_privilege('prisma_seguros','public.cuentas',
// 'UPDATE')` = false, y también a nivel de columna. O sea: esta app puede LEER
// el array (y por tanto podría validar el jti) pero NO puede añadir el suyo al
// entrar. Validar sin poder escribir deja el login muerto: el token recién
// emitido nunca estaría en la lista y toda sesión nacería inválida.
//
// Por eso NO se fuerza el cambio. Lo que sí se hace mientras tanto es acortar
// la ventana: la sesión dura 12 h en vez de 30 días (ver `lib/auth.ts`), que es
// el único tope que un token robado respeta cuando no hay forma de revocarlo.
// Para revocación de verdad hace falta UNA línea de DDL, que es decisión de
// Alberto y no de un PR de código:
//
//     GRANT UPDATE (session_jtis) ON public.cuentas TO prisma_seguros;
//
// El día que exista, esto pasa a `where: { id, sessionJtis: { has: payload.jti } }`
// (el patrón de `apps/plataforma/lib/session.ts:13`) y el logout a
// `array_remove` — quitando SOLO el suyo, nunca vaciando la lista, que se
// llevaría por delante los dispositivos de plataforma.
export async function getSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifySessionToken(token)
  if (!payload) return null

  const cuenta = await prisma.cuenta.findFirst({
    where: { id: payload.cuentaId },
    select: { id: true, nombre: true, email: true },
  })
  return cuenta ? { ...cuenta, jti: payload.jti } : null
}

export async function requireSession() {
  const s = await getSession()
  if (!s) throw new Error('Unauthenticated')
  return s
}

export type SesionAsegura = NonNullable<Awaited<ReturnType<typeof getSession>>>

/**
 * La puerta de la trastienda: **sesión + ÁMBITO DE CORREDURÍA**, fail-closed.
 *
 * ─── Por qué no basta con la sesión ─────────────────────────────────────────
 * `public.cuentas` es la tabla COMPARTIDA de toda la casa de marcas (plataforma,
 * alquiler, transporte, mariscos, rrhh, almacen…). Una cookie de asegura se
 * emite contra esa tabla sin ningún filtro, así que hasta hoy **cualquier
 * titular de cuenta del monorepo entraba en la cartera de la correduría** — y
 * como `prisma_seguros` tiene BYPASSRLS, la base no habría dicho ni pío: 200 con
 * los datos de 32.600 fichas. Medido el 20/09/2026 contra la BD: de las 3
 * cuentas de `public.cuentas`, **solo 1 casa** con `seguros.usuarios`; las otras
 * dos (el tenant DEMO de almacén y una CLIENTA de la propia correduría) entraban
 * igual.
 *
 * El criterio de pertenencia NO se inventa aquí: es el que ya escribió
 * `lib/tenant.ts` (join `public.cuentas` ↔ `seguros.usuarios` por email en
 * minúsculas, solo `activo`). Este helper solo lo EXIGE.
 *
 * Devuelve tres desenlaces, nunca dos, y ninguno es «pasa igual»:
 *   `sin-sesion`  → 401 (la UI redirige a /login)
 *   `pendiente`   → 503 «no se sabe todavía»
 *   `sin-asignar` → 403 «tu cuenta no es de esta correduría»
 */
export type AccesoCartera =
  | { ok: true; session: SesionAsegura; correduriaId: string }
  | {
      ok: false
      motivo: 'sin-sesion' | 'pendiente' | 'sin-asignar'
      status: 401 | 403 | 503
      cuerpo: { error: string; motivo: string; gastado: '0,00€' }
    }

export async function exigirAccesoCartera(): Promise<AccesoCartera> {
  const session = await getSession()
  if (!session) {
    return {
      ok: false,
      motivo: 'sin-sesion',
      status: 401,
      cuerpo: { error: 'No hay sesión.', motivo: 'sin-sesion', gastado: '0,00€' },
    }
  }

  const ambito = await ambitoActual(session.id)
  const denegado: DenegacionAmbito | null = denegacionAmbito(ambito)
  if (denegado) {
    return { ok: false, motivo: denegado.cuerpo.motivo, status: denegado.status, cuerpo: denegado.cuerpo }
  }

  // El `estado === 'ok'` ya lo garantiza `denegacionAmbito`, que es quien decide.
  return { ok: true, session, correduriaId: (ambito as { correduriaId: string }).correduriaId }
}
