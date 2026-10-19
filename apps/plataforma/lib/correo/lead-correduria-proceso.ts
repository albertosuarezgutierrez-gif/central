// lib/correo/lead-correduria-proceso.ts — qué HACE el triaje con un `correduria-lead` (con red).
//
// Las reglas viven en `lead-correduria.ts` (puro, con test); aquí solo se encadenan:
//   1. ¿respuesta en el hilo de un lead que ya registramos? → F2: se LEE y se propone la repregunta de lo que falta
//      (`lead-correduria-respuesta-proceso.ts`); si no casa con un único hilo, SOLO historial en su ficha y aviso.
//   2. Si no: la IA lee el correo (`llamarIAPrivada`: solo OpenRouter, retención cero), `normalizarLeadCorreo` valida contra el texto, y el
//      alta va por el MISMO puerto que el formulario web (`altaClienteAsegura`), solo con `es_lead:true`:
//      ficha nueva, o la que ya tenía el email del REMITENTE (no se fuerza duplicado: se anota el contacto).
//      Si el teléfono del cuerpo cae en OTRA ficha → «revisar a mano» (`resolverAltaLeadCorreo`).
//   3. Con ficha y ramo identificado (y sin «no quiero precio» explícito): una oportunidad por ramo
//      (`fuente:'correo'`, primer paso HOY: pedirle los datos). asegura no duplica una abierta.
//   4. Hogar con referencia catastral VÁLIDA en el correo: Catastro → riesgo de la oportunidad (solo lo vacío) y esos
//      datos ya no se le preguntan (`lead-correduria-pendiente.ts::catastroDeLead`; fallo = «no se sabe»).
//   5. Aviso Telegram con lo que se hizo y lo que NO; después, la petición de datos (SOLO lo que falta, desde el
//      contrato único) como BORRADOR con ✅ Enviar / ✏️ Editar / ❌ Descartar (19/10/2026, spec F1). 🚨 NADA sale hacia
//      el lead sin el ✅ de Alberto; el envío va por el puerto de asegura EN SU HILO. Sin la tabla del pendiente, sin
//      ficha propia o sin Message-ID válido, cae a la plantilla «para copiar» de antes.
//
// Solo se llama en modo vivo (`TRIAJE_DRY_RUN=false`). Nunca lanza: el triaje cae al aviso genérico
// si esto devuelve `avisado:false`. Ningún dato personal pasa por `console.*`.
import { tgAviso } from '@/lib/telegram/avisos'
import { altaClienteAsegura, historialClienteAsegura, interpretarEscritura } from '@/lib/cliente-edicion-asegura'
import { accionOportunidadAsegura } from '@/lib/seguimiento-asegura'
import { nombreDePila } from '@central/module-seguros'
import { catastroDeLead, proponerPeticion, type CatastroLead } from './lead-correduria-pendiente'
import { buscarAsegura } from '@/lib/correduria-puerto'
import { urlFichaCliente } from '@/lib/leads-web'
import { llamarIAPrivada } from './ia-lead-privada'
import type { CorreoNuevo } from './imap'
import { esRespuestaDeLeadBD } from './lead-correduria-hilo'
import { notaSinLeer, procesarRespuestaLead } from './lead-correduria-respuesta-proceso'
import {
  ACTOR_TRIAJE_CORREO, PROMPT_EXTRAER_LEAD, conocidosDelLead, cuerpoAltaLeadCorreo, cuerpoOportunidadLeadCorreo,
  motivoSinAlta, nombreVisible, normalizarLeadCorreo, plantillaPeticionDatos, resolverAltaLeadCorreo, textoAvisoLeadCorreo,
  textoHistorialLeadCorreo, textoPlantillaTelegram,
  type FichaLeadCorreo, type LeadCorreo, type OportunidadLeadCorreo,
} from './lead-correduria'


