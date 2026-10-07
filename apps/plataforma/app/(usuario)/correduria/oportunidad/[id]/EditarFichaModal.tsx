'use client'

// «Editar datos» de una figura del riesgo (30/09/2026): abre, sin salir de la pantalla, EL MISMO editor
// de la ficha del cliente (`PanelDatosCliente`: identidad con DNI recibido o motivo, regla 4; dirección; y el
// carné solo si esa persona va a conducir) sobre ESA ficha. Sin lógica propia de identidad. Al guardar, el
// panel llama a `router.refresh()`: la pantalla del riesgo vuelve a leerse y el aviso «Falta…» se actualiza;
// el modal recarga su ficha con ella. Con cambios sin guardar, cerrar pide confirmación.

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import PanelDatosCliente from '../../cliente/[id]/PanelDatosCliente'
import FaltaPorCompletar from './FaltaPorCompletar'
import { faltaMovil, faltaSexo, rotulosFaltaEnFormulario } from '@/lib/riesgo-asegura'
import { pedirFichaParaEditar, type FichaParaEditar } from './acciones'

export default function EditarFichaModal({ oportunidadId, clienteId, nombre, conduce, faltan, refresco, onCerrar }: {
  oportunidadId: string
  clienteId: string
  nombre: string
  /** Esta persona va a conducir el vehículo del riesgo: se ofrece también su carné. */
  conduce: boolean
  /** Lo que el aviso dice que falta en su ficha (`null` = no se pudo leer): se ofrece completarlo aquí. */
  faltan: string[] | null
  /** Cambia cuando el riesgo se ha vuelto a leer: la ficha del modal se recarga con él. */
  refresco: unknown
  onCerrar: () => void
}) {
  const [ficha, setFicha] = useState<FichaParaEditar | null>(null)
  const [guardadoAqui, setGuardadoAqui] = useState<{ sexo: boolean; movil: boolean } | null>(null)
  const cierre = useRef<HTMLButtonElement>(null)
  // ¿Hay algo tecleado y sin guardar en el panel? Se marca al teclear (los eventos de los campos suben hasta
  // el contenedor) y se limpia cuando el panel avisa de que guardó todo (`onGuardado`).
  const sucio = useRef(false)

  // Se mantiene lo que había mientras llega lo nuevo: no se desmonta un formulario a medio teclear.
  useEffect(() => {
    let vivo = true
    pedirFichaParaEditar({ oportunidadId, clienteId })
      .then((r) => { if (vivo) setFicha(r) })
      .catch(() => { if (vivo) setFicha((f) => f ?? { estado: 'error', mensaje: 'No se ha podido leer la ficha.' }) })
    return () => { vivo = false }
  }, [oportunidadId, clienteId, refresco])

  const cerrar = useCallback(() => {
    if (sucio.current && !window.confirm('Hay cambios sin guardar. ¿Cerrar y perderlos?')) return
    setGuardadoAqui(null)
    onCerrar()
  }, [onCerrar])
  const cerrarRef = useRef(cerrar)
  useEffect(() => { cerrarRef.current = cerrar }, [cerrar])

  useEffect(() => {
    cierre.current?.focus()
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current() }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [])

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`Editar datos de ${nombre}`}
      onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5vh 2.5vw' }}
    >
      <div style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(95vw, 760px)', maxHeight: '95vh', overflow: 'auto', padding: 16, display: 'grid', gap: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, overflowWrap: 'anywhere' }}>Datos de {nombre}</div>
          <button ref={cierre} type="button" onClick={cerrar} aria-label="Cerrar" style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}>
            <X size={18} />
          </button>
        </div>
        {ficha === null && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Leyendo la ficha…</div>}
        {ficha?.estado === 'error' && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{ficha.mensaje}</div>}
        {ficha?.estado === 'ok' && (
          <>
            {(faltaSexo(faltan) || faltaMovil(faltan)) && (
              <FaltaPorCompletar
                clienteId={clienteId} faltaSexo={faltaSexo(faltan)} faltaMovil={faltaMovil(faltan)}
                tambien={rotulosFaltaEnFormulario(faltan)} onGuardado={(g) => setGuardadoAqui(g)}
              />
            )}
            {guardadoAqui && (
              <div role="status" style={{ fontSize: 13, color: 'var(--positive)' }}>
                {guardadoAqui.sexo && guardadoAqui.movil ? 'Sexo y móvil guardados' : guardadoAqui.sexo ? 'Sexo guardado' : 'Móvil guardado'} en su ficha.
              </div>
            )}
            <div onInput={() => { sucio.current = true; setGuardadoAqui(null) }} onChange={() => { sucio.current = true; setGuardadoAqui(null) }} style={{ minWidth: 0 }}>
              <PanelDatosCliente
                clienteId={clienteId}
                identidad={ficha.identidad}
                documentos={ficha.documentos}
                contacto={ficha.contacto}
                carnets={ficha.carnets}
                fechaCarnetPoliza={ficha.fechaCarnetPoliza}
                juridica={ficha.juridica}
                secciones={conduce ? ['identidad', 'direccion', 'carnets'] : ['identidad', 'direccion']}
                onGuardado={({ todoGuardado }) => { if (todoGuardado) sucio.current = false }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              El correo y otros teléfonos se corrigen en la ficha de la persona. El nombre, el DNI y la fecha de nacimiento exigen el DNI recibido o un motivo.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
