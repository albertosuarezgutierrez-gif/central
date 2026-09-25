// Felicitar el cumpleaños a los clientes EN VIGOR (Alberto, 24/09/2026: «felicitar por mail y app
// los cumpleaños»). Corre en asegura porque la fecha de nacimiento va cifrada y solo aquí está la
// clave. Deja una fila en `felicitacion` por persona y año: es el sello (no se repite) y lo que la
// campana del portal lee ese día para felicitar también dentro de la app.
//
// Reglas:
//  - Solo cartera EN VIGOR (`WHERE_CARTERA_EN_VIGOR`) y personas físicas: nunca los 32.520 leads
//    del volcado ni una sociedad.
//  - Apagado por defecto: sin `ASEGURA_FELICITACIONES_ACTIVAS=1` se cuenta y no se escribe nada.
//    Es un correo automático a clientes; lo enciende Alberto.
//  - La fila se RESERVA antes de enviar (`on conflict do nothing`): dos pasadas solapadas no
//    mandan dos correos. Si el correo no sale, la fila pasa a `solo_app` y se felicita en el portal.
//  - Baja de correo (`email_opt_out_at`) o sin correo → solo en la app.
import { anioCumpleanos, diaMadrid, esCumpleanos, WHERE_CARTERA_EN_VIGOR } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'
import { destinatarioDeCliente } from './avisos-vencimiento'
import { enlacePortal } from './avisos-intranet-reglas'
import { enviarFelicitacion } from './correo-felicitacion'

export type ResumenFelicitaciones = {
  cumpleHoy: number
  enviados: number
  soloApp: number
  yaFelicitados: number
  ilegibles: number
  fallidos: number
  soloContar: boolean
}

export function felicitacionesActivas(env: string | undefined = process.env.ASEGURA_FELICITACIONES_ACTIVAS): boolean {
  return env?.trim() === '1'
}

/** Nombre de pila para el saludo; un centinela del volcado («Lead») no es un nombre. */
function nombreDePila(nombre: string | null): string | null {
  const n = nombre?.trim().split(/\s+/)[0] ?? ''
  if (!n || /^lead$/i.test(n)) return null
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

export async function felicitarCumpleanos(
  correduriaId: string,
  opciones: { ahora?: Date; forzarContar?: boolean } = {},
): Promise<ResumenFelicitaciones> {
  const ahora = opciones.ahora ?? new Date()
  const soloContar = !felicitacionesActivas() || (opciones.forzarContar ?? false)
  const enlace = enlacePortal()
  if (!enlace) throw new Error('sin_portal')

  const db = prismaAsegura()
  const titulares = await db.poliza.findMany({
    where: { correduriaId, ...WHERE_CARTERA_EN_VIGOR, mergedIntoPolizaId: null },
    select: { clienteId: true },
    distinct: ['clienteId'],
  })
  const fichas = titulares.length === 0 ? [] : await db.cliente.findMany({
    where: { id: { in: titulares.map((t) => t.clienteId) }, correduriaId, mergedIntoClienteId: null, NOT: { tipoPersona: 'juridica' } },
    select: {
      id: true, nombre: true, fechaNacimiento: true, emailOptOutAt: true, email: true,
      emails: { select: { email: true, esPrincipal: true, createdAt: true } },
    },
  })

  const anio = anioCumpleanos(ahora)
  // El día va como TEXTO a `::date`: con un `Date` el cast dependería del huso de la sesión.
  const dia = diaMadrid(ahora)
  const r: ResumenFelicitaciones = { cumpleHoy: 0, enviados: 0, soloApp: 0, yaFelicitados: 0, ilegibles: 0, fallidos: 0, soloContar }

  for (const f of fichas) {
    if (!f.fechaNacimiento) continue
    const fecha = descifrarCampo(f.fechaNacimiento)
    if (fecha === null) { r.ilegibles += 1; continue }
    if (!esCumpleanos(fecha, ahora)) continue
    r.cumpleHoy += 1
    if (soloContar) continue

    // Reserva: si ya hay fila este año, ya se le felicitó (u otra pasada lo está haciendo).
    const reservada = await db.$executeRaw`
      insert into felicitacion (correduria_id, cliente_id, anio, dia, canal)
      values (${correduriaId}::uuid, ${f.id}::uuid, ${anio}, ${dia}::date, 'solo_app')
      on conflict (cliente_id, anio) do nothing`
    if (reservada === 0) { r.yaFelicitados += 1; continue }

    const destino = destinatarioDeCliente(f)
    if (!destino) { r.soloApp += 1; continue }
    const res = await enviarFelicitacion(destino, { nombre: nombreDePila(f.nombre), enlace }, { correduriaId, clienteId: f.id })
    if (res === 'sin_proveedor') {
      // Avería de configuración, no del cliente: se suelta la reserva para que el reintento de hoy
      // (con la env ya puesta) sí le mande el correo. Si no, perdería su felicitación del año.
      await db.$executeRaw`delete from felicitacion where cliente_id = ${f.id}::uuid and anio = ${anio} and canal = 'solo_app'`
      throw new Error('sin_correo_configurado')
    }
    if (res !== 'enviado') { r.fallidos += 1; continue }
    r.enviados += 1
    await db.felicitacion.updateMany({ where: { clienteId: f.id, anio }, data: { canal: 'correo' } })
  }
  return r
}
