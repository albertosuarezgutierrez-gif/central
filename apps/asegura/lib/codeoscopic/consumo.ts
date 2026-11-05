// Persistencia del libro de consumo de Codeoscopic. Impuro (BD).
//
// La lógica de si SE PUEDE cotizar vive en `contador.ts` (pura y probada); aquí
// solo se lee y se escribe el libro. La separación es a propósito: la decisión
// que cuesta dinero tiene que poder probarse sin BD.
//
// 🔒 Aislamiento: toda consulta pasa por el ámbito de correduría (`lib/tenant`).
// Con `prisma_seguros` en BYPASSRLS, olvidar el filtro no da error — da el libro
// de otra correduría. Lo vigila test/regression-asegura-aislamiento.test.ts.

import { prisma } from '../tenant.ts'
import { COSTE_COTIZACION_CENTS, type Topes } from './config.ts'
import {
  MOTIVO_LIMITES,
  MOTIVO_RERATE,
  MOTIVO_SUBMIT,
  costeEmisionCents,
  puedeGastarEmision,
  topesEmision,
  type OperacionEmision,
} from './gasto-emision.ts'
import { puedeCotizar, type Consumo } from './contador.ts'
import { decidirTopeEuros } from './tope-euros.ts'
import { esquema } from '../esquema-bd.ts'

/** ¿Existe ya la columna `huella` (SQL 2026-10-08)? Vive aquí: solo este fichero nombra el libro. */
const hayHuella = () => esquema.existeColumna('codeoscopic_consumo', 'huella')
import { decidirDuplicado, VENTANA_DUPLICADO_MIN, VENTANA_REUTILIZAR_MIN, type FilaPrevia } from './huella.ts'

export type Reserva = { intentoId: string; correduriaId: string }

/** Cliente con el que se lee/escribe el libro: `prisma` o la `tx` de una transacción. */
type Db = { $queryRaw: typeof prisma.$queryRaw; $executeRaw: typeof prisma.$executeRaw }
type Env = Record<string, string | undefined>

/**
 * Un presupuesto hecho en la WEB de Avant2 y traído a la intranet (29/09/2026, ruta
 * `proyectos-cliente`). La tarificación exige su línea en el libro (FK `intento_id`), pero ese
 * precio lo pagó la web: la línea va a coste 0 y NO cuenta contra el tope de cotizar.
 */
export const MOTIVO_IMPORTADA_WEB = 'importada_web'

/**
 * La línea del libro de un presupuesto traído de la web. Va DENTRO de la transacción que guarda la
 * tarificación (la FK `intento_id` la exige): o se escriben las dos, o ninguna.
 */
export async function anotarImportadaWeb(
  tx: { $executeRaw: typeof prisma.$executeRaw },
  e: { correduriaId: string; intentoId: string; solicitadoPor: string; projectId: string },
): Promise<void> {
  await tx.$executeRaw`
    insert into seguros.codeoscopic_consumo
      (correduria_id, intento_id, estado, motivo, solicitado_por, coste_cents, project_id_codeoscopic, cerrado_at)
    values (${e.correduriaId}::uuid, ${e.intentoId}::uuid, 'facturable', ${MOTIVO_IMPORTADA_WEB}, ${e.solicitadoPor}, 0, ${e.projectId}, now())`
}

/**
 * Cuenta lo consumido hoy y este mes por esta correduría **en COTIZACIONES**
 * (`POST /insurances`, 0,50€).
 *
 * 🚨 Desde el 21/09/2026 excluye los motivos de EMISIÓN (`rerate` / `submit`),
 * que llevan su propio recuento en `consumoEmision()`. No es un cambio de
 * comportamiento —hoy no hay ni una línea con esos motivos, así que el número
 * sale idéntico— sino lo que impide que mañana lo sea: sin este filtro, una
 * tanda de emisiones agotaría el tope de cotizar y la pantalla del corredor
 * diría «te quedan 3 cotizaciones» contando cosas que no son cotizaciones.
 * Y al revés: el tope de una cosa apagaría la otra sin que nadie supiera por
 * qué, que es justo lo contrario de lo que un tope tiene que hacer.
 *
 * 🚨 NO atrapa errores. Es deliberado y es el corazón del diseño: si no podemos
 * leer el libro, no sabemos cuánto llevamos gastado, y un tope que no se puede
 * comprobar no es un tope. El llamante debe dejar caer la excepción y NO
 * cotizar. Devolver `{0,0,0,0}` en un `catch` sería exactamente el fallo que
 * `CLAUDE.md` marca como el más caro: la guarda que se pone verde porque la
 * consulta no devolvió nada.
 */
