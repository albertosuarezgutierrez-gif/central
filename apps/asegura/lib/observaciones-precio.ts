// Almacén de precios observados (fase 0, 07/11/2026): la parte con BD. La transformación es PURA (`observacion-precio.ts`).
// Diseño: docs/superpowers/specs/2026-11-07-almacen-precios.md. SQL: prisma/sql/2026-11-07b_observaciones_precio.sql.
//
// 🚨 NADA de aquí lanza: el enganche va DESPUÉS del commit del flujo principal (precio de Avant2 guardado, trabajo del bot
//    `ok`) y un fallo suyo no puede tocarlo. Devuelve el desenlace y lo dice en el log (sin URL ni datos personales).
// 🚨 Tres cerrojos, comprobados en este orden (los dos primeros sin tocar la BD):
//      1. `OBSERVACIONES_PRECIO_ACTIVO=1` (arranca APAGADO);
//      2. `ASEGURA_PRECIOS_HUELLA_SECRET` (secreto de los HMAC, `requireSecret`, SIN fallback) — sin él no se escribe: una fila
//         sin grupo quedaría así para siempre (el grupo no entra en la huella), y el barrido la recoge cuando llegue;
//      3. la tabla existe (`sin_migracion`: el código va antes que el SQL).
//    Cada motivo de «apagado» se registra UNA vez por proceso.
// 🔒 Aislamiento: toda sentencia lleva `correduria_id` (prisma_seguros tiene BYPASSRLS; cepo regression-asegura-aislamiento).

import { requireSecret } from '@central/core-identity'
import type { CompaniaCatalogo } from '@central/module-seguros'
import { prisma } from './tenant.ts'
import { esquema } from './esquema-bd.ts'
import { registrarErrorCartera } from './error-cartera.ts'
import { aCompaniaCatalogo } from './codeoscopic/cartera-companias-mapeo.ts'
import {
  contarPorFuente,
  observacionesDeTarificacion,
  type ObservacionNueva,
  type PrecioParaObservar,
  type TarificacionParaObservar,
} from './observacion-precio.ts'

/** Interruptor: sin `=1` ni los enganches ni el barrido escriben (el barrido cuenta). */
export const ENV_ACTIVO = 'OBSERVACIONES_PRECIO_ACTIVO'
/** Secreto de los HMAC (`grupo_comparacion`, `ancla_riesgo`, `riesgo_huella`). Sin fallback. */
export const ENV_SECRETO = 'ASEGURA_PRECIOS_HUELLA_SECRET'

export type EstadoAlmacen =
  | { puede: true; secreto: string }
  | { puede: false; motivo: 'apagado' | 'sin_secreto' | 'sin_migracion' }

export type Desenlace = { escritas: number; omitidas: number; estado: 'escrito' | 'apagado' | 'sin_secreto' | 'sin_migracion' | 'sin_tarificacion' | 'error'; error: string | null }

const avisados = new Set<string>()
function avisarUnaVez(motivo: string, texto: string): void {
  if (avisados.has(motivo)) return
  avisados.add(motivo)
  console.error(`[observaciones-precio] ${texto}`)
}

/** Interruptor y secreto (sin BD). PURO salvo por `process.env`. */
export function cerrojosSinBd(env: Record<string, string | undefined> = process.env): EstadoAlmacen | { puede: 'falta_tabla'; secreto: string } {
  if (env[ENV_ACTIVO] !== '1') return { puede: false, motivo: 'apagado' }
  let secreto: string
  try {
    secreto = requireSecret(ENV_SECRETO)
  } catch {
    return { puede: false, motivo: 'sin_secreto' }
  }
  return { puede: 'falta_tabla', secreto }
}

export const hayObservacionesPrecio = () => esquema.existeTabla('observaciones_precio')

/** Los tres cerrojos. No lanza (la comprobación de la tabla, si falla, da «no existe»). */
export async function estadoAlmacen(): Promise<EstadoAlmacen> {
  const c = cerrojosSinBd()
  if (c.puede === false) return c
  if (!(await hayObservacionesPrecio())) return { puede: false, motivo: 'sin_migracion' }
  return { puede: true, secreto: c.secreto }
}

// ─── Lectura (todo acotado por correduría) ───────────────────────────────────────────────────────────────────────

