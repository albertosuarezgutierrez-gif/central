/**
 * Lead web de CUALQUIER ramo (06/10/2026 auto/moto; 25/10/2026 todos, Alberto: «igual que coche/moto»). Plataforma acaba de dar de alta la ficha
 * con el formulario público y pide, en UNA llamada, el enlace `/datos/[token]` para el WhatsApp
 * prellenado del aviso de Telegram:
 *   1. La ficha tiene que ser apta (`fichaAptaParaEnlace`: recién creada por el formulario, sin DNI
 *      ni nacimiento). Una ficha que YA EXISTÍA (25/10/2026, venta cruzada) también, pero con `existente: true` y
 *      a CIEGAS: se pide todo como si la ficha no supiera nada y la página no trae nada relleno
 *      (`creada_por = ACTOR_ENLACE_WEB`), porque el formulario es anónimo y el enlace va al móvil TECLEADO.
 *   2. Se abre la oportunidad con `crearOportunidad` (origen `web:lead`, fuente `web`, estado
 *      `pendiente_cliente`, tarea de WhatsApp para hoy) con TOPE DIARIO global contado en BD, bajo
 *      cerrojo y en la misma transacción. Si ya había una abierta del ramo (409 `duplicada`), se usa esa.
 *   3. La solicitud se escribe DENTRO de la transacción del alta (`trasCrear` → `insertarSolicitud`, el
 *      único sitio que genera tokens): o quedan la oportunidad y la solicitud, o ninguna (ni cuenta para el
 *      tope). Con una oportunidad que ya estaba (409 `duplicada`), no se toca: solo `crearSolicitud`, que
 *      devuelve la viva sin token si existe (idempotente).
 * El token en claro solo sale en la respuesta (`url`); ni se loguea ni se guarda (en BD, su SHA-256).
 * `auditado()` guarda el CUERPO de la petición, no el de la respuesta.
 *
 * El SQL crudo NO prefija `seguros.`: la conexión ya trae `?schema=seguros`.
 */
import { NADA_CONOCIDO, camposSolicitud, diaMadrid, nombreRamoSolicitud, ramoSolicitud, type RamoSolicitud } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { crearOportunidad, ORIGEN_LEAD_WEB } from './oportunidad-seguimiento'
import { ACTOR_ENLACE_WEB, camposParaPersona, crearSolicitud, insertarSolicitud, urlPortalSolicitud } from './solicitud-datos'
import { fichaAptaParaEnlace, TOPE_DIARIO_LEADS_WEB } from './lead-web-regla'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultadoLeadWebSolicitud =
  | { ok: true; oportunidadId: string; url: string | null; ramo: RamoSolicitud }
  | { ok: false; estado: 'invalido' | 'no_apta' | 'tope' | 'no_encontrado' | 'conflicto' | 'sin_migracion'; motivo: string; status: 404 | 409 | 422 | 429 | 503 }

/** Postgres 23514 = CHECK violado: el de `solicitud_datos.ramo` sin el SQL del 25/10/2026 (solo admite auto/moto). */
function esCheckRamo(e: unknown): boolean {
  const t = e instanceof Error ? e.message : String(e)
  return /23514|solicitud_datos_ramo_check/.test(t)
}

const SIN_MIGRACION = {
  ok: false as const, estado: 'sin_migracion' as const, status: 503 as const,
  motivo: 'Falta el SQL 2026-10-25_solicitud_datos_todos_ramos.sql: este ramo aún no admite enlace de datos.',
}

