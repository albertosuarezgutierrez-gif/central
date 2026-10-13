// Explorador IA del tarificador RPA — la parte con BD (13/10/2026). Reglas puras en `tarificador-explorador-reglas.ts`
// y en `@central/module-tarificacion` (explorador.ts); SQL en prisma/sql/2026-10-13_tarificador_explorador.sql.
//
// 🛡️ Las rutas del worker solo conocen el id del trabajo: correduría, compañía, ramo, entrada y si hay datos reales salen
//    SIEMPRE de las filas (trabajo `en_curso` con lease vivo y modo 'exploracion' + su cabecera), nunca del cuerpo.

import type { InventarioDom, MapaExploracion, RespuestaExplorador } from '@central/module-tarificacion'
import { prisma } from './tenant'
import type { PasoGuardado } from './tarificador-explorador-reglas'

export type ExploracionViva = {
  trabajoId: string
  correduriaId: string
  compania: string
  ramo: string
  exploracionId: string
  entrada: string
  producto: string
  conDatosReales: boolean
  iniciadoAt: Date | null
  cerrada: boolean
}

/** Solo una exploración cuyo trabajo está `en_curso` con lease vivo: un worker tardío o ajeno no gasta IA ni escribe. */
export async function exploracionViva(trabajoId: string): Promise<ExploracionViva | null> {
  const filas = await prisma.$queryRaw<{
    trabajo_id: string; correduria_id: string; compania: string; ramo: string; exploracion_id: string; entrada: string
    producto: string; con_cliente: boolean; iniciado_at: Date | null; cerrada: boolean
  }[]>`
    select t.id::text as trabajo_id, t.correduria_id::text as correduria_id, t.compania, t.ramo,
           e.id::text as exploracion_id, e.entrada, e.producto, (t.cliente_id is not null) as con_cliente,
           t.iniciado_at, (e.cerrada_at is not null) as cerrada
    from seguros.tarificacion_trabajos t
    join seguros.tarificador_exploraciones e on e.trabajo_id = t.id and e.correduria_id = t.correduria_id
    where t.id = ${trabajoId}::uuid and t.modo = 'exploracion' and t.estado = 'en_curso' and t.lease_hasta > now()`
  const f = filas[0]
  if (!f) return null
  return {
    trabajoId: f.trabajo_id, correduriaId: f.correduria_id, compania: f.compania, ramo: f.ramo, exploracionId: f.exploracion_id,
    entrada: f.entrada, producto: f.producto,
    // La verdad es la fila del trabajo (cliente_id, validado por el trigger de ancla), no la columna espejo de la cabecera.
    conDatosReales: f.con_cliente, iniciadoAt: f.iniciado_at, cerrada: f.cerrada,
  }
}

type Bd = Pick<typeof prisma, '$queryRaw' | '$executeRaw'>

export type PasoLeido = PasoGuardado & { n: number; inventario: InventarioDom }

export async function pasosDe(exploracionId: string, bd: Bd = prisma): Promise<PasoLeido[]> {
  const filas = await bd.$queryRaw<{ n: number; huella: string; inventario: unknown; respuesta: unknown; origen: string; llamada_ia: boolean; coste_estimado_eur: unknown; acciones: number }[]>`
    select n, huella, inventario, respuesta, origen, llamada_ia, coste_estimado_eur, acciones
    from seguros.tarificador_exploracion_pasos
    where exploracion_id = ${exploracionId}::uuid
    order by n`
  return filas.map((f) => ({
    n: f.n, huella: f.huella, inventario: f.inventario as InventarioDom, respuesta: (f.respuesta ?? null) as RespuestaExplorador | null,
    origen: f.origen === 'ia' || f.origen === 'mapa' ? f.origen : 'regla', llamadaIA: f.llamada_ia, costeEur: Number(f.coste_estimado_eur), acciones: f.acciones,
  }))
}