export async function consumoActual(correduriaId: string, db: Db = prisma): Promise<Consumo> {
  const filas = await db.$queryRaw<
    { dia_facturables: bigint; dia_en_vuelo: bigint; mes_facturables: bigint; mes_en_vuelo: bigint }[]
  >`
    with ventana as (
      select
        estado,
        (creado_at at time zone 'Europe/Madrid')::date as dia_es,
        date_trunc('month', creado_at at time zone 'Europe/Madrid') as mes_es
      from seguros.codeoscopic_consumo
      where correduria_id = ${correduriaId}::uuid
        and creado_at >= date_trunc('month', now() at time zone 'Europe/Madrid')
        and motivo not in (${MOTIVO_RERATE}, ${MOTIVO_SUBMIT}, ${MOTIVO_LIMITES}, ${MOTIVO_IMPORTADA_WEB})
    )
    select
      count(*) filter (
        where estado = 'facturable' and dia_es = (now() at time zone 'Europe/Madrid')::date
      )::bigint as dia_facturables,
      count(*) filter (
        where estado = 'reservado'  and dia_es = (now() at time zone 'Europe/Madrid')::date
      )::bigint as dia_en_vuelo,
      count(*) filter (where estado = 'facturable')::bigint as mes_facturables,
      count(*) filter (where estado = 'reservado')::bigint  as mes_en_vuelo
    from ventana
  `

  const f = filas[0]
  return {
    diaFacturables: Number(f?.dia_facturables ?? 0),
    diaEnVuelo: Number(f?.dia_en_vuelo ?? 0),
    mesFacturables: Number(f?.mes_facturables ?? 0),
    mesEnVuelo: Number(f?.mes_en_vuelo ?? 0),
  }
}

/**
 * Abre la reserva ANTES de llamar al vendor.
 *
 * El orden importa: si se escribiera después, una caída entre la llamada y el
 * INSERT dejaría un cargo real sin rastro en el libro — y el tope contaría de
 * menos justo en el escenario en que más falta hace.
 */
export async function reservar(input: {
  correduriaId: string
  intentoId: string
  motivo: string
  solicitadoPor: string
}, db: Db = prisma): Promise<Reserva> {
  await db.$executeRaw`
    insert into seguros.codeoscopic_consumo
      (correduria_id, intento_id, estado, motivo, solicitado_por, coste_cents)
    values
      (${input.correduriaId}::uuid, ${input.intentoId}::uuid, 'reservado',
       ${input.motivo}, ${input.solicitadoPor}, ${COSTE_COTIZACION_CENTS})
  `
  return { intentoId: input.intentoId, correduriaId: input.correduriaId }
}

/**
 * 🔒 Candado de GASTO por correduría + re-cuenta del libro y del tope en euros, DENTRO de la
 * transacción que va a reservar (02/11/2026).
 *
 * Por qué: `cotizar()` y `conLibroDeEmision()` comprueban los topes ANTES de reservar, en otra
 * conexión y sin candado. N peticiones en paralelo leen el mismo gasto («69,50 €, cabe una»), las N
 * pasan y las N reservan: el tope se rebasa justo en la ráfaga contra la que existe. El candado de
 * la huella no lo evita (cuerpos distintos = huellas distintas). Aquí, bajo
 * `pg_advisory_xact_lock(hashtext('cotizar:' || correduria))` —el MISMO para cotizar y emisión: es
 * una sola bolsa de gasto en Avant2—, la segunda espera a que la primera confirme su INSERT y
 * vuelve a contar ya con él dentro.
 *
 * Todo con la `tx` (nunca `prisma`): leer por otra conexión mientras se retiene el candado podría
 * agotar el pool con todas las conexiones esperando al candado. NO atrapa errores (fail-closed).
 * `null` = cabe; si no, el motivo del corte (`sin-libro` = no se pudo leer el gasto, nunca «0 €»).
 */