export async function solicitudParaLeadWeb(
  correduriaId: string,
  clienteId: unknown,
  ramoEntrada: unknown,
  actor: string,
  /** La ficha ya existía (409 forzable del alta): oportunidad + enlace a CIEGAS (venta cruzada). */
  existente = false,
): Promise<ResultadoLeadWebSolicitud> {
  if (typeof clienteId !== 'string' || !UUID.test(clienteId)) return { ok: false, estado: 'invalido', motivo: 'id de cliente no válido', status: 422 }
  const ramo = ramoSolicitud(ramoEntrada)
  if (!ramo) return { ok: false, estado: 'invalido', motivo: 'Ramo no válido para el enlace de datos.', status: 422 }
  // El enlace del formulario anónimo se crea SIEMPRE con este actor: es lo que hace que la página no traiga nada relleno.
  if (actor !== ACTOR_ENLACE_WEB) return { ok: false, estado: 'invalido', motivo: 'actor no válido para el lead web', status: 422 }

  // `clientes.created_at` es timestamp SIN zona, escrito en UTC.
  const [f] = await prismaAsegura().$queryRaw<{ fuente: string | null; sinDni: boolean; sinNacimiento: boolean; fusionada: boolean; horas: number }[]>(Prisma.sql`
    select fuente::text as fuente, dni is null as "sinDni", fecha_nacimiento is null as "sinNacimiento",
           merged_into_cliente_id is not null as fusionada,
           extract(epoch from ((now() at time zone 'UTC') - created_at))::float8 / 3600 as horas
    from clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`)
  if (!f) return { ok: false, estado: 'no_encontrado', motivo: 'Esa ficha no es de esta correduría.', status: 404 }
  if (existente) {
    // Ficha fusionada: el alta tendría que haber devuelto la superviviente; no se adivina cuál.
    if (f.fusionada) return { ok: false, estado: 'no_apta', motivo: 'Esa ficha está fusionada en otra.', status: 409 }
  } else if (!fichaAptaParaEnlace({ fuente: f.fuente, sinDni: f.sinDni, sinNacimiento: f.sinNacimiento, fusionada: f.fusionada, horasDesdeAlta: f.horas })) {
    return { ok: false, estado: 'no_apta', motivo: 'Solo una ficha recién creada por el formulario, sin datos de identidad, recibe el enlace automático.', status: 409 }
  }

  // Lo que se pide se calcula ANTES de abrir nada: si la ficha no se puede leer, no se crea la oportunidad.
  // Ficha que ya existía: a ciegas (la página no puede revelar qué sabe su ficha).
  const campos = existente ? camposSolicitud(ramo, NADA_CONOCIDO) : await camposParaPersona(correduriaId, clienteId, ramo)
  if (!campos) return { ok: false, estado: 'no_encontrado', motivo: 'No se encuentra la ficha.', status: 404 }

  let nueva: { token: string | null } | null = null
  const nombre = nombreRamoSolicitud(ramo)
  let o: Awaited<ReturnType<typeof crearOportunidad>>
  try {
    o = await crearOportunidad(
      correduriaId,
      clienteId,
      {
        ramo,
        estado: 'pendiente_cliente',
        tipoTarea: 'whatsapp',
        prioridadTarea: 'alta',
        fechaTarea: diaMadrid(new Date()),
        // Neutra: cuando se escribe esto aún no se sabe si el WhatsApp con el enlace llegará a salir.
        nota: existente
          ? `Lead web de ${nombre} de una ficha que YA EXISTÍA (venta cruzada): formulario de datos generado a ciegas (no trae nada de su ficha). Comprueba que el teléfono del lead es suyo antes de mandarlo.`
          : `Lead web de ${nombre}: formulario de datos generado; si el cliente no lo recibió, anúlalo y pide datos de nuevo desde la oportunidad.`,
      },
      actor,
      {
        origen: ORIGEN_LEAD_WEB,
        desdeServidor: true,
        fuente: 'web',
        accionHistorial: 'creada_web',
        topeDiario: TOPE_DIARIO_LEADS_WEB,
        trasCrear: async (tx, oportunidadId) => {
          const s = await insertarSolicitud(tx, {
            correduriaId, oportunidadId, personaId: clienteId, ramo, campos, actor, tercero: false, estadoOportunidad: 'pendiente_cliente',
          })
          nueva = { token: s.token }
        },
      },
    )
  } catch (e) {
    // Sin el SQL del CHECK de ramo, la transacción entera (oportunidad incluida) se deshace: como antes del 25/10.
    if (esCheckRamo(e)) return SIN_MIGRACION
    throw e
  }
  if (o.ok) {
    const token = (nueva as { token: string | null } | null)?.token ?? null
    return { ok: true, oportunidadId: o.id, url: token ? urlPortalSolicitud(token) : null, ramo }
  }
  if (o.estado === 'tope') return { ok: false, estado: 'tope', motivo: o.motivo, status: 429 }
  if (o.estado !== 'duplicada') return { ok: false, estado: o.estado === 'no_encontrado' ? 'no_encontrado' : 'invalido', motivo: o.motivo, status: o.status === 404 ? 404 : 422 }

  // Ya había una abierta del ramo: no se toca; solo se le pide (o se reutiliza) la solicitud.
  const oportunidadId = o.id
  let s: Awaited<ReturnType<typeof crearSolicitud>>
  try {
    s = await crearSolicitud(correduriaId, oportunidadId, actor, null, { fichaCiega: existente })
  } catch (e) {
    if (esCheckRamo(e)) return SIN_MIGRACION
    throw e
  }
  if (!s.ok) return { ok: false, estado: s.estado, motivo: s.motivo, status: s.status }
  // Viva de antes (`token: null`): su enlace no se puede volver a dar → sin URL (el aviso sale sin enlace).
  return { ok: true, oportunidadId, url: s.token ? urlPortalSolicitud(s.token) : null, ramo }
}
