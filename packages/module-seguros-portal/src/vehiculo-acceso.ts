/**
 * El QR del VEHÍCULO (27/10/2026, F1) — quién GESTIONA un vehículo: reglas puras, sin BD.
 *
 * Spec `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §3.5. Un vehículo (`portal_bien`,
 * `tipo='vehiculo'`) tiene UN dueño, persona XOR empresa (CHECK `portal_bien_un_dueno`):
 *
 *  - **Particular**: `portal_bien.identidad_id` = la identidad de la sesión → `dueno_particular`.
 *  - **Empresa**: `portal_bien.cliente_id` ∈ `accesosFlota(identidad)` con un papel que puede editar
 *    vehículos (dueño o jefe de flota) → `dueno` | `jefe_flota`.
 *  - Cualquier otra cosa → `null`, que la ruta convierte en 404 (nunca 403: no se confirma que exista).
 *
 * 🚨 El ÁMBITO de dueño que devuelve es lo único que las rutas copian a las filas nuevas
 * (`portal_vehiculo_publico.dueno_identidad_id | cliente_id`): nunca un dueño que llegue en el cuerpo.
 *
 * F2 añadirá aquí `accesoAVehiculo` (persona autorizada por el dueño); F1 no tiene personas autorizadas.
 */
import { empresaPermitida, puedeEditarVehiculo, type PapelFlota } from './flota.ts'

/** El bien tal como lo necesita la regla. Lo lee la BD YA acotado a lo que la identidad puede ver. */
export type BienParaGestion = {
  id: string
  identidadId: string | null
  clienteId: string | null
  tipo: string
}

export type AmbitoDueno = { identidadId: string; clienteId?: never } | { clienteId: string; identidadId?: never }

export type GestionVehiculo =
  | { papel: 'dueno_particular'; bienId: string; ambito: { identidadId: string } }
  | { papel: Extract<PapelFlota, 'dueno' | 'jefe_flota'>; bienId: string; ambito: { clienteId: string }; empresaId: string }

/** Quién gestiona este vehículo. `null` = nadie de esta sesión (404). */
export function resolverGestionVehiculo(x: {
  identidadId: string
  bien: BienParaGestion | null
  accesosFlota: ReadonlyMap<string, PapelFlota>
}): GestionVehiculo | null {
  const b = x.bien
  if (b === null || b.tipo !== 'vehiculo') return null
  // Un bien con los DOS dueños o con NINGUNO no lo puede escribir el CHECK; si aparece, está corrupto y no se
  // adivina de quién es.
  if ((b.identidadId === null) === (b.clienteId === null)) return null
  if (b.identidadId !== null) {
    return b.identidadId === x.identidadId ? { papel: 'dueno_particular', bienId: b.id, ambito: { identidadId: x.identidadId } } : null
  }
  const empresaId = b.clienteId as string
  const papel = x.accesosFlota.get(empresaId)
  if (!puedeEditarVehiculo(papel)) return null
  return { papel: papel as 'dueno' | 'jefe_flota', bienId: b.id, ambito: { clienteId: empresaId }, empresaId }
}

/** Las empresas cuyos vehículos puede gestionar esta identidad (para acotar la consulta del bien). */
export function empresasGestionables(accesos: ReadonlyMap<string, PapelFlota>): string[] {
  return [...accesos.entries()].filter(([, p]) => puedeEditarVehiculo(p)).map(([id]) => id)
}

/**
 * El ámbito del DEFECTO de interruptores que se quiere cambiar (`PUT /api/vehiculos/publico-defecto`).
 * `{ ambito: 'persona' }` = el de la propia identidad; `{ ambito: 'empresa', empresaId }` = el de una sociedad
 * buscada DENTRO de los accesos de flota (y con papel para editar). Lo demás → `null` (404).
 */
export function ambitoDeDefecto(
  pedido: unknown,
  identidadId: string,
  accesos: ReadonlyMap<string, PapelFlota>,
): AmbitoDueno | null {
  if (typeof pedido !== 'object' || pedido === null || Array.isArray(pedido)) return null
  const p = pedido as Record<string, unknown>
  if (p.ambito === 'persona') return { identidadId }
  if (p.ambito === 'empresa') {
    const empresaId = empresaPermitida(p.empresaId, accesos)
    if (empresaId === null || !puedeEditarVehiculo(accesos.get(empresaId))) return null
    return { clienteId: empresaId }
  }
  return null
}

/** Forma de un uuid. Un id de la URL que no lo es no llega a la BD (Prisma lanzaría con `@db.Uuid`). */
export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
}

/** Cuántas etiquetas se generan, como mucho, en una impresión en lote (la pantalla pliega a 50). */
export const MAX_ETIQUETAS_LOTE = 100
