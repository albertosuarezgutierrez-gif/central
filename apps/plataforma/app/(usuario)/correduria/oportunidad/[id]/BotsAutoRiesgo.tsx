'use client'

// «Bots (gratis)» de una oportunidad de COCHE con ENTRADA PROPIA (14/10/2026): visible en la ficha del lead sin abrir el
// cotizador ni gastar en Avant2. Antes el bloque solo aparecía colgado de `AutoNuevo` (que necesita la precalificación de
// Avant2: si fallaba o no se pulsaba «Pedir precio», no había bots). Aquí el formulario sale del RIESGO (datos del vehículo,
// intervinientes, historial declarado) con la MISMA lógica que `AutoNuevo` (`lib/tarificador-auto-riesgo.ts`). Lo que el
// adaptador exige y el riesgo no tiene (matrícula, nacimiento/carné del conductor, historial…) lo dice `PrecioBots` como
// lista de faltas y el botón no encola.
// Si el cotizador Avant2 monta su propio bloque (lee lo tecleado en su formulario), este se aparta: uno solo por pantalla.
import { useContext, useEffect, useMemo, useState } from 'react'
import type { Riesgo } from '@/lib/riesgo-asegura'
import { avisoFichaTomadorParaAlta, COMPANIAS_ALTA_TOMADOR, companiaAnteriorDeRiesgo, faltanFichaTomadorParaAlta, formularioBotsAutoDeRiesgo, matriculaDeRiesgo, tomadorDeRiesgoBots } from '@/lib/tarificador-auto-riesgo'
import { companiaAnteriorDePolizas, COMPANIAS_QUE_EXIGEN_COMPANIA_ANTERIOR, resolverCompaniaAnterior, type CompaniaPorPolizas, type PolizaParaCompaniaPoliza } from '@/lib/tarificador-compania-poliza'
import { esCodigoCompania } from '@/lib/compania-anterior'
import { tipoCatalogoCompanias } from '@/lib/historial-riesgo'
import PrecioBots, { AnfitrionBotsContext } from '../../cliente/[id]/PrecioBots'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'

export default function BotsAutoRiesgo({ riesgo }: { riesgo: Riesgo }) {
  const anfitrion = useContext(AnfitrionBotsContext)
  // Compañía anterior desde la CARTERA del cliente (19/10/2026): solo se leen sus pólizas si el riesgo no la trae (y no es «0 años»).
  const tomadorId = tomadorDeRiesgoBots(riesgo)
  const aniosDecl = riesgo.historial?.historialDeclarado?.aniosAsegurado
  // Si «Historial» guardó un CÓDIGO DGS (selector de la lista), se resuelve a su nombre con la lista de compañías (gratis); sin
  // resolver, no se inventa nada: la compañía queda por pedir y el código del historial no se pisa (ver `cuerpoGuardarCompania`).
  const codigoHistorial = esCodigoCompania(riesgo.historial?.historialDeclarado?.companiaActual)
  const [catalogo, setCatalogo] = useState<{ id: string; nombre: string }[] | null>(null)
  useEffect(() => {
    if (!codigoHistorial) return
    let vivo = true
    pedirCatalogo({ tipo: tipoCatalogoCompanias('auto') })
      .then((c) => { if (vivo) setCatalogo(c.estado === 'ok' ? c.opciones.map((o) => ({ id: o.id, nombre: o.nombre })) : null) })
      .catch(() => { if (vivo) setCatalogo(null) })
    return () => { vivo = false }
  }, [codigoHistorial])
  const necesitaPolizas = companiaAnteriorDeRiesgo(riesgo, catalogo) === null && aniosDecl !== 0
  const [polizas, setPolizas] = useState<PolizaParaCompaniaPoliza[] | null>(null)
  useEffect(() => {
    if (!necesitaPolizas) return
    let vivo = true
    fetch(`/api/correduria/cliente?id=${encodeURIComponent(tomadorId)}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((j: { estado?: string; ficha?: { polizas?: PolizaParaCompaniaPoliza[] } } | null) => {
        if (vivo) setPolizas(j?.estado === 'ok' && Array.isArray(j.ficha?.polizas) ? j.ficha.polizas : null) // no se pudo leer = pendiente
      })
      .catch(() => { if (vivo) setPolizas(null) })
    return () => { vivo = false }
  }, [necesitaPolizas, tomadorId])
  const porPolizas: CompaniaPorPolizas = useMemo(
    () => (necesitaPolizas ? companiaAnteriorDePolizas(polizas, { tipo: 'auto', matricula: matriculaDeRiesgo(riesgo) }) : { estado: 'pendiente' }),
    [necesitaPolizas, polizas, riesgo],
  )
  const formulario = useMemo(() => formularioBotsAutoDeRiesgo(riesgo, porPolizas, catalogo), [riesgo, porPolizas, catalogo])
  // Mapfre da de ALTA al tomador nuevo con nombre, apellidos y nacimiento de la ficha: si le faltan, su botón no encola
  // (asegura lo repite al encolar: 422 `falta_datos_tomador`, sin gastar máquina).
  const bloqueos = useMemo(() => {
    const out: Record<string, string> = {}
    const aviso = avisoFichaTomadorParaAlta(faltanFichaTomadorParaAlta(riesgo))
    if (aviso) for (const c of COMPANIAS_ALTA_TOMADOR) out[c] = aviso
    // Varias pólizas de coche en compañías distintas: no se adivina, Allianz/Mapfre quedan bloqueadas diciéndolo.
    const ambigua = resolverCompaniaAnterior(companiaAnteriorDeRiesgo(riesgo, catalogo), aniosDecl, porPolizas).bloqueo
    if (ambigua) for (const c of COMPANIAS_QUE_EXIGEN_COMPANIA_ANTERIOR) out[c] = out[c] ? `${out[c]} ${ambigua}` : ambigua
    return Object.keys(out).length ? out : undefined
  }, [riesgo, aniosDecl, porPolizas, catalogo])
  if (anfitrion?.ocupado) return null
  return (
    <PrecioBots ramo="auto" clienteId={tomadorDeRiesgoBots(riesgo)} oportunidadId={riesgo.oportunidad.id} formulario={formulario} bloqueosPorCompania={bloqueos}
      historialDeclarado={riesgo.historial?.historialDeclarado ?? null} />
  )
}
