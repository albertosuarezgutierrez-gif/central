'use client'
import { useCallback, useEffect, useState } from 'react'

type Enlace = { id: string; inquilinoId: string; estado: string; creadoEn: string; caducaEn: string | null; revocadoPor: string | null }
type Doc = { id: string; inquilinoId: string; nombre: string; carpeta: string; creadoEn: string; compartido: boolean }

const ESTADO: Record<string, string> = {
  vigente: 'Sin abrir todavía',
  en_uso: 'El inquilino ya lo ha abierto',
  usado: 'Ya usado',
  caducado: 'Caducado',
  anulado: 'Anulado',
  revocado: 'Acceso retirado',
}

/**
 * P17 — el ENLACE para el inquilino. El portal NO envía nada: crea un enlace de un solo uso (caduca a los 14 días) que la persona
 * copia o comparte ella misma. El token se enseña UNA vez (en BD solo queda su hash). Sin casilla ni oferta: el inquilino solo
 * verá su contrato, los recibos que marques aquí y lo que suba él.
 */
export function EnlaceInquilino({ contratoId, inquilinos }: { contratoId: string; inquilinos: Array<{ id: string; nombre: string }> }) {
  const base = `/api/patrimonio/contratos/${contratoId}`
  const [inquilinoId, setInquilinoId] = useState(inquilinos[0]?.id ?? '')
  const [contacto, setContacto] = useState('')
  const [enlace, setEnlace] = useState<string | null>(null)
  const [enlaces, setEnlaces] = useState<Enlace[] | null>(null)
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const cargar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch(`${base}/enlace-inquilino`), fetch(`${base}/recibos-compartidos`)])
      if (a.ok) setEnlaces(((await a.json()) as { enlaces: Enlace[] }).enlaces)
      if (b.ok) setDocs(((await b.json()) as { documentos: Doc[] }).documentos)
    } catch {
      setAviso('No hemos podido cargar los enlaces. Recarga la página.')
    }
  }, [base])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function crear() {
    setOcupado(true)
    setAviso(null)
    setEnlace(null)
    try {
      const r = await fetch(`${base}/enlace-inquilino`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inquilinoId, contacto }),
      })
      const j = (await r.json().catch(() => null)) as { token?: string; error?: string; campo?: string } | null
      if (r.ok && j?.token) {
        setEnlace(`${window.location.origin}/inquilino/${j.token}`)
        void cargar()
      } else {
        setAviso(
          j?.campo === 'contacto'
            ? 'Escribe el nombre con el que se presentará ante tu inquilino.'
            : j?.error === 'limite_diario'
              ? 'Has creado ya muchos enlaces hoy. Prueba mañana.'
              : 'No hemos podido crear el enlace. Inténtalo otra vez.',
        )
      }
    } catch {
      setAviso('No hemos podido crear el enlace: comprueba tu conexión.')
    } finally {
      setOcupado(false)
    }
  }

  async function copiar() {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(enlace)
      setAviso('Enlace copiado.')
    } catch {
      setAviso('No hemos podido copiarlo: mantén pulsado el enlace y cópialo.')
    }
  }

  async function compartir() {
    if (!enlace) return
    try {
      await navigator.share({ title: 'Tu contrato de alquiler', text: 'Aquí puedes ver tu contrato de alquiler:', url: enlace })
    } catch {
      /* cerrar el menú de compartir no es un error */
    }
  }

  async function retirar(id: string) {
    setOcupado(true)
    try {
      const r = await fetch(`${base}/enlace-inquilino/${id}`, { method: 'DELETE' })
      setAviso(r.ok ? 'Retirado: ese enlace ya no abre nada.' : 'No hemos podido retirarlo.')
      void cargar()
    } finally {
      setOcupado(false)
    }
  }

  async function marcar(documentoId: string, compartirDoc: boolean) {
    setOcupado(true)
    try {
      const r = await fetch(`${base}/recibos-compartidos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentoId, compartir: compartirDoc }),
      })
      if (!r.ok) setAviso('No hemos podido cambiarlo.')
      void cargar()
    } finally {
      setOcupado(false)
    }
  }

  const nombreDe = (id: string) => inquilinos.find((q) => q.id === id)?.nombre ?? 'Inquilino'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, marginTop: 16 }}>
      <h3 style={{ fontSize: 15, margin: 0 }}>Enlace para tu inquilino</h3>
      <p className="suave" style={{ margin: 0, fontSize: 13 }}>
        El portal no le envía nada: tú copias o compartes el enlace. Es de un solo uso y caduca a los 14 días. Tu inquilino verá solo
        este contrato (renta, fechas, los recibos que marques abajo y el nombre con el que te presentas) y podrá subir justificantes.
        Podéis retirar el acceso los dos.
      </p>
      <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
        Para quién
        <select value={inquilinoId} onChange={(e) => setInquilinoId(e.target.value)} style={{ minHeight: 44 }}>
          {inquilinos.map((q) => (
            <option key={q.id} value={q.id}>
              {q.nombre}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
        Nombre con el que te verá
        <input value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={80} style={{ minHeight: 44 }} />
      </label>
      <div>
        <button type="button" onClick={crear} disabled={ocupado || inquilinoId === ''} style={{ minHeight: 44 }}>
          Crear enlace
        </button>
      </div>
      {enlace && (
        <div className="editor">
          <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{enlace}</p>
          <p className="suave" style={{ margin: '6px 0', fontSize: 13 }}>Guárdalo ahora: no se puede volver a ver (solo crear otro).</p>
          <button type="button" onClick={copiar} style={{ minHeight: 44 }}>
            Copiar enlace
          </button>{' '}
          {puedeCompartir && (
            <button type="button" onClick={compartir} style={{ minHeight: 44 }}>
              Compartir…
            </button>
          )}
        </div>
      )}
      {aviso && (
        <p role="status" style={{ margin: 0 }}>
          {aviso}
        </p>
      )}

      {enlaces && enlaces.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {enlaces.map((e) => (
            <li key={e.id} style={{ overflowWrap: 'anywhere' }}>
              <strong>{nombreDe(e.inquilinoId)}</strong> · {ESTADO[e.estado] ?? e.estado}
              {e.revocadoPor === 'inquilino' ? ' (lo retiró el inquilino)' : ''}
              {(e.estado === 'vigente' || e.estado === 'en_uso') && (
                <>
                  {' '}
                  <button type="button" onClick={() => retirar(e.id)} disabled={ocupado} style={{ minHeight: 44 }}>
                    {e.estado === 'en_uso' ? 'Retirar acceso' : 'Anular enlace'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ fontSize: 15, margin: 0 }}>Documentos que ve el inquilino</h3>
      {docs === null ? null : docs.length === 0 ? (
        <p className="suave" style={{ margin: 0, fontSize: 13 }}>
          No hay documentos de tus inquilinos. Sube recibos en su carpeta y márcalos aquí para compartirlos; los justificantes que suba
          él aparecen en su carpeta de recibos.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {docs.map((d) => (
            <li key={d.id}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, overflowWrap: 'anywhere' }}>
                <input type="checkbox" checked={d.compartido} disabled={ocupado} onChange={(e) => marcar(d.id, e.target.checked)} style={{ width: 20, height: 20, marginTop: 4 }} />
                <span>
                  {d.nombre} <span className="suave">· {nombreDe(d.inquilinoId)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
