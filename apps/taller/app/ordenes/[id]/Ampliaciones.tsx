'use client'
// Ampliaciones: el mecánico PROPONE (piezas/trabajos y fotos, sin precios); recepción/dueño pone precio y la manda al cliente.
import { useState, useTransition } from 'react'
import { textoFotoPurgada } from '@central/module-taller'
import { eurosACent } from '@/lib/ajustes'
import { descartarPropuestaAccion, enviarPropuestaAccion, proponerAmpliacionAccion } from '../acciones'

type Linea = { descripcion: string; referencia: string; cantidad: string }
const VACIA: Linea = { descripcion: '', referencia: '', cantidad: '1' }

export function ProponerAmpliacion({ otId }: { otId: string }) {
  const [explicacion, setExplicacion] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([{ ...VACIA }])
  const [fotos, setFotos] = useState<File[]>([])
  const [errores, setErrores] = useState<string[]>([])
  const [pend, iniciar] = useTransition()
  const cambiar = (i: number, p: Partial<Linea>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const validas = lineas.filter((l) => l.descripcion.trim())
  return (
    <div className="ficha">
      <label className="campo">¿Qué has detectado?
        <textarea value={explicacion} maxLength={2000} onChange={(e) => setExplicacion(e.target.value)} />
      </label>
      {lineas.map((l, i) => (
        <div key={i} className="dos-col">
          <label className="campo">Pieza o trabajo<input value={l.descripcion} maxLength={200} onChange={(e) => cambiar(i, { descripcion: e.target.value })} /></label>
          <label className="campo">Referencia (opcional)<input value={l.referencia} maxLength={80} onChange={(e) => cambiar(i, { referencia: e.target.value })} /></label>
          <label className="campo">Cantidad<input inputMode="numeric" value={l.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} /></label>
        </div>
      ))}
      <div className="fila">
        <button type="button" className="btn btn-sec" onClick={() => setLineas([...lineas, { ...VACIA }])}>Otra línea</button>
        <label className="btn btn-sec">Añadir fotos
          <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { setFotos((x) => [...x, ...Array.from(e.target.files ?? [])].slice(0, 12)); e.target.value = '' }} />
        </label>
        {fotos.length > 0 && <span className="tenue">{fotos.length} foto(s)</span>}
      </div>
      {errores.map((m) => <p key={m} className="aviso-error" role="alert">{m}</p>)}
      <button type="button" className="btn" disabled={pend || validas.length === 0} onClick={() => iniciar(async () => {
        setErrores([])
        const fd = new FormData()
        fd.set('datos', JSON.stringify({
          otId, explicacion,
          lineas: validas.map((l) => ({ descripcion: l.descripcion.trim(), referencia: l.referencia.trim() || null, cantidad: Number(l.cantidad) })),
        }))
        for (const [i, f] of fotos.entries()) {
          const bmp = await createImageBitmap(f)
          const esc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
          const c = document.createElement('canvas'); c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc)
          c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
          const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.8))
          if (b) fd.set(`foto_${i}`, new File([b], `ampliacion-${i}.jpg`, { type: 'image/jpeg' }))
        }
        const r = await proponerAmpliacionAccion(fd)
        if (r.ok) location.reload(); else setErrores(r.errores)
      })}>Proponer (queda pendiente de enviar al cliente)</button>
    </div>
  )
}

export type PropuestaVista = {
  id: string; estado: string; explicacion: string; autor: string
  lineas: { orden: number; descripcion: string; referencia: string | null; cantidad: number }[]
  fotos: { id: string; url: string | null; nota: string | null; purgadaEn: string | null }[]
}

/** Recepción/dueño: precio por línea → «Enviar al cliente». */
export function GestionPropuesta({ p, puedeGestionar }: { p: PropuestaVista; puedeGestionar: boolean }) {
  const [precios, setPrecios] = useState<Record<number, string>>({})
  const [errores, setErrores] = useState<string[]>([])
  const [enlace, setEnlace] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()
  const pendiente = p.estado === 'pendiente_envio'
  const cents = p.lineas.map((l) => ({ orden: l.orden, c: eurosACent(precios[l.orden] ?? '') }))
  const completos = cents.every((x) => x.c !== null)
  return (
    <div className="ficha">
      <p><strong>{p.autor}</strong> <span className="estado">{p.estado.replace('_', ' ')}</span></p>
      {p.explicacion && <p>{p.explicacion}</p>}
      <ul className="lista-simple">
        {p.lineas.map((l) => (
          <li key={l.orden}>
            {l.cantidad} × {l.descripcion}{l.referencia ? ` (${l.referencia})` : ''}
            {pendiente && puedeGestionar && (
              <label className="campo">Precio unitario sin IVA (€)
                <input inputMode="decimal" placeholder="12,50" value={precios[l.orden] ?? ''} onChange={(e) => setPrecios({ ...precios, [l.orden]: e.target.value })} />
              </label>
            )}
          </li>
        ))}
      </ul>
      {p.fotos.length > 0 && (
        <div className="fotos-mini">
          {p.fotos.map((f) => (
            <figure key={f.id}>
              {f.purgadaEn ? <span className="tenue">{textoFotoPurgada(new Date(f.purgadaEn))}</span> : f.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.url} alt={f.nota ?? 'Foto de la ampliación'} /> : <span className="tenue">sin imagen</span>}
            </figure>
          ))}
        </div>
      )}
      {pendiente && puedeGestionar && !enlace && (
        <div className="fila">
          <button type="button" className="btn" disabled={pend || !completos} onClick={() => iniciar(async () => {
            setErrores([])
            const r = await enviarPropuestaAccion({ propuestaId: p.id, precios: cents.map((x) => ({ orden: x.orden, precioUnitarioCent: x.c })) })
            if (r.ok) setEnlace(`${location.origin}${r.ruta}`); else setErrores(r.errores)
          })}>Crear enlace para el cliente</button>
          <button type="button" className="btn btn-sec" disabled={pend} onClick={() => iniciar(async () => {
            const r = await descartarPropuestaAccion(p.id)
            if (r.ok) location.reload(); else setErrores(r.errores)
          })}>Descartar</button>
        </div>
      )}
      {enlace && (
        <>
          <p className="ok">Enlace para el cliente (solo se muestra ahora). No se envía nada desde aquí: cópialo y mándalo tú.</p>
          <p className="enlace-copia">{enlace}</p>
          <button type="button" className="btn btn-sec" onClick={() => void navigator.clipboard?.writeText(enlace)}>Copiar enlace</button>
        </>
      )}
      {errores.map((m) => <p key={m} className="aviso-error" role="alert">{m}</p>)}
    </div>
  )
}
