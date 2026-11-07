// RETENCIÓN DE CARTERA F1 (07/11/2026): la parte con BD y Telegram del calendario de renovación. Reglas PURAS (con test) en
// `retencion-cartera-reglas.ts`; diseño en docs/superpowers/specs/2026-11-07-retencion-cartera.md.
// Migración `prisma/sql/2026-11-07a_retencion_cartera.sql` (NO APLICADA a la fecha): sin ella, ENSAYO (no se crea nada).
//
// Reutiliza, no rehace:
//   · datos    → `prepararSolicitudRenovacion` (PR #5569): crea el BORRADOR y manda a Alberto el Telegram con ✅ `cdr_env`.
//   · bots     → `lanzarBotsRenovacion` (PR #5592): mismo camino que «Probar», deduplica trabajos vivos. Avant2 NUNCA.
//   · propuesta→ `prepararRenovacion` (PR #5557): borrador del presupuesto de renovación + su Telegram de revisión con ✅ `crv_pub`
//                (lo vigente lo exige asegura). Publicar (campana + correo de aviso) SOLO con ese ✅ de Alberto, nunca desde aquí.
// 🛡️ Todo SQL por `correduria_id` (correduría única: `correduriaUnica`). Sin PII en logs ni Telegram (nombre de pila + ramo +
//    compañía + vencimiento). 🚨 TARIFICAR ≠ EMITIR. El SQL crudo NO prefija el schema: la conexión ya lo trae.
import { WHERE_CARTERA_EN_VIGOR, esCarteraEnVigor, nombreDePila, vencimientoConRecibos, type ReciboVigencia } from '@central/module-seguros'
import { tgSend, tgSendButtons } from '@central/core-telegram'
import { prismaAsegura } from './asegura-db'
import { correduriaUnica } from './cartera'
import { registrarErrorCartera } from './error-cartera'
import { esColumnaAusente, esTablaAusente } from './pg-error'
import { abrirRiesgoDePoliza } from './oportunidad-riesgo'
import { prepararRenovacion, urlModificar } from './renovacion-alternativas'
import { prepararSolicitudRenovacion } from './solicitud-renovacion'
import { lanzarBotsRenovacion } from './solicitud-renovacion-bots'
import {
  HORIZONTE_MAX_DIAS, RAMOS_RETENCION, accionesPendientes, botonesResumenDiario, cicloDeAnualidad, etapaRenovacion, modoRetencion,
  preferenciasEfectivas, subidaPrimaRenovacion, textoEnsayo, textoResumenDiario,
  type Accion, type CicloHecho, type LineaPoliza, type PreferenciasRenovacion,
} from './retencion-cartera-reglas'

const db = () => prismaAsegura()
export const ACTOR_RETENCION = 'sistema:retencion-cartera'
/** Tope de pólizas con acción por pasada (el resto, mañana): cada una puede abrir oportunidad, Catastro y Telegram. */
export const MAX_ACCIONES_PASADA = 15

const ausente = (e: unknown) => esTablaAusente(e) || esColumnaAusente(e)

/** ¿Está la migración 2026-11-07a? Un fallo que NO es «falta la tabla/columna» se propaga. */
export async function migracionRetencion(): Promise<boolean> {
  try {
    await db().$queryRaw`select id, datos_at, bots_at, propuesta_at, subida_avisada_at, bloqueo_hasta from renovacion_ciclo limit 0`
    return true
  } catch (e) {
    if (ausente(e)) return false
    throw e
  }
}

