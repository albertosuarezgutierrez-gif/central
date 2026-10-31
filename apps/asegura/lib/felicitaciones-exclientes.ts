// Felicitación de cumpleaños a EX-CLIENTES (Alberto, 30/10/2026). Reglas puras y su porqué en
// `felicitaciones-exclientes-reglas.ts`; el texto, en `correo-felicitacion.ts` (mismo envoltorio).
//
//  - Puerta `ASEGURA_FELICITACIONES_EXCLIENTES`: sin valor → NADA (ni se lee la BD); `aprobar` → reserva la fila
//    como `pendiente_ok` y manda a Alberto por Telegram el texto con ✅ Enviar / ❌ Descartar (prefijo `fex`, lo
//    enruta el webhook de plataforma a `POST /api/operador/felicitaciones/exclientes`); `auto` → envía.
//  - Idempotencia: la MISMA reserva por persona y año de `felicitacion` (`on conflict (cliente_id, anio) do nothing`):
//    quien ya tiene fila este año (felicitado como cliente, propuesto o descartado) no se vuelve a tocar.
//  - Requiere la migración `prisma/sql/2026-10-30_felicitacion_exclientes.sql` (columna `variante` y canales nuevos).
//    Sin ella, el modo encendido falla con `felicitacion_sin_migracion` antes de escribir nada.
//  - Solo con email válido y sin baja (`destinatarioDeCliente`): aquí no hay «solo en la app».
//
// Imports de BD/correo/Telegram DINÁMICOS: con la puerta apagada no se carga nada (y `node --test` lo comprueba).
import { anioCumpleanos, diaMadrid, esCumpleanos, WHERE_CARTERA_EN_VIGOR } from '@central/module-seguros'
import {
  botonesExcliente, ENV_EXCLIENTES, iniciales, modoExclientes, nombreDePila, propuestaDelDia, textoPropuestaTelegram, varianteExcliente,
  type DecisionFex, type ModoExclientes, type VarianteExcliente,
} from './felicitaciones-exclientes-reglas.ts'

export type ResumenExclientes = {
  modo: ModoExclientes
  cumpleHoy: number
  exCliente: number
  posibleCliente: number
  propuestos: number
  enviados: number
  yaFelicitados: number
  sinCorreo: number
  ilegibles: number
  fallidos: number
  soloContar: boolean
}

/** Valor de la puerta: de `env` si se pasa (tests), si no de `process.env`. Ausente = apagado. */
function leerModo(env?: Record<string, string | undefined>): ModoExclientes {
  return modoExclientes((env ?? process.env)[ENV_EXCLIENTES] ?? '')
}

async function hayMigracion(db: { $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown> }): Promise<boolean> {
  const filas = (await db.$queryRaw`
    select 1 from information_schema.columns
    where table_schema = 'seguros' and table_name = 'felicitacion' and column_name = 'variante'`) as unknown[]
  return filas.length > 0
}

const SELECT_FICHA = {
  id: true, nombre: true, apellidos: true, fechaNacimiento: true, emailOptOutAt: true, email: true,
  emails: { select: { email: true, esPrincipal: true, createdAt: true } },
  polizas: { where: { mergedIntoPolizaId: null }, select: { importRef: true, eiacXmlHash: true, estado: true, sustituidaAt: true } },
} as const

