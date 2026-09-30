'use client'

import { siguientePaso, type Contexto } from '@/lib/siguiente-paso'
import { whatsappUrl } from '@central/module-seguros'
import EnlaceMedido from '@/components/EnlaceMedido'

interface SiguientePasoProps {
  /**
   * El contexto de la herramienta: bonificación, vencimientos, ventana o carta.
   * Incluye el tipo y los datos específicos del resultado.
   */
  contexto: Contexto

  /**
   * El anchor del formulario donde aparece el campo de presupuesto.
   * Por defecto `#presupuesto`, pero algunas páginas pueden usar `#contacto`.
   */
  anclaFormulario?: string

  /**
   * Si se quiere personalizar el mensaje de WhatsApp, se puede pasar aquí.
   * Por defecto usa el del contexto.
   */
  whatsappMensajePersonalizado?: string
}

/**
 * Bloque de "siguiente paso" que aparece tras un resultado en una herramienta.
 * Muestra un mensaje contextual y dos acciones: WhatsApp + llamada de corredor.
 *
 * Los estilos usan clases existentes (`btn`, `btn-brand`, etc.) y no tocan
 * `globals.css` — otro agente lo puede estar editando.
 */
export default function SiguientePaso({
  contexto,
  anclaFormulario = '#presupuesto',
  whatsappMensajePersonalizado,
}: SiguientePasoProps) {
  const paso = siguientePaso(contexto)
  const whatsappMensaje = whatsappMensajePersonalizado || paso.whatsappTexto

  // El origen se determina por el tipo de contexto y sirve para medir qué herramienta
  // disparó cada click.
  const origen = `siguiente_${contexto.tipo}`

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.6 }}>
        {paso.mensaje}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <EnlaceMedido
          href={whatsappUrl(whatsappMensaje)}
          origen={`${origen}_whatsapp`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-brand"
          style={{ minHeight: 44 }}
        >
          {paso.etiquetaWhatsapp}
        </EnlaceMedido>

        <EnlaceMedido
          href={anclaFormulario}
          origen={`${origen}_llamada`}
          className="btn btn-outline"
          style={{ minHeight: 44 }}
        >
          {paso.etiquetaLlamada}
        </EnlaceMedido>
      </div>
    </div>
  )
}