/** Preferencias por cliente. `null` = no se pudieron leer (sin tabla): se aplican los DEFECTOS y se dice. */
async function leerPreferencias(correduriaId: string, clienteIds: readonly string[]): Promise<Map<string, PreferenciasRenovacion> | null> {
  if (clienteIds.length === 0) return new Map()
  try {
    const filas = await db().$queryRaw<{ cliente_id: string; umbral: unknown; dias: number | null }[]>`
      select cliente_id::text as cliente_id, umbral_subida_pct as umbral, dias_antelacion as dias from renovacion_preferencias
      where correduria_id = ${correduriaId}::uuid and cliente_id = any(${[...clienteIds]}::uuid[])`
    return new Map(filas.map((f) => [f.cliente_id, { umbralSubidaPct: f.umbral === null ? null : Number(String(f.umbral)), diasAntelacion: f.dias }]))
  } catch (e) {
    if (ausente(e)) return null
    throw e
  }
}

type Candidata = {
  polizaId: string; clienteId: string; ramo: string; compania: string | null; nombre: string | null
  vencimiento: string | null; fraccionamiento: string | null; recibos: ReciboVigencia[]; enVigor: boolean
}

/**
 * Auto y hogar EN VIGOR cuyo vencimiento CON RECIBOS cae dentro del horizonte. La consulta trae también las de fecha pasada
 * (Allianz renueva solo en el recibo): el vencimiento real lo decide `vencimientoConRecibos`, no la fecha de la póliza.
 */
async function leerCandidatas(correduriaId: string, hoy: string): Promise<Candidata[]> {
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - 400 * 86_400_000)
  const hasta = new Date(Date.parse(`${hoy}T00:00:00Z`) + (HORIZONTE_MAX_DIAS + 1) * 86_400_000)
  const ps = await db().poliza.findMany({
    where: {
      correduriaId, mergedIntoPolizaId: null, tipo: { in: [...RAMOS_RETENCION] },
      fechaVencimiento: { gte: desde, lte: hasta }, ...WHERE_CARTERA_EN_VIGOR,
    },
    select: {
      id: true, clienteId: true, tipo: true, aseguradora: true, fechaVencimiento: true, fraccionamiento: true,
      estado: true, importRef: true, eiacXmlHash: true, sustituidaAt: true,
      cliente: { select: { nombre: true } },
      recibos: { where: { correduriaId }, select: { claseRecibo: true, situacion: true, primaTotal: true, fechaVencimiento: true } },
    },
  })
  return ps.map((p) => {
    const recibos: ReciboVigencia[] = p.recibos.map((r) => ({
      claseRecibo: r.claseRecibo ?? null, situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal,
      fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString().slice(0, 10) : null,
    }))
    const venc = vencimientoConRecibos(p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : null, recibos, hoy)
    return {
      polizaId: p.id, clienteId: p.clienteId, ramo: String(p.tipo), compania: p.aseguradora, nombre: nombreDePila(p.cliente?.nombre ?? null),
      vencimiento: venc ? venc.slice(0, 10) : null, fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento), recibos,
      // Re-aplicado en TS (el `where` ya lo filtra): es la regla, no un atajo.
      enVigor: esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado === null ? null : String(p.estado), sustituidaAt: p.sustituidaAt }),
    }
  })
}

type FilaCiclo = CicloHecho & { id: string; polizaId: string; vencimiento: string }

async function leerCiclos(correduriaId: string, polizaIds: readonly string[]): Promise<Map<string, FilaCiclo[]>> {
  const m = new Map<string, FilaCiclo[]>()
  if (polizaIds.length === 0) return m
  const filas = await db().$queryRaw<FilaCiclo[]>`
    select id::text as id, poliza_id::text as "polizaId", to_char(vencimiento, 'YYYY-MM-DD') as vencimiento,
           datos_at as "datosAt", bots_at as "botsAt", propuesta_at as "propuestaAt", subida_avisada_at as "subidaAvisadaAt"
    from renovacion_ciclo where correduria_id = ${correduriaId}::uuid and poliza_id = any(${[...polizaIds]}::uuid[])`
  for (const f of filas) m.set(f.polizaId, [...(m.get(f.polizaId) ?? []), f])
  return m
}

