'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Mesa, Comanda, Transcripcion, Producto86 } from '@/types'

export function useMesas(restauranteId?: string) {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMesas = useCallback(async () => {
    let q = supabase
      .from('mesas')
      .select('*, camarero:camareros(id, nombre)')
      .order('codigo')
    if (restauranteId) q = q.eq('restaurante_id', restauranteId)
    const { data } = await q
    if (data) setMesas(data)
    setLoading(false)
  }, [restauranteId])

  useEffect(() => {
    fetchMesas()
    const channel = supabase
      .channel(`mesas-live-${restauranteId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, fetchMesas)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchMesas, restauranteId])

  return { mesas, loading, refetch: fetchMesas }
}

export function useComandas(turnoId?: string, restauranteId?: string) {
  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [loading, setLoading] = useState(true)

  const fetchComandasFn = useCallback(async () => {
    let query = supabase
      .from('comandas')
      .select('*, mesa:mesas(id, codigo, zona, capacidad), camarero:camareros(id, nombre), items:comanda_items(*)')
      .in('estado', ['nueva', 'en_cocina', 'cuenta_pedida'])
      .order('created_at', { ascending: true })

    if (turnoId) query = query.eq('turno_id', turnoId)
    if (restauranteId) query = query.eq('restaurante_id', restauranteId)

    const { data } = await query
    if (data) setComandasState(data)
    setLoading(false)
  }, [turnoId, restauranteId])

  useEffect(() => {
    fetchComandasFn()
    const key = `comandas-live-${restauranteId ?? 'all'}-${turnoId ?? 'all'}`
    const channel = supabase
      .channel(key)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, fetchComandasFn)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_items' }, fetchComandasFn)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchComandasFn, turnoId, restauranteId])

  return { comandas, loading, refetch: fetchComandasFn }
}

export function useTranscripciones(turnoId?: string, limit = 20, restauranteId?: string) {
  const [transcripciones, setTranscripciones] = useState<Transcripcion[]>([])

  useEffect(() => {
    const fetchFn = async () => {
      let query = supabase
        .from('transcripciones')
        .select('*, camarero:camareros(id, nombre)')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (turnoId) query = query.eq('turno_id', turnoId)
      if (restauranteId) query = query.eq('restaurante_id', restauranteId)
      const { data } = await query
      if (data) setTranscripciones(data)
    }

    fetchFn()
    const key = `transcripciones-live-${restauranteId ?? 'all'}`
    const channel = supabase
      .channel(key)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transcripciones' }, fetchFn)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [turnoId, limit, restauranteId])

  return transcripciones
}

export function useProductos86(turnoId?: string, restauranteId?: string) {
  const [productos, setProductos] = useState<Producto86[]>([])

  useEffect(() => {
    const fetchFn = async () => {
      let query = supabase
        .from('productos_86')
        .select('*')
        .order('created_at', { ascending: false })

      if (turnoId) query = query.eq('turno_id', turnoId)
      if (restauranteId) query = query.eq('restaurante_id', restauranteId)
      const { data } = await query
      if (data) setProductos(data)
    }

    fetchFn()
    const key = `86-live-${restauranteId ?? 'all'}`
    const channel = supabase
      .channel(key)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos_86' }, fetchFn)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [turnoId, restauranteId])

  return productos
}

export function useReloj() {
  const [ahora, setAhora] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

export interface ProductoActivo {
  id: string
  nombre: string
  nombre_alternativo: string[]
  seccion: string
  precio: number | null
  activo: boolean
  orden: number
}

export function useProductosActivos() {
  const [productos, setProductos] = useState<ProductoActivo[]>([])

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('productos')
      .select('id, nombre, nombre_alternativo, seccion, precio, activo, orden')
      .order('seccion')
      .order('orden')
    if (data) setProductos(data)
  }, [])

  useEffect(() => {
    fetch()
    const channel = supabase
      .channel('productos-activos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, fetch)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetch])

  return { productos, refetch: fetch }
}

// ── useServicioPendiente ──────────────────────────────────────
// Devuelve Set de mesa_ids que tienen servicio de running pendiente
export function useServicioPendiente(restauranteId?: string) {
  const [mesasConPendiente, setMesasConPendiente] = useState<Set<string>>(new Set())

  const fetchPendientes = useCallback(async () => {
    if (!restauranteId) return
    const { data } = await supabase
      .from('marchar_log')
      .select('mesa_id')
      .eq('restaurante_id', restauranteId)
      .eq('tipo', 'servicio')
      .eq('recogido', false)
    setMesasConPendiente(new Set((data ?? []).map((r: { mesa_id: string }) => r.mesa_id)))
  }, [restauranteId])

  useEffect(() => {
    fetchPendientes()
    const ch = supabase
      .channel(`servicio-pendiente-${restauranteId ?? 'all'}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'marchar_log',
        filter: restauranteId ? `restaurante_id=eq.${restauranteId}` : undefined,
      }, fetchPendientes)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchPendientes, restauranteId])

  return mesasConPendiente
}
