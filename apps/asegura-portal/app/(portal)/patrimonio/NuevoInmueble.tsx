'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ETIQUETA_USO, USOS_INMUEBLE } from '@/lib/patrimonio/usos'

import { DIRECCION_VACIA, DireccionCp, type ValorDireccion } from './DireccionCp'


const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para dar de alta inmuebles en ese titular.',
  ya_existe: 'Ese inmueble ya está dado de alta.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
}

/** Alta prerrellenada desde una póliza (`?alta=1&cp=&dir=&rc=&poliza=tipo:id`, ya saneada por la página). */
export type PrecargaAlta = {
  cp: string
  direccion: string
  referenciaCatastral: string
  titular: string
  poliza: { tipo: 'cartera' | 'declarada'; id: string } | null
}

const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

/** Alta de un inmueble. `titulares` = solo aquellos donde el nivel permite el alta (lo filtra el servidor). */
export function NuevoInmueble({ titulares, precarga }: { titulares: { clienteId: string; nombre: string }[]; precarga?: PrecargaAlta | null }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(precarga != null)
  // Titular de la precarga solo si es uno de los que el servidor ya filtró por nivel de alta; si no, el primero.
  const [titular, setTitular] = useState(titulares.find((t) => t.clienteId === precarga?.titular)?.clienteId ?? titulares[0]?.clienteId ?? '')
  const [alias, setAlias] = useState('')
  const [uso, setUso] = useState<(typeof USOS_INMUEBLE)[number]>('vivienda')
  const [dir, setDir] = useState<ValorDireccion>(precarga ? { ...DIRECCION_VACIA, cp: precarga.cp, direccion: precarga.direccion } : DIRECCION_VACIA)
  const [refCat, setRefCat] = useState(precarga?.referenciaCatastral ?? '')
  // Tri-estado: '' = no lo sé (null), nunca «no» por defecto.
  const [comunidad, setComunidad] = useState<'' | 'si' | 'no'>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (titulares.length === 0) return null
  if (!abierto) {
    return <button type="button" className="boton" style={{ minHeight: 44 }} onClick={() => setAbierto(true)}>Añadir inmueble</button>
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/patrimonio/inmuebles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titular, alias, uso, ...dir,
          referenciaCatastral: refCat.trim() === '' ? null : refCat,
          enComunidad: comunidad === '' ? null : comunidad === 'si',
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string; campo?: string }
      if (res.ok && j.id) {
        // Alta desde una póliza: se enlaza con el flujo de P10 (el servidor busca la póliza DENTRO de lo que ves; si
        // falla, el inmueble ya existe y su ficha propondrá el enlace por dirección). Origen `manual`: el CHECK de
        // `origen` no admite valor nuevo sin DROP.
        if (precarga?.poliza) {
          await fetch(`/api/patrimonio/inmuebles/${j.id}/seguros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'enlazar', tipo: precarga.poliza.tipo, polizaId: precarga.poliza.id, estado: 'confirmado', origen: 'manual' }),
          }).catch(() => null)
        }
        router.push(`/patrimonio/inmueble/${j.id}`)
        router.refresh()
        return
      }
      setError(j.error === 'datos_invalidos' ? `Revisa el campo «${j.campo ?? ''}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido guardarlo. Inténtalo de nuevo.'))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="seccion" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <h2 style={{ margin: 0 }}>Añadir inmueble</h2>
      {titulares.length > 1 && (
        <label style={etiqueta}>Titular
          <select className="campo" value={titular} onChange={(e) => setTitular(e.target.value)} disabled={enviando}>
            {titulares.map((t) => <option key={t.clienteId} value={t.clienteId}>{t.nombre}</option>)}
          </select>
        </label>
      )}
      <label style={etiqueta}>Nombre corto (por ejemplo «Socorro 2ºB»)
        <input className="campo" value={alias} maxLength={80} required disabled={enviando} onChange={(e) => setAlias(e.target.value)} />
      </label>
      <label style={etiqueta}>Uso
        <select className="campo" value={uso} disabled={enviando} onChange={(e) => setUso(e.target.value as typeof uso)}>
          {USOS_INMUEBLE.map((u) => <option key={u} value={u}>{ETIQUETA_USO[u]}</option>)}
        </select>
      </label>
      <DireccionCp valor={dir} onCambio={setDir} disabled={enviando} />
      <label style={etiqueta}>Referencia catastral (opcional, 20 caracteres)
        <input className="campo" value={refCat} maxLength={20} disabled={enviando} onChange={(e) => setRefCat(e.target.value.toUpperCase())} />
      </label>
      <label style={etiqueta}>¿Está en una comunidad de propietarios?
        <select className="campo" value={comunidad} disabled={enviando} onChange={(e) => setComunidad(e.target.value as typeof comunidad)}>
          <option value="">No lo sé</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      </label>
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="acciones">
        <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar inmueble'}</button>
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </form>
  )
}
