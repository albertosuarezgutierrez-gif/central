// PATRIMONIO (22/10/2026) — lógica de `GET/POST /api/patrimonio/inmuebles`, SIN prisma ni sesión (puertos inyectados),
// para poder probar el aislamiento con `node --test`. La ruta real (`app/api/patrimonio/inmuebles/route.ts`) le pasa los
// puertos de `inmuebles-bd.ts`, que sí resuelven `accesosPatrimonio()` desde la cookie.
//
// 🚨 El titular del cuerpo es una PETICIÓN, no un dato: se busca DENTRO de los accesos ya resueltos. Si no está, o si el
// nivel no permite dar de alta, la respuesta es la MISMA 404 `no_encontrado` (nunca 403: no confirma que exista).
import { puede, type NivelPatrimonio } from '@central/module-patrimonio'

import { validarAltaInmueble, type DatosAltaInmueble } from './alta-inmueble.ts'

export type ResumenInmueble = {
  id: string
  alias: string
  uso: string
  /** `null` = no consta. */
  direccion: string | null
  superficieM2: number | null
}

export type TitularLista = {
  clienteId: string
  nombre: string
  nivel: NivelPatrimonio
  /** Es tu propia ficha (vínculo), no una a la que accedes por Dueño o autorización. */
  propio: boolean
  puedeAlta: boolean
  inmuebles: ResumenInmueble[]
}

export type AccesosMapa = ReadonlyMap<string, NivelPatrimonio>

export interface PuertosInmuebles {
  /** `accesosPatrimonio(identidad.id)`: lo que ve ESTA sesión. */
  accesos(): Promise<AccesosMapa>
  /** Solo se llama con ids que salieron de `accesos()`. */
  listar(clientesIds: readonly string[], accesos: AccesosMapa): Promise<TitularLista[]>
  /** Solo se llama con un `clienteId` autorizado y con nivel que permite el alta. */
  crear(x: { clienteId: string; datos: DatosAltaInmueble }): Promise<{ ok: true; id: string } | { ok: false; motivo: 'duplicado' }>
}

export type Respuesta = { status: number; body: Record<string, unknown> }

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }

export async function responderLista(p: PuertosInmuebles): Promise<Respuesta> {
  const accesos = await p.accesos()
  if (accesos.size === 0) return { status: 200, body: { titulares: [] } }
  return { status: 200, body: { titulares: await p.listar([...accesos.keys()], accesos) } }
}

export async function responderAlta(p: PuertosInmuebles, cuerpo: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const pedido = cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>).titular : undefined
  // Titular DENTRO de los accesos, y con nivel que da de alta: si no, 404 idéntica.
  if (typeof pedido !== 'string' || !accesos.has(pedido)) return NO_ENCONTRADO
  if (!puede(accesos.get(pedido), 'alta_baja')) return NO_ENCONTRADO

  const v = validarAltaInmueble(cuerpo)
  if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }

  const r = await p.crear({ clienteId: pedido, datos: v.datos })
  if (!r.ok) return { status: 409, body: { error: 'ya_existe' } }
  return { status: 201, body: { id: r.id, porValidar: v.datos.porValidar } }
}
