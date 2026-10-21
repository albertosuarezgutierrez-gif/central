'use client'
import { useState } from 'react'

type Aviso = { id: string; texto: string; creado_at: string }

/** Fallos de envío de correo de los últimos 7 días (solo del panel: el empleado nunca lo ve). */
export default function AvisosAdminBanner({ avisos }: { avisos: Aviso[] }) {
  const [lista, setLista] = useState(avisos)
  const [error, setError] = useState(false)
  if (!lista.length) return null
  async function marcar() {
    setError(false)
    try {
      const r = await fetch('/api/admin/avisos-admin/visto', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: lista.map(a => a.id) }),
      })
      if (!r.ok) throw new Error()
      setLista([])
    } catch { setError(true) }
  }
  return (
    <section role="alert" className="mb-4 rounded-[10px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Hay correos que no se han podido enviar</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {lista.map(a => <li key={a.id} className="break-words">{a.texto}</li>)}
      </ul>
      {error && <p className="mt-2 text-red-700">No se pudo marcar como visto. Inténtalo de nuevo.</p>}
      <button type="button" onClick={marcar} className="mt-3 min-h-[44px] rounded-[10px] border border-amber-400 bg-white px-4 py-2 font-semibold">
        Marcar como visto
      </button>
    </section>
  )
}
