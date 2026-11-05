'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ListPlus } from 'lucide-react'
import NuevaTarea from './correduria/mesa/NuevaTarea'
import { EVENTO_TAREA_GUARDADA } from '@/lib/correduria/alta-tarea'

/**
 * Acceso directo «Nueva tarea» de la cabecera fija (visible en todas las pantallas). Monta el MISMO modal
 * de Mi mesa (`NuevaTarea`); al guardar avisa por evento de ventana y Mi mesa recarga si está abierta.
 * Mismo cuadrado que el de «Subir factura» (44 px) para que quepan los dos a 320 px.
 */
export default function BotonNuevaTarea() {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-label="Nueva tarea" title="Nueva tarea"
        style={{ minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>
        <ListPlus size={20} aria-hidden />
      </button>
      {/* Portal a <body>: la cabecera fija no debe recortar ni apilar el modal. */}
      {abierto && createPortal(
        <NuevaTarea
          hoy={new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })}
          onCerrar={() => setAbierto(false)}
          onGuardada={() => { window.dispatchEvent(new Event(EVENTO_TAREA_GUARDADA)) }} />,
        document.body,
      )}
    </>
  )
}
