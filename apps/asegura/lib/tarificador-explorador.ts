// Explorador IA del tarificador RPA — la parte con BD (13/10/2026). Reglas puras en `tarificador-explorador-reglas.ts`
// y en `@central/module-tarificacion` (explorador.ts); SQL en prisma/sql/2026-10-13_tarificador_explorador.sql.
//
// 🛡️ Las rutas del worker solo conocen el id del trabajo: correduría, compañía, ramo, entrada y si hay datos reales salen
//    SIEMPRE de las filas (trabajo `en_curso` con lease vivo y modo 'exploracion' + su cabecera), nunca del cuerpo.

import { ENTRADAS_EXPLORACION, MOTIVO_ORIGEN_PURGADO, claveCompania, riesgoExploracionDeOportunidad, esEntradaExploracion, puedeAutomatizar, riesgoYaPurgado, topesExplorador, type InventarioDom, type MapaExploracion, type RespuestaExplorador } from '@central/module-tarificacion'
import { ESTADOS_OPORTUNIDAD_ABIERTA } from '@central/module-seguros'
import { inmueblesPorDireccion } from '@central/core-catastro/http'
import { prisma } from './tenant'
import { catastroPorReferencia } from './codeoscopic/catastro-referencia'
import { completarRiesgoConCatastro, type DepsCatastroExploracion } from './tarificador-explorador-catastro'
import { personaDeFicha } from './oportunidad-riesgo'
import { LEASE_MS } from './tarificador-reglas'
import { RESERVA_IA_MS, inicioAcumulado, leaseExploracion, type PasoGuardado } from './tarificador-explorador-reglas'
import { PasoOcupado, type EstadoPaso, type PasoARegistrar } from './tarificador-explorador-paso'

export { PasoOcupado }

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
  /** Primer paso guardado (de cualquier intento): con `iniciadoAt`, el reloj ACUMULADO de la exploración. */
  primerPasoAt: Date | null
  cerrada: boolean
}

/** Solo una exploración cuyo trabajo está `en_curso` con lease vivo: un worker tardío o ajeno no gasta IA ni escribe. */
export async function exploracionViva(trabajoId: string): Promise<ExploracionViva | null> {
  const filas = await prisma.$queryRaw<{
    trabajo_id: string; correduria_id: string; compania: string; ramo: string; exploracion_id: string; entrada: string
    producto: string; con_cliente: boolean; iniciado_at: Date | null; primer_paso_at: Date | null; cerrada: boolean
  }[]>`
    select t.id::text as trabajo_id, t.correduria_id::text as correduria_id, t.compania, t.ramo,
           e.id::text as exploracion_id, e.entrada, e.producto, (t.cliente_id is not null) as con_cliente,
           t.iniciado_at, (select min(p.created_at) from seguros.tarificador_exploracion_pasos p where p.exploracion_id = e.id) as primer_paso_at,
           (e.cerrada_at is not null) as cerrada
    from seguros.tarificacion_trabajos t
    join seguros.tarificador_exploraciones e on e.trabajo_id = t.id and e.correduria_id = t.correduria_id
    where t.id = ${trabajoId}::uuid and t.modo = 'exploracion' and t.estado = 'en_curso' and t.lease_hasta > now()`
  const f = filas[0]
  if (!f) return null
  return {
    trabajoId: f.trabajo_id, correduriaId: f.correduria_id, compania: f.compania, ramo: f.ramo, exploracionId: f.exploracion_id,
    entrada: f.entrada, producto: f.producto,
    // La verdad es la fila del trabajo (cliente_id, validado por el trigger de ancla), no la columna espejo de la cabecera.
    conDatosReales: f.con_cliente, iniciadoAt: f.iniciado_at, primerPasoAt: f.primer_paso_at, cerrada: f.cerrada,
  }
}

/**
 * El `riesgo` del trabajo de exploración (copiado del de la petición real). Solo lo usa la ruta `paso` para saber QUÉ
 * valores quitar del inventario; nunca sale de aquí. `null` = no hay fila o no hay riesgo (quien llama decide: con datos
 * reales, PARA).
 */
export async function riesgoDeExploracion(e: Pick<ExploracionViva, 'trabajoId' | 'correduriaId'>): Promise<unknown | null> {
  const f = await prisma.$queryRaw<{ riesgo: unknown }[]>`
    select riesgo from seguros.tarificacion_trabajos
    where id = ${e.trabajoId}::uuid and correduria_id = ${e.correduriaId}::uuid`
  return f[0]?.riesgo ?? null
}

export type Bd = Pick<typeof prisma, '$queryRaw' | '$executeRaw'>

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

