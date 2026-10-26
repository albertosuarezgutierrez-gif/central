'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import type { PropuestaFactura } from '@/lib/patrimonio/factura-propuesta'
import { destinoDelFichero, reglaInmuebleSubida } from '@/lib/patrimonio/facturas-regla'
import { CATEGORIAS_GASTO, ETIQUETA_CATEGORIA, type FacturaPendiente } from '@/lib/patrimonio/gastos-api'

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para hacer eso en este titular.',
  fichero_grande: 'El fichero pesa más de 10 MB.',
  formato_no_admitido: 'Sube un PDF o una foto (JPG, PNG o WebP).',
  fichero_requerido: 'Elige un fichero.',
  tope_diario: 'Has llegado al máximo de facturas de hoy. Vuelve mañana o añade el gasto a mano.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  ya_resuelto: 'Esta factura ya estaba resuelta.',
  longitud_requerida: 'No hemos podido enviar el fichero. Inténtalo de nuevo.',
}
const CAMPOS: Record<string, string> = { fecha: 'fecha', categoria: 'categoría', total: 'total', base: 'base', iva: 'IVA', retencion: 'retención', concepto: 'concepto', inmueble: 'inmueble' }
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const rejilla: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }
const boton: React.CSSProperties = { minHeight: 44 }

type Subida = { id: string; inmueble: string | null; fuente: 'texto' | 'vision' | 'none'; propuesta: PropuestaFactura; motivos: string[] }
type RespuestaApi = Partial<Subida> & { error?: string; campo?: string; motivo?: string }
const PAGINA = 50

