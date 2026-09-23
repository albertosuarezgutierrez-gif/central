// El parte que el cliente manda TAMBIÉN a su compañía, desde su propio WhatsApp.
//
// No lo manda la correduría: ni Mapfre, ni Generali ni Allianz aceptan mensajes de
// un sistema externo, y hacerlo nosotros exigiría la API de pago de WhatsApp. Lo
// que sí funciona es abrir el chat de la compañía con el texto ya escrito
// (`wa.me/…?text=`) y que el cliente lo envíe; las fotos van en un PDF aparte que
// comparte él (Web Share). Aquí vive el TEXTO, puro y con test.
//
// 🚨 Tres reglas:
//  1. Solo lo que el cliente acaba de escribir y lo que identifica la póliza. Ni
//     DNI, ni teléfono, ni correo, ni dirección de la ficha: el chat es de la
//     compañía y el que decide qué más darle es él.
//  2. «No lo sé» se dice como «no lo sé». Un `null` en heridos NO es «no».
//  3. No promete nada de nosotros: el mensaje es del cliente a su compañía.

/** Lo que el cliente acaba de enviar en el parte, más lo que identifica su póliza. */
export type DatosParteWhatsapp = {
  compania: string | null
  numeroPoliza: string | null
  /** Quien es titular de la póliza, tal como figura. `null` si no se conoce. */
  titular: string | null
  /** Qué se asegura: matrícula o dirección, si la conocemos. */
  bien: string | null
  /** `YYYY-MM-DD`. */
  fechaHecho: string
  /** `HH:MM` o `null`. */
  horaAproximada: string | null
  lugar: string | null
  descripcion: string
  hayHeridos: boolean | null
  hayTerceros: boolean | null
  /** ¿Adjuntará el PDF con las fotos? Cambia la última frase. */
  conPdf: boolean
}

/** Tope del relato dentro del mensaje: la URL de wa.me no admite textos enormes. */
export const RELATO_MAX_WHATSAPP = 1200

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

function limpio(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

function triestado(v: boolean | null): string {
  return v === true ? 'Sí' : v === false ? 'No' : 'No lo sé'
}

/** El texto del mensaje. `null` si falta la fecha o el relato: sin eso no es un parte. */
export function mensajeParteWhatsapp(d: DatosParteWhatsapp): string | null {
  const f = FECHA.exec(d.fechaHecho?.trim() ?? '')
  const relato = typeof d.descripcion === 'string' ? d.descripcion.trim() : ''
  if (!f || relato === '') return null
  const hora = limpio(d.horaAproximada)
  const cuando = `${f[3]}/${f[2]}/${f[1]}${hora && HORA.test(hora) ? `, hacia las ${hora}` : ''}`

  const compania = limpio(d.compania)
  const numero = limpio(d.numeroPoliza)
  const poliza = numero ? `nº ${numero}${compania ? ` (${compania})` : ''}` : compania ? `de ${compania}, no tengo el número a mano` : null

  const recorte = relato.length > RELATO_MAX_WHATSAPP ? `${relato.slice(0, RELATO_MAX_WHATSAPP - 1).trimEnd()}…` : relato
  const lineas = [
    'Hola, quiero dar parte de un siniestro.',
    '',
    poliza ? `Póliza: ${poliza}` : null,
    limpio(d.titular) ? `Titular: ${limpio(d.titular)}` : null,
    limpio(d.bien) ? `Asegurado: ${limpio(d.bien)}` : null,
    `Fecha: ${cuando}`,
    limpio(d.lugar) ? `Lugar: ${limpio(d.lugar)}` : null,
    `¿Hay heridos?: ${triestado(d.hayHeridos)}`,
    `¿Hay otros implicados?: ${triestado(d.hayTerceros)}`,
    '',
    'Qué ha pasado:',
    recorte,
    '',
    d.conPdf ? 'Os mando a continuación el parte en PDF con las fotos.' : null,
    'Mi corredor es Grupo ASegura.',
  ]
  return lineas.filter((l): l is string => l !== null).join('\n')
}

/**
 * La línea que queda en el historial de su ficha (y el aviso a Alberto) cuando el cliente
 * pulsa «ya se lo he mandado». 🚨 Es SU palabra: nosotros no vemos esa conversación, y la
 * frase lo dice para que nadie dé por abierto un siniestro que la compañía no ha recibido.
 */
export function notaParteMandadoWhatsapp(compania: string, fechaHecho: string, conPdf: boolean): string {
  const f = FECHA.exec(fechaHecho.trim())
  const cuando = f ? ` del ${f[3]}/${f[2]}/${f[1]}` : ''
  return (
    `📲 El cliente dice que ha mandado el parte${cuando} a ${compania.trim() || 'su compañía'} por WhatsApp` +
    `${conPdf ? ', con el PDF de datos y fotos' : ''}. No lo hemos visto: confírmalo con la compañía y apunta el nº de siniestro.`
  )
}
