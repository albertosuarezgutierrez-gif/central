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
import { personaDeFicha, leerRiesgo } from './oportunidad-riesgo'
import { prismaAsegura } from './asegura-db'
import { claveCompania, puedeAutomatizar } from '@central/module-tarificacion'
import { encolarTrabajo, lanzarPendientes } from './tarificador'
import { companiaAdmiteRamoRpa, rpaActivo, validarEntradaRamo } from './tarificador-reglas'
import { pausaViva } from './tarificador-robustez'
import { riesgoHogarDeRiesgoOportunidad, type ReconstruccionRiesgo } from './tarificador-relanzar-reglas'
import { conocidosDeFicha, elegirEnContrato, leerDatosContrato } from './correo-respuesta-lead-puro'
import { datosVehiculoDeInfoRiesgo, claveDatosDeRamo, conocidosDeBloque, faltanObligatorios, referenciaCatastralValida, normalizarReferenciaCatastral, type CodigoConcreto } from '@central/module-seguros'
import {
  AMPLIACION_TOPE, TOPE_DIARIO_MAXIMO, carneDePersonaFicha, diaMadrid, esRamoBotLead, formularioBotDesdeLead, lecturaMoto, ramoConBot, topeDiario, valorarCompania,
  type FormularioLead, type LecturaMoto, type RamoBotLead, type Supuesto, type ValoracionCompania,
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
  /**
   * `sin_bot`: ningún bot para ese ramo (en el código o en la BD); `sin_formulario`: hay bot pero el lead aún no se traduce;
   * `discrepancias` (F3b): hay datos del correo distintos de los que había y Alberto aún no ha elegido: no se evalúa ni se lanza.
   */
  estado: 'sin_bot' | 'sin_formulario' | 'evaluada' | 'discrepancias'
  companias: ValoracionCompania[]
  supuestos: Supuesto[]
  noLeidos: string[]
  /** F3b: códigos de pregunta concreta para la repregunta (`PREGUNTAS_CONCRETAS`). */
  concretas: CodigoConcreto[]
  /** F3b: claves pendientes de elección (con `estado: 'discrepancias'`). */
  pendientes: string[]
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
    // Una fila activa solo habilita EXPLORAR en ramos como hogar (mapfre/occident): sin bot de tarificación no cuenta (→ `sin_bot`).
    if (!companiaAdmiteRamoRpa(f.compania, ramo)) continue
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

/**
 * Fecha del carné del conductor en la FICHA (carné B en coche; en moto SOLO el de moto: A, A1 o A2), la MISMA que lee la pantalla de
 * la oportunidad (`personaDeFicha`). `null` = no consta o no se pudo leer (nunca un valor de relleno).
 */
async function carneFicha(correduriaId: string, clienteId: string, ramo: string): Promise<string | null> {
  const p = await personaDeFicha(correduriaId, clienteId, ramo === 'moto' ? 'moto' : 'auto').catch(() => null)
  return carneDePersonaFicha(p, ramo)
}

type Interno = RevisionOportunidad & { formulario: FormularioLead | null }

/** Tope de cada consulta externa GRATIS de la revisión (catálogo de motos, Catastro): la revisión corre dentro del triaje. */
const TOPE_CONSULTA_MS = 8000
const conTope = <T>(p: Promise<T>, defecto: T): Promise<T> =>
  Promise.race([p.catch(() => defecto), new Promise<T>((res) => setTimeout(() => res(defecto), TOPE_CONSULTA_MS))])

/** Moto: el texto libre contra el catálogo de motos de Codeoscopic (GET gratis). Sin Codeoscopic configurado = `no_mirado`. */
async function motoDelLead(texto: unknown): Promise<LecturaMoto | null> {
  if (typeof texto !== 'string' || !texto.trim()) return null
  const { resolverConfig } = await import('./codeoscopic/config')
  const cfg = resolverConfig(process.env, { ignorarInterruptor: true })
  if (cfg.estado !== 'lista') return { estado: 'no_mirado' }
  const { marcasMoto, modelosMoto } = await import('./codeoscopic/catalogos')
  return conTope(lecturaMoto(texto, { marcas: () => marcasMoto(cfg.config), modelos: (id) => modelosMoto(cfg.config, id) }), { estado: 'no_mirado' } as LecturaMoto)
}

/**
 * Comunidades: con una referencia catastral de 20 caracteres, el año de construcción y el CP del Catastro (con la de 14, la de
 * parcela, el Catastro no da datos del bien). Solo si faltan. `null` = no se consultó o no dio nada (nunca «no tiene»).
 */
async function catastroComunidad(valores: Record<string, unknown>): Promise<{ anioConstruccion: number | null; codigoPostal: string | null } | null> {
  const ref = typeof valores.referenciaCatastral === 'string' ? normalizarReferenciaCatastral(valores.referenciaCatastral) : ''
  if (ref.length !== 20 || !referenciaCatastralValida(ref)) return null
  if (typeof valores.anioConstruccion === 'number' && typeof valores['direccion.codigoPostal'] === 'string') return null
  const { bajarCatastro } = await import('@central/core-catastro/http')
  const d = await conTope(bajarCatastro(ref), null)
  if (!d) return null
  const anio = typeof d.anioConstruccion === 'number' && d.anioConstruccion >= 1500 ? d.anioConstruccion : null
  const cp = typeof d.codigoPostal === 'string' && /^\d{5}$/.test(d.codigoPostal) ? d.codigoPostal : null
  return anio === null && cp === null ? null : { anioConstruccion: anio, codigoPostal: cp }
}

/**
 * El formulario candidato del bot de UNA oportunidad de auto/moto/comunidades: contrato del lead (descifrado) + bloque del
 * riesgo (`datosVehiculo`) + ficha (nacimiento y carné). Compartido por la revisión de leads y por «probar» (operador).
 * `discrepancias` = datos del correo sin elegir: no hay formulario.
 */
async function formularioDeOportunidad(
  correduriaId: string, clienteId: string, tipo: RamoBotLead, infoRiesgo: unknown, nac: string | null, dia: string,
): Promise<{ estado: 'discrepancias'; pendientes: string[] } | { estado: 'ok'; formulario: FormularioLead }> {
  const info = esObj(infoRiesgo) ? infoRiesgo : {}
  // F3b: con discrepancias sin elegir el expediente no está completo: ni se evalúa ni se lanza nada.
  const pendientes = Object.keys(leerDatosContrato(info.datosContrato).pendientes)
  if (pendientes.length) return { estado: 'discrepancias', pendientes }
  const { valores, ilegibles } = await descifrarContrato(info)
  const ramo = tipo
  const vehiculo = ramo === 'auto' || ramo === 'moto'
  const formulario = formularioBotDesdeLead({
    // Vehículo: el MISMO bloque que ve la oportunidad (con el fallback a las claves antiguas), no solo `datosVehiculo` a pelo.
    ramo, valores, ilegibles, bloque: vehiculo ? { ...datosVehiculoDeInfoRiesgo(info) } : esObj(info.datosVehiculo) ? info.datosVehiculo : null, fichaNacimiento: nac, hoy: dia,
    ...(vehiculo ? { fichaCarne: await carneFicha(correduriaId, clienteId, ramo) } : {}),
    ...(ramo === 'moto' ? { moto: await motoDelLead(valores.codigoVehiculo) } : {}),
    ...(ramo === 'comunidades' ? { catastro: await catastroComunidad(valores).catch(() => null) } : {}),
  })
  return { estado: 'ok', formulario }
}

/**
 * Riesgo para «probar» (operador) cuando el del último trabajo ya está purgado: se reconstruye de la oportunidad MÁS RECIENTE
 * del cliente en ese ramo + su ficha, como el botón (formulario + «completar desde ficha»). Solo SELECT; no inventa nada
 * (lo que falta lo dirá `validarEntradaRamo`). El riesgo NO sale de asegura.
 */
export async function riesgoDesdeOportunidadDelCliente(correduriaId: string, clienteId: string, ramo: string, ahora = new Date()): Promise<ReconstruccionRiesgo> {
  if (ramo === 'hogar') return riesgoHogarDeOportunidadDelCliente(correduriaId, clienteId, ahora)
  if (!esRamoBotLead(ramo)) return { riesgo: null, motivo: 'sin_formulario' }
  const [op] = await prisma.$queryRaw<{ info_riesgo: unknown }[]>`
    select o.info_riesgo from seguros.oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${clienteId}::uuid and o.tipo::text = ${ramo}
    order by o.created_at desc limit 1`
  if (!op) return { riesgo: null, motivo: 'sin_oportunidad' }
  const nac = await nacimientoFicha(correduriaId, clienteId).catch(() => null)
  const fo = await formularioDeOportunidad(correduriaId, clienteId, ramo, op.info_riesgo, nac, diaMadrid(ahora))
  if (fo.estado === 'discrepancias') return { riesgo: null, motivo: 'discrepancias' }
  return { riesgo: fo.formulario.riesgo, bloqueos: fo.formulario.bloqueos, repreguntar: fo.formulario.repreguntar }
}

/** HOGAR (27/10/2026): ver `riesgoHogarDeRiesgoOportunidad` (puro, `tarificador-relanzar-reglas.ts`). */
async function riesgoHogarDeOportunidadDelCliente(correduriaId: string, clienteId: string, ahora: Date): Promise<ReconstruccionRiesgo> {
  const [op] = await prisma.$queryRaw<{ id: string }[]>`
    select o.id::text as id from seguros.oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${clienteId}::uuid and o.tipo::text = 'hogar'
    order by (o.info_riesgo->'datosVivienda') is not null desc, o.created_at desc limit 1`
  if (!op) return { riesgo: null, motivo: 'sin_oportunidad' }
  const riesgo = await leerRiesgo(correduriaId, op.id)
  if (!riesgo) return { riesgo: null, motivo: 'sin_oportunidad' }
  return riesgoHogarDeRiesgoOportunidad(riesgo, ahora)
}

async function revisarInterno(correduriaId: string, clienteId: string, oportunidadIds: string[], ahora: Date): Promise<{ ops: Interno[]; dia: string }> {
  const dia = diaMadrid(ahora)
  const filas = await prisma.$queryRaw<{ id: string; tipo: string; info_riesgo: unknown }[]>`
    select o.id::text as id, o.tipo::text as tipo, o.info_riesgo from seguros.oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${clienteId}::uuid and o.id = any(${oportunidadIds}::uuid[])`
  const nac = filas.some((f) => esRamoBotLead(f.tipo)) ? await nacimientoFicha(correduriaId, clienteId).catch(() => null) : null
  const ops: Interno[] = []
  for (const f of filas) {
    const base = { id: f.id, ramo: f.tipo, companias: [] as ValoracionCompania[], supuestos: [] as Supuesto[], noLeidos: [] as string[], concretas: [] as CodigoConcreto[], pendientes: [] as string[], formulario: null }
    if (!ramoConBot(f.tipo)) { ops.push({ ...base, estado: 'sin_bot' }); continue }
    const cias = await companiasConBot(correduriaId, f.tipo)
    if (!cias.length) { ops.push({ ...base, estado: 'sin_bot' }); continue }
    if (!esRamoBotLead(f.tipo)) { ops.push({ ...base, estado: 'sin_formulario' }); continue }
    const fo = await formularioDeOportunidad(correduriaId, clienteId, f.tipo, f.info_riesgo, nac, dia)
    if (fo.estado === 'discrepancias') { ops.push({ ...base, estado: 'discrepancias', pendientes: fo.pendientes }); continue }
    const formulario = fo.formulario
    const ramo: RamoBotLead = f.tipo
    ops.push({
      ...base, estado: 'evaluada', formulario, supuestos: formulario.supuestos, noLeidos: formulario.noLeidos, concretas: formulario.concretas,
      companias: cias.map((c) => valorarCompania(c, ramo, formulario)),
    })
  }
  return { ops, dia }
}

const publico = (o: Interno): RevisionOportunidad => ({
  id: o.id, ramo: o.ramo, estado: o.estado, companias: o.companias, supuestos: o.supuestos, noLeidos: o.noLeidos, concretas: o.concretas, pendientes: o.pendientes,
})

export async function revisarTarificacionLead(correduriaId: string, p: { clienteId: string; oportunidadIds: string[] }, ahora = new Date()): Promise<Revision> {
  const { ops, dia } = await revisarInterno(correduriaId, p.clienteId, p.oportunidadIds, ahora)
  const { c, motivo } = await leerContador(correduriaId, dia)
  return { estado: 'ok', rpaActivo: rpaActivo(process.env), oportunidades: ops.map(publico), contador: c, contadorMotivo: motivo }
}

export type ResultadoTrabajo = { oportunidadId: string; compania: string; estado: 'encolado' | 'duplicado' | 'rechazado'; motivo?: string; trabajoId?: string }
export type ResultadoTarificar =
  | { estado: 'apagado' }
  | { estado: 'sin_tabla' | 'sin_contador' }
  /** Nada que lanzar: la revisión dice por qué (faltan datos, sin bot…). */
  | { estado: 'nada'; revision: Revision }
  /** No cabe en el cupo de hoy: queda EN COLA (nada encolado ni gastado). */
  | { estado: 'tope'; usadas: number; tope: number; pendientes: number; dia: string }
  | { estado: 'encolado'; trabajos: ResultadoTrabajo[]; usadas: number | null; tope: number | null; supuestos: Supuesto[] }

export async function tarificarLead(
  correduriaId: string,
  p: { clienteId: string; oportunidadIds: string[]; actor: string; pendienteId?: string; tgMessageId?: string },
  ahora = new Date(),
): Promise<ResultadoTarificar> {
  if (!rpaActivo(process.env)) return { estado: 'apagado' }
  const { ops, dia } = await revisarInterno(correduriaId, p.clienteId, p.oportunidadIds, ahora)
  const candidatos: { oportunidadId: string; ramo: RamoBotLead; compania: string; riesgo: unknown }[] = []
  for (const o of ops) {
    if (o.estado !== 'evaluada' || !o.formulario || !esRamoBotLead(o.ramo)) continue
    for (const v of o.companias) {
      if (v.estado !== 'lista') continue
      const val = validarEntradaRamo(o.ramo, o.formulario.riesgo, v.compania)
      if (val.ok) candidatos.push({ oportunidadId: o.id, ramo: o.ramo, compania: v.compania, riesgo: val.entrada.riesgo })
    }
  }
  const entrada = (t: (typeof candidatos)[number], soloComprobarDuplicado = false) => ({
    correduriaId, oportunidadId: t.oportunidadId, clienteId: p.clienteId, polizaId: null, compania: t.compania, ramo: t.ramo,
    riesgo: t.riesgo as Parameters<typeof encolarTrabajo>[0]['riesgo'], solicitadoPor: p.actor, soloComprobarDuplicado,
  })
  // F3b: lo que YA está en marcha con los mismos datos no reserva cupo ni se topa con el tope: se dice «ya en marcha».
  const duplicados: ResultadoTrabajo[] = []
  const lanzar: typeof candidatos = []
  for (const t of candidatos) {
    const d = await encolarTrabajo(entrada(t, true)).catch(() => null)
    if (d?.estado === 'encolado' && d.duplicado) duplicados.push({ oportunidadId: t.oportunidadId, compania: t.compania, estado: 'duplicado', trabajoId: d.trabajoId })
    else lanzar.push(t)
  }
  if (!lanzar.length && duplicados.length) {
    const { c } = await leerContador(correduriaId, dia)
    return { estado: 'encolado', trabajos: duplicados, usadas: c?.usadas ?? null, tope: c ? Math.min(c.tope + c.extra, TOPE_DIARIO_MAXIMO) : null, supuestos: [] }
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

  const trabajos: ResultadoTrabajo[] = [...duplicados]
  for (const t of lanzar) {
    const r = await encolarTrabajo(entrada(t))
      .catch(() => ({ estado: 'rechazado' as const, status: 503, motivo: 'fallo interno al encolar' }))
    if (r.estado === 'encolado') trabajos.push({ oportunidadId: t.oportunidadId, compania: t.compania, estado: r.duplicado ? 'duplicado' : 'encolado', trabajoId: r.trabajoId })
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
    const deOp = encoladas.filter((t) => t.oportunidadId === opId)
    // F3b: los trabajos y el pendiente/mensaje de Telegram, para avisar EN SU HILO si un bot falla (solo ids, sin datos).
    const detalle = { companias: deOp.map((t) => t.compania), trabajos: deOp.map((t) => t.trabajoId).filter(Boolean), pendienteId: p.pendienteId ?? null, tgMessageId: p.tgMessageId ?? null }
    await prisma.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${opId}::uuid, 'tarificacion_bots_lead', ${JSON.stringify(detalle)}::jsonb, ${p.actor})`.catch(() => 0)
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

// ─── F3b: elegir en una discrepancia ─────────────────────────────────────────

export type ResultadoElegir =
  | { estado: 'ok'; pendientes: string[]; completo: boolean; corregirFicha: boolean }
  | { estado: 'no_pendiente' | 'no_encontrada' | 'sin_clave' }

/**
 * Alberto pulsa «quedarme con el de la ficha» o «usar el del correo» (botón `clp_dis` de plataforma). En UNA transacción con
 * la oportunidad bloqueada: aplica la elección en `datosContrato` (`elegirEnContrato`), lo anota en el historial (sin valores)
 * y, si ya no queda nada pendiente ni falta nada, el hilo pasa a `lista_para_tarificar`. Nunca toca la ficha.
 */
export async function elegirDiscrepanciaLead(
  correduriaId: string, p: { clienteId: string; oportunidadId: string; clave: string; eleccion: 'ficha' | 'correo'; actor: string },
): Promise<ResultadoElegir> {
  const f = await prismaAsegura().cliente.findFirst({
    where: { id: p.clienteId, correduriaId, mergedIntoClienteId: null },
    select: { nombre: true, apellidos: true, dniLookupHash: true, telefonoLookupHash: true, emailLookupHash: true, fechaNacimiento: true, estadoCivil: true },
  })
  if (!f) return { estado: 'no_encontrada' }
  const deFicha = conocidosDeFicha(f)
  const r = await prisma.$transaction(async (tx) => {
    const [fila] = await tx.$queryRaw<{ tipo: string; info_riesgo: Record<string, unknown> | null }[]>`
      select o.tipo::text as tipo, o.info_riesgo from seguros.oportunidades o
      where o.id = ${p.oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${p.clienteId}::uuid
      for update`
    if (!fila) return { estado: 'no_encontrada' as const }
    const info = esObj(fila.info_riesgo) ? fila.info_riesgo : {}
    const e = elegirEnContrato(leerDatosContrato(info.datosContrato), p.clave, p.eleccion, { ahora: new Date().toISOString() })
    if (!e.ok) return { estado: 'no_pendiente' as const }
    await tx.$executeRaw`
      update seguros.oportunidades set info_riesgo = ${JSON.stringify({ ...info, datosContrato: e.dc })}::jsonb
      where id = ${p.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
    await tx.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${p.oportunidadId}::uuid, 'discrepancia_elegida',
              ${JSON.stringify({ clave: p.clave, eleccion: p.eleccion })}::jsonb, ${p.actor})`
    const claveBloque = claveDatosDeRamo(fila.tipo)
    const bloque = esObj(info[claveBloque]) ? (info[claveBloque] as Record<string, unknown>) : null
    const conocidos = new Set([...deFicha, ...Object.keys(e.dc.valores), ...conocidosDeBloque(fila.tipo, bloque)])
    const pendientes = Object.keys(e.dc.pendientes)
    const completo = pendientes.length === 0 && faltanObligatorios(fila.tipo, conocidos).length === 0
    return { estado: 'ok' as const, pendientes, completo, corregirFicha: e.corregirFicha }
  })
  if (r.estado === 'ok' && r.completo) {
    await prisma.$executeRaw`
      update seguros.correduria_hilo set estado_datos = 'lista_para_tarificar'
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${p.clienteId}::uuid and oportunidad_id = ${p.oportunidadId}::uuid
        and estado_datos in ('pedida', 'incompleta')`.catch(() => 0)
  }
  return r
}

// ─── F3b: qué datos del cliente han hecho fallar a los bots del lead ─────────

/**
 * Las claves del contrato que han hecho fallar a los bots lanzados desde el lead (filas `tarificacion_bot_fallo_lead` del
 * historial que escribe `avisarFalloBotLead`), para la repregunta. Solo claves. `null` = no se pudo leer (≠ «ninguna»).
 */
export async function fallosDatoLead(correduriaId: string, p: { clienteId: string; oportunidadIds: string[] }): Promise<{ oportunidadId: string; claves: string[] }[] | null> {
  try {
    const filas = await prisma.$queryRaw<{ oportunidad_id: string; detalle: unknown }[]>`
      select h.oportunidad_id::text as oportunidad_id, h.detalle from seguros.oportunidad_historial h
      join seguros.oportunidades o on o.id = h.oportunidad_id and o.correduria_id = h.correduria_id
      where h.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${p.clienteId}::uuid
        and h.oportunidad_id = any(${p.oportunidadIds}::uuid[]) and h.accion = 'tarificacion_bot_fallo_lead'`
    const por = new Map<string, Set<string>>()
    for (const f of filas) {
      const d = esObj(f.detalle) ? f.detalle : {}
      const claves = Array.isArray(d.claves) ? d.claves.filter((x): x is string => typeof x === 'string' && /^[A-Za-z][A-Za-z0-9.]{0,39}$/.test(x)) : []
      if (!claves.length) continue
      const s = por.get(f.oportunidad_id) ?? new Set<string>()
      for (const k of claves) s.add(k)
      por.set(f.oportunidad_id, s)
    }
    return [...por].map(([oportunidadId, s]) => ({ oportunidadId, claves: [...s] }))
  } catch {
    return null
  }
}