/** Céntimos → texto editable en español («1234,56»); `null` → vacío (no se sabe, no «0»). */
const centATexto = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','))
const mensaje = (j: RespuestaApi) =>
  j.error === 'datos_invalidos' && j.motivo === 'no_cuadra'
    ? 'Los importes no cuadran: el total debe ser base + IVA − retención.'
    : j.error === 'datos_invalidos' ? `Revisa el campo «${CAMPOS[j.campo ?? ''] ?? j.campo ?? ''}».` : (ERRORES[j.error ?? ''] ?? 'No hemos podido completarlo. Inténtalo de nuevo.')

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
  const [iva, setIva] = useState(centATexto(p.ivaCent))
  const [retencion, setRetencion] = useState(centATexto(p.retencionCent))
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
          <Dato k="Fecha" v={p.fecha ? p.fecha.split('-').reverse().join('/') : 'fecha sin leer'} />
          <Dato k="Base" v={eur(p.baseCent === null ? null : p.baseCent / 100)} />
          <Dato k="IVA" v={eur(p.ivaCent === null ? null : p.ivaCent / 100)} />
          <Dato k="Retención IRPF" v={eur(p.retencionCent === null ? null : p.retencionCent / 100)} />
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
        void resolver({ accion: 'confirmar', inmueble: inmueble || null, fecha, categoria, concepto: concepto || null, base: base || null, iva: iva || null, retencion: retencion || null, total })
      }}>
        <label style={etiqueta}>Inmueble (opcional)
          <select className="campo" value={inmueble} disabled={ocupado} onChange={(e) => setInmueble(e.target.value)}>
            <option value="">Sin inmueble</option>
            {inmuebles.map((i) => <option key={i.id} value={i.id}>{i.alias}</option>)}
          </select>
        </label>
        {(() => {
          const destino = destinoDelFichero(s.inmueble, inmueble)
          const origen = inmuebles.find((i) => i.id === s.inmueble)?.alias
          if (destino === 'se_traslada') return <p className="suave" style={{ margin: 0, fontSize: 13 }}>El fichero de la factura se guardará en este inmueble.</p>
          if (destino === 'queda' && inmueble === '') return <p className="suave" style={{ margin: 0, fontSize: 13 }}>Sin inmueble: el fichero seguirá guardado en {origen ? `«${origen}»` : 'el inmueble donde lo subiste'}.</p>
          return null
        })()}
        <label style={etiqueta}>Fecha<input className="campo" type="date" value={fecha} required disabled={ocupado} onChange={(e) => setFecha(e.target.value)} /></label>
        <label style={etiqueta}>Categoría
          <select className="campo" value={categoria} required disabled={ocupado} onChange={(e) => setCategoria(e.target.value)}>
            <option value="" disabled>Elige una categoría</option>
            {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
          </select>
        </label>
        <label style={etiqueta}>Concepto<input className="campo" value={concepto} maxLength={200} disabled={ocupado} onChange={(e) => setConcepto(e.target.value)} /></label>
        <label style={etiqueta}>Base, en € (opcional)<input className="campo" inputMode="decimal" value={base} disabled={ocupado} onChange={(e) => setBase(e.target.value)} /></label>
        <label style={etiqueta}>IVA, en € (opcional; vacío si está exenta)<input className="campo" inputMode="decimal" value={iva} disabled={ocupado} onChange={(e) => setIva(e.target.value)} /></label>
        <label style={etiqueta}>Retención de IRPF, en € (opcional)<input className="campo" inputMode="decimal" value={retencion} disabled={ocupado} onChange={(e) => setRetencion(e.target.value)} /></label>
        <label style={etiqueta}>Total a pagar, en € (base + IVA − retención)<input className="campo" inputMode="decimal" value={total} required disabled={ocupado} onChange={(e) => setTotal(e.target.value)} /></label>
        {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div className="acciones">
          <button type="submit" className="boton" style={boton} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Confirmar gasto'}</button>
          <button type="button" className="boton boton-secundario" style={boton} disabled={ocupado} onClick={() => void resolver({ accion: 'descartar' })}>Descartar factura</button>
        </div>
      </form>
    </div>
  )
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

/**
 * Facturas ya subidas y leídas que quedaron sin confirmar (se cerró la revisión): reabre la misma revisión con lo guardado.
 * Solo se pinta para titulares con nivel de gestión (el servidor ya las filtra por `accesosPatrimonio`). ~50 + «Ver más».
 */
export function FacturasPendientes({ clienteId, inmuebles, pendientes }: { clienteId: string; inmuebles: { id: string; alias: string }[]; pendientes: FacturaPendiente[] }) {
  const [visibles, setVisibles] = useState(PAGINA)
  const [abierta, setAbierta] = useState<string | null>(null)
  if (pendientes.length === 0) return null
  return (
    <div style={{ marginTop: 16 }}>
      <h3>Facturas pendientes de revisar</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {pendientes.slice(0, visibles).map((f) => (
          <li key={f.id} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
            {abierta === f.id ? (
              <Revision s={{ id: f.id, inmueble: f.inmuebleId, fuente: f.fuente, propuesta: f.propuesta, motivos: f.motivos }} clienteId={clienteId} inmuebles={inmuebles} fin={() => setAbierta(null)} />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <strong>{f.propuesta.concepto ?? f.propuesta.proveedor ?? 'Factura sin leer'}</strong>
                  <br />
                  <span className="suave" style={{ fontSize: 13 }}>
                    {f.propuesta.fecha ? fechaEs(f.propuesta.fecha) : 'fecha sin leer'} · {f.propuesta.totalCent === null ? 'total sin leer' : eur(f.propuesta.totalCent / 100)}
                  </span>
                </span>
                <button type="button" className="boton boton-secundario" style={boton} onClick={() => setAbierta(f.id)}>Revisar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {pendientes.length > visibles && (
        <button type="button" className="boton boton-secundario" style={{ ...boton, marginTop: 8 }} onClick={() => setVisibles((v) => v + PAGINA)}>
          Ver más ({pendientes.length - visibles} restantes)
        </button>
      )}
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
  const regla = reglaInmuebleSubida(inmuebles.length, inmueble)

  if (!abierto) {
    return <button type="button" className="boton boton-secundario" style={boton} onClick={() => setAbierto(true)}>Subir factura</button>
  }
  async function subir() {
    if (!fichero) return setError(ERRORES.fichero_requerido)
    // Sin inmueble no se guarda el fichero: con inmuebles hay que elegir uno.
    if (regla === 'elegir') return setError('Elige el inmueble de la factura para guardarla.')
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
      {regla === 'sin_inmuebles' ? (
        <p className="suave" role="status" style={{ margin: 0 }}>Añade primero un inmueble para guardar la factura. Puedes leerla igualmente, pero el fichero no se conservará.</p>
      ) : (
        <label style={etiqueta}>Inmueble (para guardar la factura)
          <select className="campo" value={inmueble} required disabled={subiendo} onChange={(e) => setInmueble(e.target.value)}>
            <option value="" disabled>Elige un inmueble</option>
            {inmuebles.map((i) => <option key={i.id} value={i.id}>{i.alias}</option>)}
          </select>
        </label>
      )}
      <label style={etiqueta}>Factura (PDF o foto, máx. 10 MB)
        <input className="campo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required disabled={subiendo} onChange={(e) => setFichero(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="acciones">
        <button type="submit" className="boton" style={boton} disabled={subiendo}>{subiendo ? 'Leyendo la factura…' : 'Leer factura'}</button>
        <button type="button" className="boton boton-secundario" style={boton} disabled={subiendo} onClick={cerrar}>Cancelar</button>
      </div>
    </form>
  )
}
