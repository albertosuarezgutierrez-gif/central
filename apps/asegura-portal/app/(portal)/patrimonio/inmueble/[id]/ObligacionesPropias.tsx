'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { ObligacionesDeInmueble, PropiaPintable } from '@/lib/patrimonio/obligaciones-api'

const CATEGORIAS: [string, string][] = [
  ['ibi', 'IBI (impuesto sobre bienes inmuebles)'],
  ['comunidad', 'Cuota de la comunidad'],
  ['caldera', 'Revisión de la caldera'],
  ['ite', 'ITE del edificio'],
  ['fin_seguro', 'Fin del seguro'],
  ['basuras', 'Tasa de basuras'],
  ['hipoteca', 'Hipoteca (cuota o vencimiento)'],
  ['otro', 'Otro (cuéntanos cuál)'],
]
const PERIODICIDADES: [string, string][] = [
  ['unica', 'Una sola vez'],
  ['mensual', 'Cada mes'],
  ['trimestral', 'Cada trimestre'],
  ['anual', 'Cada año'],
]
const TEXTO_PERIODICIDAD: Record<string, string> = { unica: 'una vez', mensual: 'cada mes', trimestral: 'cada trimestre', anual: 'cada año' }

const ERRORES: Record<string, string> = {
  no_encontrado: 'Ese recordatorio ya no está disponible. Recarga la página.',
  inmueble_archivado: 'Este inmueble está archivado: solo puedes mirarlo.',
  demasiadas: 'Has llegado al máximo de recordatorios de este inmueble. Archiva alguno que ya no uses.',
  sin_fecha: 'Este recordatorio no tiene fecha. Edítalo y ponle una.',
  periodicidad_desconocida: 'No sabemos leer cada cuánto se repite. Edítalo y elígelo de nuevo.',
  demasiadas_peticiones: 'Demasiados cambios seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  modo_corredor: 'En la vista de corredor no se puede cambiar nada.',
  categoria_no_disponible: 'Ese tipo de recordatorio todavía no se puede guardar. Elige «Otro» y escribe cuál es.',
}
const CAMPOS: Record<string, string> = {
  categoria: 'Elige de qué se trata.',
  vence: 'Pon una fecha válida.',
  periodicidad: 'Elige cada cuánto se repite.',
  descripcion: 'Cuéntanos cuál es (máximo 200 caracteres).',
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, minWidth: 0 }
const boton: React.CSSProperties = { minHeight: 44 }
const fila: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }

type Formulario = { id: string | null; categoria: string; vence: string; periodicidad: string; descripcion: string }
const VACIO: Formulario = { id: null, categoria: '', vence: '', periodicidad: 'anual', descripcion: '' }

/**
 * «Recordatorios» de la ficha del inmueble (25/10/2026): IBI, comunidad, caldera, hipoteca… que el cliente anota. Salen en el
 * calendario, la campana y «Pendiente de ti». Solo Gestión/Total pueden tocar; archivado = solo lectura.
 */
export function ObligacionesPropias({ datos }: { datos: ObligacionesDeInmueble }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState<Formulario | null>(null)

  async function enviar(cuerpo: Record<string, unknown>): Promise<boolean> {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/inmuebles/${datos.inmuebleId}/obligaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; campo?: string }
        setError((j.campo && CAMPOS[j.campo]) || ERRORES[j.error ?? ''] || 'No se ha podido guardar. Inténtalo de nuevo.')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('No se ha podido guardar. Revisa tu conexión.')
      return false
    } finally {
      setEnviando(false)
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!f) return
    const ok = await enviar({
      accion: f.id ? 'editar' : 'crear',
      obligacionId: f.id ?? undefined,
      categoria: f.categoria,
      vence: f.vence,
      periodicidad: f.periodicidad,
      descripcion: f.descripcion,
    })
    if (ok) setF(null)
  }

  const editar = (p: PropiaPintable) =>
    setF({ id: p.id, categoria: p.categoria, vence: p.vence ?? '', periodicidad: p.periodicidad ?? 'anual', descripcion: p.descripcion ?? '' })

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {datos.propias.length === 0 ? (
        <p style={{ margin: 0 }}>No has anotado ningún recordatorio de este inmueble.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {datos.propias.map((p) => (
            <li key={p.id} style={{ minWidth: 0 }}>
              <strong style={{ overflowWrap: 'anywhere' }}>{p.etiqueta}</strong>
              <div className="suave" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                {p.vence ? fechaEs(p.vence) : 'Sin fecha'} ·{' '}
                {p.periodicidad ? TEXTO_PERIODICIDAD[p.periodicidad] : 'no sabemos cada cuánto se repite'}
                {p.descripcion ? ` · ${p.descripcion}` : ''}
              </div>
              {datos.puedeEditar && (
                <div style={{ ...fila, marginTop: 4 }}>
                  <button type="button" className="boton-tenue" style={boton} disabled={enviando} onClick={() => enviar({ accion: 'hecha', obligacionId: p.id })}>
                    Hecho
                  </button>
                  <button type="button" className="boton-tenue" style={boton} disabled={enviando} onClick={() => editar(p)}>
                    Editar
                  </button>
                  <button type="button" className="boton-tenue" style={boton} disabled={enviando} onClick={() => enviar({ accion: 'archivar', obligacionId: p.id })}>
                    Archivar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}

      {datos.puedeEditar &&
        (f === null ? (
          <div style={fila}>
            <button type="button" className="boton" style={boton} onClick={() => setF({ ...VACIO })}>Añadir recordatorio</button>
          </div>
        ) : (
          <form onSubmit={guardar} className="seccion" style={{ margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <label style={etiqueta}>¿De qué se trata?
              <select className="campo" value={f.categoria} required disabled={enviando} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
                <option value="">Elige una opción</option>
                {CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label style={etiqueta}>Fecha
              <input className="campo" type="date" value={f.vence} required min="2000-01-01" max="2100-12-31" disabled={enviando} onChange={(e) => setF({ ...f, vence: e.target.value })} />
            </label>
            <label style={etiqueta}>¿Se repite?
              <select className="campo" value={f.periodicidad} disabled={enviando} onChange={(e) => setF({ ...f, periodicidad: e.target.value })}>
                {PERIODICIDADES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label style={etiqueta}>{f.categoria === 'otro' ? 'Cuéntanos cuál' : 'Nota (opcional)'}
              <input className="campo" value={f.descripcion} maxLength={200} required={f.categoria === 'otro'} disabled={enviando} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
            </label>
            <div style={fila}>
              <button type="submit" className="boton" style={boton} disabled={enviando}>{f.id ? 'Guardar cambios' : 'Guardar recordatorio'}</button>
              <button type="button" className="boton-tenue" style={boton} disabled={enviando} onClick={() => { setF(null); setError(null) }}>Cancelar</button>
            </div>
          </form>
        ))}
    </div>
  )
}
