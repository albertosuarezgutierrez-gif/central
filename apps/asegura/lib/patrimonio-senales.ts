// Señales de PATRIMONIO (P16, 26/10/2026) — el lado de BD del motor de `@central/module-patrimonio/senales.ts`.
// Spec: docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md §3.3. Texto legal (borrador):
// docs/legal/2026-10-26-borrador-p15-patrimonio.md.
//
// 🚨 APAGADO por defecto (`PATRIMONIO_SENALES_ACTIVAS`): `ejecutarSenalesPatrimonio` y `colaSenalesPatrimonio` pasan por
// `soloConInterruptor`; apagado no tocan la BD. Encendido, base legal = INTERÉS LEGÍTIMO INFORMADO (decisión de Alberto,
// 26/10/2026): se calcula para toda ficha con patrimonio SALVO que alguna identidad que la opera como propia tenga la
// OPOSICIÓN vigente (`oposicion_senales_patrimonio`, `puedeCalcularSenales`). Opuesta: se retiran las abiertas y no se
// escribe nada nuevo. Retención: `MESES_RETENCION_SENALES` (el cron borra lo caducado, `purgarSenalesCaducadas`).
// 🚨 Nada de esto envía NADA: ni correo, ni Telegram, ni mensaje. Escribe solo `portal_patrimonio_senal`.
// 🚨 No lee NINGUNA tabla de inquilino (`portal_patrimonio_inquilino*`, `portal_patrimonio_aviso_inquilino`,
// `portal_patrimonio_enlace_inquilino`) ni filas de importación: de un contrato solo lee su id y si terminó. Cepo
// `test/regression-portal-patrimonio-senales.test.ts`.
// Las tablas `portal_patrimonio_*` no están en `prisma/asegura.prisma` (las modela el portal): SQL crudo parametrizado.
import {
  RELACION_DUENO,
  TIPO_OPOSICION_SENALES,
  VERSION_TEXTO_COMERCIAL,
  capitalDeCobertura,
  consentimientoVigente,
  oposicionVigente,
  puedeAutorizar,
  NIVELES,
  type Nivel,
} from '@central/module-seguros-portal'
import { sqlCarteraEnVigor } from '@central/module-seguros'
import {
  ROTULO_SENAL,
  calcularSenales,
  corteRetencionSenales,
  declaradaVigente,
  esTipoSenal,
  estadoSeguroInmueble,
  estimarContinenteMinimo,
  alertaInfraseguro,
  permisoContacto,
  planificarSenales,
  puedeCalcularSenales,
  type ContratoParaSenal,
  type DeclaradaParaSenal,
  type EnlaceSeguro,
  type EstadoSenal,
  type FilaSenalExistente,
  type InmuebleParaSenal,
  type PermisoContacto,
  type SenalCalculada,
  type TipoSenal,
} from '@central/module-patrimonio'

import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { correduriaUnica } from './cartera'
import { sqlDeclaradaViva } from './declaradas-eliminadas'
import { Prisma } from './generated/asegura-client'
import { soloConInterruptor, type Apagado } from './patrimonio-senales-gate'
import { ESTADOS_SUPRESION_ATENDIDA, fichaSuprimida } from './patrimonio-supresion-reglas'

