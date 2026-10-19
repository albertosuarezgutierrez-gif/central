// F3a — tarificar con BOTS un lead «listo para tarificar» (19/10/2026, spec lead → propuesta §F3; decisión de Alberto: bots
// antes que Avant2). Parte con BD; las reglas viven en `tarificacion-lead-puro.ts` (con test). Puerto
// `POST /api/operador/correo/tarificar-lead`, que solo llama plataforma tras el botón de Alberto (`clp_tar`/`clp_top`).
//
//   · revisar (GRATIS, sin escribir nada): por oportunidad del lead, qué compañías con bot ACTIVO (fila
//     `companias_integracion` activa + `rpa_autorizada` + sin pausa) llegarían a precio con lo que dijo el cliente, qué les
//     falta (en claves del contrato, para la repregunta), qué se supone y el contador de hoy.
//   · tarificar: vuelve a revisar (los datos pueden haber cambiado), RESERVA el cupo del día en
//     `seguros.correduria_tarif_auto_uso` (sin la tabla NO se tarifica; sin cupo → `tope`, queda en cola) y encola por el
//     camino de siempre (`encolarTrabajo` → `riesgoParaEncolar`). Un duplicado de un trabajo vivo no gasta cupo.
//   · ampliar_tope: «➕ 10 más hoy» (solo el día de hoy; nunca más de 100 en total).
// 🛡️ Todo SQL lleva `correduria_id` (puerta `lib/tenant`). 🚨 TARIFICAR ≠ EMITIR: nada de aquí habla con Codeoscopic.
// Nada de valores personales en la respuesta ni en logs: compañías, claves y conteos.
import { prisma } from './tenant'
import { claveCompania, puedeAutomatizar } from '@central/module-tarificacion'
import { encolarTrabajo, lanzarPendientes } from './tarificador'
import { rpaActivo, validarEntradaRamo } from './tarificador-reglas'
import { pausaViva } from './tarificador-robustez'
import { leerDatosContrato } from './correo-respuesta-lead-puro'
import {
  AMPLIACION_TOPE, TOPE_DIARIO_MAXIMO, diaMadrid, esRamoBotLead, formularioBotDesdeLead, ramoConBot, topeDiario, valorarCompania,
  type FormularioLead, type Supuesto, type ValoracionCompania,
} from './tarificacion-lead-puro'

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const sinTabla = (err: unknown) => {
  const code = (err as { code?: string; meta?: { code?: string } })?.meta?.code ?? (err as { code?: string })?.code
  return code === '42P01' || /relation .* does not exist/i.test(String((err as Error)?.message))
}

export type Contador = { usadas: number; tope: number; extra: number }

export type RevisionOportunidad = {
  id: string
  ramo: string
  /** `sin_bot`: ningún bot para ese ramo (en el código o en la BD); `sin_formulario`: hay bot pero el lead aún no se traduce. */
  estado: 'sin_bot' | 'sin_formulario' | 'evaluada'
  companias: ValoracionCompania[]
  supuestos: Supuesto[]
  noLeidos: string[]
}

export type Revision = {
  estado: 'ok'
  rpaActivo: boolean
  oportunidades: RevisionOportunidad[]
  /** `null` = no se ha podido contar (sin tabla o BD caída): entonces NO se tarifica. */
  contador: Contador | null
  contadorMotivo: 'ok' | 'sin_tabla' | 'error'
}

async function leerContador(correduriaId: string, dia: string): Promise<{ c: Contador | null; motivo: 'ok' | 'sin_tabla' | 'error' }> {
  const tope = topeDiario(process.env)
  try {
    const f = await prisma.$queryRaw<{ usadas: number; tope_extra: number }[]>`
      select usadas, tope_extra from seguros.correduria_tarif_auto_uso
      where correduria_id = ${correduriaId}::uuid and dia = ${dia}::date`
    return { c: { usadas: f[0]?.usadas ?? 0, tope, extra: f[0]?.tope_extra ?? 0 }, motivo: 'ok' }
  } catch (e) {
    return { c: null, motivo: sinTabla(e) ? 'sin_tabla' : 'error' }
  }
}