/** Mapas guardados (no descartados) de la compañía/producto, del más reciente al más antiguo. Solo de ESTA correduría. */
export async function mapasMemoria(e: Pick<ExploracionViva, 'correduriaId' | 'compania' | 'producto' | 'exploracionId'>): Promise<{ estado: string; mapa: unknown }[]> {
  return prisma.$queryRaw<{ estado: string; mapa: unknown }[]>`
    select estado_mapa as estado, mapa
    from seguros.tarificador_exploraciones
    where correduria_id = ${e.correduriaId}::uuid and compania = ${e.compania} and producto = ${e.producto}
      and mapa is not null and estado_mapa <> 'descartado' and id <> ${e.exploracionId}::uuid
    order by cerrada_at desc nulls last
    limit 10`
}

export type PasoNuevo = {
  huella: string
  inventario: InventarioDom
  respuesta: RespuestaExplorador
  origen: 'ia' | 'mapa' | 'regla'
  errores: string[] | null
  costeEur: number
  modelo: string | null
}

/** Inserta el paso (n = siguiente) y acumula llamadas/coste en la cabecera. En la transacción del lock. */
export async function registrarPaso(e: ExploracionViva, p: PasoNuevo, bd: Bd): Promise<number> {
  const llamada = p.origen === 'ia'
  const acciones = p.respuesta.acciones.filter((a) => a.accion !== 'parar' && a.accion !== 'terminar').length
  const filas = await bd.$queryRaw<{ n: number }[]>`
    insert into seguros.tarificador_exploracion_pasos
      (correduria_id, exploracion_id, trabajo_id, n, huella, inventario, respuesta, origen, llamada_ia, errores, coste_estimado_eur, acciones)
    select ${e.correduriaId}::uuid, ${e.exploracionId}::uuid, ${e.trabajoId}::uuid,
           coalesce(max(n), 0) + 1, ${p.huella}, ${JSON.stringify(p.inventario)}::jsonb, ${JSON.stringify(p.respuesta)}::jsonb,
           ${p.origen}, ${llamada}, ${p.errores ? JSON.stringify(p.errores.slice(0, 20)) : null}::jsonb, ${p.costeEur}, ${acciones}
    from seguros.tarificador_exploracion_pasos where exploracion_id = ${e.exploracionId}::uuid
    returning n`
  await bd.$executeRaw`
    update seguros.tarificador_exploraciones
    set llamadas_ia = llamadas_ia + ${llamada ? 1 : 0}, coste_estimado_eur = coste_estimado_eur + ${p.costeEur},
        modelo = coalesce(${p.modelo}, modelo), updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
  return filas[0]?.n ?? 0
}

/** La IA corta a 45 s; la transacción que la envuelve, con margen (la ruta tiene 60 s). */
const TIMEOUT_TX_PASO_MS = 55_000

/**
 * Un paso cada vez por exploración: lectura del consumo + (IA) + registro en UNA transacción con
 * `pg_advisory_xact_lock`. Dos peticiones simultáneas del mismo trabajo se serializan y la segunda ve el gasto de la
 * primera: el tope de 2 € no se puede saltar por concurrencia (mismo patrón que `conLlamadaIA` del formador).
 */
export async function conPasoExclusivo<T>(e: ExploracionViva, fn: (bd: Bd) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`tarificador_explorador:${e.exploracionId}`}, 0))`
      return fn(tx)
    },
    { timeout: TIMEOUT_TX_PASO_MS, maxWait: 10_000 },
  )
}

/** Guarda el mapa UNA vez (la primera llamada de cierre gana). `false` = ya estaba cerrada. */
export async function guardarMapa(e: ExploracionViva, mapa: MapaExploracion, motivoFin: string): Promise<boolean> {
  const n = await prisma.$executeRaw`
    update seguros.tarificador_exploraciones
    set mapa = ${JSON.stringify(mapa)}::jsonb, motivo_fin = ${motivoFin}, cerrada_at = now(), updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid and cerrada_at is null`
  return n > 0
}

export async function costeYModelo(e: ExploracionViva): Promise<{ llamadas: number; eur: number; modelo: string | null }> {
  const f = await prisma.$queryRaw<{ llamadas_ia: number; coste_estimado_eur: unknown; modelo: string | null }[]>`
    select llamadas_ia, coste_estimado_eur, modelo from seguros.tarificador_exploraciones
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
  return { llamadas: f[0]?.llamadas_ia ?? 0, eur: Number(f[0]?.coste_estimado_eur ?? 0), modelo: f[0]?.modelo ?? null }
}