async function recontarBajoCandado(
  tx: Db,
  correduriaId: string,
  q:
    | { tipo: 'cotizar'; topes: Topes; env: Env }
    | { tipo: 'emision'; operacion: OperacionEmision; topes: Topes; env: Env },
  costeCents: number,
): Promise<{ razon: 'tope' | 'sin-libro'; mensaje: string } | null> {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('cotizar:' || ${correduriaId}::text))`
  const veredicto =
    q.tipo === 'cotizar'
      ? puedeCotizar(await consumoActual(correduriaId, tx), q.topes)
      : puedeGastarEmision(q.operacion, await consumoEmision(correduriaId, q.operacion, tx), q.topes, costeCents)
  if (!veredicto.permitido) return { razon: 'tope', mensaje: veredicto.explicacion }
  const gastadoCents = await gastadoMesCents(
    correduriaId,
    {
      rerate: costeEmisionCents('rerate', q.env),
      submit: costeEmisionCents('submit', q.env),
      limites: costeEmisionCents('limites_hogar', q.env),
    },
    tx,
  )
  const amp = await tx.$queryRaw<{ ampliado: bigint }[]>`
    select
      (select coalesce(sum(e.importe_cents), 0)
         from seguros.codeoscopic_tope_evento e
        where e.correduria_id = ${correduriaId}::uuid
          and e.tipo = 'ampliacion'
          and e.mes = date_trunc('month', now() at time zone 'Europe/Madrid')::date)::bigint as ampliado`
  const d = decidirTopeEuros({ gastadoCents, ampliadoCents: amp[0] ? Number(amp[0].ampliado) : null }, costeCents)
  if (!d.permitido) return { razon: d.motivo === 'desconocido' ? 'sin-libro' : 'tope', mensaje: d.explicacion }
  return null
}

/** El tope se re-comprobó bajo candado y ya no cabe: se lanza para que NO se llame al vendor. */
export class TopeAlcanzadoBajoCandado extends Error {
  readonly razon: 'tope' | 'sin-libro'
  constructor(razon: 'tope' | 'sin-libro', mensaje: string) {
    super(mensaje)
    this.razon = razon
    this.name = 'TopeAlcanzadoBajoCandado'
  }
}

/** Misma operación de emisión (misma huella) ya reservada o cobrada hace menos de 15 min: NO se llama otra vez. */
export class EmisionDuplicada extends Error {
  constructor() {
    super('Operación idéntica en curso o reciente (menos de 15 minutos): no se ha vuelto a llamar a la compañía.')
    this.name = 'EmisionDuplicada'
  }
}

export type ReservaAntiDuplicado =
  | { resultado: 'reservada' }
  | { resultado: 'tope'; razon: 'tope' | 'sin-libro'; mensaje: string }
  | { resultado: 'reutilizar'; intentoId: string; respuesta: unknown; cotizacionId: string }
  | { resultado: 'bloquear'; intentoId: string; estado: 'reservado' | 'facturable' }

/**
 * Comprueba duplicado y RESERVA en la misma transacción, bajo `pg_advisory_xact_lock(hashtext(huella))`:
 * dos pestañas con la misma petición se serializan y la segunda ve la reserva de la primera. Sin `forzar`,
 * una fila con la misma huella reservada o facturable en los últimos 15 min impide la llamada; una facturable con copia
 * se reutiliza hasta 24 h si la fecha de efecto sigue vigente (`decidirDuplicado`).
 * NO atrapa errores (fail-closed, como `reservar`): si no se puede comprobar, no se llama.
 */
export async function reservarSinDuplicado(input: {
  correduriaId: string
  intentoId: string
  motivo: string
  solicitadoPor: string
  huella: string
  forzar?: boolean
  /** Fecha de efecto (aaaa-mm-dd) del cuerpo: habilita reutilizar la copia hasta 24 h si sigue vigente. */
  fechaEfecto?: string | null
  /** Topes de cotizar vigentes (los de `resolverConfig`): se re-cuentan bajo candado. */
  topes: Topes
  env?: Env
}): Promise<ReservaAntiDuplicado> {
  const env = input.env ?? process.env
  // Esquema sin migrar (columna `huella` aún no existe): se reserva como antes de #4458 — SIN huella ni
  // deduplicación, pero CON reserva en libro (los topes se siguen aplicando antes, en cotizar). Si la
  // comprobación falla se asume «no existe». Nunca relaja la reserva: solo omite la deduplicación.
  if (!(await hayHuella())) {
    return prisma.$transaction(async (tx): Promise<ReservaAntiDuplicado> => {
      const corte = await recontarBajoCandado(tx, input.correduriaId, { tipo: 'cotizar', topes: input.topes, env }, COSTE_COTIZACION_CENTS)
      if (corte) return { resultado: 'tope', ...corte }
      await reservar({ correduriaId: input.correduriaId, intentoId: input.intentoId, motivo: input.motivo, solicitadoPor: input.solicitadoPor }, tx)
      return { resultado: 'reservada' }
    })
  }
  return prisma.$transaction(async (tx): Promise<ReservaAntiDuplicado> => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${input.huella}))`
    const filas = await tx.$queryRaw<{ intento_id: string; estado: FilaPrevia['estado']; creado_at: Date }[]>`
      select intento_id::text as intento_id, estado, creado_at
        from seguros.codeoscopic_consumo
       where correduria_id = ${input.correduriaId}::uuid
         and huella = ${input.huella}
         and estado in ('reservado', 'facturable')
         and creado_at >= now() - make_interval(mins => ${VENTANA_REUTILIZAR_MIN}::int)
       order by creado_at desc`
    const previas: FilaPrevia[] = filas.map((f) => ({ estado: f.estado, creadoAt: new Date(f.creado_at), intentoId: f.intento_id }))
    const copias = new Map<string, { respuesta: unknown; cotizacionId: string }>()
    if (previas.length > 0 && input.forzar !== true) {
      const t = await tx.$queryRaw<{ intento_id: string; id: string; respuesta: unknown }[]>`
        select intento_id::text as intento_id, id::text as id, respuesta
          from seguros.tarificaciones
         where correduria_id = ${input.correduriaId}::uuid
           and intento_id = any(${previas.map((f) => f.intentoId)}::uuid[])
           and simulado = false and respuesta is not null`
      for (const r of t) copias.set(r.intento_id, { respuesta: r.respuesta, cotizacionId: r.id })
    }
    const d = decidirDuplicado({ previas, copias: new Set(copias.keys()), ahora: new Date(), forzar: input.forzar, fechaEfecto: input.fechaEfecto })
    if (d.accion === 'reutilizar') {
      const c = copias.get(d.intentoId)!
      return { resultado: 'reutilizar', intentoId: d.intentoId, ...c }
    }
    if (d.accion === 'bloquear') return { resultado: 'bloquear', intentoId: d.intentoId, estado: d.estado }
    // Orden de candados fijo (huella → correduría) en todos los caminos: sin ciclos, sin interbloqueo.
    const corte = await recontarBajoCandado(tx, input.correduriaId, { tipo: 'cotizar', topes: input.topes, env }, COSTE_COTIZACION_CENTS)
    if (corte) return { resultado: 'tope', ...corte }
    await tx.$executeRaw`
      insert into seguros.codeoscopic_consumo
        (correduria_id, intento_id, estado, motivo, solicitado_por, coste_cents, huella)
      values
        (${input.correduriaId}::uuid, ${input.intentoId}::uuid, 'reservado',
         ${input.motivo}, ${input.solicitadoPor}, ${COSTE_COTIZACION_CENTS}, ${input.huella})`
    return { resultado: 'reservada' }
  })
}

