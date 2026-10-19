// lib/correo/lead-correduria-respuesta-proceso.ts — qué HACE el triaje con la respuesta de un lead en su hilo (con red)
// (19/10/2026, spec lead → propuesta F2). Las reglas viven en `lead-correduria-respuesta.ts` y en
// `@central/module-seguros` (`respuesta-lead.ts`), puros y con test. Aquí solo se encadenan:
//   1. asegura CASA el hilo (Message-IDs + índice ciego del remitente). 0 o varios → no se lee: el llamante cae al aviso
//      de siempre («respuesta de un lead») diciendo por qué.
//   2. La IA (`llamarIA`) lee SOLO el cuerpo sin lo citado y SOLO claves del contrato de sus ramos, con cita literal;
//      `leerRespuestaIa` tira lo que no aparece en el texto y separa lo que no vale. IA caída = «no lo he podido leer»,
//      nunca «no mandó nada».
//   3. asegura lo GUARDA en `info_riesgo` sin pisar (discrepancias y bloques confirmados se dicen) y dice qué falta.
//   4. Los adjuntos van a asegura, que los guarda CIFRADOS (sin clave, no). Nadie los lee.
//   5. Telegram: el resumen y, si falta algo, el borrador de REPREGUNTA con ✅/✏️/❌ (mismo envío en el hilo que la F1).
//      Si está todo: «✅ Datos completos — listo para tarificar». Nada sale al cliente sin el ✅.
// Nunca lanza. Ningún dato personal pasa por `console.*` ni por Telegram (solo etiquetas y conteos).
import { escapeHtml } from '@central/core-telegram'
import { cuerpoSinCita, leerRespuestaIa, promptExtraerRespuesta, type LecturaRespuesta } from '@central/module-seguros'
import { tgAviso } from '@/lib/telegram/avisos'
import { adjuntoLeadAsegura, respuestaLeadAsegura } from '@/lib/seguimiento-asegura'
import { llamarIA } from './clasificador'
import type { CorreoNuevo } from './imap'
import { ACTOR_TRIAJE_CORREO, hoyMadrid, textoPlantillaTelegram } from './lead-correduria'
import { proponerPeticion } from './lead-correduria-pendiente'
import {
  cuboAdjunto, leerCasar, leerGuardar, lineaAdjuntos, plantillaRepregunta, resumirRespuesta, textoRespuestaTelegram, type CuentaAdjuntos,
  type GuardadoLead,
} from './lead-correduria-respuesta'

const RE_MSGID = /^<[^<>\s@]+@[^<>\s@]+>$/

export type ResultadoRespuestaLead =
  | { leida: true; avisado: boolean }
  /** No se ha leído (no casa, ambiguo, sin SQL, asegura caído): el llamante avisa como antes con este motivo. */
  | { leida: false; motivo: string }

async function leerConIa(correo: CorreoNuevo, ramos: string[], hoy: string): Promise<{ lectura: LecturaRespuesta; iaFallo: boolean }> {
  const texto = cuerpoSinCita(correo.texto ?? correo.extracto).slice(0, 6000)
  if (!texto.trim()) return { lectura: { valores: {}, invalidos: [] }, iaFallo: false } // solo adjuntos: nada que leer
  try {
    const r = await llamarIA(promptExtraerRespuesta(ramos, hoy), texto, 900)
    const m = r.match(/\{[\s\S]*\}/)
    if (!m) return { lectura: { valores: {}, invalidos: [] }, iaFallo: true }
    return { lectura: leerRespuestaIa(JSON.parse(m[0]), { texto, ramos, hoy }), iaFallo: false }
  } catch {
    return { lectura: { valores: {}, invalidos: [] }, iaFallo: true }
  }
}