export async function felicitarExclientes(
  correduriaId: string,
  opciones: { ahora?: Date; forzarContar?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<ResumenExclientes> {
  const modo = leerModo(opciones.env)
  const soloContar = opciones.forzarContar ?? false
  const r: ResumenExclientes = { modo, cumpleHoy: 0, exCliente: 0, posibleCliente: 0, propuestos: 0, enviados: 0, yaFelicitados: 0, sinCorreo: 0, ilegibles: 0, fallidos: 0, soloContar }
  // 🚨 Puerta cerrada: ni BD ni correo ni Telegram.
  if (modo === 'apagado') return r

  const { prismaAsegura } = await import('./asegura-db')
  const { descifrarCampo } = await import('./cartera-edicion')
  const { destinatarioDeCliente } = await import('./avisos-vencimiento-reglas')
  const { enlacePortal } = await import('./avisos-intranet-reglas')
  const { cuerpoFelicitacionExcliente, enviarFelicitacionExcliente } = await import('./correo-felicitacion')
  const { tgSendButtons } = await import('@central/core-telegram')

  const ahora = opciones.ahora ?? new Date()
  const enlace = enlacePortal()
  if (!enlace) throw new Error('sin_portal')
  const db = prismaAsegura()
  if (!soloContar && !(await hayMigracion(db))) throw new Error('felicitacion_sin_migracion')

  // Persona física (tipo_persona IS DISTINCT FROM 'juridica'), no fusionada, con alguna póliza y NINGUNA en vigor.
  const fichas = await db.cliente.findMany({
    where: {
      correduriaId, mergedIntoClienteId: null, emailOptOutAt: null, fechaNacimiento: { not: null },
      AND: [
        { OR: [{ tipoPersona: null }, { NOT: { tipoPersona: 'juridica' } }] },
        { polizas: { some: { mergedIntoPolizaId: null } } },
        { polizas: { none: { mergedIntoPolizaId: null, ...WHERE_CARTERA_EN_VIGOR } } },
      ],
    },
    select: SELECT_FICHA,
  })

  const anio = anioCumpleanos(ahora)
  const dia = diaMadrid(ahora)
  for (const f of fichas) {
    // Red: la regla pura vuelve a decidir con TODAS sus pólizas (null = en vigor o sin pólizas → no es de aquí).
    const variante = varianteExcliente(f.polizas)
    if (!variante || !f.fechaNacimiento) continue
    const fecha = descifrarCampo(f.fechaNacimiento)
    if (fecha === null) { r.ilegibles += 1; continue }
    if (!esCumpleanos(fecha, ahora)) continue
    const destino = destinatarioDeCliente(f)
    if (!destino) { r.sinCorreo += 1; continue }
    r.cumpleHoy += 1
    if (variante === 'ex_cliente') r.exCliente += 1
    else r.posibleCliente += 1
    if (soloContar) continue

    const canal = modo === 'aprobar' ? 'pendiente_ok' : 'enviando'
    const reservada = await db.$executeRaw`
      insert into felicitacion (correduria_id, cliente_id, anio, dia, canal, variante)
      values (${correduriaId}::uuid, ${f.id}::uuid, ${anio}, ${dia}::date, ${canal}, ${variante})
      on conflict (cliente_id, anio) do nothing`
    if (reservada === 0) { r.yaFelicitados += 1; continue }
    const nombre = nombreDePila(f.nombre)

    if (modo === 'aprobar') {
      const c = cuerpoFelicitacionExcliente({ nombre, enlace, variante })
      const msg = await tgSendButtons(
        textoPropuestaTelegram({ nombre, iniciales: iniciales(f.nombre, f.apellidos), variante, texto: c.texto }),
        botonesExcliente(f.id, anio),
      )
      if (msg === null) {
        // Sin Telegram no hay botón que pulsar: se suelta la reserva para que la pasada de la tarde lo reintente.
        await db.$executeRaw`delete from felicitacion where cliente_id = ${f.id}::uuid and anio = ${anio} and canal = 'pendiente_ok'`
        r.fallidos += 1
        continue
      }
      r.propuestos += 1
      continue
    }

    const res = await enviarFelicitacionExcliente(destino, { nombre, enlace, variante }, { correduriaId, clienteId: f.id, anio })
    if (res === 'sin_proveedor') {
      await db.$executeRaw`delete from felicitacion where cliente_id = ${f.id}::uuid and anio = ${anio} and canal = 'enviando'`
      throw new Error('sin_correo_configurado')
    }
    const final = res === 'enviado' ? 'correo' : 'solo_app'
    await db.$executeRaw`update felicitacion set canal = ${final} where cliente_id = ${f.id}::uuid and anio = ${anio} and canal = 'enviando'`
    if (res === 'enviado') r.enviados += 1
    else r.fallidos += 1
  }
  return r
}

// ─── El botón de Telegram (lo reenvía plataforma) ────────────────────────────

export type ResultadoDecisionFex =
  | { estado: 'enviada' | 'descartada'; variante: VarianteExcliente | null }
  | { estado: 'sin_cambios'; canal: string | null }
  | { estado: 'caducada' | 'ya_no_aplica' | 'sin_destino' | 'fallida' | 'puerta_cerrada' | 'sin_correo_configurado' | 'sin_portal' }

/**
 * ✅ envía (reclamando la fila `pendiente_ok` → `enviando` ANTES de mandar: un doble clic no manda dos) o ❌
 * descarta. Se re-comprueba todo en el momento: puerta abierta, mismo día, sigue sin cartera en vigor, email y baja.
 */
export async function decidirFelicitacionExcliente(
  correduriaId: string,
  d: DecisionFex,
  opciones: { ahora?: Date; env?: Record<string, string | undefined> } = {},
): Promise<ResultadoDecisionFex> {
  // Descartar siempre se puede; enviar, solo con la puerta abierta (se cerró después de proponer = no sale).
  if (d.decision === 'ok' && leerModo(opciones.env) === 'apagado') return { estado: 'puerta_cerrada' }
  const { prismaAsegura } = await import('./asegura-db')
  const db = prismaAsegura()
  const donde = (canal: string) => db.$executeRaw`
    update felicitacion set canal = ${canal}
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${d.clienteId}::uuid and anio = ${d.anio} and canal = 'pendiente_ok'`
  const leer = async () => (await db.$queryRaw<{ canal: string; dia: string; variante: string | null }[]>`
    select canal, to_char(dia, 'YYYY-MM-DD') as dia, variante from felicitacion
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${d.clienteId}::uuid and anio = ${d.anio}`)[0] ?? null

  if (d.decision === 'no') {
    if ((await donde('descartada')) === 1) return { estado: 'descartada', variante: null }
    return { estado: 'sin_cambios', canal: (await leer())?.canal ?? null }
  }

  const fila = await leer()
  if (!fila || fila.canal !== 'pendiente_ok') return { estado: 'sin_cambios', canal: fila?.canal ?? null }
  const ahora = opciones.ahora ?? new Date()
  if (!propuestaDelDia(fila.dia, diaMadrid(ahora))) {
    await donde('descartada')
    return { estado: 'caducada' }
  }
  const { enlacePortal } = await import('./avisos-intranet-reglas')
  const enlace = enlacePortal()
  if (!enlace) return { estado: 'sin_portal' }
  if ((await donde('enviando')) !== 1) return { estado: 'sin_cambios', canal: (await leer())?.canal ?? null }

  const fijar = (canal: string) => db.$executeRaw`
    update felicitacion set canal = ${canal}
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${d.clienteId}::uuid and anio = ${d.anio} and canal = 'enviando'`
  const ficha = await db.cliente.findFirst({
    where: { id: d.clienteId, correduriaId, mergedIntoClienteId: null, OR: [{ tipoPersona: null }, { NOT: { tipoPersona: 'juridica' } }] },
    select: SELECT_FICHA,
  })
  const variante = ficha ? varianteExcliente(ficha.polizas) : null
  if (!ficha || !variante) { await fijar('descartada'); return { estado: 'ya_no_aplica' } }
  const { destinatarioDeCliente } = await import('./avisos-vencimiento-reglas')
  const destino = destinatarioDeCliente(ficha)
  if (!destino) { await fijar('solo_app'); return { estado: 'sin_destino' } }

  const { enviarFelicitacionExcliente } = await import('./correo-felicitacion')
  const res = await enviarFelicitacionExcliente(destino, { nombre: nombreDePila(ficha.nombre), enlace, variante }, { correduriaId, clienteId: ficha.id, anio: d.anio })
  if (res === 'sin_proveedor') {
    // Avería de configuración: vuelve a pendiente para que el mismo botón sirva cuando esté arreglado.
    await fijar('pendiente_ok')
    return { estado: 'sin_correo_configurado' }
  }
  if (res !== 'enviado') { await fijar('solo_app'); return { estado: 'fallida' } }
  await fijar('correo')
  return { estado: 'enviada', variante }
}
