'use client'

// «Para tarificar faltan» (21/10/2026, Alberto desde el móvil: «aquí solo es necesario saber los datos que faltan para tarificar,
// que entiendo que será lo mismo Avant2 o los bots»). Lo ÚNICO abierto de la pantalla del riesgo: una lista sin repetir de lo que
// falta para pedir precio, sacada de los validadores que ya existen (`lib/correduria/para-tarificar.ts`). Cada dato es un botón
// que abre su sección y lleva a ella. Cuando no falta nada, aquí mismo los botones de tarificar.
//
// 🚨 Tres estados: lo que no se ha podido comprobar se dice «sin comprobar», nunca «listo». 🚨 Avant2 y los bots NO piden lo
// mismo: un dato que solo pide uno lleva «Lo pide: …». 🚨 Tarificar con Avant2 aquí solo ABRE el cotizador (gratis): los 0,50€
// se pagan en su botón final, que pide la verificación completa.
import { useContext, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { btnStyle, cardStyle } from '@/components/ui'
import type { Riesgo } from '@/lib/riesgo-asegura'
import { datosViviendaParaBot, eleccionesInicialesHogar } from '@/lib/tarificador-hogar-formulario'
import { rotuloCompania, type IntegracionVista } from '@/lib/tarificador-probar'
import {
  aportacionAvant2, aportacionesBotsHogar, aportacionesBotsMotor, etiquetaPide, unirParaTarificar, type Aportacion, type Destino, type ItemTarificar,
} from '@/lib/correduria/para-tarificar'
import { PendientesMotorContext } from '../../cliente/[id]/PendientesMotor'
import { abrirSeccion } from './SeccionPlegable'
import { useCatalogosHogar } from './useCatalogosHogar'

/** Sección (y elemento de dentro) a la que lleva cada destino. Los ids los pone `RiesgoPantalla`. */
export const SECCION_DE_DESTINO: Record<Destino, { seccion: string; dentro?: string }> = {
  personas: { seccion: 'sec-intervinientes' },
  objeto: { seccion: 'sec-objeto' },
  historial: { seccion: 'sec-historial' },
  precio: { seccion: 'sec-pedir-precio', dentro: 'pedir-precio' },
  bots: { seccion: 'sec-pedir-precio', dentro: 'bots-gratis' },
}

const ROTULO_ESTADO: Record<ItemTarificar['estado'], { texto: string; color: string }> = {
  falta: { texto: 'Falta', color: 'var(--negative)' },
  confirmar: { texto: 'Confirmar', color: 'var(--warning)' },
  sin_comprobar: { texto: 'Sin comprobar', color: 'var(--muted)' },
}

export default function ParaTarificar({ riesgo, aplicaAvant2, esVehiculo, integraciones, onTarificarAvant2, onLanzarBots }: {
  riesgo: Riesgo
  /** El ramo se cotiza con Avant2 desde esta pantalla (`accionesPrecio().principal`). */
  aplicaAvant2: boolean
  esVehiculo: boolean
  /** Compañías con bot ACTIVO en este ramo: `undefined` = leyéndose · `null` = no se pudo leer · `[]` = ninguna. */
  integraciones: IntegracionVista[] | null | undefined
  onTarificarAvant2: () => void
  onLanzarBots: () => void
}) {
  const op = riesgo.oportunidad
  const hogar = op.ramo === 'hogar'
  const conBots = integraciones === null || (Array.isArray(integraciones) && integraciones.length > 0)
  const leidos = useCatalogosHogar(hogar && conBots)
  const publicado = useContext(PendientesMotorContext)?.publicado ?? null

  const p = useMemo(() => {
    const aportaciones: Aportacion[] = []
    const avant2 = aportacionAvant2({
      aplica: aplicaAvant2, esVehiculo, datosRiesgo: riesgo.datosRiesgo, faltanVehiculo: riesgo.faltanVehiculo, figuras: riesgo.figuras,
    })
    if (avant2) aportaciones.push(avant2)
    const companias = integraciones === null ? null : (integraciones ?? []).map((i) => ({ compania: i.compania, nombre: rotuloCompania(i.compania) }))
    if (integraciones === undefined) {
      aportaciones.push({ quien: 'Bots', comprobacion: { quien: 'Bots', estado: 'sin_comprobar', motivo: 'leyendo qué compañías tienen el bot activo…' }, items: [] })
    } else if (companias === null || companias.length > 0) {
      if (hogar) {
        if (leidos === null && companias !== null) {
          aportaciones.push({ quien: 'Bots', comprobacion: { quien: 'Bots', estado: 'sin_comprobar', motivo: 'leyendo los catálogos de la vivienda…' }, items: [] })
        } else {
          const b = riesgo.datosRiesgo
          const d = (b?.clave === 'datosVivienda' ? b.datos : {}) as Record<string, unknown>
          const hay = (v: unknown) => typeof v === 'string' && v.trim() !== ''
          aportaciones.push(...aportacionesBotsHogar({
            vivienda: datosViviendaParaBot(riesgo),
            elecciones: eleccionesInicialesHogar(riesgo, leidos?.catalogos ?? {}),
            catalogosLeidos: leidos?.completos ?? false,
            guardado: { uso: hay(d.ocupacion), regimen: hay(d.uso), tipoVivienda: hay(d.tipoVivienda), conMadera: typeof d.conMadera === 'boolean' },
            companias,
            tomador: riesgo.figuras.find((f) => f.rol === 'tomador') ?? null,
          }))
        }
      } else if (esVehiculo) {
        // Coche: lo publica «Bots (gratis)» de «Pedir precio» al cargar. Moto: sus bots van dentro del cotizador (al abrirlo).
        const motivo = op.ramo === 'moto' ? 'se comprueba al abrir el cotizador (abrirlo es gratis)' : 'comprobando en «Bots (gratis)»…'
        aportaciones.push(...aportacionesBotsMotor(publicado ? { pendientes: publicado.panel.pendientes, sueltos: publicado.panel.sueltos, nombres: publicado.panel.nombres } : null, motivo))
      }
    }
    return unirParaTarificar(aportaciones)
  }, [aplicaAvant2, esVehiculo, hogar, integraciones, leidos, publicado, riesgo, op.ramo])

  const pendientes = p.items.filter((i) => i.estado !== 'sin_comprobar')
  const itemsSinComprobar = p.items.filter((i) => i.estado === 'sin_comprobar')
  const fuentesSinComprobar = p.comprobaciones.filter((c) => c.estado === 'sin_comprobar')
  const hayBotsComprobados = p.comprobados.some((q) => q !== 'Avant2')
  const nadaQueComprobar = p.comprobaciones.length === 0
  const titulo = pendientes.length > 0 ? 'Para tarificar faltan' : p.listo ? 'Para tarificar no falta nada' : 'Para tarificar'
  const notaAvant2 = p.comprobaciones.find((c) => c.quien === 'Avant2')?.nota

  return (
    <section id="para-tarificar" aria-labelledby="para-tarificar-t" style={{ ...cardStyle, padding: 16, display: 'grid', gap: 10, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)', borderTop: '3px solid var(--primary)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 id="para-tarificar-t" style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{titulo}</h2>
        {pendientes.length > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--negative)' }}>{pendientes.length} {pendientes.length === 1 ? 'dato' : 'datos'}</span>}
      </div>

      {nadaQueComprobar && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Este ramo no tiene aquí comprobación de datos (no se cotiza con Avant2 ni con bots desde esta pantalla). Mira «Pedir precio».
        </p>
      )}

      {pendientes.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, minWidth: 0 }}>
          {pendientes.map((it) => <FilaDato key={it.clave} item={it} quien={etiquetaPide(it, p)} />)}
        </ul>
      )}

      {itemsSinComprobar.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, minWidth: 0 }}>
          {itemsSinComprobar.map((it) => <FilaDato key={it.clave} item={it} quien={etiquetaPide(it, p)} />)}
        </ul>
      )}
      {fuentesSinComprobar.length > 0 && (
        <div role="status" style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)', minWidth: 0 }}>
          {fuentesSinComprobar.map((c) => <span key={c.quien} style={{ overflowWrap: 'anywhere' }}><strong>{c.quien}:</strong> sin comprobar — {c.motivo}</span>)}
        </div>
      )}

      {pendientes.length === 0 && !nadaQueComprobar && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
          {aplicaAvant2 && (
            <div style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
              <button type="button" onClick={onTarificarAvant2} style={{ ...btnStyle('primario', 'md'), minHeight: 44, whiteSpace: 'normal', height: 'auto' }}>
                Tarificar con Avant2 · 0,50€
              </button>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Abre el cotizador (gratis). Solo se paga al confirmar en su botón final.</span>
            </div>
          )}
          {hayBotsComprobados && (
            <div style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
              <button type="button" onClick={onLanzarBots} style={{ ...btnStyle(aplicaAvant2 ? 'secundario' : 'primario', 'md'), minHeight: 44, whiteSpace: 'normal', height: 'auto' }}>
                Lanzar bots (gratis)
              </button>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lleva a «Bots (gratis)»: «Pedir precio a todas» o compañía a compañía. Solo precio.</span>
            </div>
          )}
        </div>
      )}

      {pendientes.length > 0 && (
        <button type="button" onClick={() => abrirSeccion('sec-pedir-precio', 'pedir-precio')}
          style={{ all: 'unset', cursor: 'pointer', color: 'var(--primary)', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box' }}>
          Ir a «Pedir precio» igualmente →
        </button>
      )}
      {notaAvant2 && aplicaAvant2 && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Avant2: {notaAvant2.charAt(0).toLowerCase() + notaAvant2.slice(1)}</p>}
    </section>
  )
}

function FilaDato({ item, quien }: { item: ItemTarificar; quien: string | null }) {
  const e = ROTULO_ESTADO[item.estado]
  const ir = () => { const d = SECCION_DE_DESTINO[item.destino]; abrirSeccion(d.seccion, d.dentro) }
  return (
    <li style={{ minWidth: 0, listStyle: 'none' }}>
      <button type="button" onClick={ir}
        style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: e.color, border: `1px solid ${e.color}`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap', flex: 'none' }}>{e.texto}</span>
        <span style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{item.etiqueta}</span>
          {quien && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{quien}</span>}
        </span>
        <ChevronRight size={18} aria-hidden style={{ color: 'var(--muted)', flex: 'none' }} />
      </button>
    </li>
  )
}
