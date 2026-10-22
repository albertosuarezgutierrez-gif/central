'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { CARPETAS_POR_OWNER } from '@/lib/patrimonio/carpetas'

type Doc = { id: string; carpeta: string; nombre: string; mime: string; tamano: number; creadoEn: string }
type Lista = { documentos: Doc[]; hayMas: boolean; soloLectura?: boolean }

const CARPETAS = CARPETAS_POR_OWNER.inmueble
const ETIQUETA = Object.fromEntries(CARPETAS.map((c) => [c.id, c.etiqueta])) as Record<string, string>

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para hacer eso con este documento.',
  fichero_requerido: 'Elige un fichero.',
  fichero_grande: 'El fichero pesa más de 10 MB.',
  formato_no_admitido: 'Solo se admiten PDF y fotos (JPG, PNG o WebP).',
  tope_diario: 'Has llegado al máximo de documentos de hoy. Vuelve mañana.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  longitud_requerida: 'No hemos podido enviar el fichero. Inténtalo de nuevo.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
}
const boton: React.CSSProperties = { minHeight: 44 }
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const mensaje = (j: { error?: string; campo?: string }) =>
  j.error === 'datos_invalidos' ? `Revisa el campo «${j.campo ?? ''}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido hacerlo. Inténtalo de nuevo.')

const tamanoEs = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024)).toLocaleString('es-ES')} KB` : `${(b / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`)
const fechaEs = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })

/**
 * Documentos del inmueble: carpetas, subir, descargar y borrar. El `titular` y el owner que se mandan son PETICIONES: el
 * servidor las busca dentro de lo que esta sesión puede ver (ajeno = 404). La lista no trae el fichero; la descarga va por
 * `/api/patrimonio/documentos/<id>` (nunca una URL pública). Se recarga sin desmontar la lista.
 */
