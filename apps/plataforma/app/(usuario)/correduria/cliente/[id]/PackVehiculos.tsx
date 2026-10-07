'use client'

// PACK coche + moto OPCIONAL (03/10/2026, Alberto). Un interruptor en la pantalla de tarificar un
// coche (o una moto) nuevo, APAGADO por defecto. Apagado no hace NADA: ni llama, ni toca nada, y la
// pantalla se comporta como siempre. Encendido: dice cuánto cuesta la llamada del otro vehículo ANTES
// de lanzarla y exige un clic de confirmación (es dinero real); si el otro vehículo ya estaba
// tarificado, lo enseña gratis. Con precios de los dos, un cuadro por compañía con la suma.
//
// La lógica (qué vehículo, si cabe, cuánto suma) vive en helpers puros con test:
// `@/lib/correduria/pack-otro-vehiculo` y `@central/module-seguros` (`cuadroPack`).

import { useEffect, useState } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { cuadroPack, type PrecioPack } from '@central/module-seguros'
import { COSTE_LLAMADA_EUR, otroRamoPack, textoCostePack, type OtroVehiculo, type RamoPack } from '@/lib/correduria/pack-otro-vehiculo'
import { pedirCotizacionPack, pedirPackGuardado } from './pack-acciones'

const ROTULO: Record<RamoPack, string> = { auto: 'coche', moto: 'moto' }

type Lado =
  | { estado: 'sin_mirar' }
  | { estado: 'leyendo' }
  | { estado: 'guardada'; precios: PrecioPack[]; creadaEn: string }
  | { estado: 'ninguna' }
  | { estado: 'cotizando' }
  | { estado: 'ok'; precios: PrecioPack[]; simulado: boolean; coste: string }
  | { estado: 'no'; motivo: string }
  | { estado: 'error'; mensaje: string }