/**
 * Lo consumido hoy y este mes en UNA operación de emisión (`rerate` / `submit`).
 *
 * 🚨 Mismo contrato que `consumoActual`: **NO atrapa errores**. Si no se puede
 * leer el libro, el llamante (`libro-emision.ts`) no llama al vendor. Un tope
 * que no se puede comprobar no es un tope — y aquí, además, la llamada que no
 * se comprueba es la que compromete un contrato.
 */
export async function consumoEmision(
  correduriaId: string,
  operacion: OperacionEmision,
  db: Db = prisma,
): Promise<Consumo> {
  const filas = await db.$queryRaw<
    { dia_facturables: bigint; dia_en_vuelo: bigint; mes_facturables: bigint; mes_en_vuelo: bigint }[]
  >`
    with ventana as (
      select
        estado,
        (creado_at at time zone 'Europe/Madrid')::date as dia_es
      from seguros.codeoscopic_consumo
      where correduria_id = ${correduriaId}::uuid
        and creado_at >= date_trunc('month', now() at time zone 'Europe/Madrid')
        and motivo = ${operacion}
    )
    select
      count(*) filter (
        where estado = 'facturable' and dia_es = (now() at time zone 'Europe/Madrid')::date
      )::bigint as dia_facturables,
      count(*) filter (
        where estado = 'reservado'  and dia_es = (now() at time zone 'Europe/Madrid')::date
      )::bigint as dia_en_vuelo,
      count(*) filter (where estado = 'facturable')::bigint as mes_facturables,
      count(*) filter (where estado = 'reservado')::bigint  as mes_en_vuelo
    from ventana
  `

  const f = filas[0]
  return {
    diaFacturables: Number(f?.dia_facturables ?? 0),
    diaEnVuelo: Number(f?.dia_en_vuelo ?? 0),
    mesFacturables: Number(f?.mes_facturables ?? 0),
    mesEnVuelo: Number(f?.mes_en_vuelo ?? 0),
  }
}

