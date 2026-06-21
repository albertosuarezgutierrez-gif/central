'use client'
// /cocina redirige a /kds (pantalla unificada de cocina)
import { useEffect } from 'react'
export default function CocinaRedirect() {
  useEffect(() => { window.location.replace('/kds') }, [])
  return null
}