/**
 * Estado de la exploración DENTRO del lock: pasos, cierre, IA reservada y acumulados de la cabecera. El inicio es el
 * ACUMULADO (reclamo actual o primer paso, el más antiguo): un reintento no pone el reloj a cero.
 */
export async function leerEstadoPaso(e: ExploracionViva, bd: Bd): Promise<EstadoPaso> {
  const [pasos, cab] = await Promise.all([
    pasosDe(e.exploracionId, bd),
    bd.$queryRaw<{ cerrada: boolean; ia_en_vuelo: boolean; llamadas_ia: number; coste_estimado_eur: unknown; iniciado_at: Date | null; primer_paso_at: Date | null }[]>`
      select (x.cerrada_at is not null) as cerrada, coalesce(x.ia_en_vuelo_hasta > now(), false) as ia_en_vuelo,
             x.llamadas_ia, x.coste_estimado_eur, t.iniciado_at,
             (select min(p.created_at) from seguros.tarificador_exploracion_pasos p where p.exploracion_id = x.id) as primer_paso_at
      from seguros.tarificador_exploraciones x
      join seguros.tarificacion_trabajos t on t.id = x.trabajo_id and t.correduria_id = x.correduria_id
      where x.id = ${e.exploracionId}::uuid and x.correduria_id = ${e.correduriaId}::uuid`,
  ])
  const c = cab[0]
  return {
    pasos,
    // Sin cabecera = cerrada (fail-closed: nada se registra).
    cerrada: c ? c.cerrada : true,
    iaEnVuelo: c?.ia_en_vuelo === true,
    inicio: inicioAcumulado(c?.iniciado_at ?? null, c?.primer_paso_at ?? null),
    llamadasCabecera: c?.llamadas_ia ?? 0,
    eurCabecera: Number(c?.coste_estimado_eur ?? 0),
  }
}

/** Reserva la llamada de IA (fuera de la transacción) por `RESERVA_IA_MS`. */
export async function reservarIA(e: ExploracionViva, bd: Bd): Promise<void> {
  await bd.$executeRaw`
    update seguros.tarificador_exploraciones set ia_en_vuelo_hasta = now() + make_interval(secs => ${RESERVA_IA_MS / 1000}), updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
}

export async function liberarIA(e: ExploracionViva, bd: Bd): Promise<void> {
  await bd.$executeRaw`
    update seguros.tarificador_exploraciones set ia_en_vuelo_hasta = null, updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
}

/** Una llamada de IA DESCARTADA por carrera: no tiene fila de paso, pero costó → a la cabecera (cuenta para el tope). */
export async function anotarDescartada(e: ExploracionViva, costeEur: number, bd: Bd): Promise<void> {
  await bd.$executeRaw`
    update seguros.tarificador_exploraciones
    set llamadas_ia = llamadas_ia + 1, coste_estimado_eur = coste_estimado_eur + ${costeEur}, updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
}

/** Rescate sin lock cuando la tx2 lanza tras pagar la IA: coste a la cabecera y reserva liberada, en UNA sentencia. */
export async function rescatarIA(e: ExploracionViva, costeEur: number, bd: Bd = prisma): Promise<void> {
  await bd.$executeRaw`
    update seguros.tarificador_exploraciones
    set llamadas_ia = llamadas_ia + 1, coste_estimado_eur = coste_estimado_eur + ${costeEur}, ia_en_vuelo_hasta = null, updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
}

/**
 * Inserta el paso (n = siguiente), acumula llamadas/coste en la cabecera, LIBERA la IA reservada y RENUEVA el lease del
 * trabajo (`leaseExploracion`: nunca más allá del tope de tiempo acumulado + margen; nunca lo acorta). Devuelve el lease (ISO).
 */
