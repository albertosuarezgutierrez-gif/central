'use client'

// «Editar datos» de una figura del riesgo (30/09/2026): abre, sin salir de la pantalla, los MISMOS
// formularios de la ficha del cliente — `EditarCliente` (identidad: nombre, DNI, fecha de nacimiento,
// que exigen DNI recibido, regla 4) y `EditarCarnets` (solo si esa persona va a conducir) — sobre ESA
// ficha. Sin lógica nueva de identidad. Al guardar, esos formularios llaman a `router.refresh()`: la
// pantalla del riesgo vuelve a leerse y el aviso «Falta…» se actualiza; el modal recarga su ficha con ella.

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import EditarCliente from '../../EditarCliente'
import EditarCarnets from '../../cliente/[id]/EditarCarnets'
import { pedirFichaParaEditar, type FichaParaEditar } from './acciones'

export default function EditarFichaModal({ oportunidadId, clienteId, nombre, conduce, refresco, onCerrar }: {
  oportunidadId: string
  clienteId: string
  nombre: string
  /** Esta persona va a conducir el vehículo del riesgo: se ofrece también su carné. */
  conduce: boolean
  /** Cambia cuando el riesgo se ha vuelto a leer: la ficha del modal se recarga con él. */
  refresco: unknown
  onCerrar: () => void
}) {
  const [ficha, setFicha] = useState<FichaParaEditar | null>(null)
  const [version, setVersion] = useState(0)
  const cierre = useRef<HTMLButtonElement>(null)

  // Se mantiene lo que había mientras llega lo nuevo: no se desmonta un formulario a medio teclear.
  useEffect(() => {
    let vivo = true
    pedirFichaParaEditar({ oportunidadId, clienteId })
      .then((r) => { if (vivo) { setFicha(r); setVersion((v) => v + 1) } })
      .catch(() => { if (vivo) setFicha((f) => f ?? { estado: 'error', mensaje: 'No se ha podido leer la ficha.' }) })
    return () => { vivo = false }
  }, [oportunidadId, clienteId, refresco])

  useEffect(() => {
    cierre.current?.focus()
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [onCerrar])

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`Editar datos de ${nombre}`}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5vh 2.5vw' }}
    >
      <div style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(95vw, 760px)', maxHeight: '95vh', overflow: 'auto', padding: 16, display: 'grid', gap: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, overflowWrap: 'anywhere' }}>Datos de {nombre}</div>
          <button ref={cierre} type="button" onClick={onCerrar} aria-label="Cerrar" style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}>
            <X size={18} />
          </button>
        </div>
        {ficha === null && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Leyendo la ficha…</div>}
        {ficha?.estado === 'error' && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{ficha.mensaje}</div>}
        {ficha?.estado === 'ok' && (
          <>
            <div key={`c${version}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Identidad</div>
              <EditarCliente clienteId={clienteId} identidad={ficha.identidad} documentos={ficha.documentos} />
            </div>
            {conduce && (
              <div key={`k${version}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Carné de conducir</div>
                {ficha.carnets !== null
                  ? <EditarCarnets clienteId={clienteId} carnets={ficha.carnets} fechaPoliza={ficha.fechaCarnetPoliza} />
                  : <div style={{ fontSize: 13, color: 'var(--muted)' }}>No se han podido leer los carnés de esta ficha: sin saber qué hay, no se ofrece editarlos.</div>}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Teléfono, correo y dirección se corrigen en la ficha de la persona. El nombre, el DNI y la fecha de nacimiento exigen el DNI recibido.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
