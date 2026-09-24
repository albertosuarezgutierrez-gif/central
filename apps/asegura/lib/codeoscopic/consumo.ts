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
import { COSTE_COTIZACION_CENTS } from './config.ts'
import { MOTIVO_LIMITES, MOTIVO_RERATE, MOTIVO_SUBMIT, type OperacionEmision } from './gasto-emision.ts'
import type { Consumo } from './contador.ts'

export type Reserva = { intentoId: string; correduriaId: string }

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
export async function consumoActual(correduriaId: string): Promise<Consumo> {
  const filas = await prisma.$queryRaw<
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
        and motivo not in (${MOTIVO_RERATE}, ${MOTIVO_SUBMIT}, ${MOTIVO_LIMITES})
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
}): Promise<Reserva> {
  await prisma.$executeRaw`
    insert into seguros.codeoscopic_consumo
      (correduria_id, intento_id, estado, motivo, solicitado_por, coste_cents)
    values
      (${input.correduriaId}::uuid, ${input.intentoId}::uuid, 'reservado',
       ${input.motivo}, ${input.solicitadoPor}, ${COSTE_COTIZACION_CENTS})
  `
  return { intentoId: input.intentoId, correduriaId: input.correduriaId }
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
): Promise<Consumo> {
  const filas = await prisma.$queryRaw<
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
}): Promise<Reserva> {
  await prisma.$executeRaw`
    insert into seguros.codeoscopic_consumo
      (correduria_id, intento_id, estado, motivo, solicitado_por, coste_cents, project_id_codeoscopic)
    values
      (${input.correduriaId}::uuid, ${input.intentoId}::uuid, 'reservado',
       ${input.operacion}, ${input.solicitadoPor}, ${input.costeCents}, ${input.projectId})
  `
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
