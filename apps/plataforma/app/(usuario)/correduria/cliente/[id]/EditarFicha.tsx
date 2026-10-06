'use client'
import { useState } from 'react'
import type { DocumentoResumen } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import type { ContactosCliente, IdentidadFicha } from '@/lib/cliente-edicion-asegura'
import type { CarnetFicha, ContactoFicha } from '@/lib/ficha-asegura'
import PanelDatosCliente from './PanelDatosCliente'

/**
 * «✏️ Editar datos» de la cabecera de la ficha (visible en todas las pestañas): abre el panel único
 * `PanelDatosCliente` con todas sus secciones. La lógica de edición vive allí.
 */
export default function EditarFicha({
  clienteId, identidad, documentos, contacto, contactos, carnets, fechaCarnetPoliza, juridica,
}: {
  clienteId: string
  /** `null` = asegura no manda la identidad (versión anterior): no se edita a ciegas. */
  identidad: IdentidadFicha | null
  /** `null` = no se pudieron leer los Documentos. */
  documentos: DocumentoResumen[] | null
  contacto: ContactoFicha
  /** `null` = no se pudo leer la lista de teléfonos y correos. */
  contactos: ContactosCliente | null
  /** `null` = asegura no manda el bloque: sin saber qué hay, no se ofrece editarlo. */
  carnets: CarnetFicha[] | null
  fechaCarnetPoliza: string | null
  /** Persona jurídica: sin carnés. */
  juridica: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  // Una vez montado se queda: cerrar el panel no puede tirar lo que el usuario llevara escrito.
  const [montado, setMontado] = useState(false)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div>
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => { setAbierto((v) => !v); setMontado(true) }}
          style={{ ...btnStyle(abierto ? 'secundario' : 'primario'), minHeight: 44 }}
        >
          {abierto ? 'Cerrar edición' : '✏️ Editar datos'}
        </button>
      </div>
      {montado && (
        <div style={{ display: abierto ? 'block' : 'none' }}>
          <PanelDatosCliente
            clienteId={clienteId}
            identidad={identidad}
            documentos={documentos}
            contacto={contacto}
            contactos={contactos}
            carnets={carnets}
            fechaCarnetPoliza={fechaCarnetPoliza}
            juridica={juridica}
          />
        </div>
      )}
    </div>
  )
}

