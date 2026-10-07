'use client'

// La pantalla del riesgo (29/09/2026): cabecera · datos · intervinientes · pedir precio (bloque único) · presupuestos P1…Pn · historial.
// Tras cualquier cambio de figuras se RELEE el riesgo entero del puerto: lo que se pinta es siempre
// lo que asegura tiene, nunca una suposición local de cómo quedó.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge, BtnLink, PageHeader, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { ROTULO_ESTADO, rotuloRamo } from '@/lib/seguimiento-asegura'
import type { LecturaRiesgo, Riesgo } from '@/lib/riesgo-asegura'
import { textoFaltanCapital, textoFaltanVehiculo, textoFaltanVivienda, type CampoCapital, type CampoVivienda } from '@central/module-seguros'
import { LogoCompaniaEnLinea } from '../../CeldaCompania'
import DatosRiesgo from './DatosRiesgo'
import DatosVehiculo from './DatosVehiculo'
import FigurasRiesgo from './FigurasRiesgo'
import HistorialVariantes from './HistorialVariantes'
import OfertasOportunidad from './OfertasOportunidad'
import PasarOportunidad from './PasarOportunidad'
import PresupuestosCompanias from './PresupuestosCompanias'
import { fechaEs } from './piezas-riesgo'
import { accionesPrecio, etiquetaRiesgo, ramoVariante, tomadorDelRiesgo } from './variante'
import { avisoRamoSinTarifa, companiasDisponibles } from '@/lib/presupuestos-companias'

