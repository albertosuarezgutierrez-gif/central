'use client'
// Petición CONTEXTUAL de notificaciones (sustituye al botón suelto «Activar notificaciones» del inicio):
// solo cuando hay algo que firmar o ya es la segunda visita, una vez, con «Sí» / «Ahora no».
// «Ahora no» se recuerda en localStorage (conveniencia por dispositivo; sin almacenamiento, solo se cierra).
import { useEffect, useState } from 'react'
import Boton from '@/components/ui/Boton'
import { suscribirPush } from '@/components/ActivarPush'

const CLAVE_NO = 'rrhh_push_ahora_no'
const CLAVE_VISITA = 'rrhh_e_visitado'

export default function AvisoPushEmpleado({ endpoint, hayAlgoQueFirmar }: { endpoint: string; hayAlgoQueFirmar: boolean }) {
  const [ver, setVer] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    try {
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return
      if (Notification.permission !== 'default') return
      if (localStorage.getItem(CLAVE_NO)) return
      const vuelve = !!localStorage.getItem(CLAVE_VISITA)
      localStorage.setItem(CLAVE_VISITA, '1')
      if (hayAlgoQueFirmar || vuelve) setVer(true)
    } catch { /* sin almacenamiento o sin push: no se pregunta */ }
  }, [hayAlgoQueFirmar])
  if (!ver && !msg) return null
  if (msg) return <p role="status" className="my-2 text-sm text-ink-2">{msg}</p>
  async function si() { const r = await suscribirPush(endpoint); setVer(false); setMsg(r) }
  function ahoraNo() { try { localStorage.setItem(CLAVE_NO, '1') } catch { /* solo se cierra */ } setVer(false) }
  return (
    <div role="group" aria-label="Notificaciones" className="my-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-card px-3 py-2">
      <p className="min-w-0 flex-1 basis-48 text-sm font-semibold text-ink">¿Te avisamos cuando tengas un documento nuevo?</p>
      <div className="flex gap-2">
        <Boton onClick={si}>Sí</Boton>
        <Boton variante="secundario" onClick={ahoraNo}>Ahora no</Boton>
      </div>
    </div>
  )
}
