// Hook compartido para mensajes_turno — usado en /edge y /kds
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface Mensaje {
  id: string
  camarero_id: string | null
  rol_origen: string
  nombre_origen: string
  rol_destino: string
  destinatario_id: string | null
  tipo: string
  texto: string
  mesa_ref: string | null
  leido_por: string[]
  created_at: string
}

export function useMensajes(
  restauranteId: string,
  camareroId: string,
  rolActual: string,
  turnoId?: string | null,
) {
  const [mensajes, setMensajes]     = useState<Mensaje[]>([])
  const [noLeidos, setNoLeidos]     = useState(0)
  const sesRef = useRef('')

  const cargar = useCallback(async () => {
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    sesRef.current = ses
    const params = turnoId ? `?turno_id=${turnoId}` : ''
    const r = await fetch(`/api/mensajes${params}`, { headers: { 'x-ia-session': ses } })
    if (!r.ok) return
    const d = await r.json()
    setMensajes(d.mensajes ?? [])
  }, [turnoId])

  // Contar no leídos: mensajes que no son míos y que yo no he leído
  useEffect(() => {
    const cuenta = mensajes.filter(m =>
      m.camarero_id !== camareroId &&
      !m.leido_por?.includes(camareroId) &&
      (m.rol_destino === 'todos' || m.rol_destino === rolActual || m.destinatario_id === camareroId)
    ).length
    setNoLeidos(cuenta)
  }, [mensajes, camareroId, rolActual])

  // Realtime subscription
  useEffect(() => {
    cargar()
    const ch = (supabase.channel(`mensajes-${restauranteId}`) as any)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_turno',
        filter: `restaurante_id=eq.${restauranteId}`,
      }, (payload: any) => {
        setMensajes(prev => [...prev, payload.new as Mensaje])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restauranteId, cargar])

  const enviar = useCallback(async (
    texto: string,
    opts: { rol_destino?: string; mesa_ref?: string; tipo?: string } = {}
  ) => {
    const ses = sesRef.current || localStorage.getItem('ia_rest_session') || ''
    await fetch('/api/mensajes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ texto, turno_id: turnoId, ...opts }),
    })
  }, [turnoId])

  const marcarLeido = useCallback(async (id: string) => {
    const ses = sesRef.current || localStorage.getItem('ia_rest_session') || ''
    await fetch('/api/mensajes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ id }),
    })
    setMensajes(prev => prev.map(m =>
      m.id === id ? { ...m, leido_por: [...(m.leido_por ?? []), camareroId] } : m
    ))
  }, [camareroId])

  return { mensajes, noLeidos, enviar, marcarLeido, cargar }
}
