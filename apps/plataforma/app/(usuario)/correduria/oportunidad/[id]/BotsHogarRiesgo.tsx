'use client'

// «Bots (gratis)» de una oportunidad de HOGAR con ENTRADA PROPIA (19/10/2026): como `BotsAutoRiesgo`, sale del riesgo de la
// oportunidad (sus «Datos de la vivienda»), sin Avant2. Allianz Hogar está en EXPLORACIÓN: primera prueba real del bot. Mapfre Hogar
// aparece solo si asegura lo abre (`TARIFICADOR_HOGAR_COMPANIAS_EXTRA`) y su fila está activa.
//
// Qué viaja y qué no:
//   · La vivienda (CP, calle, número, planta, puerta, año, m², reforma, referencia catastral, capitales) sale de lo guardado en
//     «Datos de la vivienda»; con la referencia catastral, año y m² vienen del Catastro («Rellenar desde el Catastro»).
//   · USO, RÉGIMEN, TIPO y MADERA los elige una persona en el bloque (sin valor por defecto). Se precargan solo si lo guardado casa
//     EXACTAMENTE con una opción del catálogo de Codeoscopic; si no, «Elegir…» y el botón no encola. El Catastro no sabe ninguno.
//   · El DNI/NIE y el nacimiento del tomador NO viajan desde aquí: asegura los lee de la ficha al encolar y los inyecta al entregar.
import { useContext, useEffect, useMemo, useState } from 'react'
import type { Riesgo } from '@/lib/riesgo-asegura'
import {
  avisoFichaTomadorParaHogar, datosViviendaParaBot, eleccionesInicialesHogar, faltanFichaTomadorParaHogar, tomadorDeRiesgoHogar,
  type CatalogosHogarLeidos,
} from '@/lib/tarificador-hogar-formulario'
import { cardStyle, CardHeader } from '@/components/ui'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'
import PrecioBots, { AnfitrionBotsContext } from '../../cliente/[id]/PrecioBots'

/** Catálogos de Codeoscopic (gratis) de los que se traducen las elecciones. Uno que no se puede leer NO inventa nada: solo valen los ids atestiguados. */
const CATALOGOS: ReadonlyArray<{ clave: keyof CatalogosHogarLeidos; nombre: string }> = [
  { clave: 'tipoVivienda', nombre: 'property-types' },
  { clave: 'ocupacion', nombre: 'occupancy-types' },
  { clave: 'uso', nombre: 'uses' },
]

export default function BotsHogarRiesgo({ riesgo }: { riesgo: Riesgo }) {
  const anfitrion = useContext(AnfitrionBotsContext)
  const [catalogos, setCatalogos] = useState<CatalogosHogarLeidos | null>(null)

  useEffect(() => {
    let vivo = true
    void Promise.all(CATALOGOS.map(async (c) => {
      try {
        const r = await pedirCatalogo({ tipo: 'hogar', nombre: c.nombre })
        return [c.clave, r.estado === 'ok' ? r.opciones : undefined] as const
      } catch {
        return [c.clave, undefined] as const
      }
    })).then((pares) => { if (vivo) setCatalogos(Object.fromEntries(pares.filter(([, v]) => v !== undefined))) })
    return () => { vivo = false }
  }, [])

  const formulario = useMemo(() => datosViviendaParaBot(riesgo), [riesgo])
  const iniciales = useMemo(() => eleccionesInicialesHogar(riesgo, catalogos ?? {}), [riesgo, catalogos])
  // Allianz (y Mapfre, si asegura lo abre con su interruptor) toman DNI/NIE y nacimiento de la ficha: si le faltan, su botón no encola
  // (asegura lo repite al encolar: 422 sin gastar máquina). Una compañía sin integración activa no pinta botón: el aviso no se ve.
  const bloqueos = useMemo(() => {
    const faltan = faltanFichaTomadorParaHogar(riesgo)
    const allianz = avisoFichaTomadorParaHogar(faltan, 'Allianz Hogar')
    const mapfre = avisoFichaTomadorParaHogar(faltan, 'Mapfre Hogar')
    return allianz && mapfre ? { allianz, mapfre } : undefined
  }, [riesgo])

  if (anfitrion?.ocupado) return null
  if (catalogos === null) {
    return (
      <div style={cardStyle}>
        <CardHeader title="Bots (gratis)" />
        <p role="status" style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Preparando los datos de la vivienda…</p>
      </div>
    )
  }
  // `key`: si lo guardado cambia (o llegan los catálogos), el bloque se monta de nuevo con las elecciones precargadas al día.
  return (
    <PrecioBots key={JSON.stringify(iniciales)} ramo="hogar" clienteId={tomadorDeRiesgoHogar(riesgo)} oportunidadId={riesgo.oportunidad.id}
      formulario={formulario} inicialesExtra={iniciales} bloqueosPorCompania={bloqueos} />
  )
}
