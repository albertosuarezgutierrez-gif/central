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
import { ibanValido, POLIZA_ESTADOS_VIGENTES } from '@central/module-seguros'
import { PREFIJO_HISTORIAL_CUENTA_PROPIA } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { cuentaParaComparar, presupuestoFirmadoEnOtraCuenta, revisarIbanNuevo, textoHistorialCuentaFicha, type ResolucionCambioCuenta } from './cambio-cuenta-reglas.ts'
import { descifrarCampo } from './cartera-edicion'
import { fichaPropiaDe } from './contacto-portal'
import { mascaraCuenta } from './presupuesto-cuenta.ts'

export type ResultadoSolicitudCuenta =
  | { estado: 'ok'; mascara: string }
  | { estado: 'sin_cambios' }
  | { estado: 'iban_invalido'; motivo: string }
  | { estado: 'sin_ficha' | 'varias_fichas' }
  | { estado: 'error'; causa: string }

export async function solicitarCambioCuenta(
  correduriaId: string,
  identidadId: string,
  ibanBruto: unknown,
  identidadCreadaEn: Date | null,
): Promise<ResultadoSolicitudCuenta> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha
  const db = prismaAsegura()
  const [cli] = await db.$queryRaw<{ cuenta: string | null }[]>`
    select cuenta_bancaria as cuenta from clientes where id = ${ficha.clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
  // La ficha puede llevar otra cuenta que sus pólizas (la de lo nuevo): «ya es la tuya» solo si todas coinciden.
  const polizas = await db.$queryRaw<{ cuenta: string | null }[]>`
    select cuenta_bancaria as cuenta from polizas
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${ficha.clienteId}::uuid
      and merged_into_poliza_id is null and sustituida_at is null
      and estado::text = any(${[...POLIZA_ESTADOS_VIGENTES] as string[]}::text[])`
  const revision = revisarIbanNuevo(ibanBruto, cuentaParaComparar(descifrarCampo(cli?.cuenta ?? null), polizas.map((p) => descifrarCampo(p.cuenta))))
  if (!revision.ok) return revision.estado === 'sin_cambios' ? { estado: 'sin_cambios' } : { estado: 'iban_invalido', motivo: revision.motivo }

  await db.$transaction(async (tx) => {
    // En fila por cliente: dos peticiones a la vez (doble clic, dos accesos de la misma ficha) no
    // pueden chocar contra el índice de «una pendiente por cliente».
    await tx.$queryRaw`select 1 from clientes where id = ${ficha.clienteId}::uuid and correduria_id = ${correduriaId}::uuid for update`
    // Si ya había una pendiente, la nueva la sustituye: la que vale es la última que dio.
    await tx.$executeRaw`
      update cambio_cuenta_solicitud set estado = 'descartada', resuelta_at = now(), resuelta_por = 'sistema:portal',
             nota = 'Sustituida por otra solicitud del cliente'
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${ficha.clienteId}::uuid and estado = 'pendiente'`
    await tx.$executeRaw`
      insert into cambio_cuenta_solicitud (correduria_id, cliente_id, identidad_id, identidad_creada_en, iban_cifrado, mascara)
      values (${correduriaId}::uuid, ${ficha.clienteId}::uuid, ${identidadId}::uuid, ${identidadCreadaEn}::timestamptz,
              ${encryptField(revision.iban)}, ${revision.mascara})`
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
  /** Días que tenía el acceso al portal al pedirla. `null` = no consta. Uno reciente es la señal de riesgo. */
  diasAcceso: number | null
  resueltaEn: string | null
  resueltaPor: string | null
}

/** Las pendientes y las resueltas de los últimos 30 días, de la más reciente a la más antigua. */
export async function colaCambiosCuenta(correduriaId: string): Promise<SolicitudCuenta[]> {
  const filas = await prismaAsegura().$queryRaw<(Omit<SolicitudCuenta, 'mascaraActual'> & { cuentaActual: string | null })[]>`
    select s.id::text as id, s.cliente_id::text as "clienteId",
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
           s.mascara, s.estado, to_char(s.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as "pedidaEn",
           case when s.identidad_creada_en is null then null
                else floor(extract(epoch from (s.created_at - s.identidad_creada_en)) / 86400)::int end as "diasAcceso",
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
    // Mismo orden de bloqueo que `solicitarCambioCuenta` (primero la ficha, luego la solicitud): en
    // orden inverso, pedir y resolver a la vez podrían interbloquearse.
    const [base] = await tx.$queryRaw<{ clienteId: string }[]>`
      select cliente_id::text as "clienteId" from cambio_cuenta_solicitud
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`
    if (!base) return null
    // La ficha que queda viva: si se fusionó entre la petición y ahora, la cuenta va a la SUPERVIVIENTE.
    const [viva] = await tx.$queryRaw<{ id: string; cuenta: string | null }[]>`
      select id::text as id, cuenta_bancaria as cuenta from clientes
      where correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null
        and id = coalesce((select merged_into_cliente_id from clientes where id = ${base.clienteId}::uuid), ${base.clienteId}::uuid)
      for update`
    const [s] = await tx.$queryRaw<{ iban: string; mascara: string }[]>`
      update cambio_cuenta_solicitud set estado = ${estado}, resuelta_at = now(), resuelta_por = ${actor}
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'
      returning iban_cifrado as iban, mascara`
    if (!s) return null
    if (estado === 'hecha') {
      if (!viva) throw new Error('la ficha del cliente no se pudo actualizar con la cuenta')
      await tx.$executeRaw`
        update clientes set cuenta_bancaria = ${s.iban}, updated_at = now()
        where id = ${viva.id}::uuid and correduria_id = ${correduriaId}::uuid`
      // Y en sus pólizas vigentes: la emisión y la retarificación leen primero la cuenta de la póliza,
      // y «hecha» significa que ya se cambió en la compañía. CIMA la volverá a traer igual.
      await tx.$executeRaw`
        update polizas set cuenta_bancaria = ${s.iban}
        where correduria_id = ${correduriaId}::uuid and merged_into_poliza_id is null and sustituida_at is null
          and estado::text = any(${[...POLIZA_ESTADOS_VIGENTES] as string[]}::text[])
          and cliente_id = ${viva.id}::uuid`
    }
    const clienteId = viva?.id ?? base.clienteId
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${estado === 'hecha'
                ? `Cuenta de los recibos cambiada a ${s.mascara} (cambiada en la compañía; lo marca ${actor}).`
                : `Solicitud de cambio de cuenta a ${s.mascara} descartada (${actor}).`})`
    return { clienteId, mascara: s.mascara, cuentaActual: viva?.cuenta ?? null }
  })
  if (!r) return { estado: 'no_encontrada' }
  if (estado === 'hecha') {
    anotarCambio({ entidad: 'cliente', id: r.clienteId, campo: 'cuenta_bancaria', antes: mascaraCuenta(descifrarCampo(r.cuentaActual)), despues: r.mascara })
  }
  return { estado: 'ok' }
}

// ─── La cuenta de la FICHA, puesta por el corredor (29/09/2026) ─────────────────────────────────
// Alberto recibe la cuenta del cliente (foto de la cartilla, WhatsApp) y la necesita en la ficha para
// emitir: la emisión y el bot de Telegram la leen de ahí (`codeoscopic/cuenta-ficha.ts`). Hasta hoy
// solo entraba por el portal (el cliente) o tecleada en la pantalla de emisión, que no la guardaba.
//
// 🚨 Solo la FICHA: a diferencia de «hecha» (que ya se cambió en la compañía), aquí no se sabe nada de
// la compañía, así que las pólizas vigentes conservan la suya. Y el IBAN no vuelve nunca en claro.

export type CuentaFichaVista =
  | { estado: 'ok'; mascara: string | null; ilegible: boolean; invalida: boolean }
  | { estado: 'no_encontrado' }

/** Distinta de `codeoscopic/cuenta-ficha.ts::cuentaDeFicha` (la que usa la emisión): esta solo enseña. */
export async function cuentaFichaVista(correduriaId: string, clienteId: string): Promise<CuentaFichaVista> {
  const [c] = await prismaAsegura().$queryRaw<{ cuenta: string | null }[]>`
    select cuenta_bancaria as cuenta from clientes
    where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
  if (!c) return { estado: 'no_encontrado' }
  const leida = descifrarCampo(c.cuenta)
  // Sin clave (fuera de producción) el cifrado puede volver tal cual: eso no es una cuenta.
  const claro = leida !== null && leida.startsWith('v1:') ? null : leida
  const guardada = c.cuenta !== null && c.cuenta.trim() !== ''
  return {
    estado: 'ok',
    mascara: mascaraCuenta(claro),
    ilegible: guardada && claro === null,
    // Un CCC viejo del volcado se enmascara igual, pero la emisión lo descarta: decirlo.
    invalida: claro !== null && !ibanValido(claro),
  }
}

