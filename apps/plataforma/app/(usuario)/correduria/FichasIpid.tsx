'use client'
import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import { interpretarIpid, type LecturaIpid } from '@/lib/ipid-asegura'

/**
 * Fichas IPID por compañía + producto. Se suben una vez y el portal las enseña en cada opción de
 * presupuesto con esa misma compañía y producto (se comparan sin mayúsculas, tildes ni signos).
 * La aceptación firmada cita la huella de la que el cliente tenía delante.
 */
const input = { width: '100%', minHeight: 44, fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' as const }

export default function FichasIpid() {
  const [lectura, setLectura] = useState<LecturaIpid | null>(null)
  const [compania, setCompania] = useState('')
  const [producto, setProducto] = useState('')
  const [fichero, setFichero] = useState<File | null>(null)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const res = await fetch('/api/correduria/ipid', { cache: 'no-store' }).catch(() => null)
    setLectura(res ? interpretarIpid(res.status, await res.json().catch(() => null)) : { estado: 'error', motivo: 'red' })
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  async function subir() {
    if (!fichero) return
    setEnviando(true); setMensaje(null)
    const form = new FormData()
    form.set('compania', compania); form.set('producto', producto); form.set('fichero', fichero)
    const res = await fetch('/api/correduria/ipid', { method: 'POST', body: form }).catch(() => null)
    const j = (res ? await res.json().catch(() => null) : null) as { estado?: string; motivo?: string; sustituye?: boolean } | null
    if (res?.status === 201) {
      setMensaje({ ok: true, texto: j?.sustituye ? 'Ficha sustituida (la anterior queda retirada).' : 'Ficha guardada.' })
      setProducto(''); setFichero(null)
      await cargar()
    } else {
      setMensaje({ ok: false, texto: j?.motivo ?? 'No se ha guardado: no se pudo hablar con asegura.' })
    }
    setEnviando(false)
  }

  async function retirar(id: string) {
    if (!confirm('¿Retirar esta ficha? Los presupuestos dejarán de enseñarla; lo ya firmado conserva su huella.')) return
    const res = await fetch(`/api/correduria/ipid?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) await cargar()
    else setMensaje({ ok: false, texto: 'No se ha retirado.' })
  }

  return (
    <Bloque Icono={FileText} titulo="Fichas IPID de producto"
      sub="El documento de información del producto de cada compañía. El cliente lo ve en su presupuesto antes de aceptar, y lo que firma cita cuál vio.">
      {lectura === null && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>}
      {lectura && lectura.estado !== 'ok' && (
        <p style={{ fontSize: 13, color: 'var(--warning)' }}>
          No se han podido leer las fichas ({lectura.estado === 'error' ? lectura.motivo : lectura.estado}). No significa que no haya.
        </p>
      )}
      {lectura?.estado === 'ok' && (lectura.fichas.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>No hay ninguna ficha subida: los presupuestos dirán que no consta el IPID.</p>
        : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 6 }}>
            {lectura.fichas.map((f) => (
              <li key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14, borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                <span style={{ flex: '1 1 220px' }}><strong>{f.compania}</strong> · {f.producto} <span style={{ color: 'var(--muted)', fontSize: 13 }}>({f.nombreFichero}, {f.createdAt})</span></span>
                <button type="button" onClick={() => void retirar(f.id)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Retirar</button>
              </li>
            ))}
          </ul>
        ))}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>Subir una ficha IPID</summary>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
          Escribe la compañía y el producto tal y como salen en el presupuesto (por ejemplo «Allianz» y «Todo Riesgo»).
        </p>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <input style={input} placeholder="Compañía" value={compania} onChange={(e) => setCompania(e.target.value)} />
          <input style={input} placeholder="Producto" value={producto} onChange={(e) => setProducto(e.target.value)} />
          <input style={input} type="file" accept="application/pdf" onChange={(e) => setFichero(e.target.files?.[0] ?? null)} aria-label="PDF de la ficha IPID" />
        </div>
        <button type="button" disabled={enviando || !compania.trim() || !producto.trim() || !fichero} onClick={() => void subir()}
          style={{ ...btnStyle('primario', 'md'), minHeight: 44, marginTop: 8 }}>
          {enviando ? 'Subiendo…' : 'Subir ficha'}
        </button>
      </details>
      {mensaje && <p style={{ fontSize: 13, color: mensaje.ok ? 'var(--positive)' : 'var(--negative)', margin: '8px 0 0' }}>{mensaje.texto}</p>}
    </Bloque>
  )
}
