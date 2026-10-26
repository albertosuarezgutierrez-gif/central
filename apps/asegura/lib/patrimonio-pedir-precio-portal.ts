/**
 * «Pedir precio» desde Patrimonio del portal (24/10/2026, P14; ampliado 25/10/2026): el cliente PULSA un botón y pide que le
 * pasen precio / comparen / revisen un seguro. Cinco tipos, UN solo puente (lista cerrada en `patrimonio-pedir-precio-reglas.ts`):
 * `inmueble_sin_seguro`, `seguro_no_vigente`, `comparar_externa` (póliza DECLARADA de otra correduría), `impago_alquiler`
 * (contrato de alquiler vivo) e `hipoteca` (el cliente dijo que el inmueble tiene hipoteca).
 * Convierte la petición en una OPORTUNIDAD (`fuente = 'portal'`, `info_riesgo.origen` = `portal:patrimonio` en los dos
 * primeros tipos y `portal:patrimonio:<tipo>` en los nuevos) con una gestión `llamada` de prioridad alta para hoy, deja
 * constancia en la ficha y avisa a Alberto por Telegram (solo ids). Es el hermano de `mejorar-precio-portal.ts` y NO de
 * `lead-declarada.ts`.
 *
 * 🚨 Solo acciones que PULSA el cliente (él pide; no dependen del consentimiento comercial). Nada de oportunidades ni avisos
 * automáticos, y ningún correo ni mensaje al cliente desde aquí.
 *
 * ─── Por qué esta puerta es estrecha ────────────────────────────────────────
 * Como el resto de `/api/portal/*` NO recibe `clienteId`: la ficha dueña sale del INMUEBLE (`portal_patrimonio_titular`,
 * de la única correduría) y el nivel de esa identidad sobre ella se RECALCULA aquí con la misma regla pura que el portal
 * (`puedePatrimonio(..., 'pedir_precio')`: solo `total`, nunca un acceso de gestión ni el inquilino). Ajeno, archivado o
 * sin nivel = `no_encontrado`. Asegura tampoco se fía de lo que el portal dijo del estado: cada tipo se RE-DECIDE aquí
 * (seguro en vigor o no se sabe; contrato terminado; hipoteca no confirmada; declarada ajena o no vigente) → `no_aplica`
 * y no se escribe nada. `comparar_externa` no cuelga de un inmueble: la póliza es de la identidad (`identidad_id`).
 *
 * Idempotente POR TIPO: si ya hay una petición abierta del mismo origen para ese objeto (inmueble, contrato o póliza
 * declarada; últimos 120 días), se devuelve la que hay. El doble clic y el reintento tras un corte son el caso normal. Las
 * tablas `portal_patrimonio_*` no están en `prisma/asegura.prisma` (las modela el portal): SQL crudo parametrizado.
 */
import { tgSend } from '@central/core-telegram'
import { declaradaVigente } from '@central/module-patrimonio'
import { ramoDesdeTexto, sqlCarteraEnVigor } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { fichasDeIdentidad, fichasOperablesDe } from './contacto-portal'
import { Prisma } from './generated/asegura-client'
import { sqlDeclaradaViva } from './declaradas-eliminadas'
import { puedePatrimonio } from './patrimonio-inquilino-portal'
import {
  ORIGEN_PORTAL_PATRIMONIO,
  aplicaComunidad,
  aplicaCompararExterna,
  aplicaHipoteca,
  aplicaImpagoAlquiler,
  aplicaPedirPrecio,
  esRamoComunidad,
  objetoDePeticion,
  origenPedirPrecio,
  ramoDePeticion,
  textoAvisoPedirPrecio,
  textoHistorialPedirPrecio,
  municipioDeDireccion,
  textoTareaPrecioPatrimonio,
  type PeticionPedirPrecio,
  type TipoPedirPrecio,
} from './patrimonio-pedir-precio-reglas'

const ACTOR = 'el cliente, desde el portal (patrimonio)'
/** Una petición más vieja que esto ya no bloquea pedir otra. */
const DIAS_PETICION_VIVA = 120

export type ResultadoPedirPrecio =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'no_encontrado' }
  | { estado: 'no_aplica' }

const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

/** Peticiones abiertas del origen base (`portal:patrimonio`) que NO son de comunidad: lo que lee el GET para el botón por inmueble. */
const ABIERTA = Prisma.sql`o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
  and o.info_riesgo->>'origen' = ${ORIGEN_PORTAL_PATRIMONIO}
  and coalesce(o.info_riesgo->>'tipo', '') <> 'comunidad'
  and o.created_at > now() - make_interval(days => ${DIAS_PETICION_VIVA}::int)`

