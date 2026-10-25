// PATRIMONIO (24/10/2026, P14) — lógica PURA de `POST /api/patrimonio/inmuebles/[id]/pedir-precio` («Pedir precio» del
// inmueble sin seguro), con puertos inyectados (sin prisma ni sesión) para probar el aislamiento con `node --test`.
//
// 🚨 Reglas (spec 24/10/2026 §3.3):
//  · El inmueble de la URL se busca DENTRO de los titulares autorizados (`segurosDeInmueble`); ajeno o inexistente = la
//    MISMA 404. Nivel que no es `total` (un acceso de gestión, el inquilino) = esa misma 404, nunca 403.
//  · El SERVIDOR decide el `tipo` desde el estado que él mismo recalcula; el cuerpo no manda nada (se ignora). Si el
//    inmueble no está «sin seguro» o con el seguro caducado → 409 `no_aplica`, sin llamar al puente.
//  · Nada de `clienteId` ni de titular hacia asegura: solo `identidadId` + `inmuebleId` + `tipo`; asegura lo vuelve a
//    comprobar. Y esto NO manda correo ni mensaje a nadie: crea una petición que la correduría ve en su pantalla.
import type { Respuesta } from './seguros-inmueble-api.ts'
import { segurosDeInmueble, type PuertosSegurosInmueble } from './seguros-inmueble-api.ts'
import type { ResultadoPuentePedirPrecio, TipoPedirPrecio } from './pedir-precio-puente.ts'

export interface PuertosPedirPrecio extends PuertosSegurosInmueble {
  pedirPorPuente(x: { inmuebleId: string; tipo: TipoPedirPrecio }): Promise<ResultadoPuentePedirPrecio>
}

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }

export async function responderPedirPrecio(p: PuertosPedirPrecio, idPedido: unknown): Promise<Respuesta> {
  const s = await segurosDeInmueble(p, idPedido)
  if (s === null) return NO_ENCONTRADO
  // `puedePedirPrecio` ya exige nivel `total` Y el estado: aquí se separan para no confundir un permiso con un estado.
  const inm = await p.inmueble(s.inmuebleId)
  if (inm === null || inm.nivel !== 'total') return NO_ENCONTRADO
  if (!s.puedePedirPrecio) return { status: 409, body: { error: 'no_aplica' } }
  const tipo: TipoPedirPrecio = s.estado === 'sin_seguro' ? 'inmueble_sin_seguro' : 'seguro_no_vigente'
  const r = await p.pedirPorPuente({ inmuebleId: s.inmuebleId, tipo })
  switch (r.estado) {
    case 'ok':
      return { status: r.yaExistia ? 200 : 201, body: { ok: true, yaExistia: r.yaExistia, pedidoEl: r.pedidoEl } }
    case 'no_encontrado':
      return NO_ENCONTRADO
    case 'no_aplica':
      return { status: 409, body: { error: 'no_aplica' } }
    case 'sin_puente':
      return { status: 503, body: { error: 'sin_puente' } }
    default:
      return { status: 502, body: { error: 'puente_fallido' } }
  }
}
