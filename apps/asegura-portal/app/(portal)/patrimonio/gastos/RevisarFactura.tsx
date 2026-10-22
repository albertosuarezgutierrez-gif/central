'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import type { PropuestaFactura } from '@/lib/patrimonio/factura-propuesta'
import { CATEGORIAS_GASTO, ETIQUETA_CATEGORIA } from '@/lib/patrimonio/gastos-api'

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para hacer eso en este titular.',
  fichero_grande: 'El fichero pesa más de 10 MB.',
  formato_no_admitido: 'Sube un PDF o una foto (JPG, PNG o WebP).',
  fichero_requerido: 'Elige un fichero.',
  tope_diario: 'Has llegado al máximo de facturas de hoy. Vuelve mañana o añade el gasto a mano.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  ya_resuelto: 'Esta factura ya estaba resuelta.',
}
const CAMPOS: Record<string, string> = { fecha: 'fecha', categoria: 'categoría', total: 'total', base: 'base', concepto: 'concepto', inmueble: 'inmueble' }
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const rejilla: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }
const boton: React.CSSProperties = { minHeight: 44 }

type Subida = { id: string; inmueble: string | null; fuente: 'texto' | 'vision' | 'none'; propuesta: PropuestaFactura; motivos: string[] }
type RespuestaApi = Partial<Subida> & { error?: string; campo?: string }

