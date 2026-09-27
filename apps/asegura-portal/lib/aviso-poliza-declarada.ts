// El aviso de que un cliente ha subido una póliza a su bóveda.
//
// 🚨 No existía ningún aviso al subir una póliza declarada (medido 17/09/2026,
// caso real: Alejandro José Soler Fernández Gao subió dos y Alberto no se
// enteró por ningún canal). La fila queda en `portal_poliza_declarada` y solo
// sale como «oportunidad» en `/correduria` cuando el vencimiento entra en la
// ventana de `DIAS_AVISO_DECLARADAS` (60 días) — para una póliza que vence
// dentro de meses, eso puede tardar medio año en avisar. El objetivo de
// Alberto es poder venderle ANTES, así que el aviso va inmediato, sin esperar
// a esa ventana.
//
// Mismo patrón que `aviso-acceso.ts`: best-effort, nunca bloquea el alta ni
// lanza, y `sin_canal` se distingue de `error` para que el log diga cuál de
// las dos cosas pasó.
import { tgSend } from '@central/core-telegram'

import { prisma } from './db'

export type ResultadoAviso = 'enviado' | 'sin_canal' | 'error'

export type ContextoPolizaDeclarada = {
  identidadId: string
  compania: string | null
  ramo: string | null
  numeroPoliza: string | null
  /** `YYYY-MM-DD`, o `null` si no se leyó/tecleó ninguna fecha. */
  fechaVencimiento: string | null
  /** `null` = la identidad no está vinculada a ninguna ficha de la cartera. */
  clienteNombre: string | null
}

export function mensajePolizaDeclarada(c: ContextoPolizaDeclarada): string {
  const quien = c.clienteNombre ?? 'una identidad SIN vincular a tu cartera'
  const compania = c.compania ?? 'compañía sin leer'
  const ramo = c.ramo ? ` (${c.ramo})` : ''
  const numero = c.numeroPoliza ? `, nº ${c.numeroPoliza}` : ''
  const vence = c.fechaVencimiento
    ? `Vence el ${c.fechaVencimiento}.`
    : 'Sin fecha de vencimiento leída/indicada.'
  return `📥 Póliza aportada por ${quien}: ${compania}${ramo}${numero}.\n${vence}\nIdentidad ${c.identidadId}`
}

/** Nunca lanza: un fallo del aviso no puede impedir que la póliza se guarde. */
export async function avisarPolizaDeclarada(c: ContextoPolizaDeclarada): Promise<ResultadoAviso> {
  try {
    const id = await tgSend(mensajePolizaDeclarada(c))
    if (id === null) {
      console.warn('[portal] poliza declarada sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
      return 'sin_canal'
    }
    return 'enviado'
  } catch (e) {
    console.error('[portal] no se ha podido avisar de la poliza declarada:', e instanceof Error ? e.message : e)
    return 'error'
  }
}

/**
 * El nombre de la ficha vinculada, si la hay. `null` en dos casos distintos
 * (sin vínculo, o la consulta falla) porque el mensaje de Telegram ya trata
 * ambos igual: «sin vincular» — lo que no puede hacer es inventarse un nombre.
 */
async function nombreClienteVinculado(identidadId: string): Promise<string | null> {
  try {
    const vinculo = await prisma.portalVinculo.findFirst({
      where: { identidadId },
      orderBy: { creadoEn: 'asc' },
      select: { clienteId: true },
    })
    if (!vinculo) return null
    const cliente = await prisma.cliente.findUnique({
      where: { id: vinculo.clienteId },
      select: { nombre: true, apellidos: true },
    })
    return cliente ? `${cliente.nombre} ${cliente.apellidos}`.trim() : null
  } catch (e) {
    console.error('[portal] no se ha podido resolver el cliente vinculado para el aviso:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Punto de entrada desde la ruta: resuelve el nombre y avisa, sin que nada de
 * esto pueda retrasar ni tumbar la respuesta al cliente (se llama con `void`).
 */
export async function avisarPolizaDeclaradaDesdeAlta(
  c: Omit<ContextoPolizaDeclarada, 'clienteNombre'>,
): Promise<ResultadoAviso> {
  const clienteNombre = await nombreClienteVinculado(c.identidadId)
  return avisarPolizaDeclarada({ ...c, clienteNombre })
}