async function extraer(correo: CorreoNuevo): Promise<LeadCorreo> {
  const cuerpo = (correo.texto ?? correo.extracto).slice(0, 4000)
  let raw: unknown = null
  try {
    const r = await llamarIAPrivada(PROMPT_EXTRAER_LEAD, `Remitente: ${correo.fromRaw}\nAsunto: ${correo.subject}\nCuerpo:\n${cuerpo}`)
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
export async function fichaPorEmail(email: string | null): Promise<{ id: string; nombre: string } | null> {
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

function leerOportunidad(status: number, json: unknown): Pick<OportunidadLeadCorreo, 'estado' | 'motivo' | 'id'> {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const id = typeof o.id === 'string' && /^[0-9a-f-]{36}$/i.test(o.id) ? o.id : undefined
  if (status === 201 && o.estado === 'ok') return { estado: 'abierta', ...(id ? { id } : {}) }
  if (status === 409 && o.estado === 'duplicada') return { estado: 'ya_abierta', ...(id ? { id } : {}) }
  if (status === 429 || o.estado === 'tope') return { estado: 'tope' }
  return { estado: 'error', motivo: typeof o.motivo === 'string' ? o.motivo.slice(0, 120) : `HTTP ${status}` }
}

export async function procesarLeadCorreo(correo: CorreoNuevo, ahora = new Date()): Promise<{ avisado: boolean; ficha: FichaLeadCorreo['estado'] | null }> {
  try {
    const respuesta = await esRespuestaDeLeadBD(correo.referencias)

    if (respuesta) {
      // F2 (19/10/2026): la respuesta casada con SU hilo se LEE (datos al riesgo sin pisar, adjuntos cifrados) y se
      // propone la repregunta de lo que falta (`lead-correduria-respuesta-proceso.ts`). Si no casa con un único hilo,
      // como antes: un hilo = un lead, NO da de alta ni abre oportunidad; solo se anota en su ficha y se dice por qué
      // no se ha leído. La ficha se busca por el FROM, nunca por un email escrito en el cuerpo.
      const leida = await procesarRespuestaLead(correo, ahora)
      if (leida.leida) return { avisado: leida.avisado, ficha: 'existente' }
      const lead = await extraer(correo)
      const f = await fichaPorEmail(lead.emailRemitente)
      const ficha: FichaLeadCorreo = f
        ? { estado: 'existente', id: f.id, nombre: f.nombre, url: urlFichaCliente(f.id), historial: await anotar(f.id, textoHistorialLeadCorreo(lead, correo.subject, true)) }
        : { estado: 'no_registrado', motivo: 'no encuentro una única ficha con el email del remitente: anótalo a mano' }
      const enviado = await tgAviso('correduria.lead-correo', `${textoAvisoLeadCorreo({ remitente: correo.fromRaw, asunto: correo.subject, lead, ficha, oportunidades: [], plantilla: null, respuesta: true })}\n${notaSinLeer(leida.motivo)}`)
      return { avisado: enviado !== null, ficha: ficha.estado }
    }
    const lead = await extraer(correo)

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

    // Catastro (hogar con referencia válida en el correo): rellena el riesgo y ya no se pregunta lo que da.
    let catastro: CatastroLead | null = null
    if (lead.esLead !== false && lead.ramos.includes('hogar') && lead.referenciasCatastrales?.length) {
      const op = oportunidades.find((o) => o.ramo === 'hogar' && o.id)
      catastro = await catastroDeLead(lead.referenciasCatastrales, op?.id ? { id: op.id, recienAbierta: op.estado === 'abierta' } : null)
    }

    // La petición de datos se prepara aunque el alta haya fallado (el lead sigue esperando respuesta);
    // no, si la IA lo lee como publicidad/proveedor. SOLO lo que falta.
    const conocidos = new Set([...conocidosDelLead(lead), ...(catastro?.conocidos ?? [])])
    const plantilla = lead.esLead === false ? null : plantillaPeticionDatos(lead, correo.subject, conocidos)
    const conFicha = ficha.estado === 'nueva' || ficha.estado === 'existente' ? ficha.id : null
    const conBoton = !!(plantilla && conFicha && lead.emailRemitente && /^<[^<>\s@]+@[^<>\s@]+>$/.test(correo.messageId))
    const enviado = await tgAviso('correduria.lead-correo', textoAvisoLeadCorreo({
      remitente: correo.fromRaw, asunto: correo.subject, lead, ficha, oportunidades, plantilla,
      peticion: conBoton ? 'boton' : 'copiar', catastro: catastro?.linea ?? null,
    }))
    if (enviado !== null && plantilla) {
      const propuesta = conBoton && conFicha && lead.emailRemitente
        ? await proponerPeticion({
            gmailMessageId: correo.messageId,
            datos: {
              clienteId: conFicha, oportunidadIds: oportunidades.flatMap((o) => (o.id ? [o.id] : [])), to: lead.emailRemitente,
              asunto: plantilla.asunto, messageId: correo.messageId, references: correo.referencias ?? [],
              pila: lead.nombre ? nombreDePila(lead.nombre) : null, ramos: lead.ramos,
            },
            borrador: plantilla.cuerpo, preguntas: plantilla.preguntas, catastro: catastro?.linea ?? null,
          })
        : null
      if (!propuesta) await tgAviso('correduria.lead-correo', textoPlantillaTelegram(plantilla, conBoton ? 'No he podido preparar el botón de envío (¿falta el SQL del pendiente?): cópiala y contéstale tú.' : null)).catch(() => null)
    }
    return { avisado: enviado !== null, ficha: ficha.estado }
  } catch (e) {
    console.error('[triaje] lead de correduría:', e instanceof Error ? e.name : 'error')
    return { avisado: false, ficha: null }
  }
}
