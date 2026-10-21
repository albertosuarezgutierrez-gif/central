/**
 * «Añadir a mi calendario» (21/10/2026): el .ics de la caducidad de un carné de conducir, generado en el
 * NAVEGADOR (nada sale a ningún servidor) y descargado por la persona. Pura: sin DOM, sin reloj propio
 * (`ahora` entra por parámetro).
 *
 *  - Evento de DÍA COMPLETO (`VALUE=DATE`, `DTEND` = día siguiente, exclusivo): sin huso, no se corre.
 *  - Tres alarmas, las del aviso escalonado del portal: 90, 30 y 7 días antes.
 *  - Solo lleva el tipo de carné y la fecha. Ni nombre, ni DNI, ni fecha de nacimiento ni de expedición.
 *  - `UID` estable por carné (`carnet-<id>@…`): volver a importarlo actualiza el evento, no lo duplica.
 *  - Texto escapado (RFC 5545 §3.3.11), líneas plegadas a 75 octetos y finales `\r\n`.
 * `null` si la fecha no es una fecha real: no se inventa un evento.
 */

const UMBRALES_ALARMA = [90, 30, 7] as const

function aYmd(iso: string): string | null {
  const t = iso.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === t ? `${m[1]}${m[2]}${m[3]}` : null
}

function diaSiguiente(iso: string): string {
  const d = new Date(`${iso.trim()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function escapar(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Pliega a 75 octetos UTF-8 por línea (continuación: CRLF + espacio), sin partir un carácter. */
export function plegarLineaIcs(linea: string): string {
  const enc = new TextEncoder()
  if (enc.encode(linea).length <= 75) return linea
  const trozos: string[] = []
  let actual = ''
  let bytes = 0
  let limite = 75
  for (const ch of linea) {
    const b = enc.encode(ch).length
    if (bytes + b > limite) {
      trozos.push(actual)
      actual = ''
      bytes = 0
      limite = 74 // la continuación lleva un espacio delante
    }
    actual += ch
    bytes += b
  }
  trozos.push(actual)
  return trozos.join('\r\n ')
}

export function icsCaducidadCarnet(x: { id: string; tipo: string; fechaCaducidad: string; ahora: Date }): string | null {
  const dia = aYmd(x.fechaCaducidad)
  const id = x.id.trim().replace(/[^A-Za-z0-9-]/g, '')
  if (dia === null || id === '' || Number.isNaN(x.ahora.getTime())) return null
  const tipo = x.tipo.trim().slice(0, 10)
  const sello = x.ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const resumen = `Caduca mi carné de conducir${tipo ? ` (${tipo})` : ''}`
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grupo ASegura//Portal del cliente//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:carnet-${id}@grupoasegura.es`,
    `DTSTAMP:${sello}`,
    `DTSTART;VALUE=DATE:${dia}`,
    `DTEND;VALUE=DATE:${diaSiguiente(x.fechaCaducidad)}`,
    `SUMMARY:${escapar(resumen)}`,
    `DESCRIPTION:${escapar('Renuévalo en un centro de reconocimiento de conductores; conducir con el carné caducado es sancionable. Sede de la DGT: https://sede.dgt.gob.es')}`,
    'TRANSP:TRANSPARENT',
    ...UMBRALES_ALARMA.flatMap((d) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapar(`${resumen}: faltan ${d} días`)}`,
      `TRIGGER:-P${d}D`,
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lineas.map(plegarLineaIcs).join('\r\n') + '\r\n'
}

/** Nombre del fichero: solo letras, números y guiones. */
export function nombreFicheroIcsCarnet(tipo: string): string {
  const t = tipo.trim().replace(/[^A-Za-z0-9]/g, '')
  return `caducidad-carnet${t ? `-${t}` : ''}.ics`
}
