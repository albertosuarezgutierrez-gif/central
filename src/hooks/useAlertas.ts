// src/hooks/useAlertas.ts
// Escucha alertas en tiempo real y las lee por audio (TTS)
// Uso en /edge: const { alertas, marcarLeida } = useAlertas(camareroId, restauranteId)

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function getSb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'
  )
}

export interface AlertaActiva {
  id: string
  regla_nombre: string
  mensaje_voz: string
  trigger_tipos: string[]
  mesa_codigo?: string
  disparada_at: string
}

async function registrarPush(camareroId: string, restauranteId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push-send/vapid-public-key`
    )
    const { publicKey } = await res.json()
    if (!publicKey) return
    const reg = await navigator.serviceWorker.register('/sw-alertas.js')
    await reg.update()
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push-send/subscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camarero_id: camareroId,
          restaurante_id: restauranteId,
          subscription: sub.toJSON(),
        }),
      }
    )
    console.log('[alertas] Push registrado ✓')
  } catch (e) {
    console.warn('[alertas] Push no disponible:', e)
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw      = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function hablar(texto: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(texto)
  utt.lang   = 'es-ES'
  utt.rate   = 0.95
  utt.pitch  = 1
  utt.volume = 1
  const voces = window.speechSynthesis.getVoices()
  const esVoz = voces.find(v => v.lang.startsWith('es') && v.localService) ??
                voces.find(v => v.lang.startsWith('es'))
  if (esVoz) utt.voice = esVoz
  window.speechSynthesis.speak(utt)
}

export function useAlertas(camareroId: string | null, restauranteId: string | null) {
  const [alertas, setAlertas]        = useState<AlertaActiva[]>([])
  const [pushRegistrado, setPushReg] = useState(false)
  const canalRef                     = useRef<ReturnType<ReturnType<typeof getSb>["channel"]> | null>(null)

  const marcarLeida = useCallback(async (alertaId: string) => {
    await getSb()
      .from('alerta_log')
      .update({ leida: true, actuada_at: new Date().toISOString() })
      .eq('id', alertaId)
    setAlertas(prev => prev.filter(a => a.id !== alertaId))
  }, [])

  useEffect(() => {
    if (!camareroId || !restauranteId) return

    if (!pushRegistrado) {
      registrarPush(camareroId, restauranteId)
      setPushReg(true)
    }

    const canal = getSb()
      .channel(`alertas-${camareroId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'alerta_log',
          filter: `camarero_notificado_id=eq.${camareroId}`,
        },
        async (payload) => {
          const row = payload.new as Record<string, unknown>

          let mesa_codigo: string | undefined
          if (row.mesa_id) {
            const { data } = await getSb()
              .from('mesas')
              .select('codigo')
              .eq('id', row.mesa_id)
              .single()
            mesa_codigo = data?.codigo
          }

          const alerta: AlertaActiva = {
            id:            row.id as string,
            regla_nombre:  row.regla_nombre as string,
            mensaje_voz:   (row.mensaje_voz as string) ?? (row.regla_nombre as string),
            trigger_tipos: (row.trigger_tipos as string[]) ?? [],
            mesa_codigo,
            disparada_at:  row.disparada_at as string,
          }

          setAlertas(prev => [alerta, ...prev].slice(0, 5))

          // Leer el mensaje por audio
          if (alerta.mensaje_voz) hablar(alerta.mensaje_voz)
        }
      )
      .subscribe()

    canalRef.current = canal
    return () => { canal.unsubscribe() }
  }, [camareroId, restauranteId, pushRegistrado])

  return { alertas, marcarLeida }
}
