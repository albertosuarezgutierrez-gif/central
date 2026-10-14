'use client'

// «Bots (gratis)» de una oportunidad de COCHE con ENTRADA PROPIA (14/10/2026): visible en la ficha del lead sin abrir el
// cotizador ni gastar en Avant2. Antes el bloque solo aparecía colgado de `AutoNuevo` (que necesita la precalificación de
// Avant2: si fallaba o no se pulsaba «Pedir precio», no había bots). Aquí el formulario sale del RIESGO (datos del vehículo,
// intervinientes, historial declarado) con la MISMA lógica que `AutoNuevo` (`lib/tarificador-auto-riesgo.ts`). Lo que el
// adaptador exige y el riesgo no tiene (matrícula, nacimiento/carné del conductor, historial…) lo dice `PrecioBots` como
// lista de faltas y el botón no encola.
// Si el cotizador Avant2 monta su propio bloque (lee lo tecleado en su formulario), este se aparta: uno solo por pantalla.
import { useContext, useMemo } from 'react'
import type { Riesgo } from '@/lib/riesgo-asegura'
import { avisoFichaTomadorParaAlta, COMPANIAS_ALTA_TOMADOR, faltanFichaTomadorParaAlta, formularioBotsAutoDeRiesgo, tomadorDeRiesgoBots } from '@/lib/tarificador-auto-riesgo'
import PrecioBots, { AnfitrionBotsContext } from '../../cliente/[id]/PrecioBots'

export default function BotsAutoRiesgo({ riesgo }: { riesgo: Riesgo }) {
  const anfitrion = useContext(AnfitrionBotsContext)
  const formulario = useMemo(() => formularioBotsAutoDeRiesgo(riesgo), [riesgo])
  // Mapfre da de ALTA al tomador nuevo con nombre, apellidos y nacimiento de la ficha: si le faltan, su botón no encola
  // (asegura lo repite al encolar: 422 `falta_datos_tomador`, sin gastar máquina).
  const bloqueos = useMemo(() => {
    const aviso = avisoFichaTomadorParaAlta(faltanFichaTomadorParaAlta(riesgo))
    return aviso ? Object.fromEntries(COMPANIAS_ALTA_TOMADOR.map((c) => [c, aviso])) : undefined
  }, [riesgo])
  if (anfitrion?.ocupado) return null
  return (
    <PrecioBots ramo="auto" clienteId={tomadorDeRiesgoBots(riesgo)} oportunidadId={riesgo.oportunidad.id} formulario={formulario} bloqueosPorCompania={bloqueos} />
  )
}
