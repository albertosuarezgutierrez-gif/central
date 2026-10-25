// PATRIMONIO (25/10/2026) — lógica PURA de las ofertas que PULSA el cliente: `POST /api/patrimonio/ofertas`
// (`comparar_externa` · `impago_alquiler` · `hipoteca`) y `POST /api/patrimonio/inmuebles/[id]/hipoteca` («¿tiene hipoteca?»).
// Puertos inyectados (sin prisma ni sesión) para probar el aislamiento con `node --test`; los reales, en `ofertas-bd.ts`.
//
// 🚨 Reglas (las mismas que «Pedir precio», P14):
//  · El inmueble, el contrato y la póliza declarada del cuerpo son PETICIONES, no datos: se buscan DENTRO de lo que esta
//    sesión ve (titulares autorizados / SUS declaradas no eliminadas). Ajeno o inexistente = la MISMA 404; un nivel que no
//    es `total` (gestión, inquilino) = esa misma 404, nunca 403.
//  · El servidor RECALCULA el estado (contrato vivo, hipoteca declarada, póliza vigente); el cuerpo solo dice QUÉ se pide.
//    Fuera de estado → 409 `no_aplica` sin llamar al puente. Asegura lo vuelve a decidir.
//  · Nada de `clienteId` ni de titular hacia asegura. Y esto NO manda correo ni mensaje a nadie: crea una petición que la
//    correduría ve en su pantalla. Solo se llega aquí pulsando un botón.
import { puede, type NivelPatrimonio } from '@central/module-patrimonio'

import { esRespuestaHipoteca, esTipoOferta, type RespuestaHipoteca, type TipoOferta } from './ofertas.ts'
import type { PeticionPuentePedirPrecio } from './pedir-precio-puente.ts'
import type { ResultadoPuentePedirPrecio } from './pedir-precio-puente.ts'
import type { Respuesta } from './seguros-inmueble-api.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const NO_APLICA: Respuesta = { status: 409, body: { error: 'no_aplica' } }
const INVALIDO = (campo: string): Respuesta => ({ status: 400, body: { error: 'datos_invalidos', campo } })

export interface PuertosOfertas {
  /** El inmueble SOLO si cuelga de un titular autorizado y vivo. `hipoteca` `null` = no lo ha dicho. */
  inmueble(id: string): Promise<{ id: string; nivel: NivelPatrimonio; hipoteca: RespuestaHipoteca | null } | null>
  /** El contrato SOLO si es de ese inmueble (ya autorizado) y no está archivado. `terminadoEn`: `YYYY-MM-DD` o `null`. */
  contrato(inmuebleId: string, contratoId: string): Promise<{ id: string; terminadoEn: string | null } | null>
  /** La póliza declarada SOLO si es de esta identidad y no está eliminada. `vigente`: la regla pura del portal. */
  declarada(id: string): Promise<{ id: string; vigente: boolean } | null>
  /** `YYYY-MM-DD` de hoy en Madrid. */
  hoy(): string
  pedirPorPuente(x: Omit<PeticionPuentePedirPrecio, 'identidadId'>): Promise<ResultadoPuentePedirPrecio>
  guardarHipoteca(inmuebleId: string, valor: RespuestaHipoteca): Promise<void>
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

function desenlace(r: ResultadoPuentePedirPrecio): Respuesta {
  switch (r.estado) {
    case 'ok':
      return { status: r.yaExistia ? 200 : 201, body: { ok: true, yaExistia: r.yaExistia, pedidoEl: r.pedidoEl } }
    case 'no_encontrado':
      return NO_ENCONTRADO
    case 'no_aplica':
      return NO_APLICA
    case 'sin_puente':
      return { status: 503, body: { error: 'sin_puente' } }
    default:
      return { status: 502, body: { error: 'puente_fallido' } }
  }
}

/** `POST /api/patrimonio/ofertas`. Cuerpo: `{ tipo, inmuebleId?, contratoId?, polizaDeclaradaId? }` con `tipo` de lista cerrada. */
export async function responderOferta(p: PuertosOfertas, cuerpo: unknown): Promise<Respuesta> {
  const b = obj(cuerpo)
  if (!esTipoOferta(b.tipo)) return INVALIDO('tipo')
  const tipo: TipoOferta = b.tipo

  if (tipo === 'comparar_externa') {
    if (!uuid(b.polizaDeclaradaId)) return INVALIDO('polizaDeclaradaId')
    const d = await p.declarada(b.polizaDeclaradaId)
    if (d === null) return NO_ENCONTRADO
    // Una póliza ya no vigente (la marcó el cliente o venció sin confirmar) no se compara; sin vencimiento sí.
    if (!d.vigente) return NO_APLICA
    return desenlace(await p.pedirPorPuente({ tipo, polizaDeclaradaId: d.id }))
  }

  if (!uuid(b.inmuebleId)) return INVALIDO('inmuebleId')
  const inm = await p.inmueble(b.inmuebleId)
  if (inm === null || !puede(inm.nivel, 'pedir_precio')) return NO_ENCONTRADO

  if (tipo === 'impago_alquiler') {
    if (!uuid(b.contratoId)) return INVALIDO('contratoId')
    const c = await p.contrato(inm.id, b.contratoId)
    if (c === null) return NO_ENCONTRADO
    // Contrato terminado (antes de hoy): ya no hay renta que proteger.
    if (c.terminadoEn !== null && c.terminadoEn < p.hoy()) return NO_APLICA
    return desenlace(await p.pedirPorPuente({ tipo, inmuebleId: inm.id, contratoId: c.id }))
  }

  // hipoteca: solo si el cliente dijo que SÍ la tiene (`null`/`no`/`no_se` no abren nada).
  if (inm.hipoteca !== 'si') return NO_APLICA
  return desenlace(await p.pedirPorPuente({ tipo, inmuebleId: inm.id }))
}

/** `POST /api/patrimonio/inmuebles/[id]/hipoteca`. Cuerpo: `{ valor: 'si' | 'no' | 'no_se' }`. */
export async function responderHipoteca(p: PuertosOfertas, idPedido: unknown, cuerpo: unknown): Promise<Respuesta> {
  if (!uuid(idPedido)) return NO_ENCONTRADO
  const inm = await p.inmueble(idPedido)
  // Solo el nivel Total ve y usa esta sección (la oferta que cuelga de ella también es Total). Ajeno o sin nivel: la misma 404.
  if (inm === null || !puede(inm.nivel, 'pedir_precio')) return NO_ENCONTRADO
  const valor = obj(cuerpo).valor
  if (!esRespuestaHipoteca(valor)) return INVALIDO('valor')
  await p.guardarHipoteca(inm.id, valor)
  return { status: 200, body: { ok: true } }
}
