// La HOJA de la nevera y su QR — acceso a BD.
//
// Lee la cabecera de `packages/module-seguros-portal/src/hoja-qr.ts`: allí están
// las reglas, aquí solo el SQL.
//
// ─── Lo que hay que tener delante antes de tocar este fichero ────────────────
//
// 1. **`hojaPorToken()` es la ÚNICA consulta de aquí sin identidad**, y es
//    deliberado: la página del QR es pública, se abre desde un papel y no hay
//    cookie ninguna. El filtro ahí es el token —256 bits, no se adivina—, y por
//    eso se normaliza ANTES de tocar la BD: una URL manipulada no gasta ni una
//    consulta. Todo lo demás de este fichero filtra por `identidadId`, que es lo
//    que exige `test/regression-portal-aislamiento.test.ts`.
//
// 2. **Crear una hoja NO es fiarse de los ids que manda el formulario.** Se lee
//    primero lo que esa identidad puede ver y la selección solo FILTRA sobre
//    eso. Si alguien mete el id de la póliza de un desconocido, no entra: no
//    porque se rechace, sino porque no está en la lista de la que se parte.
//
// 3. **Anular es un UPDATE, no un DELETE**, y el rol ni siquiera tiene DELETE
//    sobre estas tablas. Ver el punto 4 del módulo puro.

import { randomBytes } from 'node:crypto'

import {
  BYTES_TOKEN_HOJA,
  MAX_HOJAS_VIVAS,
  candidatasDeLaHoja,
  normalizarTokenHoja,
  type CandidataHoja,
  type SeleccionHoja,
} from '@central/module-seguros-portal'

import { carteraALaVista, carteraDeIdentidad, type PolizaPortal } from './cartera-lectura'
import { prisma } from './db'
import { elegiblesDeCartera, type OpcionHoja } from './hojas-elegibles'
import { hashCanal } from './auth'
import { getIdentidad } from './session'

/** El token va hasheado con la misma pimienta que el resto del portal. */
function hashToken(token: string): string {
  return hashCanal(token)
}

/** Solo para el cepo del formato: `hashCanal` ya devuelve 64 hex. */
export function formaDeHash(v: string): boolean {
  return /^[0-9a-f]{64}$/.test(v)
}

export type HojaResumen = {
  id: string
  nombre: string | null
  creadaEn: Date
  anuladaEn: Date | null
  ultimoUsoEn: Date | null
  /**
   * `null` = TODAS las propias (y las futuras). Un número = cuántas pólizas de la cartera eligió
   * (0 = las que eligió eran AÑADIDAS a mano, que desde el 26/10/2026 ya no salen en la hoja).
   */
  cuantasElegidas: number | null
}

/**
 * Una fila de la selección. Las DOS claves siempre presentes, una a `null`: el
 * CHECK de la BD exige exactamente una, y sin el tipo explícito TypeScript
 * infiere una unión de dos formas distintas que el `create` anidado no acepta.
 */
type FilaSeleccion = { polizaId: string | null; polizaDeclaradaId: string | null }

export type ResultadoCrear =
  | { ok: true; id: string; token: string }
  | { ok: false; error: 'sin_seleccion' | 'nada_visible' | 'demasiadas' }

/**
 * Las hojas de una identidad, la más reciente primero.
 *
 * Las anuladas **siguen saliendo**: su dueño tiene que poder ver que anuló una
 * y cuándo. Ocultarlas dejaría «he borrado el QR» sin ninguna prueba en
 * pantalla, y la duda acaba en una llamada.
 */
export async function hojasDeIdentidad(identidadId: string): Promise<HojaResumen[]> {
  const filas = await prisma.portalHojaQr.findMany({
    where: { identidadId },
    orderBy: { creadaEn: 'desc' },
    take: 50,
    select: {
      id: true,
      nombre: true,
      creadaEn: true,
      anuladaEn: true,
      ultimoUsoEn: true,
      polizas: { select: { polizaId: true, polizaDeclaradaId: true } },
    },
  })
  return filas.map((h) => ({
    id: h.id,
    nombre: h.nombre,
    creadaEn: h.creadaEn,
    anuladaEn: h.anuladaEn,
    ultimoUsoEn: h.ultimoUsoEn,
    // 🚨 Cero filas = TODAS, no «ninguna». Es el vocabulario de la tabla y
    // colapsarlo aquí en un 0 haría que la pantalla dijera «0 pólizas» de la
    // hoja que más enseña de todas.
    // Las filas de pólizas AÑADIDAS (de antes del 26/10/2026) siguen en la tabla pero ya no se enseñan.
    cuantasElegidas: h.polizas.length === 0 ? null : h.polizas.filter((f) => f.polizaId !== null).length,
  }))
}