/** Compañías con bot ACTIVO para ese ramo en ESTA correduría (fila activa, `rpa_autorizada`, sin pausa). */
async function companiasConBot(correduriaId: string, ramo: string): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ compania: string; modo: string; activo: boolean }[]>`
    select compania, modo, activo from seguros.companias_integracion
    where correduria_id = ${correduriaId}::uuid and ramo = ${ramo} and activo
    order by compania`
  const out: string[] = []
  for (const f of filas) {
    if (!puedeAutomatizar(f.modo)) continue
    if (await pausaViva(prisma, correduriaId, claveCompania(f.compania), ramo).catch(() => true)) continue
    out.push(claveCompania(f.compania))
  }
  return [...new Set(out)]
}

async function descifrarContrato(info: Record<string, unknown>): Promise<{ valores: Record<string, unknown>; ilegibles: string[] }> {
  const dc = leerDatosContrato(info.datosContrato)
  const { descifrarJsonEstricto } = await import('@central/module-seguros-pii')
  const valores: Record<string, unknown> = {}
  const ilegibles: string[] = []
  for (const [k, v] of Object.entries(dc.valores)) {
    if (!esObj(v)) { valores[k] = v; continue }
    try { valores[k] = descifrarJsonEstricto(String(v.cifrado)) } catch { ilegibles.push(k) }
  }
  return { valores, ilegibles }
}

