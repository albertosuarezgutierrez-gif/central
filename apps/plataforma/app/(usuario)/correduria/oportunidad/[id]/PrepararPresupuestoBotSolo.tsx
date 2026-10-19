'use client'

// Botón «Preparar presupuesto con lo que ha sacado el bot» para ramos SIN bloque «Presupuestos de compañías»
// (auto, moto…: solo comunidades lo pinta). Lee los trabajos con la MISMA ruta que ese bloque; si la lectura falla
// no pinta nada (no se afirma ausencia). Con trabajos `ok` muestra el botón.
import { useEffect, useState } from 'react'
import { leerPresupuestos } from '@/lib/presupuestos-companias'
import { hayTrabajoOk } from '@/lib/presupuesto-rpa-vista'
import PrepararPresupuestoBot from './PrepararPresupuestoBot'

export default function PrepararPresupuestoBotSolo({ oportunidadId }: { oportunidadId: string }) {
  const [hayOk, setHayOk] = useState(false)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/correduria/tarificador/oportunidad?id=${encodeURIComponent(oportunidadId)}`, { cache: 'no-store' })
        const j = await r.json().catch(() => null)
        const datos = r.ok ? leerPresupuestos(j) : null
        if (vivo) setHayOk(!!datos && hayTrabajoOk(datos.trabajos))
      } catch { /* sin lectura no se muestra nada */ }
    })()
    return () => { vivo = false }
  }, [oportunidadId])
  if (!hayOk) return null
  return <div style={{ minWidth: 0 }}><PrepararPresupuestoBot oportunidadId={oportunidadId} /></div>
}
