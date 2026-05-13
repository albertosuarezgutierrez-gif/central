'use client'
// src/hooks/useOfflineQueue.ts
// Circuit breaker: guarda comandas cuando falla la red y las sincroniza al reconectar
//
// Uso en /edge:
//   const { offline, pendientes, encolar, sincronizar } = useOfflineQueue(session)
//
// Cuando POST a /api/transcribe falla por red:
//   encolar({ mesa, items, sesionHeader })
//
// Al reconectar:
//   sincronizar() → POST a /api/comanda por cada pendiente
//   onSincronizado callback para actualizar la UI

import { useState, useEffect, useCallback, useRef } from 'react'

export interface ComandaPendiente {
  id: string                    // uuid local para deduplicación
  timestamp: number
  mesa_codigo: string           // para mostrar en la UI
  mesa_id: string
  items: Array<{ nombre: string; cantidad: number; precio_unitario?: number }>
  nota_general?: string
  sesion_header: string         // x-ia-session serializado
  intentos: number
}

const STORAGE_KEY = 'ia_rest_offline_queue'
const MAX_INTENTOS = 5

function cargarCola(): ComandaPendiente[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function guardarCola(cola: ComandaPendiente[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cola))
  } catch { /* storage lleno o sin permiso */ }
}

function uuid(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface UseOfflineQueueResult {
  offline: boolean
  pendientes: ComandaPendiente[]
  encolar: (comanda: Omit<ComandaPendiente, 'id' | 'timestamp' | 'intentos'>) => void
  sincronizar: () => Promise<{ ok: number; error: number }>
  limpiar: () => void
}

export function useOfflineQueue(
  onSincronizado?: (comanda: ComandaPendiente, exito: boolean) => void
): UseOfflineQueueResult {
  const [offline, setOffline]       = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [pendientes, setPendientes] = useState<ComandaPendiente[]>([])
  const sincronizandoRef            = useRef(false)

  // Cargar cola del localStorage al montar
  useEffect(() => {
    setPendientes(cargarCola())
  }, [])

  // Escuchar eventos de red
  useEffect(() => {
    const onOnline  = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Auto-sincronizar al recuperar conexión
  useEffect(() => {
    if (!offline && pendientes.length > 0) {
      sincronizar()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline])

  const encolar = useCallback((comanda: Omit<ComandaPendiente, 'id' | 'timestamp' | 'intentos'>) => {
    const nueva: ComandaPendiente = {
      ...comanda,
      id: uuid(),
      timestamp: Date.now(),
      intentos: 0,
    }
    setPendientes(prev => {
      const nueva_cola = [...prev, nueva]
      guardarCola(nueva_cola)
      return nueva_cola
    })
  }, [])

  const sincronizar = useCallback(async (): Promise<{ ok: number; error: number }> => {
    if (sincronizandoRef.current) return { ok: 0, error: 0 }
    sincronizandoRef.current = true

    const cola = cargarCola()
    if (!cola.length) {
      sincronizandoRef.current = false
      return { ok: 0, error: 0 }
    }

    let ok = 0
    let errorCount = 0
    const colaRestante: ComandaPendiente[] = []

    for (const comanda of cola) {
      if (comanda.intentos >= MAX_INTENTOS) {
        // Demasiados intentos — descartar silenciosamente
        console.warn('[offline-queue] Descartando comanda tras', MAX_INTENTOS, 'intentos:', comanda.mesa_codigo)
        continue
      }

      try {
        const r = await fetch('/api/comanda', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ia-session': comanda.sesion_header,
          },
          body: JSON.stringify({
            mesa_id:      comanda.mesa_id,
            items:        comanda.items,
            nota_general: comanda.nota_general,
          }),
        })

        if (r.ok) {
          ok++
          onSincronizado?.(comanda, true)
        } else {
          // Error del servidor (no de red) — descartar para no bloquear
          const d = await r.json().catch(() => ({}))
          console.error('[offline-queue] Error servidor:', r.status, d.error)
          errorCount++
          onSincronizado?.(comanda, false)
        }
      } catch {
        // Sigue sin red — volver a encolar con intento incrementado
        colaRestante.push({ ...comanda, intentos: comanda.intentos + 1 })
        errorCount++
      }
    }

    guardarCola(colaRestante)
    setPendientes(colaRestante)
    sincronizandoRef.current = false
    return { ok, error: errorCount }
  }, [onSincronizado])

  const limpiar = useCallback(() => {
    guardarCola([])
    setPendientes([])
  }, [])

  return { offline, pendientes, encolar, sincronizar, limpiar }
}