export async function procesarRespuestaLead(correo: CorreoNuevo, ahora = new Date()): Promise<ResultadoRespuestaLead> {
  try {
    const referencias = correo.referencias ?? []
    if (!referencias.length || !correo.from.includes('@')) return { leida: false, motivo: 'sin referencias o sin remitente' }
    const c = await respuestaLeadAsegura({ accion: 'casar', referencias, from: correo.from })
    const casado = leerCasar(c.status, c.json)
    if (casado.estado !== 'ok') return { leida: false, motivo: casado.motivo }
    if (!casado.oportunidades.length) return { leida: false, motivo: 'su hilo no tiene oportunidad abierta: no hay dónde guardar los datos' }
    const ramos = [...new Set(casado.oportunidades.map((o) => o.ramo))]
    const hoy = hoyMadrid(ahora)

    const { lectura, iaFallo } = await leerConIa(correo, ramos, hoy)
    // Con la IA caída NO se llama a `guardar`: con `valores: {}` asegura anotaría en su ficha «0 datos nuevos; faltan N»
    // y movería el hilo, afirmando que contestó sin datos cuando nadie lo ha leído (regla de los tres estados).
    const guardado: GuardadoLead = iaFallo
      ? { estado: 'no', motivo: 'sin leer' }
      : await respuestaLeadAsegura({
          accion: 'guardar', hiloId: casado.hiloId, from: correo.from, gmailMessageId: correo.messageId, valores: lectura.valores, actor: ACTOR_TRIAJE_CORREO,
        }).then((g) => leerGuardar(g.status, g.json))

    // Adjuntos: uno por llamada (el cuerpo va en base64 y Vercel corta a ~4,5 MB). Nunca se leen.
    const cuenta: CuentaAdjuntos = { guardados: 0, repetidos: 0, sinClave: 0, sinTabla: 0, fallidos: 0, omitidos: correo.adjuntosLeadOmitidos ?? 0 }
    if (RE_MSGID.test(correo.messageId)) {
      for (const a of correo.adjuntosLead ?? []) {
        const r = await adjuntoLeadAsegura({
          hiloId: casado.hiloId, from: correo.from, gmailMessageId: correo.messageId, nombre: a.nombre, mime: a.mime, base64: a.contenido.toString('base64'),
        }).catch(() => ({ status: 502, json: null }))
        cuenta[cuboAdjunto(r.status, r.json)]++
      }
    } else cuenta.fallidos += correo.adjuntosLead?.length ?? 0

    const resumen = resumirRespuesta(guardado, lectura.invalidos, iaFallo)
    const texto = textoRespuestaTelegram({ pila: casado.pila, ramos, guardado, resumen, iaFallo, adjuntos: lineaAdjuntos(cuenta) })

    // Repregunta SOLO si se pudo leer y guardar (si no, podría pedirle lo que ya mandó) y falta algo.
    const plantilla = !resumen.sinLeer && !resumen.completo
      ? plantillaRepregunta({ pila: casado.pila, ramos, faltan: resumen.faltan, invalidos: resumen.invalidos, asuntoOriginal: correo.subject })
      : null
    if (!plantilla) {
      const msg = await tgAviso('correduria.lead-respuesta', texto).catch(() => null)
      return { leida: true, avisado: msg !== null }
    }
    const conBoton = RE_MSGID.test(correo.messageId)
    const propuesta = conBoton
      ? await proponerPeticion({
          gmailMessageId: correo.messageId,
          datos: {
            clienteId: casado.clienteId, oportunidadIds: casado.oportunidades.map((o) => o.id), to: correo.from, asunto: plantilla.asunto,
            messageId: correo.messageId, references: referencias, pila: casado.pila, ramos, tipo: 'repregunta',
          },
          borrador: plantilla.cuerpo, preguntas: plantilla.preguntas, catastro: null, resumen: texto,
        })
      : null
    if (propuesta) return { leida: true, avisado: true }
    // Sin botón (sin SQL del pendiente, Telegram mudo o aviso apagado): el resumen y la repregunta para copiar.
    const msg = await tgAviso('correduria.lead-respuesta', texto).catch(() => null)
    await tgAviso('correduria.lead-respuesta', textoPlantillaTelegram({ asunto: plantilla.asunto, cuerpo: plantilla.cuerpo },
      'No he podido preparar el botón de envío de la repregunta: cópiala y contéstale tú.')).catch(() => null)
    return { leida: true, avisado: msg !== null }
  } catch (e) {
    console.error('[triaje] respuesta de lead:', e instanceof Error ? e.name : 'error')
    return { leida: false, motivo: 'fallo interno al leerla' }
  }
}

/** Línea para el aviso de siempre cuando la respuesta NO se ha podido leer (HTML seguro). PURA. */
export function notaSinLeer(motivo: string): string {
  return `⚠️ <i>No he leído sus datos: ${escapeHtml(motivo)}. Míralo en su correo.</i>`
}