type FilaT = {
  id: string; canal: string | null; simulado: boolean; ramo: string | null; creado_at: Date; fecha_efecto: string | null
  codigo_postal: string | null; metros_cuadrados: number | null; anio_construccion: number | null
  capital_continente: number | null; capital_contenido: number | null
  oportunidad_id: string | null; poliza_id: string | null; cliente_id: string | null
  peticion: unknown; ofertas_rpa: unknown; fallos: unknown
}
type FilaP = {
  id: string; tarificacion_id: string; compania: string | null; producto: string | null; modalidad: string | null; categoria: string | null
  prima_eur: number | null; franquicia_eur: number | null; firmeza: string | null; coberturas: unknown; garantias: unknown
  forma_pago: string | null; frecuencia_pago: string | null; meses: number | null; referencia_vendor: string | null
}

const aTarificacion = (f: FilaT): TarificacionParaObservar => ({
  id: f.id, canal: f.canal, simulado: f.simulado, ramo: f.ramo, creadoAt: f.creado_at, fechaEfecto: f.fecha_efecto,
  codigoPostal: f.codigo_postal, metrosCuadrados: f.metros_cuadrados, anioConstruccion: f.anio_construccion,
  capitalContinente: f.capital_continente, capitalContenido: f.capital_contenido,
  oportunidadId: f.oportunidad_id, polizaId: f.poliza_id, clienteId: f.cliente_id,
  peticion: f.peticion, ofertasRpa: f.ofertas_rpa, fallos: f.fallos,
})
const aPrecio = (f: FilaP): PrecioParaObservar => ({
  id: f.id, compania: f.compania, producto: f.producto, modalidad: f.modalidad, categoria: f.categoria, primaEur: f.prima_eur,
  franquiciaEur: f.franquicia_eur, firmeza: f.firmeza, coberturas: f.coberturas, garantias: f.garantias, formaPago: f.forma_pago,
  frecuenciaPago: f.frecuencia_pago, meses: f.meses, referenciaVendor: f.referencia_vendor,
})

async function leerTarificaciones(correduriaId: string, ids: string[]): Promise<{ t: TarificacionParaObservar; precios: PrecioParaObservar[] }[]> {
  if (ids.length === 0) return []
  const ts = await prisma.$queryRaw<FilaT[]>`
    select t.id::text as id, t.canal, t.simulado, t.ramo, t.creado_at, t.fecha_efecto::text as fecha_efecto, t.codigo_postal,
           t.metros_cuadrados, t.anio_construccion, t.capital_continente::float8 as capital_continente,
           t.capital_contenido::float8 as capital_contenido, t.oportunidad_id::text as oportunidad_id, t.poliza_id::text as poliza_id,
           t.cliente_id::text as cliente_id, t.peticion, case when t.canal = 'rpa' then t.respuesta -> 'ofertas' end as ofertas_rpa, t.fallos
      from seguros.tarificaciones t
     where t.correduria_id = ${correduriaId}::uuid and t.id = any(${ids}::uuid[])`
  const ps = await prisma.$queryRaw<FilaP[]>`
    select p.id::text as id, p.tarificacion_id::text as tarificacion_id, p.compania, p.producto, p.modalidad, p.categoria,
           p.prima_eur::float8 as prima_eur, p.franquicia_eur::float8 as franquicia_eur, p.firmeza, p.coberturas, p.garantias,
           p.forma_pago, p.frecuencia_pago, p.meses, p.referencia_vendor
      from seguros.tarificacion_precios p
      join seguros.tarificaciones t on t.id = p.tarificacion_id
     where t.correduria_id = ${correduriaId}::uuid and p.tarificacion_id = any(${ids}::uuid[])
     order by p.creado_at, p.id`
  const porT = new Map<string, PrecioParaObservar[]>()
  for (const p of ps) (porT.get(p.tarificacion_id) ?? porT.set(p.tarificacion_id, []).get(p.tarificacion_id)!).push(aPrecio(p))
  return ts.map((f) => ({ t: aTarificacion(f), precios: porT.get(f.id) ?? [] }))
}

async function leerCatalogo(): Promise<CompaniaCatalogo[]> {
  // Catálogo común (sin `correduria_id`). Solo activas: el vendor no cotiza con compañías dadas de baja.
  const filas = await prisma.$queryRaw<{ codigoDgs: string; nombreComun: string; nombreCima: string | null }[]>`
    select codigo_dgs as "codigoDgs", nombre_comun as "nombreComun", nombre_cima as "nombreCima"
      from seguros.companias_dgs where activa order by codigo_dgs`
  return filas.map(aCompaniaCatalogo)
}

