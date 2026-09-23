'use client'
import { useState } from 'react'

import { enlaceWhatsapp, mensajeParteWhatsapp, type DatosParteWhatsapp } from '@central/module-seguros-portal'

/**
 * Tras dar el parte: «mándaselo también a tu compañía por WhatsApp».
 *
 * Lo manda EL CLIENTE desde su WhatsApp: (1) abrir el chat de la compañía con el texto ya
 * escrito, (2) preparar y compartir el PDF con los datos y las fotos, (3) decirnos que ya lo
 * ha mandado. Un enlace de WhatsApp no puede adjuntar ficheros, por eso no es un solo toque.
 *
 * 🚨 Preparar y compartir son DOS toques a propósito: iOS solo abre el menú de compartir en el
 * mismo gesto del usuario, y montar un PDF con fotos tarda segundos — con un solo botón el
 * gesto caduca y Safari lo niega en silencio.
 *
 * 🚨 No se dice «enviado» nunca: nosotros no vemos esa conversación y no sabemos si salió.
 */
type EstadoPdf =
  | { e: 'reposo' }
  | { e: 'montando' }
  | { e: 'listo'; fichero: File; omitidos: string[] }
  | { e: 'error' }

export function EnviarACompania({
  compania,
  numero,
  horario,
  datos,
  ficheros,
  parteId,
}: {
  compania: string
  /** E.164 del WhatsApp de la compañía que vale para ESTA póliza. */
  numero: string
  horario: string | null
  datos: Omit<DatosParteWhatsapp, 'conPdf' | 'conFotos'>
  ficheros: readonly File[]
  /** El parte ya creado, para dejar anotado «ya se lo he mandado». `null` = no se sabe cuál es. */
  parteId: string | null
}) {
  const [pdf, setPdf] = useState<EstadoPdf>({ e: 'reposo' })
  const [compartido, setCompartido] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [mandado, setMandado] = useState<'reposo' | 'anotando' | 'ok' | 'sin_anotar' | 'error'>('reposo')

  const texto = mensajeParteWhatsapp({ ...datos, conPdf: true, conFotos: ficheros.length > 0 })
  const enlace = texto === null ? null : enlaceWhatsapp(numero, texto)
  if (enlace === null) return null

  async function preparar() {
    setPdf({ e: 'montando' })
    setAviso(null)
    try {
      // pdf-lib solo se descarga si alguien lo usa: no pesa en cada visita a la bóveda.
      const { pdfDelParte } = await import('@/lib/parte-pdf')
      const r = await pdfDelParte(datos, ficheros)
      setPdf({ e: 'listo', fichero: r.fichero, omitidos: r.omitidos })
      if (r.omitidos.length > 0) {
        setAviso(`No hemos podido meter ${r.omitidos.length === 1 ? '1 fichero' : `${r.omitidos.length} ficheros`} en el PDF (${r.omitidos.join(', ')}): mándalos aparte en el chat.`)
      }
    } catch {
      setPdf({ e: 'error' })
      setAviso('No hemos podido preparar el PDF en este dispositivo. Manda las fotos directamente en el chat de WhatsApp.')
    }
  }

  async function compartir() {
    if (pdf.e !== 'listo') return
    const { compartirODescargar } = await import('@/lib/parte-pdf')
    const como = await compartirODescargar(pdf.fichero, `Parte de siniestro · ${compania}`)
    if (como === 'compartido') setCompartido(true)
    setAviso(
      como === 'descargado'
        ? `Hemos descargado el PDF en tu dispositivo: adjúntalo en el chat de ${compania}.`
        : como === 'cancelado'
          ? 'No se ha compartido. Puedes volver a intentarlo cuando quieras.'
          : null,
    )
  }

  async function yaMandado() {
    if (parteId === null) return
    setMandado('anotando')
    try {
      const r = await fetch(`/api/siniestros/${parteId}/whatsapp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // «Con el PDF» solo si el menú de compartir dijo que salió; descargar o cancelar no cuenta.
        body: JSON.stringify({ conPdf: compartido }),
      })
      const j = (await r.json().catch(() => null)) as { anotado?: boolean; avisado?: boolean } | null
      setMandado(r.ok ? (j?.anotado || j?.avisado ? 'ok' : 'sin_anotar') : 'error')
    } catch {
      setMandado('error')
    }
  }

  const etiquetaPdf = ficheros.length > 0 ? `el PDF con ${ficheros.length === 1 ? 'tu foto' : `tus ${ficheros.length} fotos y documentos`}` : 'el parte en PDF'

  return (
    <div className="canal-caja" style={{ marginTop: 12 }}>
      <h3 className="canal-titulo">Si quieres adelantarlo, mándaselo tú a {compania} por WhatsApp</h3>
      <p className="editor-ayuda">
        Nosotros lo tramitamos igualmente. Lo envías tú desde tu WhatsApp y no vemos esa conversación.
        {horario !== null && <> Atienden {horario}.</>} Así se lo mandas:
      </p>
      <ol className="editor-ayuda" style={{ margin: '0 0 10px', paddingLeft: 20 }}>
        <li>Abre el chat de {compania}: el parte ya va escrito. Dale a enviar.</li>
        <li>Vuelve aquí, prepara {etiquetaPdf} y compártelo en ese mismo chat.</li>
        {parteId !== null && <li>Pulsa «Ya se lo he mandado» para que tu corredor lo sepa.</li>}
      </ol>
      <p className="editor-ayuda">
        Si te contesta un asistente con opciones, elige la de dar parte de un siniestro. Cuando {compania} te dé un
        número de siniestro, guárdalo.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <a className="boton" href={enlace} target="_blank" rel="noreferrer noopener" style={{ minHeight: 48 }}>
          Abrir el WhatsApp de {compania}
        </a>
        {pdf.e === 'listo' ? (
          <button type="button" className="boton secundario" style={{ minHeight: 48 }} onClick={compartir}>
            Compartir {etiquetaPdf}
          </button>
        ) : (
          <button type="button" className="boton secundario" style={{ minHeight: 48 }} disabled={pdf.e === 'montando'} onClick={preparar}>
            {pdf.e === 'montando' ? 'Preparando el PDF…' : `Preparar ${etiquetaPdf}`}
          </button>
        )}
        {parteId !== null && mandado !== 'ok' && mandado !== 'sin_anotar' && (
          <button type="button" className="boton secundario" style={{ minHeight: 48 }} disabled={mandado === 'anotando'} onClick={yaMandado}>
            {mandado === 'anotando' ? 'Anotándolo…' : `Ya se lo he mandado a ${compania}`}
          </button>
        )}
      </div>
      {aviso && (
        <p className={pdf.e === 'error' ? 'error-linea' : 'editor-ayuda'} role={pdf.e === 'error' ? 'alert' : 'status'} style={{ marginTop: 8 }}>
          {aviso}
        </p>
      )}
      {mandado === 'ok' && (
        <p className="confirmacion" role="status" style={{ marginTop: 8 }}>
          Anotado: tu corredor ya sabe que se lo has mandado a {compania}. Si te dan un número de siniestro, díselo.
        </p>
      )}
      {mandado === 'sin_anotar' && (
        <p className="editor-ayuda" role="status" style={{ marginTop: 8 }}>
          Gracias. No hemos podido dejarlo anotado ahora mismo: si puedes, díselo a tu corredor. Tu parte sigue registrado con nosotros.
        </p>
      )}
      {mandado === 'error' && (
        <p className="error-linea" role="alert" style={{ marginTop: 8 }}>
          No hemos podido anotarlo. Inténtalo de nuevo en un momento; tu parte sigue registrado con nosotros.
        </p>
      )}
    </div>
  )
}
