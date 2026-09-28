'use client'
import { useState } from 'react'
import { eur } from '@/lib/dinero'

/**
 * Aceptar una opción del presupuesto (pieza 4-d).
 *
 * Reglas:
 *  - El documento se enseña ENTERO antes de firmar: se firma lo que se ha leído.
 *  - La sesión del portal no basta: hace falta un código nuevo al correo.
 *  - El texto de consentimiento es el que devuelve asegura, el mismo que queda
 *    en la evidencia de la firma; aquí no se escribe una copia.
 *  - La vista de corredor lee pero no firma (el servidor también lo niega).
 *  - Un error al firmar NO se pinta como «aceptada»: se dice que no se sabe.
 *  - Sin cuenta de domiciliación no se firma. La de la ficha se enseña SOLO enmascarada
 *    («**** 1234»); si no hay o quiere otra, teclea un IBAN que valida el servidor (módulo 97).
 *    El IBAN tecleado vive solo en este estado: no se guarda en el navegador.
 */
type CuentaFicha = { mascara: string | null; aviso: string | null }
type Eleccion = { eleccion: 'ficha' } | { eleccion: 'otra'; iban: string }
type PasoCuenta = { paso: 'cuenta'; cuentaFicha: CuentaFicha }
type PasoRev = { paso: 'revisar'; cuentaFicha: CuentaFicha; eleccion: Eleccion; cuentaMascara: string; consentimiento: string; confirmacionDatos: string; documento: string; documentoHash: string; anulacion: { compania: string; numeroPoliza: string; fechaEfecto: string; carta: string; advertencia: string | null } | null; sinAnulacion: string | null }
type PasoCodigo = { paso: 'codigo'; email: string; minutos: number; consentimiento: string; confirmacionDatos: string; documentoHash: string; eleccion: Eleccion }

const AVISO_CUENTA: Record<string, string> = {
  ilegible: 'Tenemos una cuenta guardada que ahora mismo no podemos leer. Indícanos en cuál quieres domiciliar los recibos.',
  invalida: 'La cuenta que tenemos guardada no es un IBAN válido. Indícanos en cuál quieres domiciliar los recibos.',
  no_comprobada: 'No hemos podido comprobar si tenemos tu cuenta. Indícanos en cuál quieres domiciliar los recibos.',
}

function leerCuentaFicha(v: unknown): CuentaFicha {
  const c = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  return {
    // Solo una máscara «**** XXXX»: cualquier otra cosa no se pinta.
    mascara: typeof c.mascara === 'string' && /^\*\*\*\* [A-Z0-9]{4}$/.test(c.mascara) ? c.mascara : null,
    aviso: typeof c.aviso === 'string' ? c.aviso : null,
  }
}