// ─── Escritura (una sentencia por tarificación: atómica) ───────────────────────────────────────────────────────────

/** Inserta las observaciones; las ya presentes (misma clave + huella) no se tocan. `sustituye_a` = la vigente de esa clave. */
async function insertar(correduriaId: string, obs: readonly ObservacionNueva[]): Promise<number> {
  if (obs.length === 0) return 0
  const filas = obs.map((o) => ({
    fuente: o.fuente, origen_tabla: o.origenTabla, origen_id: o.origenId, origen_subclave: o.origenSubclave, clave_origen: o.claveOrigen,
    huella_valores: o.huellaValores, resultado: o.resultado, motivo_codigo: o.motivoCodigo, compania_dgs: o.companiaDgs,
    compania_texto: o.companiaTexto, compania_resolucion: o.companiaResolucion, ramo: o.ramo, producto: o.producto, modalidad: o.modalidad,
    categoria: o.categoria, nivel: o.nivel, nivel_fuente: o.nivelFuente, nivel_version: o.nivelVersion, prima_anual_cents: o.primaAnualCents,
    prima_tipo: o.primaTipo, forma_pago: o.formaPago, franquicia_cents: o.franquiciaCents, coberturas: o.coberturas, firmeza: o.firmeza,
    coherencia: o.coherencia, observada_at: o.observadaAt, fecha_tipo: o.fechaTipo, fecha_efecto: o.fechaEfecto,
    grupo_comparacion: o.grupoComparacion, ancla_riesgo: o.anclaRiesgo, riesgo_huella: o.riesgoHuella, provincia: o.provincia,
    perfil: o.perfil, creado_por: o.creadoPor,
  }))
  const n = await prisma.$executeRaw`
    insert into seguros.observaciones_precio (
      correduria_id, fuente, origen_tabla, origen_id, origen_subclave, clave_origen, huella_valores, sustituye_a, resultado, motivo_codigo,
      compania_dgs, compania_texto, compania_resolucion, ramo, producto, modalidad, categoria, nivel, nivel_fuente, nivel_version,
      prima_anual_cents, prima_tipo, forma_pago, franquicia_cents, coberturas, firmeza, coherencia, observada_at, fecha_tipo, fecha_efecto,
      grupo_comparacion, ancla_riesgo, riesgo_huella, provincia, perfil, creado_por)
    select ${correduriaId}::uuid, x.fuente, x.origen_tabla, x.origen_id, x.origen_subclave, x.clave_origen, x.huella_valores,
           (select v.id from seguros.observaciones_precio v
             where v.correduria_id = ${correduriaId}::uuid and v.clave_origen = x.clave_origen
             order by v.creado_at desc limit 1),
           x.resultado, x.motivo_codigo, x.compania_dgs, x.compania_texto, x.compania_resolucion, x.ramo, x.producto, x.modalidad,
           x.categoria, x.nivel, x.nivel_fuente, x.nivel_version, x.prima_anual_cents, x.prima_tipo, x.forma_pago, x.franquicia_cents,
           x.coberturas, x.firmeza, x.coherencia, x.observada_at, x.fecha_tipo, x.fecha_efecto, x.grupo_comparacion, x.ancla_riesgo,
           x.riesgo_huella, x.provincia, coalesce(x.perfil, '{}'::jsonb), x.creado_por
      from jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) as x(
        fuente text, origen_tabla text, origen_id uuid, origen_subclave text, clave_origen text, huella_valores text, resultado text,
        motivo_codigo text, compania_dgs text, compania_texto text, compania_resolucion text, ramo text, producto text, modalidad text,
        categoria text, nivel text, nivel_fuente text, nivel_version smallint, prima_anual_cents bigint, prima_tipo text, forma_pago text,
        franquicia_cents bigint, coberturas jsonb, firmeza text, coherencia text, observada_at timestamptz, fecha_tipo text, fecha_efecto date,
        grupo_comparacion text, ancla_riesgo text, riesgo_huella text, provincia text, perfil jsonb, creado_por text)
    on conflict (correduria_id, clave_origen, huella_valores) do nothing`
  return Number(n)
}

