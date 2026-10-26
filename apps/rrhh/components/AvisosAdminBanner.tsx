'use client'
import { useState } from 'react'
import Aviso from '@/components/ui/Aviso'
import Boton from '@/components/ui/Boton'

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
    <Aviso tono="aviso" titulo="Hay correos que no se han podido enviar" className="mb-4">
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {lista.map(a => <li key={a.id} className="break-words">{a.texto}</li>)}
      </ul>
      {error && <p className="mt-2 text-alert">No se pudo marcar como visto. Inténtalo de nuevo.</p>}
      <Boton variante="secundario" onClick={marcar} className="mt-3">Marcar como visto</Boton>
    </Aviso>
  )
}
