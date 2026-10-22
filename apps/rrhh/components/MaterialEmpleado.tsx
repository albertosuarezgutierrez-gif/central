'use client'
import { useEffect, useRef, useState } from 'react'
import {
  TIPOS_MATERIAL, ETIQUETA_TIPO, ETIQUETA_ESTADO, NOMBRE_MAX, NOTA_MAX, LADO_MAX_COMPRIMIDO,
  decidirSubida, empleadoPuedeBorrar, type TipoMaterial, type EstadoMaterial,
} from '@/lib/material'

type Material = {
  id: string; tipo: TipoMaterial; nombre: string; nota: string | null; estado: EstadoMaterial
  estado_nota: string | null; creado_at: string; url: string | null
}

const COLOR_ESTADO: Record<EstadoMaterial, string> = {
  pendiente: 'text-ink-3', revisado: 'text-ok', falta_roto: 'text-alert', devuelto: 'text-ink-2',
}

/** Reduce a ~1600 px de lado mayor en JPEG. null si el navegador no puede decodificarla (p. ej. HEIC). */
async function comprimir(file: File): Promise<Blob | null> {
  try {
    let fuente: CanvasImageSource & { width: number; height: number }
    try {
      fuente = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      const url = URL.createObjectURL(file)
      try {
        fuente = await new Promise<HTMLImageElement>((ok, ko) => {
          const img = new Image(); img.onload = () => ok(img); img.onerror = ko; img.src = url
        })
      } finally { setTimeout(() => URL.revokeObjectURL(url), 0) }
    }
    const w = fuente.width, h = fuente.height
    if (!w || !h) return null
    const k = Math.min(1, LADO_MAX_COMPRIMIDO / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height)
    if ('close' in fuente && typeof fuente.close === 'function') fuente.close()
    return await new Promise<Blob | null>(ok => canvas.toBlob(b => ok(b), 'image/jpeg', 0.82))
  } catch { return null }
}

export default function MaterialEmpleado() {
  const [lista, setLista] = useState<Material[] | null>(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoMaterial>('epi')
  const [nombre, setNombre] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function cargar() {
    try {
      const r = await fetch('/api/e/material')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErrorCarga(j.error ?? 'No se pudo cargar tu material'); return }
      setLista(j.material); setErrorCarga('')
    } catch { setErrorCarga('Error de red') }
  }
  useEffect(() => { cargar() }, [])
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa) }, [previa])

  function elegir(f: File | undefined) {
    if (!f) return
    setArchivo(f); setError(''); setAbierto(true)
    setPrevia(URL.createObjectURL(f))
  }

  function cerrar() {
    setAbierto(false); setArchivo(null); setPrevia(null); setNombre(''); setNota(''); setError('')
  }

  async function enviar() {
    if (!archivo) { setError('Haz o elige una foto'); return }
    if (!nombre.trim()) { setError('Pon un nombre corto'); return }
    setEnviando(true); setError('')
    try {
      const comprimida = await comprimir(archivo)
      const d = decidirSubida(archivo, comprimida)
      if ('error' in d) { setError(d.error); return }
      const fd = new FormData()
      if (d.usar === 'comprimida' && comprimida) fd.set('foto', comprimida, 'foto.jpg')
      else fd.set('foto', archivo, archivo.name || 'foto')
      fd.set('tipo', tipo); fd.set('nombre', nombre); fd.set('nota', nota)
      const r = await fetch('/api/e/material', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? (r.status === 413 ? 'La foto es demasiado grande' : 'No se pudo subir')); return }
      setLista(l => [j.material, ...(l ?? [])])
      cerrar()
    } catch { setError('Error de red. Vuelve a probar.') }
    finally { setEnviando(false) }
  }

  async function borrar(m: Material) {
    if (!confirm(`¿Borrar «${m.nombre}»?`)) return
    const r = await fetch(`/api/e/material/${m.id}`, { method: 'DELETE' })
    if (r.ok) setLista(l => (l ?? []).filter(x => x.id !== m.id))
    else { alert((await r.json().catch(() => ({}))).error ?? 'No se pudo borrar'); cargar() }
  }

  return (
    <section className="my-3 min-w-0 rounded-card border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base">Mi material</h2>
        <button type="button" onClick={() => input.current?.click()} className="min-h-[44px] px-4">
          📷 Añadir material
        </button>
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { elegir(e.target.files?.[0]); e.currentTarget.value = '' }} />
      </div>
      <p className="mt-1 text-xs text-ink-3">Haz una foto de tus EPIs, herramientas o máquinas para que RRHH lo tenga registrado.</p>

      {abierto && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-line p-3">
          {previa && <img src={previa} alt="Foto elegida" className="max-h-48 w-full rounded-lg object-contain bg-paper-2" />}
          <label className="text-xs text-ink-2">Tipo
            <select className="mt-1 block w-full" value={tipo} onChange={e => setTipo(e.target.value as TipoMaterial)}>
              {TIPOS_MATERIAL.map(t => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-2">Nombre corto
            <input className="mt-1 block w-full" value={nombre} maxLength={NOMBRE_MAX} placeholder="Ej.: Botas de seguridad"
              onChange={e => setNombre(e.target.value)} />
          </label>
          <label className="text-xs text-ink-2">Nota (opcional)
            <textarea className="mt-1 block w-full" rows={2} value={nota} maxLength={NOTA_MAX}
              onChange={e => setNota(e.target.value)} />
          </label>
          {error && <p className="text-sm text-alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={enviar} disabled={enviando} className="min-h-[44px] flex-1 px-4">
              {enviando ? 'Subiendo…' : 'Subir'}
            </button>
            <button type="button" onClick={cerrar} disabled={enviando} className="min-h-[44px] bg-paper-2 px-4 text-ink-2 hover:bg-line">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {errorCarga && <p className="mt-2 text-sm text-alert">{errorCarga}</p>}
      {lista === null && !errorCarga && <p className="mt-2 text-sm text-ink-3">Cargando…</p>}
      {lista && lista.length === 0 && <p className="mt-2 text-sm text-ink-3">Aún no has subido material.</p>}
      {lista && lista.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {lista.map(m => (
            <li key={m.id} className="flex min-w-0 items-start gap-3 rounded-lg border border-line p-2">
              {m.url
                ? <button type="button" onClick={() => setAmpliada(m.url)} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-transparent p-0" aria-label={`Ampliar foto de ${m.nombre}`}>
                    <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-paper-2 text-xs text-ink-3">Sin foto</div>}
              <div className="min-w-0 flex-1 text-sm">
                <p className="break-words font-medium">{m.nombre}</p>
                <p className="text-xs text-ink-3">{ETIQUETA_TIPO[m.tipo] ?? m.tipo} · {new Date(m.creado_at).toLocaleDateString('es-ES')}</p>
                <p className={`text-xs font-medium ${COLOR_ESTADO[m.estado] ?? ''}`}>{ETIQUETA_ESTADO[m.estado] ?? m.estado}</p>
                {m.estado_nota && <p className="break-words text-xs text-ink-2">RRHH: {m.estado_nota}</p>}
              </div>
              {empleadoPuedeBorrar(m.estado) && (
                <button type="button" onClick={() => borrar(m)} className="min-h-[44px] shrink-0 bg-transparent px-2 text-xs text-alert underline">
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {ampliada && (
        <div onClick={() => setAmpliada(null)} className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-2">
          <img src={ampliada} alt="Foto ampliada" className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain" />
        </div>
      )}
    </section>
  )
}
