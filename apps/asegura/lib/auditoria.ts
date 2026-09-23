// Registro de escrituras del puerto de operador en `seguros.auditoria` (Fase 1b de ASegura OS).
//
// Toda ruta de `app/api/operador/*` que exporta POST/PATCH/PUT/DELETE se envuelve con
// `auditado(...)` (lo vigila `lib/auditoria.test.ts`, que lee el fuente). Deja una fila por
// llamada AUTORIZADA: quién (cabecera `x-actor`), qué ruta y método, qué ids tocó y cómo acabó.
// Y desde la pieza (c), los campos que tocó: las funciones de la cartera llaman a
// `anotarCambio()` y lo anotado viaja en la columna `cambios` de esa misma fila (saneado por
// `lib/cambios.ts`: solo los campos de negocio guardan valor; lo personal consta como «tocado»).
//
// Un fallo al registrar NUNCA tumba la escritura, que ya se ha hecho: se avisa en el log con
// un prefijo fijo para poder buscarlo. Las llamadas sin el Bearer no se registran (no son
// escrituras, y un barrido de intentos llenaría la tabla).

import { AsyncLocalStorage } from 'node:async_hooks'
import { prismaAsegura, aseguraConfigurada } from './asegura-db'
import { operadorAutorizado } from './operador'
import { CABECERA_ACTOR, idsDeEscritura, leerActor } from './actor'
import { cambiosParaGuardar, type Cambio } from './cambios'

const MS_TECHO_INSERCION = 3_000

const contexto = new AsyncLocalStorage<{ cambios: Cambio[] }>()

/**
 * Deja constancia de un campo que esta escritura cambia. Fuera de una llamada `auditado()` (un
 * cron, un script) no hace nada: no hay fila del puerto a la que colgarlo.
 */
export function anotarCambio(c: Cambio): void {
  contexto.getStore()?.cambios.push(c)
}

type Manejador<C> = (req: Request, ctx: C) => Promise<Response> | Response

export function auditado<C>(manejador: Manejador<C>): (req: Request, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    const autorizado = operadorAutorizado(req)
    // El cuerpo se copia ANTES de que la ruta lo consuma, y solo si es JSON: una subida de
    // documento (multipart) duplicaría el PDF en memoria para no sacar de ahí ningún id.
    const esJson = (req.headers.get('content-type') ?? '').includes('application/json')
    const copia = autorizado && esJson ? req.clone() : null
    const t0 = Date.now()
    const store = { cambios: [] as Cambio[] }
    let estado = 500
    try {
      const res = await contexto.run(store, () => manejador(req, ctx))
      estado = res.status
      return res
    } finally {
      if (autorizado) await registrarEscritura(req, copia, estado, Date.now() - t0, store.cambios)
    }
  }
}

async function registrarEscritura(req: Request, copia: Request | null, estado: number, duracionMs: number, anotados: Cambio[]): Promise<void> {
  try {
    if (!aseguraConfigurada()) return
    let cuerpo: unknown = null
    if (copia) cuerpo = await copia.json().catch(() => null)
    const actor = leerActor(req.headers.get(CABECERA_ACTOR))
    const actorId = actor.tipo === 'desconocido' ? actor.motivo : actor.id
    const ruta = new URL(req.url).pathname
    const ids = JSON.stringify(idsDeEscritura(req.url, cuerpo))
    const cambios = JSON.stringify(cambiosParaGuardar(anotados))
    // Con techo: la escritura YA se hizo (a veces una emisión pagada). Si el pooler se cuelga,
    // perder la fila de auditoría es mejor que perder la respuesta y que el corredor reintente.
    const insercion = prismaAsegura().$executeRaw`
      insert into auditoria (actor_tipo, actor_id, metodo, ruta, estado_http, ids, duracion_ms, cambios)
      values (${actor.tipo}, ${actorId}, ${req.method}, ${ruta}, ${estado}, ${ids}::jsonb, ${duracionMs}, ${cambios}::jsonb)`
    let techo: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      insercion,
      new Promise((_, rechazar) => { techo = setTimeout(() => rechazar(new Error(`sin respuesta en ${MS_TECHO_INSERCION} ms`)), MS_TECHO_INSERCION) }),
    ]).finally(() => clearTimeout(techo))
  } catch (e) {
    console.error('[auditoria] no se pudo registrar la escritura', req.method, new URL(req.url).pathname, e instanceof Error ? e.message : e)
  }
}