export default function PackVehiculos({
  clienteId,
  ramoActual,
  otro,
  estadoCivilId,
  municipioId,
  fechaEfecto,
  preciosActuales,
  puedePedir,
  llamadasHechas,
  onPack,
}: {
  clienteId: string
  ramoActual: RamoPack
  /** `null` = no se han podido leer las oportunidades del cliente: no se sabe si tiene otro vehículo. */
  otro: OtroVehiculo | null
  estadoCivilId: string
  municipioId: string
  fechaEfecto: string
  /** Los precios de ESTA pantalla (`null` = aún no se ha pedido). */
  preciosActuales: PrecioPack[] | null
  /** El libro de consumo permite otra llamada (o es simulación). */
  puedePedir: boolean
  /** Llamadas de pago ya hechas en esta pantalla (0 o 1): para decir el total del pack. */
  llamadasHechas: number
  /** Estado del pack para quien decide `insuredFamilyInAllianz`: encendido, y con precios REALES del otro vehículo. */
  onPack: (e: { activo: boolean; tarificado: boolean }) => void
}) {
  const [activo, setActivo] = useState(false)
  const [lado, setLado] = useState<Lado>({ estado: 'sin_mirar' })
  const [confirmo, setConfirmo] = useState(false)
  const nombreOtro = ROTULO[otroRamoPack(ramoActual)]

  // Al encenderlo, SIN gastar: ¿ya está tarificado el otro? (lectura gratis de lo guardado).
  useEffect(() => {
    if (!activo || otro?.estado !== 'uno' || lado.estado !== 'sin_mirar') return
    let vivo = true
    setLado({ estado: 'leyendo' })
    pedirPackGuardado({ clienteId, ramoActual, oportunidadOtroId: otro.oportunidadId })
      .then((r) => {
        if (!vivo) return
        if (r.estado === 'ok' && !r.guardada.caducada) setLado({ estado: 'guardada', precios: r.guardada.precios, creadaEn: r.guardada.creadaEn })
        else if (r.estado === 'ok' || r.estado === 'ninguna') setLado({ estado: 'ninguna' })
        else setLado({ estado: 'error', mensaje: `No se ha podido mirar si ya estaba tarificado (${r.mensaje}). Eso no quiere decir que no lo esté.` })
      })
      .catch(() => vivo && setLado({ estado: 'error', mensaje: 'No se ha podido hablar con asegura para mirar si ya estaba tarificado.' }))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo])

  const preciosOtro = lado.estado === 'ok' || lado.estado === 'guardada' ? lado.precios : null
  const simulado = lado.estado === 'ok' && lado.simulado
  useEffect(() => {
    onPack({ activo, tarificado: activo && preciosOtro !== null && !simulado })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, preciosOtro, simulado])

  function alternar() {
    setActivo((a) => !a)
    setConfirmo(false)
    // Apagar vuelve a lo de siempre: se olvida lo leído (la próxima vez que se encienda se mira otra vez).
    if (activo) setLado({ estado: 'sin_mirar' })
  }

  async function lanzar() {
    if (otro?.estado !== 'uno') return
    setLado({ estado: 'cotizando' })
    setConfirmo(false)
    const r = await pedirCotizacionPack({ clienteId, ramoActual, oportunidadOtroId: otro.oportunidadId, estadoCivilId, municipioId, fechaEfecto: fechaEfecto || null })
    switch (r.estado) {
      case 'ok': setLado({ estado: 'ok', precios: r.precios, simulado: r.simulado, coste: r.coste }); return
      case 'pack_no': setLado({ estado: 'no', motivo: r.motivo }); return
      case 'faltan': setLado({ estado: 'no', motivo: `Faltan datos para el ${nombreOtro}: ${r.faltan.map((f) => String(f.campo)).join(', ')}. No se ha gastado nada.` }); return
      case 'error': setLado({ estado: 'error', mensaje: `${r.mensaje}${r.gastoDesconocido ? ' — No se sabe si se han cobrado los 0,50€: míralo en el libro de consumo antes de repetir.' : ''}` }); return
      default: setLado({ estado: 'error', mensaje: r.mensaje })
    }
  }

  const a = ramoActual === 'auto' ? preciosActuales : preciosOtro
  const b = ramoActual === 'auto' ? preciosOtro : preciosActuales
  const cuadro = a && b ? cuadroPack(a, b) : null

  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 10, minWidth: 0 }}>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        onClick={alternar}
        style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, width: '100%', background: 'transparent', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
      >
        <span aria-hidden style={{ flex: '0 0 44px', height: 26, borderRadius: 13, background: activo ? 'var(--primary)' : 'var(--border)', position: 'relative' }}>
          <span style={{ position: 'absolute', top: 3, left: activo ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left .15s' }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <strong>Pack coche + moto</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
            {activo ? `Se tarifica también el ${nombreOtro} del cliente.` : `Apagado: solo se tarifica ${ramoActual === 'auto' ? 'este coche' : 'esta moto'}, como siempre.`}
          </span>
        </span>
      </button>

      {activo && otro === null && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          No se han podido leer las oportunidades del cliente: no consta si tiene otro vehículo (eso no quiere decir que no lo tenga). Recarga la pantalla.
        </p>
      )}
      {activo && otro?.estado === 'ninguno' && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          El cliente no tiene abierta una oportunidad de {nombreOtro}: no hay segundo vehículo que tarificar. Ábrela desde su ficha y vuelve aquí.
        </p>
      )}
      {activo && otro?.estado === 'ambiguo' && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          El cliente tiene {otro.n} oportunidades abiertas de {nombreOtro}: no se elige una a ojo (podría salir el precio de otro vehículo). Deja abierta solo la que va en el pack.
        </p>
      )}

      {activo && otro?.estado === 'uno' && (
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, overflowWrap: 'anywhere' }}>
            Segundo vehículo: <strong>{otro.etiqueta ?? `${nombreOtro} sin matrícula en la oportunidad`}</strong>
          </p>

          {lado.estado === 'leyendo' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Mirando si ya está tarificado (gratis)…</p>}
          {lado.estado === 'guardada' && (
            <p style={{ margin: 0, fontSize: 13 }}>
              Ya está tarificado ({new Date(lado.creadaEn).toLocaleDateString('es-ES')}): se usa esa, <strong>gratis</strong>. Volver a tarificarlo cuesta {eur(COSTE_LLAMADA_EUR)}.
            </p>
          )}
          {lado.estado === 'error' && <p style={{ margin: 0, fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{lado.mensaje}</p>}
          {lado.estado === 'no' && <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)', overflowWrap: 'anywhere' }}>No se ha tarificado el {nombreOtro} (0,00€): {lado.motivo}</p>}
          {lado.estado === 'ok' && (
            <p style={{ margin: 0, fontSize: 13 }}>
              {lado.simulado ? 'SIMULACIÓN (precios inventados, no cuenta como pack). ' : ''}Tarificado el {nombreOtro}: {lado.precios.length} precios · coste {lado.coste}.
            </p>
          )}

          {(lado.estado === 'sin_mirar' || lado.estado === 'ninguna' || lado.estado === 'guardada' || lado.estado === 'error' || lado.estado === 'no') && (
            <div style={{ display: 'grid', gap: 8, borderLeft: '3px solid var(--negative)', paddingLeft: 10 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong style={{ color: 'var(--negative)' }}>{textoCostePack(llamadasHechas)}</strong>
              </p>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontSize: 13 }}>
                <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} style={{ width: 22, height: 22, flex: '0 0 22px' }} />
                <span>Confirmo el gasto de {eur(COSTE_LLAMADA_EUR)} en esta llamada.</span>
              </label>
              <button
                type="button"
                disabled={!confirmo || !puedePedir}
                onClick={lanzar}
                style={{ ...btnStyle('primario', 'sm'), minHeight: 44, justifySelf: 'start', maxWidth: '100%' }}
              >
                {lado.estado === 'guardada' ? `Volver a tarificar el ${nombreOtro} — ${eur(COSTE_LLAMADA_EUR)}` : `Tarificar el ${nombreOtro} — ${eur(COSTE_LLAMADA_EUR)}`}
              </button>
              {!puedePedir && <p style={{ margin: 0, fontSize: 12, color: 'var(--negative)' }}>El libro de consumo no permite otra llamada ahora mismo.</p>}
            </div>
          )}
          {lado.estado === 'cotizando' && <p style={{ margin: 0, fontSize: 13 }}>Tarificando el {nombreOtro}… (puede tardar hasta 2 min; no cierres la pantalla)</p>}
        </div>
      )}

      {activo && otro?.estado === 'uno' && preciosOtro !== null && preciosActuales === null && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Pide el precio de {ramoActual === 'auto' ? 'este coche' : 'esta moto'} (botón de arriba) y aquí saldrá la suma por compañía.
        </p>
      )}

      {activo && cuadro && (
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>Pack: suma por compañía</strong>
          {cuadro.filas.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Ninguna compañía ha dado precio para los dos vehículos: no hay suma que enseñar.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {cuadro.filas.map((f) => (
                <li key={f.compania} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <strong>{f.compania}</strong>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                      Coche {eur(f.a.primaEur)} + moto {eur(f.b.primaEur)}
                    </span>
                  </span>
                  <strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{eur(f.total)}</strong>
                </li>
              ))}
            </ul>
          )}
          {cuadro.soloEnUno.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
              Sin suma (precio solo en uno de los dos): {cuadro.soloEnUno.map((s) => `${s.compania} (${s.enA ? 'coche' : 'moto'})`).join(', ')}.
            </p>
          )}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            Suma del precio más barato de cada compañía en cada vehículo. Es una orientación: cada póliza se contrata por separado.
          </p>
        </div>
      )}
    </section>
  )
}