/**
 * Todo lo que esa identidad puede meter hoy en una hoja — **ya filtrado a lo que está en vigor**
 * (regla 5 de `hoja-qr.ts`) y con el TITULAR de cada póliza (regla 6).
 *
 * 🔒 Sale de `carteraDeIdentidad()`, la MISMA lectura que pinta la bóveda: sus propias, las de las
 * fichas que la autorizan (vigentes, no revocadas, respetando `poliza_id`), las de sus empresas y
 * aquellas donde figura. Aquí no hay ninguna regla de acceso propia. Las pólizas que la persona
 * AÑADIÓ a mano no se ofrecen (26/10/2026): la hoja es solo cartera viva.
 */
export async function polizasElegibles(identidadId: string): Promise<{ cartera: OpcionHoja[] }> {
  const cartera = carteraALaVista(await carteraDeIdentidad(identidadId), { soloSiYaCubre: true })
  return { cartera: elegiblesDeCartera(cartera) }
}

/**
 * Lo que la página PÚBLICA del QR enseña de la cartera de quien la generó, leído EN VIVO con su
 * acceso de HOY. La regla es la misma que la del selector (`candidatasDeLaHoja`); la selección la
 * aplica la página con `polizasQueEnsenaLaHoja`.
 */
export async function candidatasEnVivo(identidadId: string, hoy: Date = new Date()): Promise<CandidataHoja<PolizaPortal>[]> {
  const cartera = carteraALaVista(await carteraDeIdentidad(identidadId), { soloSiYaCubre: true }, hoy)
  return candidatasDeLaHoja<PolizaPortal>(cartera)
}

/**
 * Crea una hoja y devuelve su token EN CLARO — la única vez que existe fuera
 * del QR. Quien llama lo mete en el enlace y no lo guarda en ningún sitio.
 */
export async function crearHoja(
  identidadId: string,
  seleccion: SeleccionHoja,
  nombre: string | null,
): Promise<ResultadoCrear> {
  const vivas = await prisma.portalHojaQr.count({ where: { identidadId, anuladaEn: null } })
  if (vivas >= MAX_HOJAS_VIVAS) return { ok: false, error: 'demasiadas' }

  // 🚨 Punto 2 de la cabecera: se parte de lo que HOY puede ver, y la selección
  // filtra. Los ids del formulario nunca se insertan tal cual.
  const elegibles = await polizasElegibles(identidadId)
  const idsCartera = new Set(elegibles.cartera.map((p) => p.id))
  if (idsCartera.size === 0) return { ok: false, error: 'nada_visible' }
  // «Todas» = todas las PROPIAS (regla 6): sin ninguna propia, una hoja «de todas» nacería vacía.
  if (seleccion.todas && !elegibles.cartera.some((p) => p.propia)) return { ok: false, error: 'nada_visible' }

  let filas: FilaSeleccion[] = []
  if (!seleccion.todas) {
    // Solo pólizas de la cartera que HOY ve: un id ajeno, de una póliza añadida o de un
    // desconocido no está en `idsCartera` y se cae.
    filas = seleccion.polizaIds.flatMap((id): FilaSeleccion[] =>
      idsCartera.has(id) ? [{ polizaId: id, polizaDeclaradaId: null }] : [],
    )
    // Todo lo elegido era ajeno o ya no existe. NO se crea una hoja vacía, que
    // en el vocabulario de la tabla significaría «todas» — exactamente al revés
    // de lo que pidió quien la creó.
    if (filas.length === 0) return { ok: false, error: 'sin_seleccion' }
  }

  const token = randomBytes(BYTES_TOKEN_HOJA).toString('hex')
  const hoja = await prisma.portalHojaQr.create({
    data: {
      identidadId,
      // El token, HASHEADO. En claro solo viaja dentro del QR.
      tokenHash: hashToken(token),
      nombre,
      polizas: filas.length > 0 ? { create: filas } : undefined,
    },
    select: { id: true },
  })
  return { ok: true, id: hoja.id, token }
}