export async function registrarPaso(e: ExploracionViva, p: PasoARegistrar & { huella: string; inventario: InventarioDom }, inicio: Date | null, bd: Bd): Promise<string | null> {
  const llamada = p.origen === 'ia'
  const acciones = p.respuesta.acciones.filter((a) => a.accion !== 'parar' && a.accion !== 'terminar').length
  await bd.$queryRaw<{ n: number }[]>`
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
        modelo = coalesce(${p.modelo}, modelo),
        -- Invariante: una sola reserva viva por exploración (tx1 la toma bajo lock y 409 a quien llegue con ella viva) y
        -- RESERVA_IA_MS > maxDuration de la ruta (la reserva no caduca antes de que este paso termine). Solo el paso de IA
        -- la limpia: un paso de memoria/regla (origen ≠ 'ia') no tiene reserva propia y no toca la de otro.
        ia_en_vuelo_hasta = case when ${llamada}::boolean then null else ia_en_vuelo_hasta end, updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
  const lease = leaseExploracion({ ahora: new Date(), inicio, leaseMs: LEASE_MS, maxMs: topesExplorador(process.env).maxMs })
  const t = await bd.$queryRaw<{ lease_hasta: Date | null }[]>`
    update seguros.tarificacion_trabajos
    set lease_hasta = greatest(lease_hasta, ${lease}::timestamptz), updated_at = now()
    where id = ${e.trabajoId}::uuid and correduria_id = ${e.correduriaId}::uuid and estado = 'en_curso' and modo = 'exploracion'
    returning lease_hasta`
  return t[0]?.lease_hasta ? t[0].lease_hasta.toISOString() : null
}

/** La transacción del paso dura lecturas + escrituras (la IA va FUERA); con margen. */
const TIMEOUT_TX_PASO_MS = 15_000

/**
 * Transacción CORTA con `pg_try_advisory_xact_lock` por exploración (la misma clave para `paso` y `cierre`). Si otro la
 * tiene, NO se espera: `PasoOcupado` (la ruta → 409). La IA nunca corre aquí dentro.
 */
export async function conLockExploracion<T>(e: Pick<ExploracionViva, 'exploracionId'>, fn: (bd: Bd) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const r = await tx.$queryRaw<{ ok: boolean }[]>`select pg_try_advisory_xact_lock(hashtextextended(${`tarificador_explorador:${e.exploracionId}`}, 0)) as ok`
      if (r[0]?.ok !== true) throw new PasoOcupado()
      return fn(tx)
    },
    { timeout: TIMEOUT_TX_PASO_MS, maxWait: 10_000 },
  )
}

/** Guarda el mapa UNA vez (la primera llamada de cierre gana). `false` = ya estaba cerrada. */
export async function guardarMapa(e: ExploracionViva, mapa: MapaExploracion, motivoFin: string, bd: Bd = prisma): Promise<boolean> {
  const n = await bd.$executeRaw`
    update seguros.tarificador_exploraciones
    set mapa = ${JSON.stringify(mapa)}::jsonb, motivo_fin = ${motivoFin}, cerrada_at = now(), updated_at = now()
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid and cerrada_at is null`
  return n > 0
}

export async function costeYModelo(e: ExploracionViva, bd: Bd = prisma): Promise<{ llamadas: number; eur: number; modelo: string | null }> {
  const f = await bd.$queryRaw<{ llamadas_ia: number; coste_estimado_eur: unknown; modelo: string | null }[]>`
    select llamadas_ia, coste_estimado_eur, modelo from seguros.tarificador_exploraciones
    where id = ${e.exploracionId}::uuid and correduria_id = ${e.correduriaId}::uuid`
  return { llamadas: f[0]?.llamadas_ia ?? 0, eur: Number(f[0]?.coste_estimado_eur ?? 0), modelo: f[0]?.modelo ?? null }
}

// ─── Encolar (puerto de operador, 13/10/2026) ────────────────────────────────

/** El Catastro de verdad para `completarRiesgoConCatastro` (lo mismo que usa la pantalla de Hogar nuevo). */
const DEPS_CATASTRO: DepsCatastroExploracion = {
  porReferencia: async (ref) => {
    const c = await catastroPorReferencia(ref)
    return c.estado === 'ok' ? { estado: 'ok', catastro: { anioConstruccion: c.catastro.anioConstruccion, metrosCuadrados: c.catastro.metrosCuadrados } } : c
  },
  inmuebles: (p) => inmueblesPorDireccion(p),
  timeoutMs: 10_000,
}

export type EntradaEncolarExploracion = { correduriaId: string; entrada: string; trabajoOrigenId: string | null; oportunidadId?: string | null; solicitadoPor: string }
export type ResultadoEncolarExploracion =
  | { estado: 'encolado'; trabajoId: string; exploracionId: string; compania: string; conDatosReales: boolean }
  | { estado: 'rechazado'; status: number; motivo: string }

/**
 * Encola UNA exploración. Sintética (sin ancla: `cliente_id NULL`, riesgo vacío, todo lo personal de prueba) o ligada a
 * datos REALES por una de dos anclas EXCLUYENTES: un trabajo `tarificar` de ESTA correduría, con cliente y del MISMO ramo
 * (se copian su cliente y su riesgo), o una OPORTUNIDAD de Hogar de esta correduría (cliente de la oportunidad; riesgo =
 * ficha + `datosVivienda`, con uso y régimen obligatorios). El trigger de la BD re-exige el mismo cliente. Cerrojos: entrada de la lista cerrada, fila de
 * `companias_integracion` activa y `rpa_autorizada` (la misma que mira `reclamarSiguiente`), y una exploración viva por
 * compañía (índice único → 409). No lanza la máquina: eso lo hace quien llama (`lanzarPendientes`).
 */
export async function encolarExploracion(e: EntradaEncolarExploracion): Promise<ResultadoEncolarExploracion> {
  if (!esEntradaExploracion(e.entrada)) return { estado: 'rechazado', status: 400, motivo: 'entrada_desconocida' }
  const def = ENTRADAS_EXPLORACION[e.entrada]
  const compania = claveCompania(def.compania)
  const integ = await prisma.$queryRaw<{ modo: string; activo: boolean }[]>`
    select modo, activo from seguros.companias_integracion
    where correduria_id = ${e.correduriaId}::uuid and compania = ${compania} and ramo = ${def.ramo}`
  if (!integ[0] || !integ[0].activo || !puedeAutomatizar(integ[0].modo)) {
    return { estado: 'rechazado', status: 409, motivo: `modo_no_automatizable: ${integ[0] ? (integ[0].activo ? integ[0].modo : 'inactiva') : 'sin_integracion'}` }
  }
  let clienteId: string | null = null
  let riesgo: unknown = {}
  if (e.trabajoOrigenId) {
    const o = await prisma.$queryRaw<{ cliente_id: string | null; ramo: string; modo: string | null; riesgo: unknown; estado: string }[]>`
      select cliente_id::text as cliente_id, ramo, to_jsonb(t)->>'modo' as modo, riesgo, estado
      from seguros.tarificacion_trabajos t
      where t.id = ${e.trabajoOrigenId}::uuid and t.correduria_id = ${e.correduriaId}::uuid`
    const f = o[0]
    if (!f) return { estado: 'rechazado', status: 404, motivo: 'trabajo_origen_no_encontrado' }
    if ((f.modo ?? 'tarificar') !== 'tarificar' || !f.cliente_id) return { estado: 'rechazado', status: 409, motivo: 'trabajo_origen_no_es_una_tarificacion_de_cliente' }
    if (f.ramo !== def.ramo) return { estado: 'rechazado', status: 409, motivo: `trabajo_origen_de_otro_ramo (${f.ramo} ≠ ${def.ramo})` }
    if (typeof f.riesgo !== 'object' || f.riesgo === null || Array.isArray(f.riesgo)) return { estado: 'rechazado', status: 409, motivo: 'trabajo_origen_sin_riesgo' }
    // Purga (13/10/2026): «con datos reales» y un riesgo ya borrado al cerrarse sería explorar con datos a medias. Se dice.
    if (riesgoYaPurgado(f)) return { estado: 'rechazado', status: 409, motivo: `${MOTIVO_ORIGEN_PURGADO}: el riesgo de ese trabajo ya se borró al cerrarse (datos personales); elige uno abierto o explora en sintético` }
    clienteId = f.cliente_id
    riesgo = f.riesgo
  }
  const oportunidadId = e.trabajoOrigenId ? null : (e.oportunidadId ?? null)
  if (oportunidadId) {
    // Vía (c), 13/10/2026: ancla = una OPORTUNIDAD de Hogar de esta correduría. El riesgo se monta con la ficha de SU
    // cliente (descifrada en el servidor, `personaDeFicha`) + `info_riesgo.datosVivienda`. Nada se inventa ni se supone.
    const o = await prisma.$queryRaw<{ cliente_id: string | null; tipo: string | null; estado: string | null; datos_vivienda: unknown; tomador_distinto: boolean }[]>`
      select o.cliente_id::text as cliente_id, o.tipo::text as tipo, o.estado::text as estado, o.info_riesgo->'datosVivienda' as datos_vivienda,
             exists (select 1 from seguros.oportunidad_figura f
                     where f.oportunidad_id = o.id and f.correduria_id = o.correduria_id and f.rol = 'tomador' and f.cliente_id <> o.cliente_id) as tomador_distinto
      from seguros.oportunidades o
      where o.id = ${oportunidadId}::uuid and o.correduria_id = ${e.correduriaId}::uuid`
    const f = o[0]
    if (!f) return { estado: 'rechazado', status: 404, motivo: 'oportunidad_no_encontrada' }
    // Solo oportunidades ABIERTAS (la lista del módulo): una ganada o perdida ya no se tarifica con los datos del cliente.
    if (!(ESTADOS_OPORTUNIDAD_ABIERTA as readonly string[]).includes(f.estado ?? '')) return { estado: 'rechazado', status: 409, motivo: `oportunidad_cerrada (${f.estado ?? 'sin estado'}): solo se explora una oportunidad abierta` }
    if (!f.cliente_id) return { estado: 'rechazado', status: 409, motivo: 'oportunidad_sin_cliente' }
    if (f.tipo !== 'hogar' || def.ramo !== 'hogar') return { estado: 'rechazado', status: 409, motivo: `oportunidad_de_otro_ramo (${f.tipo ?? 'sin ramo'} ≠ ${def.ramo}): la vía oportunidad solo explora Hogar` }
    // El trigger exige que el cliente del trabajo sea el de la oportunidad: un tomador distinto no se mezcla con él.
    if (f.tomador_distinto) return { estado: 'rechazado', status: 409, motivo: 'tomador_distinto_del_cliente: el tomador de la oportunidad no es su cliente' }
    const ficha = await personaDeFicha(e.correduriaId, f.cliente_id, 'hogar')
    if (!ficha) return { estado: 'rechazado', status: 409, motivo: 'ficha_del_cliente_no_legible' }
    if ('tipo' in ficha && ficha.tipo === 'juridica') return { estado: 'rechazado', status: 409, motivo: 'tomador_empresa_no_soportado' }
    const p = ficha as { dni?: string; nombre?: string; apellido1?: string; apellido2?: string; fechaNacimiento?: string }
    const r = riesgoExploracionDeOportunidad({ nif: p.dni, nombre: p.nombre, apellido1: p.apellido1, apellido2: p.apellido2, fechaNacimiento: p.fechaNacimiento }, f.datos_vivienda)
    // Solo NOMBRES de campo en el motivo, nunca valores.
    if (!r.ok) {
      const partes = [r.faltan.length ? `falta ${r.faltan.join(', ')}` : '', r.noReconocidos?.length ? `id no reconocido en ${r.noReconocidos.join(', ')}` : ''].filter(Boolean)
      return { estado: 'rechazado', status: 409, motivo: `oportunidad_incompleta: ${partes.join('; ')}` }
    }
    clienteId = f.cliente_id
    // Año y m² que la oportunidad no trae: del Catastro, SOLO si es inequívoco y SOLO al riesgo del trabajo (la
    // oportunidad no se toca). Sin valor → la exploración parará con `dato_no_disponible`. Nunca lanza ni da 500.
    const cat = await completarRiesgoConCatastro(r.riesgo, f.datos_vivienda, DEPS_CATASTRO)
      .catch(() => ({ riesgo: r.riesgo, estado: 'error' as const, anadidos: [] }))
    if (cat.estado !== 'no_hacia_falta') console.info('[tarificador/explorador] catastro al encolar', { estado: cat.estado, anadidos: cat.anadidos })
    riesgo = cat.riesgo
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const t = await tx.$queryRaw<{ id: string }[]>`
        insert into seguros.tarificacion_trabajos (correduria_id, cliente_id, trabajo_origen_id, oportunidad_id, compania, ramo, riesgo, solicitado_por, modo)
        values (${e.correduriaId}::uuid, ${clienteId}::uuid, ${e.trabajoOrigenId}::uuid, ${oportunidadId}::uuid, ${compania}, ${def.ramo}, ${JSON.stringify(riesgo)}::jsonb, ${e.solicitadoPor}, 'exploracion')
        returning id::text as id`
      const x = await tx.$queryRaw<{ id: string }[]>`
        insert into seguros.tarificador_exploraciones (correduria_id, trabajo_id, entrada, compania, producto, con_datos_reales, solicitado_por)
        values (${e.correduriaId}::uuid, ${t[0].id}::uuid, ${e.entrada}, ${compania}, ${def.producto}, ${clienteId !== null}, ${e.solicitadoPor})
        returning id::text as id`
      return { estado: 'encolado' as const, trabajoId: t[0].id, exploracionId: x[0].id, compania, conDatosReales: clienteId !== null }
    }, { timeout: 15_000, maxWait: 10_000 })
  } catch (err) {
    const x = err as { meta?: { code?: unknown }; message?: unknown }
    const msg = typeof x?.message === 'string' ? x.message : ''
    if (x?.meta?.code === '23505' || /\b23505\b|duplicate key value violates unique constraint/.test(msg)) return { estado: 'rechazado', status: 409, motivo: 'exploracion_viva_para_la_compania' }
    if (x?.meta?.code === '23514' || /\b23514\b|violates check constraint/.test(msg)) return { estado: 'rechazado', status: 409, motivo: 'ancla_no_valida' }
    throw err
  }
}