/**
 * Abre la reserva de un ReRate o de un Submit ANTES de llamar al vendor.
 *
 * Gemela de `reservar()`, con dos diferencias que son el motivo de que exista
 * aparte en vez de un parámetro opcional: el `motivo` es el que separa los
 * contadores (ver `consumoActual`), y el coste **no** es `COSTE_COTIZACION_CENTS`
 * sino lo que diga la env de esa operación — hoy 0, porque no está confirmado
 * que facturen. El camino de `cotizar()` no se toca.
 */
export async function reservarEmision(input: {
  correduriaId: string
  intentoId: string
  operacion: OperacionEmision
  solicitadoPor: string
  costeCents: number
  projectId: string | null
  /**
   * Huella anti doble clic (05/11/2026), la MISMA columna y el mismo candado que `reservarSinDuplicado`: si hay otra
   * línea con esta huella reservada o facturable en los últimos 15 min se lanza `EmisionDuplicada`. Sin la columna
   * `huella` (esquema sin migrar) se reserva como antes, sin deduplicar.
   */
  huella?: string
  env?: Env
}): Promise<Reserva> {
  const env = input.env ?? process.env
  const huella = input.huella && (await hayHuella()) ? input.huella : null
  // Bajo el MISMO candado que cotizar (una sola bolsa en euros). Si ya no cabe, se LANZA: el
  // llamante (`libro-emision.ts`) trata cualquier excepción de la reserva como «no se llama».
  await prisma.$transaction(async (tx) => {
    if (huella) {
      // Orden de candados fijo (huella → correduría), como en `reservarSinDuplicado`.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${huella}))`
      const previas = await tx.$queryRaw<{ intento_id: string }[]>`
        select intento_id::text as intento_id
          from seguros.codeoscopic_consumo
         where correduria_id = ${input.correduriaId}::uuid
           and huella = ${huella}
           and estado in ('reservado', 'facturable')
           and creado_at >= now() - make_interval(mins => ${VENTANA_DUPLICADO_MIN}::int)
         limit 1`
      if (previas.length > 0) throw new EmisionDuplicada()
    }
    const corte = await recontarBajoCandado(
      tx,
      input.correduriaId,
      { tipo: 'emision', operacion: input.operacion, topes: topesEmision(input.operacion, env), env },
      input.costeCents,
    )
    if (corte) throw new TopeAlcanzadoBajoCandado(corte.razon, corte.mensaje)
    await tx.$executeRaw`
      insert into seguros.codeoscopic_consumo
        (correduria_id, intento_id, estado, motivo, solicitado_por, coste_cents, project_id_codeoscopic, huella)
      values
        (${input.correduriaId}::uuid, ${input.intentoId}::uuid, 'reservado',
         ${input.operacion}, ${input.solicitadoPor}, ${input.costeCents}, ${input.projectId}, ${huella})
    `
  })
  return { intentoId: input.intentoId, correduriaId: input.correduriaId }
}