/**
 * Anular. Idempotente y **filtrando por identidad en el propio `updateMany`**:
 * un `update` por id y una comprobación del dueño en la línea siguiente
 * funcionan igual… hasta que alguien mueva esa comprobación.
 *
 * `anuladaEn: null` en el `where` es lo que la hace idempotente sin mentir: una
 * hoja ya anulada no cambia de fecha, así que la que consta es la de la primera
 * vez, que es la que importa.
 */
export async function anularHoja(identidadId: string, id: string): Promise<boolean> {
  const r = await prisma.portalHojaQr.updateMany({
    where: { id, identidadId, anuladaEn: null },
    data: { anuladaEn: new Date() },
  })
  return r.count > 0
}

export type HojaAbierta = {
  anuladaEn: Date | null
  identidadId: string
  /** `{ todas: true }` = todas las PROPIAS de su dueño. */
  seleccion: SeleccionHoja
}

/**
 * 🚨 LA ÚNICA CONSULTA DE ESTE FICHERO SIN IDENTIDAD, y está marcada en voz
 * alta a propósito. La página del QR es pública: se abre desde un papel, sin
 * sesión. El filtro es el token.
 *
 * El token se normaliza ANTES —64 hex exactos— así que una URL manipulada
 * devuelve `null` sin llegar a la base de datos.
 */
export async function hojaPorToken(tokenCrudo: unknown): Promise<HojaAbierta | null> {
  const token = normalizarTokenHoja(tokenCrudo)
  if (token === null) return null
  const h = await prisma.portalHojaQr.findFirst({
    where: { tokenHash: hashToken(token) },
    select: {
      anuladaEn: true,
      identidadId: true,
      polizas: { select: { polizaId: true, polizaDeclaradaId: true } },
    },
  })
  if (!h) return null
  const ids = h.polizas.map((p) => p.polizaId ?? p.polizaDeclaradaId).filter((x): x is string => x !== null)
  return {
    anuladaEn: h.anuladaEn,
    identidadId: h.identidadId,
    seleccion: h.polizas.length === 0 ? { todas: true } : { todas: false, polizaIds: ids },
  }
}

/**
 * Sella que alguien la ha escaneado. **No se deja fallar hacia arriba**: que no
 * se pueda anotar la visita no es razón para no enseñarle la hoja a quien está
 * en el arcén. Es el único sitio del portal donde un fallo de escritura se traga
 * a propósito, y por eso se dice aquí.
 *
 * Solo sella las vivas: anotar un uso sobre una anulada dejaría en la pantalla
 * de su dueño una visita que en realidad no vio nada.
 */
export async function sellarUso(identidadId: string, token: string): Promise<void> {
  try {
    await prisma.portalHojaQr.updateMany({
      where: { tokenHash: hashToken(token), identidadId, anuladaEn: null },
      data: { ultimoUsoEn: new Date() },
    })
  } catch {
    // Silencio deliberado (ver arriba).
  }
}

// ─── La puerta ───────────────────────────────────────────────────────────────
//
// Las funciones de arriba reciben la identidad; estas la RESUELVEN por la
// cookie (`lib/session`). Es la misma forma que `lib/supresion.ts` y
// `lib/partes-siniestro.ts`, y no es cortesía: deja las rutas de API sin
// fontanería de sesión, así que no hay dos sitios donde acordarse de mirar
// quién eres.

/** Crear, resolviendo la identidad por la cookie. `null` = no hay sesión. */
export async function crearHojaDeSesion(
  seleccion: SeleccionHoja,
  nombre: string | null,
): Promise<ResultadoCrear | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return crearHoja(identidad.id, seleccion, nombre)
}

/** Anular, resolviendo la identidad por la cookie. `null` = no hay sesión. */
export async function anularHojaDeSesion(id: string): Promise<boolean | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return anularHoja(identidad.id, id)
}
