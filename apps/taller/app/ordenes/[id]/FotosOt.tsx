'use client'
import { useState, useTransition } from 'react'
import { anadirFotosAccion } from '../acciones'

async function comprimir(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('foto'))), 'image/jpeg', 0.8))
}

/** Hace fotos (cámara) o elige de la galería y las sube a la OT. Se comprimen en el navegador (~0,3 MB). */
export function FotosOt({ otId }: { otId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [pend, iniciar] = useTransition()
  return (
    <div className="fila">
      <label className={`btn btn-sec${pend ? ' desactivado' : ''}`}>{pend ? 'Subiendo…' : 'Hacer o subir fotos'}
        <input type="file" accept="image/*" capture="environment" multiple hidden disabled={pend}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 12)
            e.target.value = ''
            if (files.length === 0) return
            iniciar(async () => {
              const fd = new FormData()
              fd.set('otId', otId)
              for (const [i, f] of files.entries()) fd.set(`foto_${i}`, new File([await comprimir(f)], `foto-${i}.jpg`, { type: 'image/jpeg' }))
              const r = await anadirFotosAccion(fd)
              if (r.ok) location.reload(); else setMsg({ ok: false, t: r.errores.join(' · ') })
            })
          }} />
      </label>
      {msg && <p className={msg.ok ? 'ok' : 'aviso-error'} role="alert">{msg.t}</p>}
    </div>
  )
}
