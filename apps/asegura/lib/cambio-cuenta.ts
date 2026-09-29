// El cliente pide desde el portal cambiar la cuenta de sus recibos, y Alberto la cambia en la
// compañía (29/09/2026). Alberto: «si cambia el IBAN, me avisa para yo cambiarla».
//
// 🚨 Pedirlo NO cambia la ficha: la compañía sigue cargando en la cuenta vieja hasta que Alberto se
// la cambie, así que la solicitud queda PENDIENTE (IBAN cifrado) en la cola de «Hoy». Al marcarla
// hecha se copia a `clientes.cuenta_bancaria`. El aviso a Alberto sale por el muro de actividad (el
// historial lleva `PREFIJO_HISTORIAL_CUENTA_PROPIA`), que manda Telegram en ≤5 min.
//
// La ficha la decide el VÍNCULO de la identidad (`fichaPropiaDe`), nunca un id que mande el portal.
// El IBAN en claro solo sale en `ibanDeSolicitud`, que pide Alberto a mano para teclearlo en la
// compañía, y esa consulta queda anotada.

import { encryptField } from '@central/module-seguros-pii'
import { PREFIJO_HISTORIAL_CUENTA_PROPIA } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { revisarIbanNuevo, type ResolucionCambioCuenta } from './cambio-cuenta-reglas.ts'
import { descifrarCampo } from './cartera-edicion'
import { fichaPropiaDe } from './contacto-portal'
import { mascaraCuenta } from './presupuesto-cuenta.ts'

export type ResultadoSolicitudCuenta =
  | { estado: 'ok'; mascara: string }
  | { estado: 'sin_cambios' }
  | { estado: 'iban_invalido'; motivo: string }
  | { estado: 'sin_ficha' | 'varias_fichas' }
  | { estado: 'error'; causa: string }

export async function solicitarCambioCuenta(correduriaId: string, identidadId: string, ibanBruto: unknown): Promise<ResultadoSolicitudCuenta> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha
  const db = prismaAsegura()
  const [cli] = await db.$queryRaw<{ cuenta: string | null }[]>`
    select cuenta_bancaria as cuenta from clientes where id = ${ficha.clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
  const revision = revisarIbanNuevo(ibanBruto, descifrarCampo(cli?.cuenta ?? null))
  if (!revision.ok) return revision.estado === 'sin_cambios' ? { estado: 'sin_cambios' } : { estado: 'iban_invalido', motivo: revision.motivo }

  await db.$transaction(async (tx) => {
    // Si ya había una pendiente, la nueva la sustituye: la que vale es la última que dio.
    await tx.$executeRaw`
      update cambio_cuenta_solicitud set estado = 'descartada', resuelta_at = now(), resuelta_por = 'sistema:portal',
             nota = 'Sustituida por otra solicitud del cliente'
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${ficha.clienteId}::uuid and estado = 'pendiente'`
    await tx.$executeRaw`
      insert into cambio_cuenta_solicitud (correduria_id, cliente_id, identidad_id, iban_cifrado, mascara)
      values (${correduriaId}::uuid, ${ficha.clienteId}::uuid, ${identidadId}, ${encryptField(revision.iban)}, ${revision.mascara})`
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${ficha.clienteId}::uuid, cast('contacto' as tipo_historial_interno),
              ${`${PREFIJO_HISTORIAL_CUENTA_PROPIA}: nueva cuenta ${revision.mascara}. Pendiente de cambiarla en la compañía.`})`
  })
  return { estado: 'ok', mascara: revision.mascara }
}

export type SolicitudCuenta = {
  id: string
  clienteId: string
  cliente: string | null
  mascara: string
  /** Máscara de la cuenta que tiene hoy la ficha. `null` = no tiene o no se puede leer. */
  mascaraActual: string | null
  estado: 'pendiente' | 'hecha' | 'descartada'
  pedidaEn: string
  resueltaEn: string | null
  resueltaPor: string | null
}