/**
 * Cierra como facturable una línea de emisión.
 *
 * Aparte de `cerrarFacturable()` por una razón concreta: allí el `projectId` es
 * lo que devuelve la cotización y no se conocía antes de llamar, así que el
 * cierre lo escribe. Aquí el proyecto ya se conocía y lo escribió la reserva —
 * reescribirlo desde el cierre obligaría a pasarlo otra vez y a meter un `''`
 * cuando no se tiene, que es un centinela con forma de dato.
 */
export async function cerrarEmisionFacturable(intentoId: string): Promise<void> {
  await prisma.$executeRaw`
    update seguros.codeoscopic_consumo
       set estado = 'facturable',
           cerrado_at = now()
     where intento_id = ${intentoId}::uuid
       and estado = 'reservado'
  `
}

/** El vendor respondió: hay proyecto y, por tanto, cargo. */
export async function cerrarFacturable(intentoId: string, projectId: string): Promise<void> {
  await prisma.$executeRaw`
    update seguros.codeoscopic_consumo
       set estado = 'facturable',
           project_id_codeoscopic = ${projectId},
           cerrado_at = now()
     where intento_id = ${intentoId}::uuid
       and estado = 'reservado'
  `
}

/**
 * Cierra como NO facturable. Exige evidencia por contrato (y por CHECK en BD).
 *
 * Solo hay tres evidencias admisibles, y todas significan que el vendor no llegó
 * a tarificar: fallo de autenticación (401/403), fallo de conexión antes de
 * enviar, o rechazo de validación (400/422) del propio vendor.
 *
 * ⚠️ Un TIMEOUT **no** es evidencia de nada: la cotización puede tardar más de
 * un minuto y el proyecto puede haberse creado igual. Esos se quedan en
 * `reservado` y siguen contando. Es intencionado.
 */
export async function cerrarDescartado(
  intentoId: string,
  evidencia: string,
  errorCodigo: string,
): Promise<void> {
  await prisma.$executeRaw`
    update seguros.codeoscopic_consumo
       set estado = 'descartado',
           descarte_evidencia = ${evidencia},
           error_codigo = ${errorCodigo},
           cerrado_at = now()
     where intento_id = ${intentoId}::uuid
       and estado = 'reservado'
  `
}

/**
 * Lo gastado este mes natural (Madrid) en el libro, en céntimos. Lo lee el tope en euros
 * (`tope-euros-bd.ts`), que no toca la tabla: el libro solo se mira desde aquí.
 *
 * Las líneas de ReRate/Submit/límites escritas cuando su coste por defecto era 0 («sin
 * confirmar») se cuentan al coste vigente de su operación (`greatest`). Solo SUBE una línea,
 * nunca la abarata. Las importadas de la web cuentan 0. `null` = sin fila (no se sabe, no 0 €).
 * NO atrapa errores: quien llama decide.
 */
export async function gastadoMesCents(
  correduriaId: string,
  costes: { rerate: number; submit: number; limites: number },
  db: Db = prisma,
): Promise<number | null> {
  const filas = await db.$queryRaw<{ gastado: bigint }[]>`
    with mes as (
      select (date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid') as desde
    )
    select
      (select coalesce(sum(case
                when c.motivo = ${MOTIVO_IMPORTADA_WEB} then 0
                when c.motivo = ${MOTIVO_RERATE} then greatest(c.coste_cents, ${costes.rerate})
                when c.motivo = ${MOTIVO_SUBMIT} then greatest(c.coste_cents, ${costes.submit})
                when c.motivo = ${MOTIVO_LIMITES} then greatest(c.coste_cents, ${costes.limites})
                else c.coste_cents end), 0)
         from seguros.codeoscopic_consumo c, mes
        where c.correduria_id = ${correduriaId}::uuid
          and c.estado in ('reservado', 'facturable')
          and c.creado_at >= mes.desde)::bigint as gastado
  `
  const f = filas[0]
  return f ? Number(f.gastado) : null
}