export default function RiesgoPantalla({ inicial }: { inicial: Riesgo }) {
  const [riesgo, setRiesgo] = useState<Riesgo>(inicial)
  // Editar una ficha desde el modal de «Editar datos» refresca la página del servidor (router.refresh):
  // el riesgo que llega de nuevo manda sobre el que había, y el aviso «Falta…» se actualiza solo.
  useEffect(() => { setRiesgo(inicial) }, [inicial])
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [recargando, setRecargando] = useState(false)
  const op = riesgo.oportunidad

  async function recargar(texto?: string) {
    setRecargando(true)
    try {
      const res = await fetch(`/api/correduria/oportunidad/riesgo?id=${encodeURIComponent(op.id)}`, { cache: 'no-store' })
      const j = (await res.json().catch(() => null)) as LecturaRiesgo | null
      if (j && j.estado === 'ok' && j.riesgo) {
        setRiesgo(j.riesgo)
        if (texto) setAviso({ ok: true, texto })
      } else {
        setAviso({ ok: false, texto: `${texto ? `${texto} ` : ''}Pero no se ha podido releer el riesgo: lo de pantalla puede estar desfasado. Recarga la página.` })
      }
    } catch {
      setAviso({ ok: false, texto: 'No se ha podido releer el riesgo: lo de pantalla puede estar desfasado. Recarga la página.' })
    } finally {
      setRecargando(false)
    }
  }

  const etiqueta = etiquetaRiesgo(riesgo)
  const titulo = [rotuloRamo(op.ramo), etiqueta].filter(Boolean).join(' · ')
  const estado = (ROTULO_ESTADO as Record<string, string>)[op.estado] ?? (op.estado || 'Estado sin leer')
  const ramo = ramoVariante(op.ramo)
  const acciones = accionesPrecio({ ramo: op.ramo, polizaId: op.polizaId, tomadorId: tomadorDelRiesgo(riesgo), oportunidadId: op.id })
  const hayBots = !acciones.principal && companiasDisponibles(op.ramo).length > 0
  const esVehiculo = op.ramo === 'auto' || op.ramo === 'moto'
  // Lo que falta del riesgo NO bloquea «Pedir precio» (la pantalla de precio lo pide), pero se dice.
  const bloqueDatos = riesgo.datosRiesgo
  const faltaDatos = !ramo
    ? null
    : esVehiculo
      ? textoFaltanVehiculo(riesgo.faltanVehiculo)
      : bloqueDatos?.clave === 'datosVivienda'
        ? textoFaltanVivienda(bloqueDatos.faltan as CampoVivienda[])
        : bloqueDatos?.clave === 'datosCapital'
          ? textoFaltanCapital(bloqueDatos.faltan as CampoCapital[])
          : null

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <div>
        <Link href={`/correduria/cliente/${encodeURIComponent(op.clienteId)}?tab=oportunidades`} style={{ fontSize: 13, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
          ← Ficha de {op.clienteNombre}
        </Link>
        <PageHeader
          titulo={titulo}
          icono={<ShieldCheck size={20} strokeWidth={1.75} />}
          sub={
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Badge tono={op.estado === 'ganada' ? 'positivo' : op.estado === 'perdida' ? 'negativo' : 'info'}>{estado}</Badge>
              {op.vence && <span>Vence {fechaEs(op.vence)}</span>}
              {op.aseguradora && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {/* La compañía de HOY no es la de nuestra oferta: sin el «ahora en» se leía
                      «Mapfre · 276,69€» con un precio de Reale (29/09/2026). La oferta está en las variantes. */}
                  · {op.aseguradoraActual ? 'ahora en ' : ''}<LogoCompaniaEnLinea compania={op.aseguradora} />{op.prima !== null ? ` · ${eur(op.prima)}` : ''}
                </span>
              )}
              {op.polizaId && (
                <Link href={`/correduria/poliza/${encodeURIComponent(op.polizaId)}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  · ver póliza
                </Link>
              )}
            </span>
          }
        />
        <PasarOportunidad riesgo={riesgo} />
      </div>

      {aviso && (
        <div role="status" style={{ ...cardStyle, padding: '10px 14px', fontSize: 13, borderLeft: `3px solid ${aviso.ok ? 'var(--positive)' : 'var(--negative)'}`, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ color: aviso.ok ? 'var(--text)' : 'var(--negative)', minWidth: 0 }}>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--muted)', minHeight: 44, minWidth: 44, textAlign: 'center' }} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {esVehiculo ? (
        <DatosVehiculo
          riesgo={riesgo}
          ocupado={recargando}
          onCambio={(texto) => void recargar(texto)}
          onError={(texto) => setAviso({ ok: false, texto })}
        />
      ) : (
        <DatosRiesgo
          riesgo={riesgo}
          ocupado={recargando}
          onCambio={(texto) => void recargar(texto)}
          onError={(texto) => setAviso({ ok: false, texto })}
        />
      )}

      <FigurasRiesgo
        riesgo={riesgo}
        ocupado={recargando}
        onCambio={(texto) => void recargar(texto)}
        onError={(texto) => setAviso({ ok: false, texto })}
      />

      {/* ÚNICO bloque «Pedir precio» (07/10/2026): el aviso «Falta para pedir precio», el botón principal, el
          secundario (póliza) y el coste de 0,50€ viven aquí y en ningún otro sitio de la página. */}
      <section id="pedir-precio" aria-labelledby="pedir-precio-titulo" style={{ ...cardStyle, display: 'grid', gap: 8, minWidth: 0 }}>
        <div id="pedir-precio-titulo" style={{ fontSize: 14, fontWeight: 600 }}>Pedir precio</div>
        {acciones.principal ? (
          <>
            {faltaDatos && (
              <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
                {faltaDatos} Puedes seguir: la pantalla de precio lo pedirá.
              </p>
            )}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              {op.polizaId && acciones.secundario
                ? 'Este riesgo es de una póliza en cartera. Lo normal es pedir precio con los intervinientes y los datos de esta página; retarificar la póliza usa sus datos de hoy.'
                : 'Se pide precio con los intervinientes y los datos de esta página.'}{' '}
              En la siguiente pantalla se confirma; pedir precio cuesta 0,50€.
            </p>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
              <div style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
                <BtnLink href={acciones.principal.href} variante="primario">{acciones.principal.etiqueta}</BtnLink>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{acciones.principal.nota}</span>
              </div>
              {acciones.secundario && (
                <div style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
                  <BtnLink href={acciones.secundario.href} variante="secundario">{acciones.secundario.etiqueta}</BtnLink>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{acciones.secundario.nota}</span>
                </div>
              )}
            </div>
          </>
        ) : hayBots ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Este ramo se cotiza con los bots de compañía: el formulario de presupuestos de más abajo va ya sembrado con el capital y la dirección de los datos; allí eliges compañías y lo pides.
            </p>
            <div>
              <a href="#presupuestos" style={{ ...btnStyle('primario', 'md'), minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', maxWidth: '100%' }}>
                Ir a pedir presupuestos →
              </a>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {avisoRamoSinTarifa(op.ramo, 'Este ramo se cotiza fuera (no hay tarifa a la que pedir precio desde aquí): los datos de arriba son para el expediente.')} La{' '}
            <Link href={`/correduria/cliente/${encodeURIComponent(op.clienteId)}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>ficha del cliente</Link>{' '}
            sigue siendo el sitio de sus pólizas y gestiones.
          </p>
        )}
      </section>

      <OfertasOportunidad oportunidadId={op.id} clienteId={op.clienteId} polizaId={op.polizaId} />

      {/* Bots de compañía (07/10/2026): solo se pinta si algún bot cotiza este ramo (hoy, comunidades). */}
      <PresupuestosCompanias
        oportunidadId={op.id}
        ramo={op.ramo}
        riesgoLibre={bloqueDatos?.clave === 'datosRiesgoLibre' ? { capital: bloqueDatos.datos.capital, direccion: bloqueDatos.datos.direccion } : null}
      />

      <HistorialVariantes riesgo={riesgo} />
    </div>
  )
}
