// La cuenta de cargo que YA conocemos de un cliente, para no pedírsela otra
// vez al emitir. Impuro (BD): la parte pura vive en `emitir-iban.ts`.
//
// 🚨 Medido el 12/09/2026, tras el duodécimo 400 («The bank account is
// mandatory…»): la primera versión miraba SOLO `polizas.cuenta_bancaria` y
// `clientes.cuenta_bancaria`, las dos a NULL en Pilar Franco Ruz, y por eso la
// pantalla iba a decir «ni la póliza ni la ficha la tienen». Falso: CIMA trae el
// IBAN en **`poliza_recibos.iban`** (121 de 187 recibos; 69 de las 110 pólizas
// vivas; los 2 recibos de Pilar). Es la cuenta con la que el cliente PAGA HOY
// su seguro — el mejor dato que existe para domiciliar el nuevo. Regla del
// repo: antes de escribir «no lo tiene», mirar TODAS las columnas donde vive.
//
// Orden de preferencia (la primera legible y válida gana):
//   1. `polizas.cuenta_bancaria` de la póliza que se está retarificando
//   2. `poliza_recibos.iban` de esa póliza, del recibo más reciente hacia atrás
//   3. `clientes.cuenta_bancaria` del tomador
//   4. `poliza_recibos.iban` de sus OTRAS pólizas de cartera viva
// Devuelve TRES cosas, no dos: la cuenta, `ilegible` (hay una guardada que la
// clave PII no abre — no es «no tiene») y el origen, para decirlo en pantalla.

import { sqlCarteraViva } from '@central/module-seguros'

import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { descifrarCampo } from '../cartera-edicion'
import { ibanValido, normalizarIban, type OrigenCuenta } from './emitir-iban'

export { describirOrigenCuenta, type OrigenCuenta } from './emitir-iban'

export type AvisoCuenta =
  /** Hay una cuenta guardada que la clave PII no abre. */
  | 'ilegible'
  /** Hay una cuenta guardada, legible, que no es un IBAN válido (CCC antiguo, errata). */
  | 'invalida'
  /** La consulta falló: NO se sabe si tiene cuenta. */
  | 'no_comprobada'

export type CuentaFicha = {
  iban: string | null
  origen: OrigenCuenta | null
  /** Solo cuando `iban` es null: por qué no hay una utilizable, si se sabe. */
  aviso: AvisoCuenta | null
}

/** Se miró y no hay ninguna guardada. */
export const SIN_CUENTA: CuentaFicha = { iban: null, origen: null, aviso: null }
/** NO se pudo mirar: no es «no tiene». */
export const CUENTA_NO_COMPROBADA: CuentaFicha = { iban: null, origen: null, aviso: 'no_comprobada' }

/**
 * `polizaId` es la póliza que se retarifica (sus cuentas van primero). Sin ella
 * (cotización de nuevo negocio) NO se elige una póliza «actual» al azar: se va
 * directamente a la ficha del cliente y a los recibos de sus pólizas vivas.
 */
export async function cuentaDeFicha(
  correduriaId: string,
  polizaId: string | null,
  clienteId: string | null,
): Promise<CuentaFicha> {
  if (!polizaId && !clienteId) return SIN_CUENTA
  let filas: { origen: OrigenCuenta; valor: string | null }[]
  try {
    const viva = Prisma.raw(sqlCarteraViva('p2'))
    // `ficha` es SIEMPRE una fila (escalares, sin FROM): así la ficha del
    // cliente se lee aunque no tenga ninguna póliza, y la póliza aunque no se
    // conozca el cliente.
    filas = await prismaAsegura().$queryRaw<{ origen: OrigenCuenta; valor: string | null }[]>`
      with ficha as (
        select
          ${polizaId}::uuid as poliza_id,
          coalesce(
            ${clienteId}::uuid,
            (select p0.cliente_id from polizas p0 where p0.id = ${polizaId}::uuid and p0.correduria_id = ${correduriaId}::uuid)
          ) as cliente_id
      )
      select origen, valor from (
        select 1 as orden, 'poliza'::text as origen, p.cuenta_bancaria as valor, null::timestamptz as fecha
          from polizas p join ficha f on f.poliza_id = p.id
          where p.correduria_id = ${correduriaId}::uuid
        union all
        select 2, 'recibo', r.iban, r.fecha_emision
          from poliza_recibos r join ficha f on f.poliza_id = r.poliza_id
          where r.iban is not null and r.iban <> ''
        union all
        select 3, 'cliente', c.cuenta_bancaria, null
          from clientes c join ficha f on f.cliente_id = c.id
          where c.correduria_id = ${correduriaId}::uuid
        union all
        select 4, 'recibo_otra_poliza', r.iban, r.fecha_emision
          from poliza_recibos r
          join polizas p2 on p2.id = r.poliza_id
          join ficha f on f.cliente_id = p2.cliente_id and p2.id is distinct from f.poliza_id
          where p2.correduria_id = ${correduriaId}::uuid
            and ${viva}
            and r.iban is not null and r.iban <> ''
      ) x
      where valor is not null and valor <> ''
      order by orden asc, fecha desc nulls last
      limit 20
    `
  } catch (e) {
    // Sin poder mirar no se afirma nada — y tampoco se calla: la pantalla dirá
    // «no se ha podido comprobar», que no es «no tiene».
    console.error('[cuenta-ficha] no se pudo leer la cuenta de cargo:', e instanceof Error ? e.message : e)
    return CUENTA_NO_COMPROBADA
  }

  let aviso: AvisoCuenta | null = null
  for (const f of filas) {
    const claro = descifrarCampo(f.valor)
    // 🚨 Sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el `v1:…` tal cual
    // sin lanzar: eso no es un IBAN, y tampoco es «no tiene cuenta».
    if (claro === null || claro.startsWith('v1:')) {
      if (f.valor?.startsWith('v1:')) aviso = 'ilegible'
      continue
    }
    const iban = normalizarIban(claro)
    if (iban && ibanValido(iban)) return { iban, origen: f.origen, aviso: null }
    // Guardada y legible pero no es un IBAN (CCC de 20 dígitos del volcado, errata):
    // existe, y se dice. `ilegible` pesa más: manda a la clave, no al teclado.
    if (aviso !== 'ilegible') aviso = 'invalida'
  }
  return { iban: null, origen: null, aviso }
}