/** Las pendientes y las resueltas de los últimos 30 días, de la más reciente a la más antigua. */
export async function colaCambiosCuenta(correduriaId: string): Promise<SolicitudCuenta[]> {
  const filas = await prismaAsegura().$queryRaw<(Omit<SolicitudCuenta, 'mascaraActual'> & { cuentaActual: string | null })[]>`
    select s.id::text as id, s.cliente_id::text as "clienteId",
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
           s.mascara, s.estado, to_char(s.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as "pedidaEn",
           to_char(s.resuelta_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "resueltaEn", s.resuelta_por as "resueltaPor",
           c.cuenta_bancaria as "cuentaActual"
    from cambio_cuenta_solicitud s
    left join clientes c on c.id = s.cliente_id
    where s.correduria_id = ${correduriaId}::uuid
      and (s.estado = 'pendiente' or s.resuelta_at >= now() - interval '30 days')
    order by (s.estado = 'pendiente') desc, s.created_at desc
    limit 100`
  return filas.map(({ cuentaActual, ...f }) => ({ ...f, mascaraActual: mascaraCuenta(descifrarCampo(cuentaActual)) }))
}

/**
 * El IBAN completo de una solicitud PENDIENTE, para teclearlo en la compañía. Solo pendientes: una
 * resuelta ya no hace falta leerla entera. Queda en la auditoría del puerto quién lo consultó.
 */
export async function ibanDeSolicitud(
  correduriaId: string,
  id: string,
): Promise<{ estado: 'ok'; iban: string } | { estado: 'no_encontrada' } | { estado: 'ilegible' }> {
  const [f] = await prismaAsegura().$queryRaw<{ iban: string }[]>`
    select iban_cifrado as iban from cambio_cuenta_solicitud
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`
  if (!f) return { estado: 'no_encontrada' }
  anotarCambio({ entidad: 'cambio_cuenta', id, campo: 'iban_consultado', antes: null, despues: 'consultado' })
  const iban = descifrarCampo(f.iban)
  // Sin la clave (o con un cifrado roto) NO es «no existe»: es que no se puede leer aquí.
  return iban === null ? { estado: 'ilegible' } : { estado: 'ok', iban }
}

export type ResultadoResolverCuenta = { estado: 'ok' } | { estado: 'no_encontrada' }

/**
 * `hecha` = Alberto ya la cambió en la compañía: la cuenta pasa a la ficha. `descartada` = no procede
 * (la pidió por error, ya estaba…). Solo se cierra una pendiente: dos clics no la cierran dos veces.
 */
export async function resolverCambioCuenta(correduriaId: string, id: string, estado: ResolucionCambioCuenta, actor: string): Promise<ResultadoResolverCuenta> {
  const db = prismaAsegura()
  const r = await db.$transaction(async (tx) => {
    const [s] = await tx.$queryRaw<{ clienteId: string; iban: string; mascara: string; cuentaActual: string | null }[]>`
      update cambio_cuenta_solicitud s set estado = ${estado}, resuelta_at = now(), resuelta_por = ${actor}
      from clientes c
      where s.id = ${id}::uuid and s.correduria_id = ${correduriaId}::uuid and s.estado = 'pendiente' and c.id = s.cliente_id
      returning s.cliente_id::text as "clienteId", s.iban_cifrado as iban, s.mascara, c.cuenta_bancaria as "cuentaActual"`
    if (!s) return null
    if (estado === 'hecha') {
      await tx.$executeRaw`
        update clientes set cuenta_bancaria = ${s.iban}, updated_at = now()
        where id = ${s.clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
    }
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${s.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${estado === 'hecha'
                ? `Cuenta de los recibos cambiada a ${s.mascara} (cambiada en la compañía; lo marca ${actor}).`
                : `Solicitud de cambio de cuenta a ${s.mascara} descartada (${actor}).`})`
    return s
  })
  if (!r) return { estado: 'no_encontrada' }
  if (estado === 'hecha') {
    anotarCambio({ entidad: 'cliente', id: r.clienteId, campo: 'cuenta_bancaria', antes: mascaraCuenta(descifrarCampo(r.cuentaActual)), despues: r.mascara })
  }
  return { estado: 'ok' }
}
