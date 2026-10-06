/**
 * Lead web de AUTO/MOTO (06/10/2026, Alberto: automático). Plataforma acaba de dar de alta la ficha
 * con el formulario público y pide, en UNA llamada, el enlace `/datos/[token]` para el WhatsApp
 * prellenado del aviso de Telegram:
 *   1. La ficha tiene que ser apta (`fichaAptaParaEnlace`: recién creada por el formulario, sin DNI
 *      ni nacimiento). Una ficha que ya existía NUNCA recibe enlace automático.
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
import { diaMadrid, ramoSolicitud, type RamoSolicitud } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { crearOportunidad, ORIGEN_LEAD_WEB } from './oportunidad-seguimiento'
import { camposParaPersona, crearSolicitud, insertarSolicitud, urlPortalSolicitud } from './solicitud-datos'
import { fichaAptaParaEnlace, TOPE_DIARIO_LEADS_WEB } from './lead-web-regla'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultadoLeadWebSolicitud =
  | { ok: true; oportunidadId: string; url: string | null; ramo: RamoSolicitud }
  | { ok: false; estado: 'invalido' | 'no_apta' | 'tope' | 'no_encontrado' | 'conflicto'; motivo: string; status: 404 | 409 | 422 | 429 }

export async function solicitudParaLeadWeb(
  correduriaId: string,
  clienteId: unknown,
  ramoEntrada: unknown,
  actor: string,
): Promise<ResultadoLeadWebSolicitud> {
  if (typeof clienteId !== 'string' || !UUID.test(clienteId)) return { ok: false, estado: 'invalido', motivo: 'id de cliente no válido', status: 422 }
  const ramo = ramoSolicitud(ramoEntrada)
  if (!ramo) return { ok: false, estado: 'invalido', motivo: 'El enlace de datos es solo para auto y moto.', status: 422 }

  // `clientes.created_at` es timestamp SIN zona, escrito en UTC.
  const [f] = await prismaAsegura().$queryRaw<{ fuente: string | null; sinDni: boolean; sinNacimiento: boolean; fusionada: boolean; horas: number }[]>(Prisma.sql`
    select fuente::text as fuente, dni is null as "sinDni", fecha_nacimiento is null as "sinNacimiento",
           merged_into_cliente_id is not null as fusionada,
           extract(epoch from ((now() at time zone 'UTC') - created_at))::float8 / 3600 as horas
    from clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`)
  if (!f) return { ok: false, estado: 'no_encontrado', motivo: 'Esa ficha no es de esta correduría.', status: 404 }
  if (!fichaAptaParaEnlace({ fuente: f.fuente, sinDni: f.sinDni, sinNacimiento: f.sinNacimiento, fusionada: f.fusionada, horasDesdeAlta: f.horas })) {
    return { ok: false, estado: 'no_apta', motivo: 'Solo una ficha recién creada por el formulario, sin datos de identidad, recibe el enlace automático.', status: 409 }
  }

  // Lo que se pide se calcula ANTES de abrir nada: si la ficha no se puede leer, no se crea la oportunidad.
  const campos = await camposParaPersona(correduriaId, clienteId, ramo)
  if (!campos) return { ok: false, estado: 'no_encontrado', motivo: 'No se encuentra la ficha.', status: 404 }

  let nueva: { token: string | null } | null = null
  const o = await crearOportunidad(
    correduriaId,
    clienteId,
    {
      ramo,
      estado: 'pendiente_cliente',
      tipoTarea: 'whatsapp',
      prioridadTarea: 'alta',
      fechaTarea: diaMadrid(new Date()),
      // Neutra: cuando se escribe esto aún no se sabe si el WhatsApp con el enlace llegará a salir.
      nota: `Lead web de ${ramo}: formulario de datos generado; si el cliente no lo recibió, anúlalo y pide datos de nuevo desde la oportunidad.`,
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
  if (o.ok) {
    const token = (nueva as { token: string | null } | null)?.token ?? null
    return { ok: true, oportunidadId: o.id, url: token ? urlPortalSolicitud(token) : null, ramo }
  }
  if (o.estado === 'tope') return { ok: false, estado: 'tope', motivo: o.motivo, status: 429 }
  if (o.estado !== 'duplicada') return { ok: false, estado: o.estado === 'no_encontrado' ? 'no_encontrado' : 'invalido', motivo: o.motivo, status: o.status === 404 ? 404 : 422 }

  // Ya había una abierta del ramo: no se toca; solo se le pide (o se reutiliza) la solicitud.
  const oportunidadId = o.id
  const s = await crearSolicitud(correduriaId, oportunidadId, actor)
  if (!s.ok) return { ok: false, estado: s.estado, motivo: s.motivo, status: s.status }
  // Viva de antes (`token: null`): su enlace no se puede volver a dar → sin URL (el aviso sale sin enlace).
  return { ok: true, oportunidadId, url: s.token ? urlPortalSolicitud(s.token) : null, ramo }
}
