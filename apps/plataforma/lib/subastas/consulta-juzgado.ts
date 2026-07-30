// ────────────────────────────────────────────────────────────────────────────
// «Siguiente paso» de una subasta: el escrito de consulta al juzgado o notaría.
//
// Por qué existe: leer la certificación deja dudas que SOLO puede resolver el
// órgano que lleva la ejecución, y son dudas que cuestan dinero. El caso real de
// Belmonte (SUB-JA-2026-264269): se subasta por una anotación de embargo y hay una
// hipoteca ANTERIOR de 44.850€; si se cancela con la adjudicación el inmueble es
// un chollo, y si no, se paga el triple de lo que vale. Eso no lo decide un
// modelo: se pregunta al juzgado.
//
// Las preguntas las genera CÓDIGO a partir de lo que falta o chirría en la ficha,
// no la IA: así siempre se pregunta lo que de verdad afecta al coste, y en el
// mismo orden. La IA solo pule la redacción del escrito (y si no está disponible,
// se manda la plantilla tal cual — degrada, no rompe).
// ────────────────────────────────────────────────────────────────────────────
import {
  cargasQueSubsisten,
  mismoAcreedorQueEjecutante,
  type CuadroCargas,
  type SubastaInmueble,
} from '@central/module-subastas'

export interface DatosConsulta {
  subasta: SubastaInmueble
  cuadro: CuadroCargas | null
  autoridad: string | null
  telefono: string | null
  email: string | null
  /**
   * Estos dos viven en la tabla `subastas` pero no en el tipo del módulo (el JSON
   * de `subastas_radar.subasta` no los lleva), así que se pasan aparte en vez de
   * ensanchar `SubastaInmueble` con campos que `filaASubasta` no rellena.
   */
  direccion?: string | null
  arrendamientoInscrito?: boolean | null
}

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`

/**
 * Las preguntas que hay que hacer sobre ESTA subasta, ordenadas por cuánto
 * dinero mueven. Determinista y testeable: mismo estado de la ficha → mismas
 * preguntas.
 */
export function preguntasParaJuzgado(d: DatosConsulta): string[] {
  const q: string[] = []
  const s = d.subasta
  const cuadro = d.cuadro

  if (cuadro) {
    const subsistentes = cargasQueSubsisten(cuadro)
    const hipotecasAnteriores = subsistentes.cargas.filter((c) => c.tipo === 'hipoteca')

    // LA pregunta: en ejecución por embargo, la hipoteca anterior no se purga.
    if (cuadro.procedimiento === 'embargo' && hipotecasAnteriores.length) {
      const importe = hipotecasAnteriores.reduce((t, c) => t + (c.importe ?? 0), 0)
      const acreedores = hipotecasAnteriores.map((c) => c.acreedor).filter(Boolean).join(', ')
      q.push(
        `Si la subasta se celebra en virtud de una anotación preventiva de embargo, ¿subsistirá tras la adjudicación la hipoteca inscrita con anterioridad` +
          `${acreedores ? ` a favor de ${acreedores}` : ''}${importe > 0 ? ` (responsabilidad de ${eur(importe)})` : ''}, ` +
          'o se ordenará su cancelación al quedar satisfecho con el remate el crédito que garantiza?',
      )
      if (mismoAcreedorQueEjecutante(cuadro.cargas, d.autoridad)) {
        q.push('Al coincidir el ejecutante con el acreedor hipotecario, ¿se ha solicitado o se prevé la cancelación de dicha hipoteca en este procedimiento?')
      }
    }

    const sinImporte = subsistentes.cargas.filter((c) => c.importe == null)
    if (sinImporte.length) {
      q.push(`¿Podrían indicar el importe actualmente pendiente de las siguientes cargas anteriores: ${sinImporte.map((c) => c.tipo.replace(/_/g, ' ')).join(', ')}?`)
    }

    const embargosViejos = subsistentes.cargas.filter(
      (c) => c.tipo === 'embargo' && c.fecha != null && /(19|20)\d{2}/.test(c.fecha) && Number(c.fecha.match(/(19|20)\d{2}/)![0]) <= new Date().getFullYear() - 4,
    )
    if (embargosViejos.length) {
      q.push('Consta anotación de embargo anterior con más de cuatro años de antigüedad: ¿ha sido prorrogada o ha caducado conforme al artículo 86 de la Ley Hipotecaria?')
    }
    if (!cuadro.sinMasCargas) {
      q.push('¿Se encuentra en el expediente certificación registral actualizada de dominio y cargas? En caso afirmativo, ¿podría facilitarse copia?')
    }
  } else {
    q.push('¿Podría facilitarse la certificación registral de dominio y cargas de la finca, al no constar publicada en la ficha del portal de subastas?')
  }

  // Posesión: el otro gran coste oculto (un lanzamiento puede llevar años).
  if (s.situacionPosesoria !== 'libre') {
    q.push('¿Consta en el procedimiento la situación posesoria actual del inmueble y, en particular, si se encuentra ocupado y por quién?')
  }
  if (d.arrendamientoInscrito) {
    q.push('¿Existe contrato de arrendamiento vigente que el adjudicatario deba respetar?')
  }
  if (s.sinVisita) {
    q.push('¿Es posible concertar una visita al inmueble o acceder a fotografías del interior obrantes en el expediente?')
  }
  // Deudas de comunidad: se heredan el año en curso y los tres anteriores.
  q.push('¿Consta el importe de las cuotas de comunidad de propietarios pendientes que asumiría el adjudicatario (anualidad en curso y tres anteriores, art. 9.1.e LPH)?')

  return q
}

/**
 * Envía la consulta por email al órgano gestor y deja constancia. Devuelve el
 * estado para que el llamante lo diga en Telegram.
 *
 * Se manda desde el buzón del monorepo (`MAIL_FROM`) con Reply-To al correo de
 * Alberto, de forma que la respuesta del juzgado le llegue a él y el agente de
 * triaje de correo pueda reconocerla y volcarla a la ficha.
 *
 * No se envía nada si la ficha no publica correo del órgano: muchos juzgados solo
 * dan teléfono, y ahí el escrito se entrega a mano o por sede judicial.
 */
export async function enviarConsulta(
  d: DatosConsulta,
  escrito: string,
  deps: {
    enviar: (args: { to: string; subject: string; text: string; replyTo?: string }) => Promise<unknown>
    registrar: (args: { dedupeKey: string; email: string; escrito: string }) => Promise<unknown>
    replyTo?: string
  },
): Promise<{ enviado: boolean; motivo: string }> {
  const email = (d.email ?? '').trim()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return {
      enviado: false,
      motivo: d.telefono
        ? `La ficha no publica correo del órgano gestor; solo teléfono (${d.telefono}).`
        : 'La ficha no publica correo ni teléfono del órgano gestor.',
    }
  }

  const ref = d.subasta.identificador ?? d.subasta.dedupeKey
  await deps.enviar({
    to: email,
    subject: `Solicitud de información — subasta ${ref}`,
    text: escrito,
    replyTo: deps.replyTo,
  })
  await deps.registrar({ dedupeKey: d.subasta.dedupeKey, email, escrito }).catch(() => {})

  return { enviado: true, motivo: `Enviada a ${email}` }
}

/** Escrito completo listo para mandar. `plantilla` = sin pasar por la IA. */
export function escritoConsulta(d: DatosConsulta, preguntas: string[]): string {
  const s = d.subasta
  const ref = s.identificador ?? s.dedupeKey
  const finca = [d.direccion, s.municipio, s.provincia].filter(Boolean).join(', ')

  return [
    d.autoridad ? `A la atención de ${d.autoridad}` : 'A la atención del órgano gestor de la subasta',
    '',
    `Asunto: solicitud de información sobre la subasta ${ref}${finca ? ` (finca en ${finca})` : ''}.`,
    '',
    'Muy señores míos:',
    '',
    `En relación con la subasta de referencia ${ref}, publicada en el Portal de Subastas del BOE, y como posible licitador interesado, agradecería que me facilitaran la siguiente información antes de la fecha de conclusión:`,
    '',
    ...preguntas.map((p, i) => `${i + 1}. ${p}`),
    '',
    'Agradeciendo de antemano su atención, quedo a su disposición.',
    '',
    'Atentamente,',
  ].join('\n')
}