export type ResultadoCuentaFicha =
  | { estado: 'ok'; mascara: string }
  | { estado: 'sin_cambios' }
  | { estado: 'iban_invalido'; motivo: string }
  | { estado: 'presupuesto_firmado'; mascara: string }
  | { estado: 'no_encontrado' }

export async function ponerCuentaFicha(correduriaId: string, clienteId: string, ibanBruto: unknown, actor: string): Promise<ResultadoCuentaFicha> {
  const r = await prismaAsegura().$transaction(async (tx) => {
    const [c] = await tx.$queryRaw<{ cuenta: string | null }[]>`
      select cuenta_bancaria as cuenta from clientes
      where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null
      for update`
    if (!c) return { estado: 'no_encontrado' as const }
    const leida = descifrarCampo(c.cuenta)
    // Sin clave el cifrado puede volver tal cual: eso no es una cuenta (ni para comparar ni para el historial).
    const actual = leida !== null && leida.startsWith('v1:') ? null : leida
    const revision = revisarIbanNuevo(ibanBruto, actual)
    if (!revision.ok) return revision.estado === 'sin_cambios' ? { estado: 'sin_cambios' as const } : { estado: 'iban_invalido' as const, motivo: revision.motivo }
    // Un presupuesto aceptado sin emitir con cuenta NUEVA guarda su IBAN solo aquí: no se pisa con otra.
    const firmadas = await tx.$queryRaw<{ mascara: string | null }[]>`
      select mascara from (
        select distinct on (p.id) ev.detalle->'cuenta'->>'origen' as origen, ev.detalle->'cuenta'->>'mascara' as mascara
        from presupuesto p
        join presupuesto_evento ev on ev.presupuesto_id = p.id and ev.tipo = 'aceptado'
        where p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid
          and p.aceptado_at is not null and p.emitido_at is null and p.retirado_at is null
        order by p.id, ev.ocurrido_at desc
      ) x where origen = 'nueva'`
    const firmada = presupuestoFirmadoEnOtraCuenta(firmadas.map((f) => f.mascara), revision.mascara)
    if (firmada !== null) return { estado: 'presupuesto_firmado' as const, mascara: firmada }
    await tx.$executeRaw`
      update clientes set cuenta_bancaria = ${encryptField(revision.iban)}, updated_at = now()
      where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
    const antes = mascaraCuenta(actual)
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${textoHistorialCuentaFicha({ mascara: revision.mascara, antes, antesIlegible: c.cuenta !== null && c.cuenta.trim() !== '' && actual === null, actor })})`
    return { estado: 'ok' as const, mascara: revision.mascara, antes }
  })
  if (r.estado !== 'ok') return r
  anotarCambio({ entidad: 'cliente', id: clienteId, campo: 'cuenta_bancaria', antes: r.antes, despues: r.mascara })
  return { estado: 'ok', mascara: r.mascara }
}