/** Crea (si no hay) el ciclo de la anualidad y lo RESERVA 15 min. `null` = otra pasada lo tiene: no se toca. */
async function reservarCiclo(correduriaId: string, c: Candidata, existente: FilaCiclo | null): Promise<string | null> {
  let id = existente?.id ?? null
  if (!id) {
    const [n] = await db().$queryRaw<{ id: string }[]>`
      insert into renovacion_ciclo (correduria_id, poliza_id, cliente_id, ramo, vencimiento)
      values (${correduriaId}::uuid, ${c.polizaId}::uuid, ${c.clienteId}::uuid, ${c.ramo}, ${c.vencimiento}::date)
      on conflict (correduria_id, poliza_id, vencimiento) do update set actualizado_at = now()
      returning id::text as id`
    id = n?.id ?? null
  }
  if (!id) return null
  const [r] = await db().$queryRaw<{ id: string }[]>`
    update renovacion_ciclo set bloqueo_hasta = now() + interval '15 minutes', actualizado_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and (bloqueo_hasta is null or bloqueo_hasta < now())
    returning id::text as id`
  return r?.id ?? null
}

async function soltarCiclo(correduriaId: string, id: string): Promise<void> {
  await db().$executeRaw`update renovacion_ciclo set bloqueo_hasta = null where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
}

/** Sella un paso como HECHO (CAS: si ya estaba, no se pisa). El resultado es un estado corto, nunca un valor. */
async function sellar(correduriaId: string, id: string, a: Accion, resultado: string, presupuestoId: string | null = null): Promise<void> {
  const r = resultado.slice(0, 80)
  if (a === 'datos') await db().$executeRaw`update renovacion_ciclo set datos_at = now(), datos_resultado = ${r} where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and datos_at is null`
  if (a === 'bots') await db().$executeRaw`update renovacion_ciclo set bots_at = now(), bots_resultado = ${r} where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and bots_at is null`
  if (a === 'propuesta') await db().$executeRaw`update renovacion_ciclo set propuesta_at = now(), propuesta_resultado = ${r}, presupuesto_id = ${presupuestoId}::uuid where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and propuesta_at is null`
}

/** Anota (sin sellar) el último resultado de un intento que se repetirá mañana. */
async function anotarIntento(correduriaId: string, id: string, a: Accion, resultado: string): Promise<void> {
  const r = `pendiente:${resultado}`.slice(0, 80)
  if (a === 'datos') await db().$executeRaw`update renovacion_ciclo set datos_resultado = ${r} where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and datos_at is null`
  if (a === 'bots') await db().$executeRaw`update renovacion_ciclo set bots_resultado = ${r} where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and bots_at is null`
  if (a === 'propuesta') await db().$executeRaw`update renovacion_ciclo set propuesta_resultado = ${r} where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and propuesta_at is null`
}

/**
 * Ejecuta UNA acción. Devuelve el estado corto y si queda HECHA (se sella) o se reintenta mañana. Cada función reutilizada
 * ya manda su propio Telegram de revisión a Alberto con su ✅; aquí no se manda nada al cliente.
 */
async function ejecutar(correduriaId: string, c: Candidata, a: Accion): Promise<{ estado: string; hecho: boolean; presupuestoId?: string }> {
  if (a === 'datos') {
    const r = await prepararSolicitudRenovacion(correduriaId, { polizaId: c.polizaId, actor: ACTOR_RETENCION })
    if (r.estado === 'creada' || r.estado === 'actualizada') return { estado: r.telegram ? 'solicitud_propuesta' : 'solicitud_sin_telegram', hecho: r.telegram }
    // «Nada que pedir» = datos completos; ya publicada / otra viva / empresa: no hay nada más que proponer en esta anualidad.
    if (r.estado === 'nada_que_pedir' || r.estado === 'ya_publicada' || r.estado === 'otra_solicitud' || r.estado === 'no_preguntable') return { estado: r.estado, hecho: true }
    return { estado: r.estado, hecho: false }
  }
  if (a === 'bots') {
    const ab = await abrirRiesgoDePoliza(correduriaId, { polizaId: c.polizaId, actor: ACTOR_RETENCION })
    if (!ab.ok) return { estado: 'sin_oportunidad', hecho: false }
    // `faltas: 0` NO se supone: `lanzarBotsRenovacion` valida el riesgo por compañía (`validarEntradaRamo`) antes de encolar.
    const r = await lanzarBotsRenovacion(correduriaId, { clienteId: c.clienteId, oportunidadId: ab.oportunidadId, faltas: 0 })
    if (r.fallo) return { estado: 'fallo', hecho: false }
    if (r.decision.accion !== 'encolar') return { estado: r.decision.motivo, hecho: false }
    const vivos = r.resultados.filter((x) => x.tipo !== 'rechazado').length
    return { estado: vivos > 0 ? `lanzados_${vivos}` : 'rechazados', hecho: vivos > 0 }
  }
  const r = await prepararRenovacion(correduriaId, { polizaId: c.polizaId, actor: ACTOR_RETENCION, avisar: true })
  if (r.estado === 'creado' || r.estado === 'ya_existe') return { estado: r.telegram ? 'preparada' : 'preparada_sin_telegram', hecho: r.telegram, presupuestoId: r.presupuestoId }
  return { estado: r.estado, hecho: false }
}

export type ResumenRetencion = {
  modo: 'ensayo' | 'activo'
  motivo?: 'interruptor' | 'sin_migracion' | 'contar'
  candidatas: number
  porEtapa: Record<string, number>
  acciones: number
  aplazadas: number
  telegram: boolean
  preferenciasLeidas: boolean
}

export async function ejecutarRetencionCartera(e: { contar: boolean }, env: Record<string, string | undefined> = process.env, ahora = new Date()): Promise<ResumenRetencion> {
  const correduria = await correduriaUnica()
  if (!correduria) throw new Error('sin_correduria')
  const cid = correduria.id
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const candidatas = await leerCandidatas(cid, hoy)
  const prefs = await leerPreferencias(cid, [...new Set(candidatas.map((c) => c.clienteId))])
  const hayMigracion = await migracionRetencion()
  const pedido = modoRetencion(env, e.contar)
  const modo: 'ensayo' | 'activo' = pedido === 'activo' && hayMigracion ? 'activo' : 'ensayo'
  const motivo = modo === 'activo' ? undefined : e.contar ? 'contar' : pedido === 'activo' ? 'sin_migracion' : !hayMigracion ? 'sin_migracion' : 'interruptor'
  const ciclos = hayMigracion ? await leerCiclos(cid, candidatas.map((c) => c.polizaId)) : new Map<string, FilaCiclo[]>()

  const lineas: LineaPoliza[] = []
  const conCiclo: { c: Candidata; linea: LineaPoliza; ciclo: FilaCiclo | null }[] = []
  for (const c of candidatas) {
    const pref = prefs?.get(c.clienteId) ?? null
    const efectivas = preferenciasEfectivas(pref)
    const etapa = etapaRenovacion({ enVigor: c.enVigor, ramo: c.ramo, vencimiento: c.vencimiento }, hoy, pref)
    if (etapa === 'no_aplica' || etapa === 'fuera' || etapa === 'vencida') continue
    const ciclo = c.vencimiento ? cicloDeAnualidad(ciclos.get(c.polizaId) ?? [], c.vencimiento) : null
    const subida = c.vencimiento ? subidaPrimaRenovacion({ recibos: c.recibos, vencimiento: c.vencimiento, fraccionamiento: c.fraccionamiento, umbralPct: efectivas.umbralSubidaPct }) : { estado: 'sin_dato' as const }
    const linea: LineaPoliza = {
      polizaId: c.polizaId, nombre: c.nombre, ramo: c.ramo, compania: c.compania, vencimiento: c.vencimiento, etapa,
      acciones: accionesPendientes(etapa, c.ramo, ciclo),
      // Una subida ya avisada en esta anualidad no se repite cada día.
      subida: subida.estado === 'subida' && ciclo?.subidaAvisadaAt != null ? { ...subida, estado: 'sin_subida' } : subida,
    }
    lineas.push(linea)
    conCiclo.push({ c, linea, ciclo })
  }
  const porEtapa: Record<string, number> = {}
  for (const l of lineas) porEtapa[l.etapa] = (porEtapa[l.etapa] ?? 0) + 1
  const base = { candidatas: candidatas.length, porEtapa, preferenciasLeidas: prefs !== null }

  if (modo === 'ensayo') {
    let telegram = false
    try {
      telegram = (await tgSend(textoEnsayo({ lineas, motivo: motivo ?? 'interruptor', preferenciasLeidas: prefs !== null }))) !== null
    } catch (x) {
      registrarErrorCartera('retencion-cartera/telegram-ensayo', x)
    }
    return { modo, motivo, ...base, acciones: 0, aplazadas: 0, telegram }
  }

  // ── ACTIVO: cada póliza con algo pendiente, reservada; cada acción, una vez por anualidad. ──
  let acciones = 0
  let aplazadas = 0
  const subidas: { id: string; pct: number }[] = []
  for (const { c, linea, ciclo } of conCiclo) {
    const quiereSubida = linea.subida.estado === 'subida'
    if (linea.acciones.length === 0 && !quiereSubida) continue
    if (!c.vencimiento) continue
    if (acciones >= MAX_ACCIONES_PASADA) { aplazadas++; continue }
    let id: string | null = null
    try {
      id = await reservarCiclo(cid, c, ciclo)
      if (!id) { aplazadas++; continue }
      acciones++
      const resultados: Partial<Record<Accion, string>> = {}
      for (const a of linea.acciones) {
        try {
          const r = await ejecutar(cid, c, a)
          resultados[a] = r.estado
          if (r.hecho) await sellar(cid, id, a, r.estado, r.presupuestoId ?? null)
          else await anotarIntento(cid, id, a, r.estado)
          // Sin datos completos no tiene sentido seguir con los bots HOY (la respuesta del cliente ya los lanza sola, PR #5592).
          if (a === 'datos' && r.estado !== 'nada_que_pedir') break
        } catch (x) {
          registrarErrorCartera(`retencion-cartera/${a}`, x)
          resultados[a] = 'error'
          break
        }
      }
      if (quiereSubida && linea.subida.estado === 'subida') subidas.push({ id, pct: linea.subida.pct })
      linea.resultados = resultados
    } catch (x) {
      registrarErrorCartera('retencion-cartera/poliza', x)
    } finally {
      if (id) await soltarCiclo(cid, id).catch((x: unknown) => registrarErrorCartera('retencion-cartera/soltar', x))
    }
  }

  let telegram = false
  try {
    const texto = textoResumenDiario({ lineas, preferenciasLeidas: prefs !== null })
    const botones = botonesResumenDiario(lineas, urlModificar)
    telegram = (botones.length ? await tgSendButtons(texto, botones) : await tgSend(texto)) !== null
  } catch (x) {
    registrarErrorCartera('retencion-cartera/telegram', x)
  }
  // La subida queda «avisada» SOLO si el resumen salió (si no, mañana se vuelve a decir). F2: reevaluar (bots de nuevo).
  if (telegram) {
    for (const s of subidas) {
      await db().$executeRaw`update renovacion_ciclo set subida_avisada_at = now(), subida_pct = ${s.pct}
        where id = ${s.id}::uuid and correduria_id = ${cid}::uuid and subida_avisada_at is null`.catch((x: unknown) => registrarErrorCartera('retencion-cartera/subida', x))
    }
  }
  return { modo, ...base, acciones, aplazadas, telegram }
}