/** Lo que hace falta para abrir UNA petición (cualquier tipo): la ficha sale de la BD, nunca del cuerpo. */
type Apertura = {
  fichaId: string
  tipo: TipoPedirPrecio
  ramo: string
  tarea: string
  /** `YYYY-MM-DD` o `null`. */
  fechaFinVigencia: string | null
  inmuebleId: string | null
  /** Ids del objeto pedido (inmueble / contrato / póliza declarada): van a `info_riesgo` por id, no por texto. */
  ids: Record<string, string>
  objeto: { clave: string; id: string }
}

async function abrirPeticion(correduriaId: string, a: Apertura): Promise<ResultadoPedirPrecio> {
  const db = prismaAsegura()
  const origen = origenPedirPrecio(a.tipo)
  const hoyIso = hoyMadrid()
  const r = await db.$transaction(async (tx) => {
    // Un doble clic son dos peticiones a la vez: el candado las pone en fila (una clave por origen y objeto).
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`${origen}:${a.fichaId}:${a.objeto.id}`}))`)
    const [ya] = await tx.$queryRaw<{ pedidoEl: string }[]>(Prisma.sql`
      select to_char(o.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "pedidoEl"
      from oportunidades o
      where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${a.fichaId}::uuid
        and o.info_riesgo->>(${a.objeto.clave}::text) = ${a.objeto.id}
        and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
        and o.info_riesgo->>'origen' = ${origen}
        and o.created_at > now() - make_interval(days => ${DIAS_PETICION_VIVA}::int)
      order by o.created_at limit 1`)
    if (ya) return { pedidoEl: ya.pedidoEl, yaExistia: true, oportunidadId: null as string | null }

    const info = JSON.stringify({ origen, tipo: a.tipo, ...a.ids })
    const [o] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, fecha_fin_vigencia, info_riesgo)
      values (${correduriaId}::uuid, ${a.fichaId}::uuid, cast(${a.ramo} as tipo_seguro), 'portal', 'en_negociacion',
              ${a.fechaFinVigencia}::date, ${info}::jsonb)
      returning id::text as id`)
    await tx.$executeRaw(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, cast('llamada' as gestion_tipo), 'alta', 'pendiente', ${a.tarea},
              (${hoyIso}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${a.fichaId}::uuid, null, ${o!.id}::uuid, 'central:seguimiento')`)
    // Sin la nota libre ni el alias: `oportunidad_historial` no se puede borrar (supresión RGPD).
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${o!.id}::uuid, 'creada_portal', null, 'en_negociacion',
              ${JSON.stringify({ tipo: a.tipo, ...a.ids })}::jsonb, ${ACTOR})`)
    // Dentro de la misma transacción: si la bitácora falla, falla todo (no queda una oportunidad sin su rastro).
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${a.fichaId}::uuid, cast('contacto' as tipo_historial_interno), ${textoHistorialPedirPrecio(a.tipo)})`)
    return { pedidoEl: hoyIso, yaExistia: false, oportunidadId: o!.id }
  })

  if (!r.yaExistia && r.oportunidadId) {
    // Best-effort: la oportunidad y la tarea ya están; tumbar la respuesta por el aviso le diría al
    // cliente que no se guardó lo que sí.
    try {
      await tgSend(textoAvisoPedirPrecio({ oportunidadId: r.oportunidadId, inmuebleId: a.inmuebleId, tipo: a.tipo }), { html: false })
    } catch (e) {
      console.error('[pedir-precio-patrimonio] aviso a Telegram no enviado:', e instanceof Error ? e.message : e)
    }
  }
  return { estado: 'ok', pedidoEl: r.pedidoEl, yaExistia: r.yaExistia }
}

export async function pedirPrecioPatrimonio(correduriaId: string, d: PeticionPedirPrecio): Promise<ResultadoPedirPrecio> {
  return d.tipo === 'comparar_externa' ? compararExterna(correduriaId, d) : porInmueble(correduriaId, d)
}

/**
 * Póliza DECLARADA por el cliente (de otra correduría): es de la identidad (`identidad_id`, no eliminada), no de la
 * cartera. La ficha es la ÚNICA en la que la identidad puede operar; con varias no se adivina (`no_aplica`).
 */
async function compararExterna(correduriaId: string, d: Extract<PeticionPedirPrecio, { tipo: 'comparar_externa' }>): Promise<ResultadoPedirPrecio> {
  const db = prismaAsegura()
  const [dec] = await db.$queryRaw<{ ramo: string | null; compania: string | null; fecha_vencimiento: Date | null; vigente_declarada: string | null }[]>(Prisma.sql`
    select d.ramo, d.compania, d.fecha_vencimiento, d.vigente_declarada
    from portal_poliza_declarada d
    where d.id = ${d.polizaDeclaradaId}::uuid and d.identidad_id = ${d.identidadId}::uuid and ${sqlDeclaradaViva('d')}`)
  if (!dec) return { estado: 'no_encontrado' }
  const f = await fichasOperablesDe(correduriaId, d.identidadId)
  if (f.estado === 'sin_ficha') return { estado: 'no_encontrado' }
  if (f.estado === 'error') throw new Error(`pedir-precio-patrimonio: ${f.causa}`)
  if (f.clienteIds.length !== 1) return { estado: 'no_aplica' }
  if (!aplicaCompararExterna(declaradaVigente({ eliminadaEn: null, fechaVencimiento: dec.fecha_vencimiento, vigenteDeclarada: dec.vigente_declarada }, new Date()))) {
    return { estado: 'no_aplica' }
  }
  const vence = dec.fecha_vencimiento ? dec.fecha_vencimiento.toISOString().slice(0, 10) : null
  const ramo = ramoDesdeTexto(dec.ramo) ?? 'otros'
  return abrirPeticion(correduriaId, {
    fichaId: f.clienteIds[0]!, tipo: d.tipo, ramo, inmuebleId: null,
    tarea: textoTareaPrecioPatrimonio({ tipo: d.tipo, uso: null, municipio: null, ramo, compania: dec.compania, vence }),
    fechaFinVigencia: vence, ids: { polizaDeclaradaId: d.polizaDeclaradaId }, objeto: objetoDePeticion(d),
  })
}

async function porInmueble(correduriaId: string, d: Exclude<PeticionPedirPrecio, { tipo: 'comparar_externa' }>): Promise<ResultadoPedirPrecio> {
  const db = prismaAsegura()
  // La ficha dueña sale del inmueble, nunca del cuerpo. Archivado o de otra correduría = como si no existiera.
  // Sin el alias: la tarea solo lleva tipo de inmueble + municipio (de `direccion_normalizada`) + tipo de petición.
  const [inm] = await db.$queryRaw<{ cliente_id: string; uso: string | null; direccion_normalizada: string | null; en_comunidad: boolean | null; catastro_tipo_vivienda: string | null; presidente_comunidad: boolean | null }[]>(Prisma.sql`
    select t.cliente_id::text as cliente_id, i.uso, i.direccion_normalizada, i.en_comunidad, i.catastro_tipo_vivienda, i.presidente_comunidad
    from portal_patrimonio_inmueble i
    join portal_patrimonio_titular t on t.id = i.titular_id
    where i.id = ${d.inmuebleId}::uuid and i.archivado_en is null
      and t.archivado_en is null and t.correduria_id = ${correduriaId}::uuid`)
  if (!inm) return { estado: 'no_encontrado' }
  if (!(await puedePatrimonio(correduriaId, d.identidadId, inm.cliente_id, 'pedir_precio'))) return { estado: 'no_encontrado' }

  let ramo: string = ramoDePeticion(d.tipo, inm.uso)
  let rentaCent: number | null = null

  if (d.tipo === 'impago_alquiler') {
    // El contrato se busca DENTRO de este inmueble (ya autorizado) y vivo; la renta es la del contrato, no la del cuerpo.
    const hoyIso = hoyMadrid()
    const [c] = await db.$queryRaw<{ terminado_en: Date | null; renta: string | null }[]>(Prisma.sql`
      select c.terminado_en,
             coalesce((select a.renta_mensual_cent from portal_patrimonio_renta_actualizacion a
                       where a.contrato_id = c.id and a.desde <= ${hoyIso}::date order by a.desde desc limit 1),
                      c.renta_mensual_cent)::text as renta
      from portal_patrimonio_contrato c
      where c.id = ${d.contratoId ?? ''}::uuid and c.inmueble_id = ${d.inmuebleId}::uuid and c.archivado_en is null`)
    if (!c) return { estado: 'no_encontrado' }
    if (!aplicaImpagoAlquiler({ terminadoEn: c.terminado_en ? c.terminado_en.toISOString().slice(0, 10) : null, hoy: hoyIso })) return { estado: 'no_aplica' }
    const n = c.renta === null ? NaN : Number(c.renta)
    rentaCent = Number.isFinite(n) && n > 0 ? n : null
    ramo = 'impago_alquiler'
  } else if (d.tipo === 'hipoteca') {
    // La columna `hipoteca` solo se lee aquí (el resto de tipos funcionan aunque la SQL aún no esté aplicada).
    const [h] = await db.$queryRaw<{ hipoteca: string | null }[]>(Prisma.sql`
      select i.hipoteca from portal_patrimonio_inmueble i where i.id = ${d.inmuebleId}::uuid`)
    if (!aplicaHipoteca(h?.hipoteca ?? null)) return { estado: 'no_aplica' }
    ramo = 'hogar'
  } else {
    // Los seguros ENLAZADOS (confirmados y vivos) y si siguen en vigor: cartera por `sqlCarteraEnVigor`, declarada por la
    // misma regla pura del portal. No se fía de lo que el portal dijo del estado.
    const enlaces = await db.$queryRaw<{
      cartera_id: string | null; en_vigor: boolean | null
      declarada_id: string | null; declarada_viva_id: string | null; fecha_vencimiento: Date | null; vigente_declarada: string | null
      ramo_cartera: string | null; ramo_declarada: string | null
    }[]>(Prisma.sql`
      select e.poliza_id::text as cartera_id, (${Prisma.raw(sqlCarteraEnVigor('p'))}) as en_vigor,
             e.poliza_declarada_id::text as declarada_id, d.id::text as declarada_viva_id, d.fecha_vencimiento, d.vigente_declarada, p.tipo::text as ramo_cartera, d.ramo as ramo_declarada
      from portal_patrimonio_inmueble_poliza e
      left join polizas p on p.id = e.poliza_id and p.correduria_id = ${correduriaId}::uuid
      left join portal_poliza_declarada d on d.id = e.poliza_declarada_id and ${sqlDeclaradaViva('d')}
      where e.inmueble_id = ${d.inmuebleId}::uuid and e.archivado_en is null and e.estado = 'confirmado'`)
    const hoy = new Date()
    const esComunidad = d.tipo === 'comunidad'
    if (esComunidad && !aplicaComunidad({ enComunidad: inm.en_comunidad, tipoCatastro: inm.catastro_tipo_vivienda, presidenteComunidad: inm.presidente_comunidad })) {
      return { estado: 'no_aplica' }
    }
    // Para la comunidad solo cuentan los seguros de ramo comunidad; para el resto, todos los enlazados.
    const considerados = esComunidad
      ? enlaces.filter((e) => esRamoComunidad(e.cartera_id !== null ? e.ramo_cartera : e.ramo_declarada))
      : enlaces
    const vigencias = considerados.map((e): boolean | null => {
      if (e.cartera_id !== null) return e.en_vigor === null ? null : e.en_vigor
      if (e.declarada_id !== null) {
        // El `join` solo trae las NO eliminadas: si la fila no llega, la quitó el cliente → no está en vigor.
        if (e.declarada_viva_id === null) return false
        return declaradaVigente({ eliminadaEn: null, fechaVencimiento: e.fecha_vencimiento, vigenteDeclarada: e.vigente_declarada }, hoy)
      }
      return null
    })
    if (!aplicaPedirPrecio(d.tipo, vigencias)) return { estado: 'no_aplica' }
  }

  const ids: Record<string, string> = { inmuebleId: d.inmuebleId }
  if (d.tipo === 'impago_alquiler' && d.contratoId) ids.contratoId = d.contratoId
  return abrirPeticion(correduriaId, {
    fichaId: inm.cliente_id, tipo: d.tipo, ramo, inmuebleId: d.inmuebleId, ids, objeto: objetoDePeticion(d),
    tarea: textoTareaPrecioPatrimonio({ tipo: d.tipo, uso: inm.uso, municipio: municipioDeDireccion(inm.direccion_normalizada), ramo, rentaCent }),
    fechaFinVigencia: null,
  })
}

export type PeticionInmuebleAbierta = { inmuebleId: string; pedidoEl: string }

/**
 * Las peticiones «Pedir precio» ABIERTAS de las fichas de esta identidad (25/10/2026), para que el portal no vuelva a
 * ofrecer el botón y diga «Precio pedido el dd/mm». Solo lectura. La ficha sale de `portal_vinculo`
 * (`fichasDeIdentidad`), no del cuerpo ni de la query. `'sin_ficha'` = la identidad no tiene ficha vinculada.
 */
export async function peticionesPedirPrecioAbiertas(correduriaId: string, identidadId: string): Promise<PeticionInmuebleAbierta[] | 'sin_ficha'> {
  const fichas = await fichasDeIdentidad(correduriaId, identidadId)
  if (fichas.length === 0) return 'sin_ficha'
  return prismaAsegura().$queryRaw<PeticionInmuebleAbierta[]>(Prisma.sql`
    select o.info_riesgo->>'inmuebleId' as "inmuebleId",
           to_char(min(o.created_at) at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "pedidoEl"
    from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid
      and o.cliente_id in (${Prisma.join(fichas.map((f) => Prisma.sql`${f}::uuid`))})
      and o.info_riesgo->>'inmuebleId' is not null and ${ABIERTA}
    group by 1`)
}
