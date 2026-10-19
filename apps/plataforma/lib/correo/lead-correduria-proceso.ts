// lib/correo/lead-correduria-proceso.ts — qué HACE el triaje con un `correduria-lead` (con red).
//
// Las reglas viven en `lead-correduria.ts` (puro, con test); aquí solo se encadenan:
//   1. ¿respuesta en el hilo de un lead que ya registramos? → SOLO historial en su ficha y aviso.
//   2. Si no: la IA lee el correo (`llamarIA`), `normalizarLeadCorreo` valida contra el texto, y el
//      alta va por el MISMO puerto que el formulario web (`altaClienteAsegura`), solo con `es_lead:true`:
//      ficha nueva, o la que ya tenía el email del REMITENTE (no se fuerza duplicado: se anota el contacto).
//      Si el teléfono del cuerpo cae en OTRA ficha → «revisar a mano» (`resolverAltaLeadCorreo`).
//   3. Con ficha y ramo identificado (y sin «no quiero precio» explícito): una oportunidad por ramo
//      (`fuente:'correo'`, primer paso HOY: pedirle los datos). asegura no duplica una abierta.
//   4. Aviso Telegram con lo que se hizo y lo que NO, y la petición de datos como texto para copiar.
//      🚨 NADA sale hacia el lead: el envío automático está pendiente de autorización de Alberto.
//
// Solo se llama en modo vivo (`TRIAJE_DRY_RUN=false`). Nunca lanza: el triaje cae al aviso genérico
// si esto devuelve `avisado:false`. Ningún dato personal pasa por `console.*`.
import { tgAviso } from '@/lib/telegram/avisos'
import { altaClienteAsegura, historialClienteAsegura, interpretarEscritura } from '@/lib/cliente-edicion-asegura'
import { accionOportunidadAsegura } from '@/lib/seguimiento-asegura'
import { buscarAsegura } from '@/lib/correduria-puerto'
import { urlFichaCliente } from '@/lib/leads-web'
import { llamarIA } from './clasificador'
import type { CorreoNuevo } from './imap'
import { esRespuestaDeLeadBD } from './lead-correduria-hilo'
import {
  ACTOR_TRIAJE_CORREO, PROMPT_EXTRAER_LEAD, cuerpoAltaLeadCorreo, cuerpoOportunidadLeadCorreo,
  motivoSinAlta, nombreVisible, normalizarLeadCorreo, plantillaPeticionDatos, resolverAltaLeadCorreo, textoAvisoLeadCorreo,
  textoHistorialLeadCorreo, textoPlantillaTelegram,
  type FichaLeadCorreo, type LeadCorreo, type OportunidadLeadCorreo,
} from './lead-correduria'


async function extraer(correo: CorreoNuevo): Promise<LeadCorreo> {
  const cuerpo = (correo.texto ?? correo.extracto).slice(0, 4000)
  let raw: unknown = null
  try {
    const r = await llamarIA(PROMPT_EXTRAER_LEAD, `Remitente: ${correo.fromRaw}\nAsunto: ${correo.subject}\nCuerpo:\n${cuerpo}`)
    const m = r.match(/\{[\s\S]*\}/)
    raw = m ? JSON.parse(m[0]) : null
  } catch {
    raw = null // IA caída: sigue con lo que el correo dice por sí mismo (remitente)
  }
  return normalizarLeadCorreo(raw, {
    texto: `${correo.subject}\n${correo.texto ?? correo.extracto}\n${correo.fromRaw}`,
    from: correo.from,
    fromNombre: nombreVisible(correo.fromRaw),
  })
}

/** Una ÚNICA ficha con ese email (índice ciego, exacto). Cero o varias → `null`: no se adivina. */
async function fichaPorEmail(email: string | null): Promise<{ id: string; nombre: string } | null> {
  if (!email) return null
  const b = await buscarAsegura(email)
  if (b.estado !== 'ok') return null
  const vistos = new Map<string, string>()
  for (const bl of b.bloques) for (const h of bl.hallazgos) vistos.set(h.clienteId, h.nombre)
  if (vistos.size !== 1) return null
  const [[id, nombre]] = [...vistos]
  return { id, nombre }
}

async function anotar(clienteId: string, texto: string): Promise<boolean> {
  const h = await historialClienteAsegura({ clienteId, tipo: 'contacto', texto, actor: ACTOR_TRIAJE_CORREO })
  return interpretarEscritura(h.status, h.json).estado === 'ok'
}

