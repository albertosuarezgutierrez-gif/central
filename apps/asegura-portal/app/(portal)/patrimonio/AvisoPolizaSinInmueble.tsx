'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { precargaDeUbicacion } from '@central/module-patrimonio'

import type { AvisoPintable } from '@/lib/patrimonio/poliza-sin-inmueble-bd'

/** Lo que cruza al cliente: sin ids de titular ajenos ni nada que no se pinte. */
export type AvisoUI = Pick<AvisoPintable, 'tipo' | 'id' | 'ubicacion' | 'referenciaCatastral' | 'propuesta' | 'peticion' | 'titularClienteId'>

const ERRORES: Record<string, string> = {
  no_encontrado: 'Ya no podemos enlazar esa póliza. Recarga la página.',
  ya_existe: 'Esa póliza ya está enlazada.',
  sin_comprobar: 'Ahora no hemos podido comprobar tus seguros. Vuelve a intentarlo en un rato.',
  demasiadas_peticiones: 'Demasiados cambios seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  modo_corredor: 'En la vista de corredor no se puede cambiar nada.',
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

/** Enlace al alta PRERRELLENADA: CP, calle y referencia catastral. Municipio y provincia salen del CP en el formulario. */
export function hrefAltaDesdePoliza(a: Pick<AvisoUI, 'tipo' | 'id' | 'ubicacion' | 'referenciaCatastral' | 'titularClienteId'>): string {
  const { cp, direccion } = precargaDeUbicacion(a.ubicacion)
  const q = new URLSearchParams({ alta: '1', poliza: `${a.tipo}:${a.id}` })
  if (cp) q.set('cp', cp)
  if (direccion) q.set('dir', direccion)
  if (a.referenciaCatastral) q.set('rc', a.referenciaCatastral)
  if (a.titularClienteId) q.set('titular', a.titularClienteId)
  return `/patrimonio?${q.toString()}`
}

/**
 * «Esta póliza protege una vivienda que no tienes en tu patrimonio». Con inmueble que casa: «Enlazar» (mismo flujo de
 * propuestas que la ficha del inmueble: el servidor recalcula el origen). Sin él: «Añadir a tu patrimonio» (alta
 * prerrellenada que pasa por el validador de dirección). Con una petición ya abierta no hay botón: se dice cuándo se pidió.
 */
export function AvisoPolizaSinInmueble({ aviso }: { aviso: AvisoUI }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const p = aviso.peticion

  async function enlazar() {
    if (aviso.propuesta.accion !== 'enlazar') return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/inmuebles/${aviso.propuesta.inmuebleId}/seguros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enlazar', tipo: aviso.tipo, polizaId: aviso.id, estado: 'confirmado', origen: aviso.propuesta.origen }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(ERRORES[j.error ?? ''] ?? 'No se ha podido enlazar. Inténtalo de nuevo.')
        return
      }
      router.refresh()
    } catch {
      setError('No se ha podido enlazar. Revisa tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="seccion" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }} role="group" aria-label="Póliza sin inmueble en tu patrimonio">
      <p style={{ margin: 0, fontWeight: 600 }}>
        <span aria-hidden="true">⚠ </span>Esta póliza protege una vivienda que no tienes en tu patrimonio.
      </p>
      {aviso.ubicacion && <p className="suave" style={{ margin: 0, overflowWrap: 'anywhere' }}>{aviso.ubicacion}</p>}
      {p !== null && p.estado === 'pedida' ? (
        <p style={{ margin: 0 }}>Precio pedido el {fechaEs(p.el)}, te llamaremos.</p>
      ) : p !== null && p.estado === 'sin_comprobar' ? (
        <p className="suave" style={{ margin: 0 }}>No hemos podido comprobarlo ahora. Vuelve a mirar en un rato.</p>
      ) : aviso.propuesta.accion === 'enlazar' ? (
        <div>
          <button type="button" className="boton" style={{ minHeight: 44 }} disabled={enviando} onClick={enlazar}>
            {enviando ? 'Enlazando…' : 'Enlazar con el inmueble que ya tienes'}
          </button>
        </div>
      ) : (
        <div>
          <Link className="boton" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }} href={hrefAltaDesdePoliza(aviso)}>
            Añádelo a tu patrimonio
          </Link>
        </div>
      )}
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  )
}
