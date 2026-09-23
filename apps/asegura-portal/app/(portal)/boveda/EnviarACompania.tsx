'use client'
import { useState } from 'react'

import { enlaceWhatsapp, mensajeParteWhatsapp, type DatosParteWhatsapp } from '@central/module-seguros-portal'

import { compartirODescargar, pdfDelParte } from '@/lib/parte-pdf'

/**
 * Tras dar el parte: «mándaselo también a tu compañía por WhatsApp».
 *
 * Lo manda EL CLIENTE desde su WhatsApp, en dos toques: (1) abrir el chat de la compañía con
 * el texto ya escrito y (2) compartir el PDF con los datos y las fotos. Un enlace de WhatsApp
 * no puede adjuntar ficheros, por eso son dos pasos y no uno.
 *
 * 🚨 No se dice «enviado» nunca: nosotros no vemos esa conversación y no sabemos si salió.
 */
export function EnviarACompania({
  compania,
  numero,
  horario,
  datos,
  ficheros,
}: {
  compania: string
  /** E.164 del WhatsApp de la compañía que vale para ESTA póliza. */
  numero: string
  horario: string | null
  datos: Omit<DatosParteWhatsapp, 'conPdf'>
  ficheros: readonly File[]
}) {
  const [pdf, setPdf] = useState<'reposo' | 'montando' | 'listo' | 'error'>('reposo')
  const [aviso, setAviso] = useState<string | null>(null)

  const texto = mensajeParteWhatsapp({ ...datos, conPdf: true })
  const enlace = texto === null ? null : enlaceWhatsapp(numero, texto)
  if (enlace === null) return null

  async function mandarPdf() {
    setPdf('montando')
    setAviso(null)
    try {
      const r = await pdfDelParte(datos, ficheros)
      const como = await compartirODescargar(r.fichero, `Parte de siniestro · ${compania}`)
      setPdf('listo')
      const falta = r.omitidos.length > 0 ? ` No hemos podido meter ${r.omitidos.length === 1 ? '1 fichero' : `${r.omitidos.length} ficheros`} (${r.omitidos.join(', ')}): mándalos aparte.` : ''
      setAviso(
        como === 'descargado'
          ? `Hemos descargado el PDF en tu dispositivo: adjúntalo en el chat de ${compania}.${falta}`
          : como === 'cancelado'
            ? 'No se ha compartido. Puedes volver a intentarlo cuando quieras.'
            : `Elige WhatsApp y el chat de ${compania} para mandarlo.${falta}`,
      )
    } catch {
      setPdf('error')
      setAviso('No hemos podido preparar el PDF en este móvil. Manda las fotos directamente en el chat de WhatsApp.')
    }
  }

  return (
    <div className="canal-caja" style={{ marginTop: 12 }}>
      <h3 className="canal-titulo">Mándaselo también a {compania} por WhatsApp</h3>
      <p className="editor-ayuda">
        Lo envías tú desde tu WhatsApp; nosotros no vemos esa conversación.
        {horario !== null && <> Atienden {horario}.</>} Si te contesta un asistente con opciones, elige la de dar parte
        de un siniestro y sigue sus pasos.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <a className="boton" href={enlace} target="_blank" rel="noreferrer noopener" style={{ minHeight: 48 }}>
          1. Abrir el WhatsApp de {compania} con el parte escrito
        </a>
        <button type="button" className="boton secundario" style={{ minHeight: 48 }} disabled={pdf === 'montando'} onClick={mandarPdf}>
            {pdf === 'montando'
              ? 'Preparando el PDF…'
              : ficheros.length > 0
                ? `2. Enviar el PDF con ${ficheros.length === 1 ? 'la foto' : `las ${ficheros.length} fotos y documentos`}`
                : '2. Enviar el parte en PDF'}
        </button>
      </div>
      {aviso && (
        <p className={pdf === 'error' ? 'error-linea' : 'editor-ayuda'} role={pdf === 'error' ? 'alert' : 'status'} style={{ marginTop: 8 }}>
          {aviso}
        </p>
      )}
    </div>
  )
}
