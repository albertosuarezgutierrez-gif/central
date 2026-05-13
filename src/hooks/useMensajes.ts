// Hook compartido para mensajes_turno — usado en /edge, /kds, /jefe, /running
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

  // Carga inicial — sin filtro de turnoId para que los mensajes de KDS
  // (que no tienen turnoId) también aparezcan. Scoping por restaurante_id es suficiente.
  const cargar = useCallback(async () => {
    const ses = localStorage.getItem('ia_rest_session') ?? ''
    sesRef.current = ses
    const r = await fetch('/api/mensajes', { headers: { 'x-ia-session': ses } })
    if (!r.ok) return
    const d = await r.json()
    setMensajes(d.mensajes ?? [])
  }, []) // sin dependencias — no recrear en cada cambio de turnoId

  // Contar no leídos: mensajes que no son míos y que yo no he leído
  useEffect(() => {
    const cuenta = mensajes.filter(m =>
      m.camarero_id !== camareroId &&
      !m.leido_por?.includes(camareroId) &&
      (m.rol_destino === 'todos' || m.rol_destino === rolActual || m.destinatario_id === camareroId)
    ).length
    setNoLeidos(cuenta)
  }, [mensajes, camareroId, rolActual])

  // Realtime subscription — solo depende de restauranteId, no de cargar.
  // Si cargar fuera dependencia, cada cambio de turnoId destruiría y recrearía
  // el canal dejándolo en estado inválido.
  useEffect(() => {
    if (!restauranteId) return
    cargar()
    const ch = (supabase.channel(`mensajes-${restauranteId}`) as any)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_turno',
        filter: `restaurante_id=eq.${restauranteId}`,
      }, (payload: any) => {
        setMensajes(prev => {
          // Evitar duplicados (el sender ya tiene el mensaje en estado local)
          if (prev.some(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new as Mensaje]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restauranteId]) // SOLO restauranteId — nunca recrear el canal por otros motivos

  // Polling de seguridad cada 10s — garantiza consistencia si Realtime falla
  useEffect(() => {
    if (!restauranteId) return
    const interval = setInterval(cargar, 10_000)
    return () => clearInterval(interval)
  }, [restauranteId, cargar])

  const enviar = useCallback(async (
    texto: string,
    opts: { rol_destino?: string; mesa_ref?: string; tipo?: string } = {}
  ) => {
    const ses = sesRef.current || localStorage.getItem('ia_rest_session') || ''
    await fetch('/api/mensajes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ texto, turno_id: turnoId ?? null, ...opts }),
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