const nivelDe = (v: string): Nivel => ((NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta')
const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
const dia = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

// Espejo de `apps/asegura-portal/lib/patrimonio/capital-continente.ts` (un cepo compara las dos expresiones).
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const ES_CONTINENTE = /^(continente|edificio|edificacion)(\s|$|[:(\-–])/
const esComunidad = (ramo: string | null) => ['comunidad', 'comunidades'].includes((ramo ?? '').trim().toLowerCase())
const esImpago = (ramo: string | null) => ['impago_alquiler', 'alquiler'].includes((ramo ?? '').trim().toLowerCase())

export type ResumenSenales = {
  estado: 'ok'
  ensayo: boolean
  fichas: number
  sinPermiso: number
  insertadas: number
  refrescadas: number
  resueltas: number
  retiradas: number
  /** Señales borradas por caducar el plazo de conservación (en ensayo: las que se borrarían). */
  purgadas: number
}

// ─── Permiso por ficha ─────────────────────────────────────────────────────────────────────────────────────────

/** Identidades que operan la ficha como propia: vínculos que operan (sin la vista de corredor) a la ficha y a su(s) Dueño(s). */
async function identidadesDeFicha(correduriaId: string, fichaId: string): Promise<string[]> {
  const db = prismaAsegura()
  const relaciones = await db.clienteRelacion.findMany({
    where: { correduriaId, tipoRelacion: RELACION_DUENO, OR: [{ clienteAId: fichaId }, { clienteBId: fichaId }] },
    select: { clienteAId: true, clienteBId: true },
  })
  const fichas = [...new Set([fichaId, ...relaciones.flatMap((r) => [r.clienteAId, r.clienteBId])])]
  const vinculos = await db.portalVinculo.findMany({
    where: { correduriaId, clienteId: { in: fichas } },
    select: { identidadId: true, nivel: true, origen: true },
  })
  return [...new Set(vinculos.filter((v) => v.origen !== 'corredor' && puedeAutorizar(nivelDe(v.nivel))).map((v) => v.identidadId))]
}

/** Oposición vigente de cada identidad (`true` opuesta · `false` la retiró · `null` nunca). No depende de la versión del texto. */
async function oposicionesDe(identidades: readonly string[]): Promise<(boolean | null)[]> {
  if (identidades.length === 0) return []
  const filas = await prismaAsegura().portalConsentimiento.findMany({
    where: { identidadId: { in: [...identidades] }, tipo: TIPO_OPOSICION_SENALES },
    select: { identidadId: true, tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
  })
  return identidades.map((id) => oposicionVigente(filas.filter((f) => f.identidadId === id)))
}

/** Consentimiento `comercial` vigente (sobre la versión ACTUAL de su texto) de cada identidad: el permiso para CONTACTAR. */
async function comercialesDe(identidades: readonly string[]): Promise<(boolean | null)[]> {
  if (identidades.length === 0) return []
  const filas = await prismaAsegura().portalConsentimiento.findMany({
    where: { identidadId: { in: [...identidades] }, tipo: 'comercial' },
    select: { identidadId: true, tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
  })
  return identidades.map((id) => consentimientoVigente(filas.filter((f) => f.identidadId === id), 'comercial', VERSION_TEXTO_COMERCIAL))
}

// ─── Lectura de una ficha ──────────────────────────────────────────────────────────────────────────────────────

type FilaInmueble = {
  id: string; alias: string; uso: string; referencia_catastral: string | null; sin_seguro_declarado_en: Date | null
  hipoteca: string | null; en_comunidad: boolean | null; valor_cent: string | null; titular_id: string
  catastro_superficie_m2: string | null; catastro_tipo_vivienda: string | null
}
type FilaEnlace = {
  inmueble_id: string; estado: string
  cartera_id: string | null; en_vigor: boolean | null; ramo_cartera: string | null
  declarada_id: string | null; declarada_viva_id: string | null; fecha_vencimiento: Date | null
  vigente_declarada: string | null; ramo_declarada: string | null; datos_ramo: unknown
}

/** Capital de continente de las pólizas de CARTERA (`poliza_coberturas`): solo la cobertura que ES el continente y sin ambigüedad. */
async function capitalesDeCartera(correduriaId: string, polizaIds: readonly string[]): Promise<Map<string, number | null>> {
  const salida = new Map<string, number | null>()
  if (polizaIds.length === 0) return salida
  const filas = await prismaAsegura().polizaCobertura.findMany({
    where: { correduriaId, polizaId: { in: [...polizaIds] } },
    select: { polizaId: true, descripcion: true, capitalAsegurado: true, datosExtra: true },
  })
  const porPoliza = new Map<string, Set<number>>()
  for (const c of filas) {
    if (!ES_CONTINENTE.test(sinTildes(c.descripcion ?? ''))) continue
    const cap = capitalDeCobertura(c)
    if (cap.tipo !== 'importe' || !(cap.importe > 0)) continue
    const s = porPoliza.get(c.polizaId) ?? new Set<number>()
    s.add(Math.round(cap.importe * 100))
    porPoliza.set(c.polizaId, s)
  }
  for (const id of polizaIds) {
    const s = porPoliza.get(id)
    salida.set(id, s && s.size === 1 ? [...s][0]! : null) // ambiguo o ausente = no se sabe
  }
  return salida
}

function capitalDeclarada(datosRamo: unknown): number | null {
  if (typeof datosRamo !== 'object' || datosRamo === null || Array.isArray(datosRamo)) return null
  const v = (datosRamo as Record<string, unknown>).capitalContinente
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : Number.NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

/** Las entradas del motor para UNA ficha. Solo lee tablas del titular, sus inmuebles, contratos (id y fin), enlaces y declaradas. */
async function entradasDeFicha(
  correduriaId: string, fichaId: string, identidades: readonly string[], hoy: string,
): Promise<{ inmuebles: InmuebleParaSenal[]; declaradas: DeclaradaParaSenal[]; titularDe: Map<string, string> }> {
  const db = prismaAsegura()
  const inm = await db.$queryRaw<FilaInmueble[]>(Prisma.sql`
    select i.id::text as id, i.titular_id::text as titular_id, i.alias, i.uso, i.referencia_catastral, i.sin_seguro_declarado_en, i.hipoteca, i.en_comunidad,
           i.valor_reconstruccion_estimado_cent::text as valor_cent,
           i.catastro_superficie_m2::text as catastro_superficie_m2, i.catastro_tipo_vivienda
    from portal_patrimonio_inmueble i
    join portal_patrimonio_titular t on t.id = i.titular_id
    where t.correduria_id = ${correduriaId}::uuid and t.cliente_id = ${fichaId}::uuid
      and t.archivado_en is null and i.archivado_en is null`)
  const ids = inm.map((i) => i.id)

  const enlaces: FilaEnlace[] = ids.length === 0 ? [] : await db.$queryRaw<FilaEnlace[]>(Prisma.sql`
    select e.inmueble_id::text as inmueble_id, e.estado,
           e.poliza_id::text as cartera_id, (${Prisma.raw(sqlCarteraEnVigor('p'))}) as en_vigor, p.tipo::text as ramo_cartera,
           e.poliza_declarada_id::text as declarada_id, d.id::text as declarada_viva_id, d.fecha_vencimiento,
           d.vigente_declarada, d.ramo as ramo_declarada, d.datos_ramo
    from portal_patrimonio_inmueble_poliza e
    left join polizas p on p.id = e.poliza_id and p.correduria_id = ${correduriaId}::uuid
    left join portal_poliza_declarada d on d.id = e.poliza_declarada_id and ${sqlDeclaradaViva('d')}
    where e.inmueble_id in (${ids.length > 0 ? Prisma.join(ids.map((x) => Prisma.sql`${x}::uuid`)) : Prisma.sql`null`})
      and e.archivado_en is null`)

  // Solo id y fin: NADA del inquilino (renta, nombre, contacto) se lee aquí.
  const contratos = ids.length === 0 ? [] : await db.$queryRaw<{ id: string; inmueble_id: string; terminado_en: Date | null }[]>(Prisma.sql`
    select c.id::text as id, c.inmueble_id::text as inmueble_id, c.terminado_en
    from portal_patrimonio_contrato c
    where c.inmueble_id in (${Prisma.join(ids.map((x) => Prisma.sql`${x}::uuid`))}) and c.archivado_en is null`)

  const carteraIds = [...new Set(enlaces.map((e) => e.cartera_id).filter((x): x is string => x !== null))]
  const capCartera = await capitalesDeCartera(correduriaId, carteraIds)
  const ahora = new Date(`${hoy}T12:00:00Z`)

  const vigenciaDe = (e: FilaEnlace): boolean | null => {
    if (e.cartera_id !== null) return e.en_vigor === null ? null : e.en_vigor
    if (e.declarada_id !== null) {
      if (e.declarada_viva_id === null) return false // la quitó el cliente
      return declaradaVigente({ eliminadaEn: null, fechaVencimiento: e.fecha_vencimiento, vigenteDeclarada: e.vigente_declarada }, ahora)
    }
    return null
  }

  const inmuebles: InmuebleParaSenal[] = inm.map((i) => {
    const suyos = enlaces.filter((e) => e.inmueble_id === i.id)
    const confirmados = suyos.filter((e) => e.estado === 'confirmado')
    const paraEstado: EnlaceSeguro[] = suyos.map((e) => ({ estado: e.estado, archivado: false, vigente: vigenciaDe(e) }))
    const estadoSeguro = estadoSeguroInmueble({ enlaces: paraEstado, sinSeguroDeclaradoEn: i.sin_seguro_declarado_en })

    // Infraseguro: mismas reglas que la ficha del portal (capital del mayor seguro en vigor que no es de comunidad vs valor).
    const vigentes = confirmados.filter((e) => vigenciaDe(e) === true)
    const ramoDe = (e: FilaEnlace) => (e.cartera_id !== null ? e.ramo_cartera : e.ramo_declarada)
    const capitales = vigentes
      .filter((e) => !esComunidad(ramoDe(e)))
      .map((e) => (e.cartera_id !== null ? capCartera.get(e.cartera_id) ?? null : capitalDeclarada(e.datos_ramo)))
      .filter((c): c is number => typeof c === 'number' && c > 0)
    const capital = capitales.length > 0 ? Math.max(...capitales) : null
    const dado = i.valor_cent !== null && Number.isFinite(Number(i.valor_cent)) && Number(i.valor_cent) > 0 ? Number(i.valor_cent) : null
    const tipoViv = i.catastro_tipo_vivienda === 'piso' || i.catastro_tipo_vivienda === 'unifamiliar' ? i.catastro_tipo_vivienda : null
    const m2 = i.catastro_superficie_m2 === null ? null : Number(i.catastro_superficie_m2)
    const valorEstimado = dado ?? estimarContinenteMinimo({ superficieM2: m2, uso: i.uso, tipoVivienda: tipoViv })?.capitalCent ?? null
    const infraseguro = vigentes.length === 0
      ? null
      : alertaInfraseguro({ capitalContinente: capital, valorEstimado, enComunidad: i.en_comunidad, polizaComunidadEnlazada: vigentes.some((e) => esComunidad(ramoDe(e))) })

    // ¿Tiene el inmueble un seguro de impago de alquiler? true = vigente · null = alguno sin comprobar · false = consta que no.
    const impagos = confirmados.filter((e) => esImpago(ramoDe(e)))
    const tieneImpago: boolean | null = impagos.some((e) => vigenciaDe(e) === true) ? true : impagos.some((e) => vigenciaDe(e) === null) ? null : false
    const cs: ContratoParaSenal[] = contratos
      .filter((c) => c.inmueble_id === i.id)
      .map((c) => ({ id: c.id, terminadoEn: dia(c.terminado_en), tieneSeguroImpago: tieneImpago }))

    return {
      id: i.id, alias: i.alias, uso: i.uso, referenciaCatastral: i.referencia_catastral?.trim() || null,
      estadoSeguro, infraseguro, hipoteca: i.hipoteca, contratos: cs,
    }
  })

  // Declaradas de las identidades que operan la ficha Y que no operan ninguna otra (con varias fichas no se adivina).
  const declaradas = await declaradasDe(correduriaId, fichaId, identidades)
  return { inmuebles, declaradas, titularDe: new Map(inm.map((i) => [i.id, i.titular_id])) }
}

async function declaradasDe(correduriaId: string, fichaId: string, identidades: readonly string[]): Promise<DeclaradaParaSenal[]> {
  if (identidades.length === 0) return []
  const db = prismaAsegura()
  const vinculos = await db.portalVinculo.findMany({
    where: { correduriaId, identidadId: { in: [...identidades] } },
    select: { identidadId: true, clienteId: true, nivel: true, origen: true },
  })
  const soloEsta = identidades.filter((id) => {
    const suyas = new Set(vinculos.filter((v) => v.identidadId === id && v.origen !== 'corredor' && puedeAutorizar(nivelDe(v.nivel))).map((v) => v.clienteId))
    return suyas.size === 1 && suyas.has(fichaId)
  })
  if (soloEsta.length === 0) return []
  const filas = await db.$queryRaw<{ id: string; ramo: string | null; fecha_vencimiento: Date | null; vigente_declarada: string | null }[]>(Prisma.sql`
    select d.id::text as id, d.ramo, d.fecha_vencimiento, d.vigente_declarada
    from portal_poliza_declarada d
    where d.identidad_id in (${Prisma.join(soloEsta.map((x) => Prisma.sql`${x}::uuid`))}) and ${sqlDeclaradaViva('d')}`)
  const ahora = new Date()
  return filas.map((d) => ({
    id: d.id, ramo: d.ramo, vencimiento: dia(d.fecha_vencimiento),
    vigente: declaradaVigente({ eliminadaEn: null, fechaVencimiento: d.fecha_vencimiento, vigenteDeclarada: d.vigente_declarada }, ahora),
  }))
}

// ─── Escritura ─────────────────────────────────────────────────────────────────────────────────────────────────

async function aplicar(correduriaId: string, fichaId: string, plan: ReturnType<typeof planificarSenales>, titularDe: Map<string, string>): Promise<void> {
  const db = prismaAsegura()
  await db.$transaction(async (tx) => {
    for (const s of plan.insertar) {
      const titularId = s.inmuebleId ? titularDe.get(s.inmuebleId) ?? null : null
      await tx.$executeRaw(Prisma.sql`
        insert into portal_patrimonio_senal
          (correduria_id, cliente_id, titular_id, inmueble_id, contrato_id, poliza_declarada_id, tipo, ramo, prioridad, objeto, clave, datos)
        values (${correduriaId}::uuid, ${fichaId}::uuid, ${titularId}::uuid, ${s.inmuebleId}::uuid, ${s.contratoId}::uuid,
                ${s.polizaDeclaradaId}::uuid, ${s.tipo}, ${s.ramo}, ${s.prioridad}, ${s.objeto}, ${s.clave}, ${JSON.stringify(s.datos)}::jsonb)
        on conflict (correduria_id, clave) where estado in ('abierta', 'promovida') do nothing`)
    }
    for (const r of plan.refrescar) {
      await tx.$executeRaw(Prisma.sql`
        update portal_patrimonio_senal set ultima_vez_en = now(), datos = ${JSON.stringify(r.senal.datos)}::jsonb, prioridad = ${r.senal.prioridad}
        where id = ${r.id}::uuid and correduria_id = ${correduriaId}::uuid and estado in ('abierta', 'promovida')`)
    }
    for (const id of plan.resolver) {
      await tx.$executeRaw(Prisma.sql`
        update portal_patrimonio_senal set estado = 'resuelta', cerrada_en = now(), cerrada_por = 'motor', motivo = 'la condición ya no se da'
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'abierta'`)
    }
    for (const id of plan.retirar) {
      await tx.$executeRaw(Prisma.sql`
        update portal_patrimonio_senal set estado = 'retirada', cerrada_en = now(), cerrada_por = 'motor', motivo = 'oposición del cliente o ficha no viva'
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'abierta'`)
    }
  })
}

// ─── El cron ───────────────────────────────────────────────────────────────────────────────────────────────────

export async function ejecutarSenalesPatrimonio(opts: { forzarContar?: boolean } = {}): Promise<ResumenSenales | Apagado> {
  return soloConInterruptor(async () => {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const db = prismaAsegura()
    const hoy = hoyMadrid()
    const ensayo = opts.forzarContar === true

    // Fichas con patrimonio + fichas con señales abiertas (para retirar/resolver las que ya no tienen patrimonio).
    const conTitular = await db.$queryRaw<{ cliente_id: string; id: string }[]>(Prisma.sql`
      select t.cliente_id::text as cliente_id, t.id::text as id from portal_patrimonio_titular t
      where t.correduria_id = ${correduria.id}::uuid and t.archivado_en is null`)
    const conSenales = await db.$queryRaw<{ cliente_id: string }[]>(Prisma.sql`
      select distinct cliente_id::text as cliente_id from portal_patrimonio_senal
      where correduria_id = ${correduria.id}::uuid and estado in ('abierta', 'promovida')`)
    const fichas = [...new Set([...conTitular.map((t) => t.cliente_id), ...conSenales.map((s) => s.cliente_id)])]

    const resumen: ResumenSenales = { estado: 'ok', ensayo, fichas: fichas.length, sinPermiso: 0, insertadas: 0, refrescadas: 0, resueltas: 0, retiradas: 0, purgadas: 0 }

    // Supresiones atendidas (art. 17): sus fichas / identidades NO se calculan (cubre la ficha sin identidad de portal).
    const supresiones = (await db.portalSupresion.findMany({
      where: { correduriaId: correduria.id, estado: { in: [...ESTADOS_SUPRESION_ATENDIDA] } },
      select: { estado: true, clienteId: true, identidadId: true },
    }))

    for (const fichaId of fichas) {
      const viva = await db.cliente.findFirst({ where: { id: fichaId, correduriaId: correduria.id, mergedIntoClienteId: null, activo: true }, select: { id: true } })
      const identidades = viva ? await identidadesDeFicha(correduria.id, fichaId) : []
      const oposiciones = await oposicionesDe(identidades)
      const permitido = viva !== null && puedeCalcularSenales({ interruptor: true, oposiciones, suprimida: fichaSuprimida(fichaId, identidades, supresiones) })
      if (!permitido) resumen.sinPermiso++

      const existentes = (await db.$queryRaw<{ id: string; clave: string; estado: string; cerrada_en: Date | null }[]>(Prisma.sql`
        select id::text as id, clave, estado, cerrada_en from portal_patrimonio_senal
        where correduria_id = ${correduria.id}::uuid and cliente_id = ${fichaId}::uuid`))
        .map((e): FilaSenalExistente => ({ id: e.id, clave: e.clave, estado: e.estado as EstadoSenal, cerradaEn: dia(e.cerrada_en) }))

      let calculadas: SenalCalculada[] = []
      let titularDe = new Map<string, string>()
      if (permitido) {
        const e = await entradasDeFicha(correduria.id, fichaId, identidades, hoy)
        calculadas = calcularSenales({ clienteId: fichaId, hoy, inmuebles: e.inmuebles, declaradas: e.declaradas })
        titularDe = e.titularDe
      }
      const plan = planificarSenales({ calculadas, existentes, permitido, hoy })
      resumen.insertadas += plan.insertar.length
      resumen.refrescadas += plan.refrescar.length
      resumen.resueltas += plan.resolver.length
      resumen.retiradas += plan.retirar.length
      if (!ensayo) await aplicar(correduria.id, fichaId, plan, titularDe)
    }
    resumen.purgadas = await purgarSenalesCaducadas(correduria.id, hoy, ensayo)
    return resumen
  })
}

/**
 * Retención (`MESES_RETENCION_SENALES`, regla pura `debePurgarseSenal`, este SQL es su espejo): se BORRAN las señales
 * cerradas antes del corte y las vivas cuya última actualización es anterior al corte. `prisma_seguros` tiene DELETE sobre
 * la tabla (privilegios por defecto del schema; el portal NO lo tiene, ni se le da). Sin fecha → no se borra (no ocurre: el
 * CHECK `portal_patrimonio_senal_cierre` y el `NOT NULL` de `ultima_vez_en` lo impiden). En ensayo solo cuenta.
 */
async function purgarSenalesCaducadas(correduriaId: string, hoy: string, ensayo: boolean): Promise<number> {
  const corte = corteRetencionSenales(hoy)
  const caducada = Prisma.sql`correduria_id = ${correduriaId}::uuid and (
      (cerrada_en is not null and (cerrada_en at time zone 'Europe/Madrid')::date < ${corte}::date)
      or (cerrada_en is null and (ultima_vez_en at time zone 'Europe/Madrid')::date < ${corte}::date))`
  const db = prismaAsegura()
  if (ensayo) {
    const r = await db.$queryRaw<{ n: number }[]>(Prisma.sql`select count(*)::int as n from portal_patrimonio_senal where ${caducada}`)
    return r[0]?.n ?? 0
  }
  return db.$executeRaw(Prisma.sql`delete from portal_patrimonio_senal where ${caducada}`)
}

// ─── La cola para /correduria ──────────────────────────────────────────────────────────────────────────────────

export type SenalCola = {
  id: string
  tipo: TipoSenal
  rotulo: string
  ramo: string
  prioridad: string
  clienteId: string
  cliente: string
  /** Alias que el cliente dio al inmueble (no es PII del inquilino). `null` = no consta. */
  inmueble: string | null
  /** Solo cifras del riesgo (ratio, faltante, vence, dias). */
  cifras: Record<string, string | number | boolean | null>
  permiso: PermisoContacto
  desde: string
}

export type ColaSenales = { estado: 'ok'; senales: SenalCola[] } | { estado: 'sin_correduria' } | { estado: 'sin_configurar' } | Apagado

/**
 * Las señales ABIERTAS para la cola «Patrimonio». Apagado: `{estado:'apagado'}` sin leer la BD (la pantalla lo dice).
 * Las de permiso `opuesto` NO salen. El nombre de la ficha viene de `clientes.nombre` ya descifrado por el puerto como en
 * el resto de colas; aquí solo se lee el nombre COMERCIAL/visible de la ficha (nunca DNI, IBAN ni dirección).
 */
export async function colaSenalesPatrimonio(): Promise<ColaSenales> {
  return soloConInterruptor(async (): Promise<ColaSenales> => {
    if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
    const correduria = await correduriaUnica()
    if (!correduria) return { estado: 'sin_correduria' }
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{
      id: string; tipo: string; ramo: string; prioridad: string; cliente_id: string; nombre: string | null
      datos: Record<string, string | number | boolean | null>; primera_vez_en: Date
    }[]>(Prisma.sql`
      select s.id::text as id, s.tipo, s.ramo, s.prioridad, s.cliente_id::text as cliente_id, trim(c.nombre || ' ' || coalesce(c.apellidos, '')) as nombre, s.datos, s.primera_vez_en
      from portal_patrimonio_senal s
      join clientes c on c.id = s.cliente_id and c.correduria_id = s.correduria_id
      where s.correduria_id = ${correduria.id}::uuid and s.estado = 'abierta'
      order by case s.prioridad when 'alta' then 0 when 'media' then 1 else 2 end, s.primera_vez_en`)
    const fichas = [...new Set(filas.map((f) => f.cliente_id))]
    const permisoPorFicha = new Map<string, PermisoContacto>()
    for (const f of fichas) {
      const identidades = await identidadesDeFicha(correduria.id, f)
      const peticion = await peticionAbierta(correduria.id, f)
      permisoPorFicha.set(f, permisoContacto({
        peticionAbierta: peticion, oposiciones: await oposicionesDe(identidades), comerciales: await comercialesDe(identidades),
      }))
    }
    const senales: SenalCola[] = []
    for (const f of filas) {
      if (!esTipoSenal(f.tipo)) continue
      const permiso = permisoPorFicha.get(f.cliente_id) ?? 'sin_permiso'
      if (permiso === 'opuesto') continue
      const { alias, ...cifras } = f.datos ?? {}
      senales.push({
        id: f.id, tipo: f.tipo, rotulo: ROTULO_SENAL[f.tipo], ramo: f.ramo, prioridad: f.prioridad, clienteId: f.cliente_id,
        cliente: f.nombre ?? 'Cliente sin nombre', inmueble: typeof alias === 'string' ? alias : null, cifras, permiso,
        desde: f.primera_vez_en.toISOString().slice(0, 10),
      })
    }
    // «Lo ha pedido» arriba.
    senales.sort((a, b) => Number(b.permiso === 'pedido') - Number(a.permiso === 'pedido'))
    return { estado: 'ok', senales }
  })
}

/** ¿Tiene la ficha una petición «Pedir precio» abierta del portal (origen `portal:patrimonio*`)? */
async function peticionAbierta(correduriaId: string, fichaId: string): Promise<boolean> {
  const r = await prismaAsegura().$queryRaw<{ n: number }[]>(Prisma.sql`
    select count(*)::int as n from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${fichaId}::uuid
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and o.info_riesgo->>'origen' like 'portal:patrimonio%'
      and o.created_at > now() - make_interval(days => 120)`)
  return (r[0]?.n ?? 0) > 0
}

// ─── Descartar ─────────────────────────────────────────────────────────────────────────────────────────────────

export type ResultadoDescarte = { estado: 'descartada' } | { estado: 'no_encontrada' } | { estado: 'invalida'; motivo: string } | Apagado

/** «Descartar» desde la cola. Arranca el reloj de 180 días. Solo una señal ABIERTA; el motivo es obligatorio. */
export async function descartarSenal(id: string, motivo: string, actor: string): Promise<ResultadoDescarte> {
  return soloConInterruptor(async (): Promise<ResultadoDescarte> => {
    const m = motivo.trim().slice(0, 500)
    if (m === '') return { estado: 'invalida', motivo: 'falta el motivo' }
    const correduria = await correduriaUnica()
    if (!correduria) return { estado: 'no_encontrada' }
    const n = await prismaAsegura().$executeRaw(Prisma.sql`
      update portal_patrimonio_senal set estado = 'descartada', cerrada_en = now(), cerrada_por = ${actor.slice(0, 200)}, motivo = ${m}
      where id = ${id}::uuid and correduria_id = ${correduria.id}::uuid and estado = 'abierta'`)
    return n > 0 ? { estado: 'descartada' } : { estado: 'no_encontrada' }
  })
}
