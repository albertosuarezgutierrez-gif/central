'use client'

// «Duplicar con otro tomador» (07/10/2026): pone de tomador a OTRA persona ya cargada en el riesgo, sin cambiar
// quién conduce ni de quién es el vehículo, y abre la pantalla de precio de la nueva variante (el enlace principal
// de `accionesPrecio`, que es `rutaVariante` con el tomador nuevo).
// Cambiar figuras es gratis; pedir precio se confirma en la pantalla siguiente (0,50€). La decisión es pura
// (`duplicar-tomador.ts`); aquí solo se enseña lo que quedará y se asigna por el puerto de siempre.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { btnStyle } from '@/components/ui'
import type { Riesgo } from '@/lib/riesgo-asegura'
import { ROTULO_ROL } from '@/lib/riesgo-asegura'
import { planDuplicarConOtroTomador } from './duplicar-tomador'
import { llamarFiguras, motivoDe } from './piezas-riesgo'
import { accionesPrecio, ramoVariante } from './variante'

export default function DuplicarOtroTomador({ riesgo, ocupado, onCambio, onError, onRecargar }: {
  riesgo: Riesgo
  ocupado: boolean
  onCambio: (texto: string) => void
  onError: (texto: string) => void
  /** Relee el riesgo SIN pisar el aviso (tras un fallo a medias). */
  onRecargar: () => void
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const op = riesgo.oportunidad
  const ramo = ramoVariante(op.ramo)
  if (!ramo || !riesgo.roles.includes('conductor_habitual')) return null
  const plan = planDuplicarConOtroTomador({ roles: riesgo.roles, figuras: riesgo.figuras, clienteOportunidad: { clienteId: op.clienteId, nombre: op.clienteNombre } })

  async function hacer() {
    if (!plan.ok) return
    setEnviando(true)
    // En orden: lo que NO cambia de persona primero; el tomador, el último. Si algo falla a medias, el riesgo
    // sigue describiendo a las mismas personas en los mismos papeles (solo se ha hecho explícito lo implícito).
    for (const a of plan.asignaciones) {
      const r = await llamarFiguras('POST', { accion: 'asignar', oportunidadId: op.id, rol: a.rol, clienteId: a.clienteId })
      if (!r.ok) {
        setEnviando(false)
        onError(`No se ha podido poner ${ROTULO_ROL[a.rol].toLowerCase()}: ${motivoDe(r)}. No se ha pedido precio; revisa «Intervinientes».`)
        onRecargar()
        return
      }
    }
    setAbierto(false)
    setEnviando(false)
    if (op.ramo === 'moto') {
      // Moto: el cotizador vive en esta misma página.
      onCambio(`Ahora: ${plan.resultado}. Pide precio arriba, en «Pedir precio».`)
      document.getElementById('pedir-precio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    // El MISMO enlace principal de «Pedir precio» (accionesPrecio → rutaVariante), ya con el tomador nuevo: la página
    // tiene un solo camino a la pantalla de precio (test/regression-precio-principal.test.ts).
    const destino = accionesPrecio({ ramo: op.ramo, polizaId: op.polizaId, tomadorId: plan.nuevoTomador.clienteId, oportunidadId: op.id }).principal
    if (destino) router.push(destino.href)
    else onCambio(`Ahora: ${plan.resultado}.`)
  }

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div>
        <button type="button" onClick={() => setAbierto((x) => !x)} disabled={ocupado || enviando} aria-expanded={abierto}
          style={{ ...btnStyle('secundario', 'md'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', height: 'auto' }}>
          Duplicar con otro tomador
        </button>
      </div>
      {abierto && (
        plan.ok ? (
          <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
            <span>Quedará: <strong>{plan.resultado}</strong>. Cambiar los intervinientes es gratis; el precio se confirma en la pantalla siguiente (0,50€).</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void hacer()} disabled={ocupado || enviando} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
                {enviando ? 'Cambiando…' : 'Cambiar y pedir precio'}
              </button>
              <button type="button" onClick={() => setAbierto(false)} disabled={enviando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{plan.motivo}</span>
        )
      )}
    </div>
  )
}