/** De `obs`, cuántas NO están ya (misma clave + huella). Sin la tabla, todas son nuevas. */
async function contarNuevas(correduriaId: string, obs: readonly ObservacionNueva[], hayTabla: boolean): Promise<number> {
  if (obs.length === 0 || !hayTabla) return obs.length
  const claves = obs.map((o) => ({ c: o.claveOrigen, h: o.huellaValores }))
  const f = await prisma.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from jsonb_to_recordset(${JSON.stringify(claves)}::jsonb) as x(c text, h text)
     where not exists (select 1 from seguros.observaciones_precio v
                        where v.correduria_id = ${correduriaId}::uuid and v.clave_origen = x.c and v.huella_valores = x.h)`
  return f[0]?.n ?? 0
}

// ─── Enganche en caliente ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Proyecta UNA tarificación ya guardada (relee de la BD: así caliente y barrido son idénticos). NUNCA LANZA.
 * `riesgoRpa`: el riesgo del trabajo del bot EN MEMORIA (antes de la purga), solo para los tramos del perfil.
 */
export async function anotarObservacionesTarificacion(
  correduriaId: string,
  tarificacionId: string,
  opciones: { creadoPor: 'sistema:avant2' | 'sistema:rpa'; riesgoRpa?: unknown },
): Promise<Desenlace> {
  try {
    const estado = await estadoAlmacen()
    if (!estado.puede) {
      avisarUnaVez(estado.motivo, `no se escribe (${estado.motivo}): ${estado.motivo === 'apagado' ? `${ENV_ACTIVO} no es 1` : estado.motivo === 'sin_secreto' ? `falta ${ENV_SECRETO}` : 'la tabla observaciones_precio no existe (¿SQL 2026-11-07b sin aplicar?)'}; el barrido nocturno lo recogerá`)
      return { escritas: 0, omitidas: 0, estado: estado.motivo, error: null }
    }
    const [leida] = await leerTarificaciones(correduriaId, [tarificacionId])
    if (!leida) return { escritas: 0, omitidas: 0, estado: 'sin_tarificacion', error: null }
    const obs = observacionesDeTarificacion(leida.t, leida.precios, { catalogo: await leerCatalogo(), secreto: estado.secreto, riesgoRpa: opciones.riesgoRpa, creadoPor: opciones.creadoPor })
    const escritas = await insertar(correduriaId, obs)
    return { escritas, omitidas: obs.length - escritas, estado: 'escrito', error: null }
  } catch (e) {
    // Solo el id de la tarificación y la causa (sin URL ni datos del riesgo).
    const causa = registrarErrorCartera(`observaciones-precio/tarificacion ${tarificacionId}`, e)
    return { escritas: 0, omitidas: 0, estado: 'error', error: causa }
  }
}

// ─── Barrido nocturno / backfill ─────────────────────────────────────────────────────────────────────────────────

export const TOPE_TARIFICACIONES_POR_PASADA = 500
const TANDA = 50

export type InformeBarrido = {
  modo: 'contar' | 'escribir'
  /** Por qué cuenta y no escribe (`null` = escribe). */
  porQueContar: 'pedido' | 'apagado' | 'sin_secreto' | 'sin_migracion' | null
  corredurias: number
  tarificaciones: number
  /** Observaciones que salen de esas tarificaciones, por fuente y resultado (ya estén o no). */
  observaciones: Record<string, Record<string, number>>
  /** De ellas, las que aún no están en el almacén (lo que escribiría / ha intentado escribir). */
  nuevas: number
  escritas: number
  /** Tarificaciones que quedaron fuera por el tope de la pasada (las coge la siguiente). */
  pendientesPorTope: number
  /** Latido: tarificaciones reales de hace > 24 h sin ninguna observación (el enganche en caliente está fallando). `null` = sin tabla. */
  sinObservacion24h: number | null
  errores: number
}

/**
 * Recorre las tarificaciones reales (no simuladas) de cada correduría y proyecta las que aún no tienen observación (con
 * `todo`, todas: re-clasificación tras subir una versión). Idempotente: la MISMA función que el enganche + UNIQUE.
 * Modo CONTAR por defecto: sin interruptor/secreto/tabla, o con `contar`, NO escribe nada. Lanza solo si la BD no responde
 * al listar (la ruta lo traduce a 503); el fallo de UNA tanda se cuenta y se sigue.
 */
export async function barrerObservacionesPrecio(o: { contar: boolean; todo?: boolean; tope?: number }): Promise<InformeBarrido> {
  const c = cerrojosSinBd()
  const hayTabla = await hayObservacionesPrecio()
  const porQueContar: InformeBarrido['porQueContar'] = o.contar ? 'pedido' : c.puede === false ? c.motivo : !hayTabla ? 'sin_migracion' : null
  const escribir = porQueContar === null
  // El secreto solo cambia los HMAC (fuera de la huella): contar sin él da las mismas cifras.
  const secreto = c.puede === false ? null : c.secreto
  const tope = Math.max(1, Math.min(o.tope ?? TOPE_TARIFICACIONES_POR_PASADA, 5_000))
  const informe: InformeBarrido = { modo: escribir ? 'escribir' : 'contar', porQueContar, corredurias: 0, tarificaciones: 0, observaciones: {}, nuevas: 0, escritas: 0, pendientesPorTope: 0, sinObservacion24h: null, errores: 0 }
  const todas: ObservacionNueva[] = []
  const catalogo = await leerCatalogo()
  const corredurias = await prisma.$queryRaw<{ id: string }[]>`select id::text as id from seguros.corredurias order by id`
  informe.corredurias = corredurias.length
  for (const { id: correduriaId } of corredurias) {
    const candidatas = await candidatasDe(correduriaId, hayTabla && !o.todo, tope + 1)
    if (candidatas.length > tope) informe.pendientesPorTope += 1
    const ids = candidatas.slice(0, tope)
    informe.tarificaciones += ids.length
    for (let i = 0; i < ids.length; i += TANDA) {
      const tanda = ids.slice(i, i + TANDA)
      try {
        for (const { t, precios } of await leerTarificaciones(correduriaId, tanda)) {
          const obs = observacionesDeTarificacion(t, precios, { catalogo, secreto, creadoPor: 'sistema:barrido' })
          todas.push(...obs)
          informe.nuevas += await contarNuevas(correduriaId, obs, hayTabla)
          if (escribir) informe.escritas += await insertar(correduriaId, obs)
        }
      } catch (e) {
        informe.errores++
        registrarErrorCartera(`observaciones-precio/barrido (${tanda.length} tarificaciones)`, e)
      }
    }
    if (hayTabla) informe.sinObservacion24h = (informe.sinObservacion24h ?? 0) + (await sinObservacion24h(correduriaId))
  }
  informe.observaciones = contarPorFuente(todas)
  return informe
}

/** Ids de tarificaciones reales con algo que proyectar (precios o fallos); `soloSinObservar` = sin ninguna observación aún. */
async function candidatasDe(correduriaId: string, soloSinObservar: boolean, limite: number): Promise<string[]> {
  const filas = soloSinObservar
    ? await prisma.$queryRaw<{ id: string }[]>`
        select t.id::text as id from seguros.tarificaciones t
         where t.correduria_id = ${correduriaId}::uuid and t.simulado = false and t.canal in ('codeoscopic', 'rpa')
           and (exists (select 1 from seguros.tarificacion_precios p where p.tarificacion_id = t.id)
                or (jsonb_typeof(t.fallos) = 'array' and jsonb_array_length(t.fallos) > 0))
           and not exists (select 1 from seguros.observaciones_precio v
                            where v.correduria_id = ${correduriaId}::uuid
                              and (v.origen_id = t.id or v.origen_id in (select p.id from seguros.tarificacion_precios p where p.tarificacion_id = t.id)))
         order by t.creado_at limit ${limite}`
    : await prisma.$queryRaw<{ id: string }[]>`
        select t.id::text as id from seguros.tarificaciones t
         where t.correduria_id = ${correduriaId}::uuid and t.simulado = false and t.canal in ('codeoscopic', 'rpa')
           and (exists (select 1 from seguros.tarificacion_precios p where p.tarificacion_id = t.id)
                or (jsonb_typeof(t.fallos) = 'array' and jsonb_array_length(t.fallos) > 0))
         order by t.creado_at limit ${limite}`
  return filas.map((f) => f.id)
}

async function sinObservacion24h(correduriaId: string): Promise<number> {
  const f = await prisma.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from seguros.tarificaciones t
     where t.correduria_id = ${correduriaId}::uuid and t.simulado = false and t.canal in ('codeoscopic', 'rpa')
       and t.creado_at < now() - interval '24 hours'
       and exists (select 1 from seguros.tarificacion_precios p where p.tarificacion_id = t.id)
       and not exists (select 1 from seguros.observaciones_precio v
                        where v.correduria_id = ${correduriaId}::uuid
                          and v.origen_id in (select p.id from seguros.tarificacion_precios p where p.tarificacion_id = t.id))`
  return f[0]?.n ?? 0
}