export function AceptarOpcion({ presupuestoId, opcionId, prima, compania, corredor, bloqueoDatos }: {
  presupuestoId: string
  opcionId: string
  prima: number | null
  compania: string
  corredor: boolean
  /** Por qué no se puede aceptar por los datos (ilegibles o avisados como incorrectos). `null` = se puede. */
  bloqueoDatos: string | null
}) {
  const [paso, setPaso] = useState<{ paso: 'inicio' } | PasoCuenta | PasoRev | PasoCodigo | { paso: 'aceptada'; aceptadoEl: string }>({ paso: 'inicio' })
  // La cuenta: «usar la de mi ficha» o «usar otra» (con el IBAN tecleado).
  const [usarOtra, setUsarOtra] = useState(false)
  const [iban, setIban] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  // «He revisado mis datos…»: sin marcarla no se firma (y el servidor lo vuelve a exigir).
  const [confirma, setConfirma] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function enviar(cuerpo: Record<string, unknown>): Promise<{ status: number; j: Record<string, unknown> } | null> {
    try {
      const r = await fetch('/api/presupuesto/firma', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presupuestoId, opcionId, ...cuerpo }),
      })
      return { status: r.status, j: ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown> }
    } catch {
      return null
    }
  }

  async function elegir() {
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'preparar' })
    setOcupado(false)
    if (r?.status === 200 && r.j.estado === 'elegir_cuenta') {
      const cuentaFicha = leerCuentaFicha(r.j.cuentaFicha)
      setUsarOtra(cuentaFicha.mascara === null)
      setIban('')
      setPaso({ paso: 'cuenta', cuentaFicha })
      return
    }
    avisoDePreparar(r)
  }

  async function continuarConCuenta() {
    if (paso.paso !== 'cuenta') return
    const eleccion: Eleccion = usarOtra || paso.cuentaFicha.mascara === null ? { eleccion: 'otra', iban } : { eleccion: 'ficha' }
    if (eleccion.eleccion === 'otra' && !eleccion.iban.trim()) {
      setAviso('Escribe el IBAN de la cuenta en la que quieres domiciliar los recibos.')
      return
    }
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'preparar', cuenta: eleccion })
    setOcupado(false)

    // Sin el texto de la casilla ni la cuenta enmascarada no se ofrece firmar.
    const cuenta = (typeof r?.j.cuenta === 'object' && r?.j.cuenta !== null ? r.j.cuenta : {}) as Record<string, unknown>
    if (r?.status === 200 && r.j.estado === 'ok' && typeof r.j.documento === 'string'
      && typeof r.j.confirmacionDatos === 'string' && r.j.confirmacionDatos.trim()
      && typeof cuenta.mascara === 'string' && /^\*\*\*\* [A-Z0-9]{4}$/.test(cuenta.mascara)) {
      setPaso({
        paso: 'revisar',
        cuentaFicha: paso.cuentaFicha,
        eleccion,
        cuentaMascara: cuenta.mascara,
        consentimiento: typeof r.j.consentimiento === 'string' ? r.j.consentimiento : '',
        confirmacionDatos: r.j.confirmacionDatos,
        documento: r.j.documento,
        documentoHash: typeof r.j.documentoHash === 'string' ? r.j.documentoHash : '',
        anulacion: (typeof r.j.anulacion === 'object' && r.j.anulacion !== null) ? {
          compania: typeof (r.j.anulacion as Record<string, unknown>).compania === 'string' ? (r.j.anulacion as Record<string, unknown>).compania as string : '',
          numeroPoliza: typeof (r.j.anulacion as Record<string, unknown>).numeroPoliza === 'string' ? (r.j.anulacion as Record<string, unknown>).numeroPoliza as string : '',
          fechaEfecto: typeof (r.j.anulacion as Record<string, unknown>).fechaEfecto === 'string' ? (r.j.anulacion as Record<string, unknown>).fechaEfecto as string : '',
          carta: typeof (r.j.anulacion as Record<string, unknown>).carta === 'string' ? (r.j.anulacion as Record<string, unknown>).carta as string : '',
          advertencia: (typeof (r.j.anulacion as Record<string, unknown>).advertencia === 'string') ? (r.j.anulacion as Record<string, unknown>).advertencia as string : null,
        } : null,
        sinAnulacion: typeof r.j.sinAnulacion === 'string' ? r.j.sinAnulacion : null,
      })
      return
    }
    // El IBAN no vale (o falta): se queda en el paso de la cuenta con el motivo del servidor.
    if ((r?.j.estado === 'iban_invalido' || r?.j.estado === 'sin_cuenta') && typeof r.j.motivo === 'string') {
      setAviso(r.j.motivo)
      return
    }
    avisoDePreparar(r)
  }

  function avisoDePreparar(r: { status: number; j: Record<string, unknown> } | null) {
    // `preparar` devuelve el estado de asegura tal cual (caducado → `no_admite` con su motivo), no `no_disponible`.
    const estado = typeof r?.j.estado === 'string' ? r.j.estado : 'error'
    if (r && estado !== 'error' && typeof r.j.motivo === 'string') {
      setAviso(r.j.motivo)
      return
    }
    const fijo: Record<string, string> = {
      no_encontrado: 'Este presupuesto ya no está disponible. Recarga la página.',
      sin_ficha: 'Este presupuesto ya no está disponible. Recarga la página.',
      varias_fichas: 'Este presupuesto ya no está disponible. Recarga la página.',
      sin_precio: 'La opción no tiene precio. Escríbeme para revisarla.',
    }
    setAviso(fijo[estado] ?? 'No hemos podido preparar la aceptación. Inténtalo en unos minutos o llámanos.')
  }

  async function pedirCodigo() {
    if (paso.paso !== 'revisar') return
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'codigo' })
    setOcupado(false)

    if (r?.j.estado === 'codigo_enviado' && typeof r.j.email === 'string') {
      setPaso({
        paso: 'codigo', email: r.j.email, minutos: typeof r.j.minutos === 'number' ? r.j.minutos : 10,
        consentimiento: paso.consentimiento, confirmacionDatos: paso.confirmacionDatos, documentoHash: paso.documentoHash,
        eleccion: paso.eleccion,
      })
      setCodigo('')
      return
    }
    if (r?.j.estado === 'espera') {
      setAviso(`Acabamos de mandarte un código. Espera ${String(r.j.segundos ?? 60)} segundos para pedir otro.`)
      return
    }
    if (r?.j.estado === 'no_disponible' && typeof r.j.motivo === 'string') {
      setAviso(r.j.motivo)
      return
    }
    setAviso('No hemos podido mandarte el código. Inténtalo en unos minutos o llámanos.')
  }

  async function firmar() {
    if (paso.paso !== 'codigo') return
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'firmar', codigo, nombre, documentoHash: paso.documentoHash, datosConfirmados: confirma, cuenta: paso.eleccion })
    setOcupado(false)

    if (r?.j.estado === 'aceptado' && typeof r.j.aceptadoEl === 'string') {
      setIban('')
      setPaso({ paso: 'aceptada', aceptadoEl: r.j.aceptadoEl })
      return
    }
    if ((r?.j.estado === 'reintentar' || r?.j.estado === 'no_disponible') && typeof r.j.motivo === 'string') {
      setAviso(r.j.motivo)
      return
    }
    setAviso('No sabemos si la aceptación se ha guardado. Recarga la página antes de volver a intentarlo.')
  }

  function fecha(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  if (paso.paso === 'aceptada') {
    return (
      <article className="vencimiento-tarjeta">
        <strong style={{ fontSize: 15 }}>Has aceptado esta opción</strong>
        <p style={{ margin: 0, fontSize: 14 }}>
          Aceptada el {fecha(paso.aceptadoEl)}. Tu corredor tramita la emisión con la compañía; no tienes
          cobertura nueva hasta que te confirmemos que está emitida.
        </p>
      </article>
    )
  }

  const puedeAceptar = prima !== null

  // Fail-closed: con los datos ilegibles o avisados como incorrectos no se ofrece aceptar.
  if (bloqueoDatos !== null) {
    return (
      <article className="vencimiento-tarjeta">
        <strong style={{ fontSize: 15 }}>Elegir esta opción</strong>
        <p className="pendiente" style={{ margin: 0, fontSize: 14 }}>{bloqueoDatos}</p>
      </article>
    )
  }

  return (
    <article className="vencimiento-tarjeta">
      <div style={{ display: 'grid', gap: 2 }}>
        <strong style={{ fontSize: 15 }}>Elegir esta opción</strong>
        <span className="suave" style={{ fontSize: 13 }}>{compania} · {puedeAceptar ? eur(prima) : '—'}</span>
      </div>

      {!puedeAceptar ? (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>
          Esta opción no tiene precio. Escríbeme para revisarla.
        </p>
      ) : (
        <>
          {paso.paso === 'inicio' ? (
            <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado} onClick={elegir}>
              {ocupado ? 'Cargando…' : 'Elegir esta opción'}
            </button>
          ) : paso.paso === 'cuenta' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <strong style={{ fontSize: 14 }}>Cuenta para domiciliar los recibos</strong>
              {paso.cuentaFicha.mascara !== null ? (
                <div role="radiogroup" aria-label="Cuenta para los recibos" style={{ display: 'grid', gap: 6 }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontSize: 14, cursor: 'pointer' }}>
                    <input type="radio" name={`cuenta-${opcionId}`} checked={!usarOtra} onChange={() => setUsarOtra(false)} style={{ width: 22, height: 22, flex: '0 0 auto' }} />
                    <span>Usar la de mi ficha: <strong>{paso.cuentaFicha.mascara}</strong></span>
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontSize: 14, cursor: 'pointer' }}>
                    <input type="radio" name={`cuenta-${opcionId}`} checked={usarOtra} onChange={() => setUsarOtra(true)} style={{ width: 22, height: 22, flex: '0 0 auto' }} />
                    <span>Usar otra cuenta</span>
                  </label>
                </div>
              ) : (
                <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                  {(paso.cuentaFicha.aviso && AVISO_CUENTA[paso.cuentaFicha.aviso])
                    ?? 'No tenemos ninguna cuenta tuya. Indícanos en cuál quieres domiciliar los recibos: la compañía la necesita para emitir la póliza.'}
                </p>
              )}
              {(usarOtra || paso.cuentaFicha.mascara === null) && (
                <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                  IBAN
                  <input
                    className="campo" autoComplete="off" spellCheck={false} autoCapitalize="characters" maxLength={42}
                    placeholder="ES00 0000 0000 0000 0000 0000" value={iban}
                    onChange={(e) => setIban(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ''))}
                    style={{ minHeight: 44, fontFamily: 'inherit', letterSpacing: 0.5, width: '100%', boxSizing: 'border-box' }}
                  />
                  <span className="suave" style={{ fontSize: 12 }}>La comprobamos antes de seguir. La guardamos cifrada en tu ficha.</span>
                </label>
              )}
              <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado} onClick={continuarConCuenta}>
                {ocupado ? 'Comprobando…' : 'Continuar'}
              </button>
            </div>
          ) : paso.paso === 'revisar' ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
                <span>Recibos en la cuenta <strong>{paso.cuentaMascara}</strong></span>
                <button
                  type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={ocupado}
                  onClick={() => { setAviso(null); setPaso({ paso: 'cuenta', cuentaFicha: paso.cuentaFicha }) }}
                >
                  Cambiar cuenta
                </button>
              </div>
              <div
                style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflowWrap: 'anywhere' }}
                aria-label="Documento que vas a firmar"
              >
                {paso.documento}
              </div>

              {paso.anulacion && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <strong style={{ fontSize: 14 }}>También firmas la anulación de tu póliza</strong>
                  <p style={{ fontSize: 13, margin: '6px 0 0' }}>
                    {paso.anulacion.compania} (nº {paso.anulacion.numeroPoliza}) · con efecto el {fecha(paso.anulacion.fechaEfecto)}
                  </p>
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '6px 0 0', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                    No se enviará a {paso.anulacion.compania} hasta que la nueva póliza esté emitida.
                  </p>
                  {paso.anulacion.carta && (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '8px 0 0', padding: 8, background: 'var(--background)', borderRadius: 4, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                      {paso.anulacion.carta}
                    </div>
                  )}
                  {paso.anulacion.advertencia && (
                    <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--alarma)', fontWeight: 500 }}>
                      {paso.anulacion.advertencia}
                    </p>
                  )}
                </div>
              )}

              {paso.sinAnulacion && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <p style={{ margin: 0, fontSize: 13 }}>{paso.sinAnulacion}</p>
                </div>
              )}

              {corredor ? (
                <p className="suave" style={{ margin: 0, fontSize: 14 }}>Vista de corredor: la firma la hace el cliente con un código a su correo.</p>
              ) : (
                <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado} onClick={pedirCodigo}>
                  {ocupado ? 'Enviando…' : 'Mandarme un código para firmar'}
                </button>
              )}
            </>
          ) : paso.paso === 'codigo' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                Te hemos mandado un código a {paso.email}. Caduca en {paso.minutos} minutos.
              </p>
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Código
                <input
                  className="campo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Tu nombre y apellidos
                <input className="campo" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </label>
              {paso.consentimiento && <p className="suave" style={{ margin: 0, fontSize: 13 }}>{paso.consentimiento}</p>}
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, minHeight: 44, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={confirma} onChange={(e) => setConfirma(e.target.checked)}
                  style={{ width: 22, height: 22, flex: '0 0 auto', marginTop: 1 }}
                />
                <span>{paso.confirmacionDatos} <span className="suave">(los de «Revisa tus datos», arriba)</span></span>
              </label>
              <button
                type="button" className="boton" style={{ minHeight: 48 }}
                disabled={ocupado || codigo.length !== 6 || nombre.trim() === '' || !confirma} onClick={firmar}
              >
                {ocupado ? 'Firmando…' : 'Firmar y aceptar'}
              </button>
              <button type="button" className="boton-tenue" disabled={ocupado} onClick={pedirCodigo}>
                Mandarme otro código
              </button>
            </div>
          ) : null}
        </>
      )}

      {aviso && <p className="error-linea" role="alert" style={{ margin: 0 }}>{aviso}</p>}
    </article>
  )
}