async function nacimientoFicha(correduriaId: string, clienteId: string): Promise<string | null> {
  const f = await prisma.$queryRaw<{ fecha_nacimiento: string | null }[]>`
    select fecha_nacimiento from seguros.clientes
    where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
  const v = f[0]?.fecha_nacimiento
  if (!v) return null
  const { decryptField } = await import('@central/module-seguros-pii')
  try {
    const t = decryptField(v).trim()
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
    const es = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : es ? `${es[3]}-${es[2]}-${es[1]}` : null
  } catch { return null }
}

type Interno = RevisionOportunidad & { formulario: FormularioLead | null }

async function revisarInterno(correduriaId: string, clienteId: string, oportunidadIds: string[], ahora: Date): Promise<{ ops: Interno[]; dia: string }> {
  const dia = diaMadrid(ahora)
  const filas = await prisma.$queryRaw<{ id: string; tipo: string; info_riesgo: unknown }[]>`
    select o.id::text as id, o.tipo::text as tipo, o.info_riesgo from seguros.oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${clienteId}::uuid and o.id = any(${oportunidadIds}::uuid[])`
  const nac = filas.some((f) => esRamoBotLead(f.tipo)) ? await nacimientoFicha(correduriaId, clienteId).catch(() => null) : null
  const ops: Interno[] = []
  for (const f of filas) {
    const base = { id: f.id, ramo: f.tipo, companias: [] as ValoracionCompania[], supuestos: [] as Supuesto[], noLeidos: [] as string[], formulario: null }
    if (!ramoConBot(f.tipo)) { ops.push({ ...base, estado: 'sin_bot' }); continue }
    const cias = await companiasConBot(correduriaId, f.tipo)
    if (!cias.length) { ops.push({ ...base, estado: 'sin_bot' }); continue }
    if (!esRamoBotLead(f.tipo)) { ops.push({ ...base, estado: 'sin_formulario' }); continue }
    const info = esObj(f.info_riesgo) ? f.info_riesgo : {}
    const { valores, ilegibles } = await descifrarContrato(info)
    const formulario = formularioBotDesdeLead({
      ramo: f.tipo, valores, ilegibles, bloque: esObj(info.datosVehiculo) ? info.datosVehiculo : null, fichaNacimiento: nac, hoy: dia,
    })
    ops.push({ ...base, estado: 'evaluada', formulario, supuestos: formulario.supuestos, noLeidos: formulario.noLeidos, companias: cias.map((c) => valorarCompania(c, f.tipo as 'auto' | 'moto', formulario)) })
  }
  return { ops, dia }
}

const publico = (o: Interno): RevisionOportunidad => ({ id: o.id, ramo: o.ramo, estado: o.estado, companias: o.companias, supuestos: o.supuestos, noLeidos: o.noLeidos })

export async function revisarTarificacionLead(correduriaId: string, p: { clienteId: string; oportunidadIds: string[] }, ahora = new Date()): Promise<Revision> {
  const { ops, dia } = await revisarInterno(correduriaId, p.clienteId, p.oportunidadIds, ahora)
  const { c, motivo } = await leerContador(correduriaId, dia)
  return { estado: 'ok', rpaActivo: rpaActivo(process.env), oportunidades: ops.map(publico), contador: c, contadorMotivo: motivo }
}

export type ResultadoTrabajo = { oportunidadId: string; compania: string; estado: 'encolado' | 'duplicado' | 'rechazado'; motivo?: string }
export type ResultadoTarificar =
  | { estado: 'apagado' }
  | { estado: 'sin_tabla' | 'sin_contador' }
  /** Nada que lanzar: la revisión dice por qué (faltan datos, sin bot…). */
  | { estado: 'nada'; revision: Revision }
  /** No cabe en el cupo de hoy: queda EN COLA (nada encolado ni gastado). */
  | { estado: 'tope'; usadas: number; tope: number; pendientes: number; dia: string }
  | { estado: 'encolado'; trabajos: ResultadoTrabajo[]; usadas: number; tope: number; supuestos: Supuesto[] }

export async function tarificarLead(correduriaId: string, p: { clienteId: string; oportunidadIds: string[]; actor: string }, ahora = new Date()): Promise<ResultadoTarificar> {
  if (!rpaActivo(process.env)) return { estado: 'apagado' }
  const { ops, dia } = await revisarInterno(correduriaId, p.clienteId, p.oportunidadIds, ahora)
  const lanzar: { oportunidadId: string; ramo: 'auto' | 'moto'; compania: string; riesgo: unknown }[] = []
  for (const o of ops) {
    if (o.estado !== 'evaluada' || !o.formulario || !esRamoBotLead(o.ramo)) continue
    for (const v of o.companias) {
      if (v.estado !== 'lista') continue
      const val = validarEntradaRamo(o.ramo, o.formulario.riesgo, v.compania)
      if (val.ok) lanzar.push({ oportunidadId: o.id, ramo: o.ramo, compania: v.compania, riesgo: val.entrada.riesgo })
    }
  }
  if (!lanzar.length) {
    const { c, motivo } = await leerContador(correduriaId, dia)
    return { estado: 'nada', revision: { estado: 'ok', rpaActivo: true, oportunidades: ops.map(publico), contador: c, contadorMotivo: motivo } }
  }

  // Reserva del cupo ANTES de encolar (atómica: dos pulsaciones a la vez no pasan las dos del tope).
  const tope = topeDiario(process.env)
  const n = lanzar.length
  let reservado: { usadas: number; tope_extra: number }[]
  try {
    reservado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        insert into seguros.correduria_tarif_auto_uso (correduria_id, dia) values (${correduriaId}::uuid, ${dia}::date)
        on conflict (correduria_id, dia) do nothing`
      return tx.$queryRaw<{ usadas: number; tope_extra: number }[]>`
        update seguros.correduria_tarif_auto_uso set usadas = usadas + ${n}, updated_at = now()
        where correduria_id = ${correduriaId}::uuid and dia = ${dia}::date
          and usadas + ${n} <= least(${tope} + tope_extra, ${TOPE_DIARIO_MAXIMO})
        returning usadas, tope_extra`
    })
  } catch (e) {
    return { estado: sinTabla(e) ? 'sin_tabla' : 'sin_contador' }
  }
  if (!reservado.length) {
    const { c } = await leerContador(correduriaId, dia)
    return { estado: 'tope', usadas: c?.usadas ?? 0, tope: Math.min(tope + (c?.extra ?? 0), TOPE_DIARIO_MAXIMO), pendientes: n, dia }
  }

  const trabajos: ResultadoTrabajo[] = []
  for (const t of lanzar) {
    const r = await encolarTrabajo({
      correduriaId, oportunidadId: t.oportunidadId, clienteId: p.clienteId, polizaId: null, compania: t.compania, ramo: t.ramo,
      riesgo: t.riesgo as Parameters<typeof encolarTrabajo>[0]['riesgo'], solicitadoPor: p.actor,
    }).catch(() => ({ estado: 'rechazado' as const, status: 503, motivo: 'fallo interno al encolar' }))
    if (r.estado === 'encolado') trabajos.push({ oportunidadId: t.oportunidadId, compania: t.compania, estado: r.duplicado ? 'duplicado' : 'encolado' })
    // Solo el código del motivo (antes de «:»): nunca un dato.
    else trabajos.push({ oportunidadId: t.oportunidadId, compania: t.compania, estado: 'rechazado', motivo: r.motivo.split(':')[0].slice(0, 60) })
  }
  // Lo que no se encoló de verdad (duplicado o rechazado) devuelve su cupo.
  const nuevos = trabajos.filter((t) => t.estado === 'encolado').length
  let usadas = reservado[0].usadas
  if (nuevos < n) {
    const f = await prisma.$queryRaw<{ usadas: number }[]>`
      update seguros.correduria_tarif_auto_uso set usadas = greatest(usadas - ${n - nuevos}, 0), updated_at = now()
      where correduria_id = ${correduriaId}::uuid and dia = ${dia}::date returning usadas`.catch(() => null)
    if (f?.[0]) usadas = f[0].usadas
  }
  for (const c of new Set(trabajos.filter((t) => t.estado === 'encolado').map((t) => t.compania))) {
    await lanzarPendientes(correduriaId, c).catch(() => null)
  }
  const encoladas = trabajos.filter((t) => t.estado !== 'rechazado')
  for (const opId of new Set(encoladas.map((t) => t.oportunidadId))) {
    await prisma.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${opId}::uuid, 'tarificacion_bots_lead',
              ${JSON.stringify({ companias: encoladas.filter((t) => t.oportunidadId === opId).map((t) => t.compania) })}::jsonb, ${p.actor})`.catch(() => 0)
  }
  if (encoladas.length) {
    await prisma.$executeRaw`
      update seguros.correduria_hilo set estado_datos = 'tarificando'
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${p.clienteId}::uuid
        and oportunidad_id = any(${[...new Set(encoladas.map((t) => t.oportunidadId))]}::uuid[]) and estado_datos = 'lista_para_tarificar'`.catch(() => 0)
  }
  const supuestos = ops.flatMap((o) => o.supuestos)
  return { estado: 'encolado', trabajos, usadas, tope: Math.min(tope + reservado[0].tope_extra, TOPE_DIARIO_MAXIMO), supuestos }
}

export type ResultadoAmpliar = { estado: 'ok'; usadas: number; tope: number } | { estado: 'sin_tabla' | 'error' }

/** «➕ 10 más hoy». Solo para HOY (lo valida el puerto). El tope efectivo nunca pasa de 100. */
export async function ampliarTopeLead(correduriaId: string, dia: string): Promise<ResultadoAmpliar> {
  const tope = topeDiario(process.env)
  try {
    const f = await prisma.$queryRaw<{ usadas: number; tope_extra: number }[]>`
      insert into seguros.correduria_tarif_auto_uso (correduria_id, dia, tope_extra)
      values (${correduriaId}::uuid, ${dia}::date, ${AMPLIACION_TOPE})
      on conflict (correduria_id, dia) do update
        set tope_extra = least(seguros.correduria_tarif_auto_uso.tope_extra + ${AMPLIACION_TOPE}, greatest(${TOPE_DIARIO_MAXIMO} - ${tope}, 0)),
            updated_at = now()
      returning usadas, tope_extra`
    return { estado: 'ok', usadas: f[0].usadas, tope: Math.min(tope + f[0].tope_extra, TOPE_DIARIO_MAXIMO) }
  } catch (e) {
    return { estado: sinTabla(e) ? 'sin_tabla' : 'error' }
  }
}