function leerOportunidad(status: number, json: unknown): Pick<OportunidadLeadCorreo, 'estado' | 'motivo'> {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 201 && o.estado === 'ok') return { estado: 'abierta' }
  if (status === 409 && o.estado === 'duplicada') return { estado: 'ya_abierta' }
  if (status === 429 || o.estado === 'tope') return { estado: 'tope' }
  return { estado: 'error', motivo: typeof o.motivo === 'string' ? o.motivo.slice(0, 120) : `HTTP ${status}` }
}

export async function procesarLeadCorreo(correo: CorreoNuevo, ahora = new Date()): Promise<{ avisado: boolean; ficha: FichaLeadCorreo['estado'] | null }> {
  try {
    const respuesta = await esRespuestaDeLeadBD(correo.referencias)
    const lead = await extraer(correo)

    if (respuesta) {
      // Un hilo = un lead: la respuesta NO da de alta ni abre oportunidad; solo se anota en su ficha.
      // La ficha se busca por el FROM, nunca por un email escrito en el cuerpo.
      const f = await fichaPorEmail(lead.emailRemitente)
      const ficha: FichaLeadCorreo = f
        ? { estado: 'existente', id: f.id, nombre: f.nombre, url: urlFichaCliente(f.id), historial: await anotar(f.id, textoHistorialLeadCorreo(lead, correo.subject, true)) }
        : { estado: 'no_registrado', motivo: 'no encuentro una única ficha con el email del remitente: anótalo a mano' }
      const enviado = await tgAviso('correduria.lead-correo', textoAvisoLeadCorreo({ remitente: correo.fromRaw, asunto: correo.subject, lead, ficha, oportunidades: [], plantilla: null, respuesta: true }))
      return { avisado: enviado !== null, ficha: ficha.estado }
    }

    let ficha: FichaLeadCorreo
    const sinAlta = motivoSinAlta(lead)
    if (sinAlta) {
      ficha = { estado: 'no_registrado', motivo: sinAlta }
    } else {
      const alta = await altaClienteAsegura(cuerpoAltaLeadCorreo(lead, correo.subject), ACTOR_TRIAJE_CORREO)
      const r = resolverAltaLeadCorreo(alta.status, alta.json, interpretarEscritura(alta.status, alta.json))
      if (r.estado === 'nueva') ficha = { estado: 'nueva', id: r.id, url: urlFichaCliente(r.id) }
      else if (r.estado === 'existente') {
        ficha = { estado: 'existente', id: r.id, nombre: r.nombre, url: urlFichaCliente(r.id), historial: await anotar(r.id, textoHistorialLeadCorreo(lead, correo.subject, false)) }
      } else if (r.estado === 'revisar') {
        ficha = { estado: 'revisar', motivo: r.motivo, fichas: r.fichas.map((x) => ({ ...x, url: urlFichaCliente(x.id) })) }
      } else ficha = { estado: 'no_registrado', motivo: r.motivo }
    }

    const oportunidades: OportunidadLeadCorreo[] = []
    if ((ficha.estado === 'nueva' || ficha.estado === 'existente') && lead.pidePresupuesto !== false) {
      for (const ramo of lead.ramos) {
        const o = await accionOportunidadAsegura(cuerpoOportunidadLeadCorreo(ficha.id, ramo, lead, ahora))
        oportunidades.push({ ramo, ...leerOportunidad(o.status, o.json) })
      }
    }

    // La petición de datos se prepara aunque el alta haya fallado (el lead sigue esperando respuesta);
    // no, si la IA lo lee como publicidad/proveedor.
    const plantilla = lead.esLead === false ? null : plantillaPeticionDatos(lead, correo.subject)
    const enviado = await tgAviso('correduria.lead-correo', textoAvisoLeadCorreo({ remitente: correo.fromRaw, asunto: correo.subject, lead, ficha, oportunidades, plantilla }))
    if (enviado !== null && plantilla) await tgAviso('correduria.lead-correo', textoPlantillaTelegram(plantilla)).catch(() => null)
    return { avisado: enviado !== null, ficha: ficha.estado }
  } catch (e) {
    console.error('[triaje] lead de correduría:', e instanceof Error ? e.name : 'error')
    return { avisado: false, ficha: null }
  }
}
