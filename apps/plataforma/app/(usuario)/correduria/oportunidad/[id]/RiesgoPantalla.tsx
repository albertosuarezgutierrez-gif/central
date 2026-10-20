'use client'

// La pantalla del riesgo (29/09/2026): cabecera · datos · intervinientes · historial del seguro y del carné · pedir precio (bloque único) · parrilla de precios Avant2 ↔ bot (13/10/2026) · presupuestos P1…Pn · historial de variantes.
// Tras cualquier cambio de figuras se RELEE el riesgo entero del puerto: lo que se pinta es siempre
// lo que asegura tiene, nunca una suposición local de cómo quedó.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge, BtnLink, PageHeader, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { ROTULO_ESTADO, rotuloRamo } from '@/lib/seguimiento-asegura'
import type { LecturaRiesgo, Riesgo } from '@/lib/riesgo-asegura'
import { textoFaltanCapital, textoFaltanVehiculo, textoFaltanVivienda, type CampoCapital, type CampoVivienda } from '@central/module-seguros'
import { LogoCompaniaEnLinea } from '../../CeldaCompania'
import DatosRiesgo from './DatosRiesgo'
import DatosVehiculo from './DatosVehiculo'
import DuplicarOtroTomador from './DuplicarOtroTomador'
import FigurasRiesgo from './FigurasRiesgo'
import HistorialRiesgo from './HistorialRiesgo'
import HistorialVariantes from './HistorialVariantes'
import OfertasOportunidad from './OfertasOportunidad'
import PasarOportunidad from './PasarOportunidad'
import { COTIZADOR_EMBEBIDO } from './cotizadores-embebidos'
import BotsAutoRiesgo from './BotsAutoRiesgo'
import BotsHogarRiesgo from './BotsHogarRiesgo'
import { AnfitrionBotsContext } from '../../cliente/[id]/PrecioBots'
import { BloqueMotor, PendientesMotorProvider } from '../../cliente/[id]/PendientesMotor'
import { abrirAlCargar, bloqueObjetoDeRamo, ramoCotizadorEmbebido } from './cotizador-embebido'
import PresupuestosCompanias from './PresupuestosCompanias'
import PrepararPresupuestoBotSolo from './PrepararPresupuestoBotSolo'
import { avisoSinAvant2 } from '@/lib/correduria/registro-ramos'
import ParrillaPrecios, { trabajosParaParrilla } from './ParrillaPrecios'
import type { LadoBot } from './parrilla-precios'
import PropuestaEscenarios from './PropuestaEscenarios'
import { fechaEs } from './piezas-riesgo'
import { accionesPrecio, etiquetaRiesgo, ramoVariante, tomadorDelRiesgo } from './variante'
import { avisoRamoSinTarifa, companiasDisponibles, type TrabajoCompania } from '@/lib/presupuestos-companias'