export function Documentos({ clienteId, inmuebleId }: { clienteId: string; inmuebleId: string }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [hayMas, setHayMas] = useState(false)
  // Inmueble archivado: histórico del cliente. Se ve y se descarga; no se sube ni se borra (lo dice el servidor).
  const [soloLectura, setSoloLectura] = useState(false)
  const [filtro, setFiltro] = useState<string>('')
  const [carpeta, setCarpeta] = useState<string>(CARPETAS[0].id)
  const [fichero, setFichero] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  const cargar = useCallback(
    async (desde: number) => {
      setCargando(true)
      try {
        const q = new URLSearchParams({ titular: clienteId, ownerTipo: 'inmueble', ownerId: inmuebleId, desde: String(desde) })
        const res = await fetch(`/api/patrimonio/documentos?${q}`)
        const j = (await res.json().catch(() => ({}))) as Partial<Lista> & { error?: string }
        if (!res.ok || !j.documentos) {
          setError(mensaje(j))
          return
        }
        const nuevos = j.documentos
        // Recarga desde 0 sustituye sin vaciar antes (no parpadea); «Ver más» añade sin repetir.
        setDocs((prev) => (desde === 0 || !prev ? nuevos : [...prev, ...nuevos.filter((n) => !prev.some((p) => p.id === n.id))]))
        setHayMas(Boolean(j.hayMas))
        setSoloLectura(j.soloLectura === true)
      } catch {
        setError('No hemos podido conectar. Vuelve a intentarlo.')
      } finally {
        setCargando(false)
      }
    },
    [clienteId, inmuebleId],
  )
  useEffect(() => { void cargar(0) }, [cargar])

  async function subir() {
    if (!fichero) return setError(ERRORES.fichero_requerido)
    setSubiendo(true)
    setError(null)
    try {
      const f = new FormData()
      f.set('titular', clienteId)
      f.set('ownerTipo', 'inmueble')
      f.set('ownerId', inmuebleId)
      f.set('carpeta', carpeta)
      f.set('fichero', fichero)
      const res = await fetch('/api/patrimonio/documentos', { method: 'POST', body: f })
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string; campo?: string }
      if (res.ok && j.id) {
        setFichero(null)
        if (entrada.current) entrada.current.value = ''
        await cargar(0)
      } else setError(mensaje(j))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setSubiendo(false)
    }
  }

  async function borrar(id: string) {
    setBorrando(id)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/documentos/${id}?${new URLSearchParams({ titular: clienteId })}`, { method: 'DELETE' })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) {
        setConfirmando(null)
        setDocs((prev) => prev && prev.filter((d) => d.id !== id))
      } else setError(mensaje(j))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setBorrando(null)
    }
  }

  const visibles = (docs ?? []).filter((d) => filtro === '' || d.carpeta === filtro)
  const chip = (id: string, texto: string) => (
    <button key={id} type="button" className={id === filtro ? 'boton' : 'boton boton-secundario'} style={boton} aria-pressed={id === filtro} onClick={() => setFiltro(id)}>
      {texto}
    </button>
  )

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {soloLectura && <p className="suave" role="status" style={{ margin: 0 }}>Este inmueble está archivado: puedes ver y descargar sus documentos, pero no subir ni borrar.</p>}
      {!soloLectura && <form
        onSubmit={(e) => { e.preventDefault(); void subir() }}
        style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}
      >
        <label style={etiqueta}>Carpeta
          <select className="campo" value={carpeta} disabled={subiendo} onChange={(e) => setCarpeta(e.target.value)}>
            {CARPETAS.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
        </label>
        <label style={etiqueta}>Fichero (PDF o foto, máx. 10 MB)
          <input ref={entrada} className="campo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={subiendo} onChange={(e) => setFichero(e.target.files?.[0] ?? null)} />
        </label>
        <div>
          <button type="submit" className="boton" style={boton} disabled={subiendo || !fichero}>{subiendo ? 'Subiendo…' : 'Subir documento'}</button>
        </div>
      </form>}

      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Carpetas">
        {chip('', 'Todas')}
        {CARPETAS.map((c) => chip(c.id, c.etiqueta))}
      </div>

      {docs === null ? (
        <p className="suave" style={{ margin: 0 }}>{cargando ? 'Cargando documentos…' : 'No hemos podido cargar los documentos.'}</p>
      ) : visibles.length === 0 ? (
        <p className="suave" style={{ margin: 0 }}>{filtro ? 'No hay documentos en esta carpeta.' : 'Todavía no hay documentos.'}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {visibles.map((d) => (
            <li key={d.id} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)', overflowWrap: 'anywhere', minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <strong>{d.nombre}</strong>
                <div className="suave" style={{ fontSize: 13 }}>{ETIQUETA[d.carpeta] ?? d.carpeta} · {tamanoEs(d.tamano)} · {fechaEs(d.creadoEn)}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <a className="boton boton-secundario" style={{ ...boton, display: 'inline-flex', alignItems: 'center' }} href={`/api/patrimonio/documentos/${d.id}?${new URLSearchParams({ titular: clienteId })}`} download>
                  Descargar
                </a>
                {soloLectura ? null : confirmando === d.id ? (
                  <>
                    <button type="button" className="boton" style={boton} disabled={borrando === d.id} onClick={() => void borrar(d.id)}>
                      {borrando === d.id ? 'Borrando…' : 'Sí, borrar'}
                    </button>
                    <button type="button" className="boton boton-secundario" style={boton} disabled={borrando === d.id} onClick={() => setConfirmando(null)}>Cancelar</button>
                  </>
                ) : (
                  <button type="button" className="boton boton-secundario" style={boton} onClick={() => setConfirmando(d.id)}>Borrar</button>
                )}
              </div>
              {confirmando === d.id && <p className="suave" style={{ margin: 0, fontSize: 13 }}>¿Borrar «{d.nombre}»? Dejará de verse en tu lista.</p>}
            </li>
          ))}
        </ul>
      )}

      {hayMas && (
        <div>
          <button type="button" className="boton boton-secundario" style={boton} disabled={cargando} onClick={() => void cargar(docs?.length ?? 0)}>
            {cargando ? 'Cargando…' : 'Ver más'}
          </button>
        </div>
      )}
    </div>
  )
}