/** Céntimos → texto editable en español («1234,56»); `null` → vacío (no se sabe, no «0»). */
const centATexto = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','))
const mensaje = (j: RespuestaApi) =>
  j.error === 'datos_invalidos' ? `Revisa el campo «${CAMPOS[j.campo ?? ''] ?? j.campo ?? ''}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido completarlo. Inténtalo de nuevo.')

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span className="suave" style={{ fontSize: 12 }}>{k}</span>
      <div style={{ overflowWrap: 'anywhere' }}>{v}</div>
    </div>
  )
}

function Revision({ s, clienteId, inmuebles, fin }: { s: Subida; clienteId: string; inmuebles: { id: string; alias: string }[]; fin: () => void }) {
  const p = s.propuesta
  const [inmueble, setInmueble] = useState(s.inmueble ?? '')
  const [fecha, setFecha] = useState(p.fecha ?? '')
  const [categoria, setCategoria] = useState<string>(p.categoria ?? '')
  const [concepto, setConcepto] = useState(p.concepto ?? p.proveedor ?? '')
  const [base, setBase] = useState(centATexto(p.baseCent))
  const [total, setTotal] = useState(centATexto(p.totalCent))
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function resolver(cuerpo: Record<string, unknown>) {
    setOcupado(true)
    setError(null)
    try {
      const res = await fetch('/api/patrimonio/facturas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, titular: clienteId, gasto: s.id }) })
      const j = (await res.json().catch(() => ({}))) as RespuestaApi
      if (res.ok) {
        fin()
        router.refresh()
        return
      }
      setError(mensaje(j))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={rejilla}>
      <h3 style={{ margin: 0 }}>Revisa la factura</h3>
      {s.fuente === 'none' ? (
        <p role="status" style={{ margin: 0 }}>No hemos podido leer la factura. Rellena los datos a mano o descártala.</p>
      ) : (
        <div style={{ ...rejilla, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Lo que hemos leído">
          <Dato k="Proveedor" v={p.proveedor ?? '—'} />
          <Dato k="NIF del proveedor" v={p.nifProveedor ?? '—'} />
          <Dato k="Fecha" v={p.fecha ? p.fecha.split('-').reverse().join('/') : '—'} />
          <Dato k="Base" v={eur(p.baseCent === null ? null : p.baseCent / 100)} />
          <Dato k="IVA" v={eur(p.ivaCent === null ? null : p.ivaCent / 100)} />
          <Dato k="Total" v={eur(p.totalCent === null ? null : p.totalCent / 100)} />
        </div>
      )}
      {s.motivos.length > 0 && (
        <ul className="suave" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {s.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      <p className="suave" style={{ margin: 0, fontSize: 13 }}>Lo ha leído una máquina: compruébalo y corrígelo antes de confirmar.</p>

      <form style={rejilla} onSubmit={(e) => {
        e.preventDefault()
        void resolver({ accion: 'confirmar', inmueble: inmueble || null, fecha, categoria, concepto: concepto || null, base: base || null, total })
      }}>
        <label style={etiqueta}>Inmueble (opcional)
          <select className="campo" value={inmueble} disabled={ocupado} onChange={(e) => setInmueble(e.target.value)}>
            <option value="">Sin inmueble</option>
            {inmuebles.map((i) => <option key={i.id} value={i.id}>{i.alias}</option>)}
          </select>
        </label>
        <label style={etiqueta}>Fecha<input className="campo" type="date" value={fecha} required disabled={ocupado} onChange={(e) => setFecha(e.target.value)} /></label>
        <label style={etiqueta}>Categoría
          <select className="campo" value={categoria} required disabled={ocupado} onChange={(e) => setCategoria(e.target.value)}>
            <option value="" disabled>Elige una categoría</option>
            {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
          </select>
        </label>
        <label style={etiqueta}>Concepto<input className="campo" value={concepto} maxLength={200} disabled={ocupado} onChange={(e) => setConcepto(e.target.value)} /></label>
        <label style={etiqueta}>Base, en € (opcional)<input className="campo" inputMode="decimal" value={base} disabled={ocupado} onChange={(e) => setBase(e.target.value)} /></label>
        <label style={etiqueta}>Total, en €<input className="campo" inputMode="decimal" value={total} required disabled={ocupado} onChange={(e) => setTotal(e.target.value)} /></label>
        {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="boton" style={boton} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Confirmar gasto'}</button>
          <button type="button" className="boton boton-secundario" style={boton} disabled={ocupado} onClick={() => void resolver({ accion: 'descartar' })}>Descartar factura</button>
        </div>
      </form>
    </div>
  )
}

/** Subir factura → ver propuesta y motivos → corregir → confirmar. El gasto no existe como confirmado hasta el último paso. */
export function RevisarFactura({ clienteId, inmuebles }: { clienteId: string; inmuebles: { id: string; alias: string }[] }) {
  const [abierto, setAbierto] = useState(false)
  const [inmueble, setInmueble] = useState('')
  const [fichero, setFichero] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subida, setSubida] = useState<Subida | null>(null)
  const cerrar = () => { setAbierto(false); setSubida(null); setFichero(null); setError(null) }

  if (!abierto) {
    return <button type="button" className="boton boton-secundario" style={boton} onClick={() => setAbierto(true)}>Subir factura</button>
  }
  async function subir() {
    if (!fichero) return setError(ERRORES.fichero_requerido)
    setSubiendo(true)
    setError(null)
    try {
      const f = new FormData()
      f.set('titular', clienteId)
      if (inmueble) f.set('inmueble', inmueble)
      f.set('fichero', fichero)
      const res = await fetch('/api/patrimonio/facturas', { method: 'POST', body: f })
      const j = (await res.json().catch(() => ({}))) as RespuestaApi
      if (res.ok && j.id && j.propuesta) setSubida({ id: j.id, inmueble: j.inmueble ?? null, fuente: j.fuente ?? 'none', propuesta: j.propuesta, motivos: j.motivos ?? [] })
      else setError(mensaje(j))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setSubiendo(false)
    }
  }
  if (subida) return <Revision s={subida} clienteId={clienteId} inmuebles={inmuebles} fin={cerrar} />
  return (
    <form style={{ ...rejilla, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); void subir() }}>
      <h3 style={{ margin: 0 }}>Subir factura</h3>
      <label style={etiqueta}>Inmueble (opcional)
        <select className="campo" value={inmueble} disabled={subiendo} onChange={(e) => setInmueble(e.target.value)}>
          <option value="">Sin inmueble</option>
          {inmuebles.map((i) => <option key={i.id} value={i.id}>{i.alias}</option>)}
        </select>
      </label>
      <label style={etiqueta}>Factura (PDF o foto, máx. 10 MB)
        <input className="campo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required disabled={subiendo} onChange={(e) => setFichero(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" className="boton" style={boton} disabled={subiendo}>{subiendo ? 'Leyendo la factura…' : 'Leer factura'}</button>
        <button type="button" className="boton boton-secundario" style={boton} disabled={subiendo} onClick={cerrar}>Cancelar</button>
      </div>
    </form>
  )
}