export default function RiesgoPantalla({ inicial, hoy }: { inicial: Riesgo; hoy: string }) {
  const [riesgo, setRiesgo] = useState<Riesgo>(inicial)
  // Editar una ficha desde el modal de «Editar datos» refresca la página del servidor (router.refresh):
  // el riesgo que llega de nuevo manda sobre el que había, y el aviso «Falta…» se actualiza solo.
  useEffect(() => { setRiesgo(inicial) }, [inicial])
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [recargando, setRecargando] = useState(false)
  // Cotizador EMBEBIDO (moto 07/10/2026, auto y hogar 10/10/2026; registro `COTIZADOR_EMBEBIDO`): se abre AQUÍ. Lo que está a
  // medias arriba lo bloquea, y mientras se paga no se deja editar el riesgo (`ocupado`). Los demás ramos, como siempre.
  const [cotizadorAbierto, setCotizadorAbierto] = useState(false)
  // El bloque del objeto (vehículo o vivienda…) con una edición a medias: bloquea el cotizador embebido.
  const [editandoObjeto, setEditandoObjeto] = useState(false)
  const [editandoFiguras, setEditandoFiguras] = useState(false)
  const [cotizandoEmbebido, setCotizandoEmbebido] = useState(false)
  // «Bots (gratis)» de coche: entrada propia (`BotsAutoRiesgo`); si el cotizador Avant2 monta el suyo, el propio se aparta.
  const [botsEnCotizador, setBotsEnCotizador] = useState(false)
  const anfitrionBots = useMemo(() => ({ ocupado: botsEnCotizador, ocupar: setBotsEnCotizador }), [botsEnCotizador])
  // La variante recién pedida: «Presupuestos de este riesgo» la abre con sus precios para emitir sin salir.
  const [abrirPrecios, setAbrirPrecios] = useState<string | null>(null)
  const alEditarObjeto = useCallback((b: boolean) => setEditandoObjeto(b), [])
  const alEditarFiguras = useCallback((b: boolean) => setEditandoFiguras(b), [])
  const op = riesgo.oportunidad
  // «Parrilla de precios»: el lado bot llega de la MISMA lectura (y sondeo) de «Presupuestos de compañías»; sin bot
  // para el ramo, ese bloque no se pinta ni lee, y el lado es «no aplica». `null` = aún leyéndose.
  const botsDelRamo = useMemo(() => companiasDisponibles(op.ramo).map((c) => c.compania), [op.ramo])
  const [ladoBot, setLadoBot] = useState<LadoBot | null>(() => (botsDelRamo.length === 0 ? { estado: 'no_aplica' } : null))
  const alLeerBots = useCallback((l: { estado: 'ok'; trabajos: TrabajoCompania[] } | { estado: 'error'; texto: string }) => {
    setLadoBot(l.estado === 'ok' ? { estado: 'ok', disponibles: botsDelRamo, trabajos: trabajosParaParrilla(l.trabajos) } : { estado: 'sin_leer', motivo: l.texto })
  }, [botsDelRamo])

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
  // Ramo SIN cotizador Avant2 (comercio, RC, comunidades, otros…): aviso explícito; no se inventa cotizador (13/10/2026).
  const sinAvant2 = acciones.principal ? null : avisoSinAvant2(op.ramo, { hayBots })
  const esVehiculo = op.ramo === 'auto' || op.ramo === 'moto'
  const ramoEmbebido = ramoCotizadorEmbebido(op.ramo)
  const CotizadorEmbebido = ramoEmbebido ? COTIZADOR_EMBEBIDO[ramoEmbebido] : null
  const ocupado = recargando || cotizandoEmbebido
  // Llegar con `#pedir-precio` («Tarificar →» de la ficha, `rutaPedirPrecio`) abre el cotizador: solo LEE (gratis);
  // pedir precio sigue necesitando el clic de confirmación (0,50€).
  useEffect(() => {
    if (acciones.principal && abrirAlCargar(window.location.hash, op.ramo)) setCotizadorAbierto(true)
    // Una vez, al llegar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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

  // Auto y moto (20/10/2026): tres bloques (Personas · Riesgo · Póliza) con SOLO lo pendiente arriba y lo completo plegado.
  // Lo que falta lo publica «Bots (gratis)»; mientras no lo haya publicado, los bloques se ven enteros como siempre.
  const motor = op.ramo === 'auto' || op.ramo === 'moto'

  return (
    <PendientesMotorProvider>
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

      {/* Orden (Alberto, 13/10/2026): intervinientes → objeto del riesgo → historial → verificación + pedir precio. */}
      <BloqueMotor bloque="personas" activo={motor}>
      <FigurasRiesgo
        riesgo={riesgo}
        ocupado={ocupado}
        onCambio={(texto) => void recargar(texto)}
        onError={(texto) => setAviso({ ok: false, texto })}
        onEditando={alEditarFiguras}
      />
      </BloqueMotor>

      {esVehiculo ? (
        <BloqueMotor bloque="riesgo" activo={motor}>
        <DatosVehiculo
          riesgo={riesgo}
          ocupado={ocupado}
          onCambio={(texto) => void recargar(texto)}
          onError={(texto) => setAviso({ ok: false, texto })}
          onEditando={alEditarObjeto}
        />
        </BloqueMotor>
      ) : (
        <DatosRiesgo
          riesgo={riesgo}
          // Mientras se paga una cotización embebida (hogar) no se deja editar la vivienda: se cotiza con lo guardado.
          ocupado={ocupado}
          onCambio={(texto) => void recargar(texto)}
          onError={(texto) => setAviso({ ok: false, texto })}
          onEditando={alEditarObjeto}
        />
      )}

      {/* «Historial y bonificaciones» (10/10/2026): seguro anterior, siniestros y carné, para verlos antes de pedir precio. */}
      <BloqueMotor bloque="poliza" activo={motor}>
      <HistorialRiesgo riesgo={riesgo} hoy={hoy} />
      </BloqueMotor>

      {/* ÚNICO bloque «Pedir precio» (07/10/2026): el aviso «Falta para pedir precio», el botón principal, el
          secundario (póliza) y el coste de 0,50€ viven aquí y en ningún otro sitio de la página. */}
      <AnfitrionBotsContext.Provider value={anfitrionBots}>
      <section id="pedir-precio" aria-labelledby="pedir-precio-titulo" style={{ ...cardStyle, display: 'grid', gap: 8, minWidth: 0 }}>
        <div id="pedir-precio-titulo" style={{ fontSize: 14, fontWeight: 600 }}>Pedir precio</div>
        {acciones.principal ? (
          <>
            {faltaDatos && (
              <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
                {faltaDatos} {CotizadorEmbebido ? `Complétalo arriba, en «${bloqueObjetoDeRamo(op.ramo)}»: el bloque de precio no lo vuelve a pedir.` : 'Puedes seguir: la pantalla de precio lo pedirá.'}
              </p>
            )}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              {op.polizaId && acciones.secundario
                ? 'Este riesgo es de una póliza en cartera. Lo normal es pedir precio con los intervinientes y los datos de esta página; retarificar la póliza usa sus datos de hoy.'
                : 'Se pide precio con los intervinientes y los datos de esta página.'}{' '}
              {CotizadorEmbebido
                ? 'Abrir el cotizador es gratis; solo se paga en su botón final, que se enciende con la verificación completa'
                : 'En la siguiente pantalla se confirma'}; pedir precio cuesta 0,50€.
            </p>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
              {/* Cotizador embebido: se despliega en este mismo bloque; ningún enlace a la pantalla `…-nuevo` de su ramo.
                  Abierto, el botón que lo abre sobra (el formulario ES esa acción): no se repite. */}
              {!(CotizadorEmbebido && cotizadorAbierto) && (
              <div style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
                {CotizadorEmbebido ? (
                  <button type="button" onClick={() => setCotizadorAbierto(true)} aria-expanded={false} aria-controls="pedir-precio-cotizador"
                    style={{ ...btnStyle('primario', 'md'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', height: 'auto' }}>
                    {acciones.principal.etiqueta}
                  </button>
                ) : (
                  <BtnLink href={acciones.principal.href} variante="primario">{acciones.principal.etiqueta}</BtnLink>
                )}
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {CotizadorEmbebido ? (op.ramo === 'auto' ? 'Aquí solo se piden las condiciones de esta cotización (efecto, remolque, estado civil, municipio, carnet…): el coche, las personas y el historial son los de arriba.' : esVehiculo ? 'Con los intervinientes y los datos de arriba; aquí solo se piden las condiciones (efecto, garaje, km, seguro actual…).' : 'Aquí solo se piden las condiciones (fecha de efecto…).') : acciones.principal.nota}
                </span>
              </div>
              )}
              {acciones.secundario && (
                <div style={{ display: 'grid', gap: 4, alignContent: 'start', minWidth: 0 }}>
                  <BtnLink href={acciones.secundario.href} variante="secundario">{acciones.secundario.etiqueta}</BtnLink>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{acciones.secundario.nota}</span>
                </div>
              )}
            </div>
            {/* Bots RPA (gratis) con entrada propia: no dependen de Avant2 (ni de su precalificación) ni de abrir el cotizador. */}
            {op.ramo === 'auto' && <BotsAutoRiesgo riesgo={riesgo} />}
            {/* Hogar (19/10/2026): Allianz Hogar en exploración, con los datos de la vivienda y el Catastro; uso/régimen/tipo/madera, a elegir. */}
            {op.ramo === 'hogar' && <BotsHogarRiesgo riesgo={riesgo} />}
            {CotizadorEmbebido && cotizadorAbierto && (
              <div id="pedir-precio-cotizador" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, minWidth: 0 }}>
                <CotizadorEmbebido
                  riesgo={riesgo}
                  editandoObjeto={editandoObjeto}
                  editandoFiguras={editandoFiguras}
                  recargando={recargando}
                  onCotizando={setCotizandoEmbebido}
                  onCotizado={(id) => {
                    setCotizadorAbierto(false)
                    setCotizandoEmbebido(false)
                    setAbrirPrecios(id)
                    void recargar('Precio pedido y guardado en «Presupuestos de este riesgo»: desde ahí se emite.')
                  }}
                  onDesfase={() => void recargar()}
                  onCerrar={() => setCotizadorAbierto(false)}
                />
              </div>
            )}
            {/* Escenarios (07/10/2026): otra persona de tomador sin tocar figura a figura. Acción SECUNDARIA: apartada,
                debajo del cotizador, para que no compita con el botón de pedir precio. */}
            {ramo && riesgo.roles.includes('conductor_habitual') && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>Otras opciones</div>
              <DuplicarOtroTomador
                riesgo={riesgo}
                ocupado={ocupado || editandoFiguras || editandoObjeto || cotizadorAbierto}
                onCambio={(texto) => void recargar(texto)}
                onError={(texto) => setAviso({ ok: false, texto })}
                onRecargar={() => void recargar()}
              />
            </div>
            )}
          </>
        ) : hayBots ? (
          <>
            {sinAvant2 && <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>{sinAvant2}</p>}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Este ramo se cotiza con los bots de compañía: el formulario de presupuestos de más abajo va ya sembrado con el capital y la dirección de los datos; allí eliges compañías y lo pides.
            </p>
            <div>
              <a href="#presupuestos" style={{ ...btnStyle('primario', 'md'), minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', maxWidth: '100%' }}>
                Ir a pedir presupuestos →
              </a>
            </div>
            {/* Sin acción principal (p. ej. sin Avant2) el coche sigue teniendo sus bots con entrada propia. */}
            {op.ramo === 'auto' && <BotsAutoRiesgo riesgo={riesgo} />}
          </>
        ) : (
          <>
          {sinAvant2 && <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>{sinAvant2}</p>}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {avisoRamoSinTarifa(op.ramo, 'Este ramo se cotiza fuera (no hay tarifa a la que pedir precio desde aquí): los datos de arriba son para el expediente.')} La{' '}
            <Link href={`/correduria/cliente/${encodeURIComponent(op.clienteId)}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>ficha del cliente</Link>{' '}
            sigue siendo el sitio de sus pólizas y gestiones.
          </p>
          </>
        )}
      </section>
      </AnfitrionBotsContext.Provider>

      {/* UNA parrilla por oportunidad (13/10/2026): Avant2 frente al bot, por compañía. Solo compara; los precios con su
          «Emitir», PDF y traza siguen en «Presupuestos de compañías» y en «Presupuestos de este riesgo» (P1…Pn). */}
      <ParrillaPrecios oportunidadId={op.id} claveVariantes={riesgo.variantes.map((v) => v.id).join(',')} bot={ladoBot} />

      <OfertasOportunidad oportunidadId={op.id} clienteId={op.clienteId} polizaId={op.polizaId} />

      {/* Bots de compañía (07/10/2026): solo se pinta si algún bot cotiza este ramo (hoy, comunidades). */}
      <PresupuestosCompanias
        oportunidadId={op.id}
        clienteId={op.clienteId}
        ramo={op.ramo}
        riesgoLibre={bloqueDatos?.clave === 'datosRiesgoLibre' ? { capital: bloqueDatos.datos.capital, direccion: bloqueDatos.datos.direccion } : null}
        onLectura={alLeerBots}
      />
      {/* Ramos sin bloque de compañías (auto, moto…): el botón de «preparar presupuesto» se monta aparte. */}
      {botsDelRamo.length === 0 && <PrepararPresupuestoBotSolo oportunidadId={op.id} />}

      <HistorialVariantes riesgo={riesgo} abrirPrecios={abrirPrecios} />

      {/* Varios presupuestos de este riesgo en UNA propuesta (07/10/2026). Preparar no avisa a nadie. */}
      <PropuestaEscenarios riesgo={riesgo} />
    </div>
    </PendientesMotorProvider>
  )
}
