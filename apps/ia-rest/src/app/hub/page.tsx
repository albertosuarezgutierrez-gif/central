'use client'
// /hub redirige a /jefe (rol admin eliminado, fusionado con jefe_sala)
import { useEffect } from 'react'
export default function HubRedirect() {
  useEffect(() => { window.location.replace('/jefe') }, [])
  return null
}
