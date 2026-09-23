// Qué le falta al tomador para poder EMITIR (spec 2026-09-21 §4bis, PR 5). Lee y descifra aquí; la
// regla es pura (`huecosParaEmitirDesdeFicha` de `@central/module-seguros`).
//
// Lo usan tres sitios: el portal (bloque «Datos para contratar» del presupuesto), la pantalla de
// Alberto (la tarjeta de presupuestos) y el correo de aviso («me faltan N datos tuyos»).
//
// 🚨 Un cifrado que no abre sale como `no_legible` y se registra: es una avería nuestra (clave PII) y
// nunca se le pide al cliente que la arregle volviendo a escribir su DNI.

import { POLIZA_ESTADOS_VIGENTES, datosDelTomador, huecosParaEmitirDesdeFicha, type DatosParaEmitir, type ValorLeido } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { campoIlegible, descifrarCampo } from './cartera-edicion'
import { fichaPropiaDe } from './contacto-portal'
import { partirDireccion } from './codeoscopic/direccion'

const VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]

const leido = (v: string | null): ValorLeido => ({ valor: descifrarCampo(v), legible: !campoIlegible(v) })
/** Para las fuentes de relleno, un cifrado roto es simplemente «no hay»: la avería se ve en la ficha. */
const abierto = (v: string | null): string | null => (campoIlegible(v) ? null : descifrarCampo(v))

/** `null` = la ficha no existe en esta correduría. Un fallo de BD sube como excepción, no como «nada falta». */
export async function datosParaEmitir(correduriaId: string, clienteId: string): Promise<DatosParaEmitir | null> {
  const db = prismaAsegura()
  const [c] = await db.$queryRaw<{
    email: string | null; dni: string | null; fechaNacimiento: string | null; direccion: string | null
    codigoPostal: string | null; iban: string | null; dniPendiente: boolean
  }[]>`
    select c.email, c.dni, c.fecha_nacimiento as "fechaNacimiento", c.direccion, c.codigo_postal as "codigoPostal",
           c.cuenta_bancaria as iban,
           exists (select 1 from documentos d where d.cliente_id = c.id and d.correduria_id = c.correduria_id
                     and d.tipo = 'dni' and d.estado = 'recibido') as "dniPendiente"
    from clientes c
    where c.id = ${clienteId}::uuid and c.correduria_id = ${correduriaId}::uuid`
  if (!c) return null

  // Lo PROPIO del tomador en sus pólizas: solo filas con su cliente_id (nunca otra persona de la póliza).
  const propios = await db.$queryRaw<{ nif: string | null; fechaNacimiento: string | null; email: string | null; iban: string | null }[]>`
    select i.nif, i.fecha_nacimiento as "fechaNacimiento", i.email, null::text as iban
    from poliza_intervinientes i
    where i.cliente_id = ${clienteId}::uuid and i.correduria_id = ${correduriaId}::uuid
    union all
    select null, null, null, p.cuenta_bancaria
    from polizas p
    where p.cliente_id = ${clienteId}::uuid and p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null and p.estado::text = any(${VIGENTES}::text[]) and p.cuenta_bancaria is not null`

  const direccion = leido(c.direccion)
  const partida = direccion.legible && direccion.valor ? partirDireccion(direccion.valor) : null
  const r = huecosParaEmitirDesdeFicha(datosDelTomador({
    email: leido(c.email),
    dni: leido(c.dni),
    fechaNacimiento: leido(c.fechaNacimiento),
    direccion,
    codigoPostal: c.codigoPostal,
    direccionCompleta: partida ? partida.nombre !== null && partida.numero !== null : false,
    iban: leido(c.iban),
    dniPendienteDeRevisar: c.dniPendiente,
  }, propios.map((p) => ({ nif: abierto(p.nif), fechaNacimiento: abierto(p.fechaNacimiento), email: abierto(p.email), iban: abierto(p.iban) }))))

  if (r.noLegibles > 0) {
    // Sin el campo ni el valor: solo que hay una clave que no abre en esa ficha.
    console.error(`[datos-emision] ${r.noLegibles} campo(s) cifrado(s) que no abren en la ficha ${clienteId}: revisa la clave PII`)
  }
  return r
}

export type DatosParaEmitirPortal =
  | ({ estado: 'ok' } & DatosParaEmitir)
  | { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'error'; causa: string }

/** Lo mismo, para el portal: la ficha la resuelve `portal_vinculo`, nunca un `clienteId` que viaje. */
export async function datosParaEmitirDePortal(correduriaId: string, identidadId: string): Promise<DatosParaEmitirPortal> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha
  const r = await datosParaEmitir(correduriaId, ficha.clienteId)
  // El vínculo apunta a una ficha que ya no está: es una avería, no «nada falta».
  if (!r) return { estado: 'error', causa: 'ficha_no_encontrada' }
  return { estado: 'ok', ...r }
}
