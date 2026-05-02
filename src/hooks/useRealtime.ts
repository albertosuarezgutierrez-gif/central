'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Mesa, Comanda, Transcripcion, Producto86 } from '@/types'

export function useMesas() {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMesas = useCallback(async () => {
    const { data } = await supabase
      .from('mesas')
      .select('*, camarero:camareros(id, nombre)')
      .order('codigo')
    if (data) setMesas(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchMesas()

    const channel = supabase
      .channel('mesas-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, () => {
        fetchMesas()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchMesas])

  return { mesas, loading, refetch: fetchMesas }
}

export function useComandas(turnoId?: string) {
  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [loading, setLoading] = useState(true)

  const fetchComandasFn = useCallback(async () => {
    let query = supabase
      .from('comandas')
      .select('*, mesa:mesas(id, codigo, zona), camarero:camareros(id, nombre), items:comanda_items(*)')
      .in('estado', ['nueva', 'en_cocina'])
      .order('created_at', { ascending: true })

    if (turnoId) query = query.eq('turno_id', turnoId)

    const { data } = await query
    if (data) setComandasState(data)
    setLoading(false)
  }, [turnoId])

  useEffect(() => {
    fetchComandasFn()

    const channel = supabase
      .channel('comandas-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, () => {
        fetchComandasFn()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_items' }, () => {
        fetchComandasFn()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchComandasFn])

  return { comandas, loading, refetch: fetchComandasFn }
}

export function useTranscripciones(turnoId?: string, limit = 20) {
  const [transcripciones, setTranscripciones] = useState<Transcripcion[]>([])

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from('transcripciones')
        .select('*, camarero:camareros(id, nombre)')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (turnoId) query = query.eq('turno_id', turnoId)
      const { data } = await query
      if (data) setTranscripciones(data)
    }

    fetch()

    const channel = supabase
      .channel('transcripciones-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transcripciones' }, () => {
        fetch()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [turnoId, limit])

  return transcripciones
}

export function useProductos86(turnoId?: string) {
  const [productos, setProductos] = useState<Producto86[]>([])

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from('productos_86')
        .select('*')
        .order('created_at', { ascending: false })

      if (turnoId) query = query.eq('turno_id', turnoId)
      const { data } = await query
      if (data) setProductos(data)
    }

    fetch()

    const channel = supabase
      .channel('86-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos_86' }, () => {
        fetch()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [turnoId])

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

/** Hook: lista de productos activos con realtime. Usado por Edge para mostrar 86. */
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => {
        fetch()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetch])

  return { productos, refetch: fetch }
}
