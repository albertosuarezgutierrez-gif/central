'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import type { PolizaPintable, SegurosDeInmueble } from '@/lib/patrimonio/seguros-inmueble-api'

const ERRORES: Record<string, string> = {
  no_encontrado: 'Ese seguro ya no está disponible para este inmueble. Recarga la página.',
  ya_existe: 'Ese seguro ya está enlazado a este inmueble.',
  sin_comprobar: 'Ahora no hemos podido comprobar tus seguros. Vuelve a intentarlo en un rato.',
  no_aplica: 'Este inmueble ya no figura sin seguro. Recarga la página.',
  sin_puente: 'Ahora mismo no podemos enviar la petición. Vuelve a intentarlo más tarde.',
  puente_fallido: 'No hemos podido enviar la petición. Inténtalo de nuevo en un rato.',
  demasiadas_peticiones: 'Demasiados cambios seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  modo_corredor: 'En la vista de corredor no se puede cambiar nada.',
}

const RAMO: Record<string, string> = {
  hogar: 'Hogar', comercio: 'Comercio', comunidades: 'Comunidad', comunidad: 'Comunidad', impago_alquiler: 'Impago de alquiler',
  alquiler: 'Alquiler', responsabilidad_civil: 'Responsabilidad civil', decenal: 'Decenal', empresas: 'Empresa',
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

/** Cómo se nombra una póliza aquí: ramo + compañía + bien. 🚨 Nunca el nº de póliza ni la prima. */
function nombrePoliza(p: PolizaPintable): string {
  const partes = [p.ramo ? (RAMO[p.ramo] ?? 'Seguro') : 'Seguro', p.compania, p.ubicacion].filter(Boolean)
  const tipo = p.tipo === 'declarada' ? ' (añadida por ti)' : ''
  return `${partes.join(' · ')}${tipo}`
}

const pctEs = (r: number) => `${Math.round(r * 100)} %`

/** La alerta de infraseguro: dice el hecho y lo que no sabemos; nunca «todo bien» sin dato. */
function textoInfraseguro(d: SegurosDeInmueble): { texto: string; aviso: boolean } | null {
  const a = d.infraseguro
  if (a === null) return null
  const cap = d.capitalContinenteCent === null ? null : eur(d.capitalContinenteCent / 100)
  const val = d.valorEstimadoCent === null ? null : eur(d.valorEstimadoCent / 100)
  // De dónde sale la estimación, para que se vea que no es un dato: m² del Catastro × coste por m² (aún por verificar).
  const e = d.estimacionContinente
  const base = e === null ? '' : `: ${e.superficieM2.toLocaleString('es-ES')} m² del Catastro × ${eur(e.eurPorM2)}/m²`
  switch (a.estado) {
    case 'infraseguro':
      return {
        aviso: true,
        texto: `⚠ Posible infraseguro: el capital asegurado del edificio (${cap}) es el ${pctEs(a.ratio)} de lo que costaría reconstruirlo según nuestra estimación (${val}${base}). Si hay un siniestro, la aseguradora podría pagarte solo la parte proporcional. Es solo una estimación: pídenos que lo revisemos.`,
      }
    case 'ok':
      return { aviso: false, texto: `Capital del edificio asegurado: ${cap}, el ${pctEs(a.ratio)} del valor de reconstrucción estimado (${val}${base}). Es solo una estimación.` }
    case 'sin_dato':
      return {
        aviso: false,
        texto:
          a.motivo === 'sin_valor_estimado'
            ? 'No podemos comprobar si el capital del edificio es suficiente: no tenemos los metros cuadrados del Catastro.'
            : a.motivo === 'sin_capital'
              ? 'No podemos comprobar si el capital del edificio es suficiente: no consta el capital de continente de tu seguro.'
              : 'El edificio suele estar en el seguro de la comunidad: no podemos comprobar si el capital de tu parte es suficiente.',
      }
  }
}

function vigencia(p: PolizaPintable): string {
  if (p.vigente === false) return 'ya no está en vigor'
  if (p.vigente === null) return 'no hemos podido comprobar si sigue en vigor'
  return p.vence ? `en vigor · vence el ${fechaEs(p.vence)}` : 'en vigor'
}

/**
 * «Seguros» de la ficha del inmueble (24/10/2026, spec §2). Tres estados + dos derivados; nunca «no tiene seguro»
 * salvo que el cliente lo haya DICHO. Las propuestas no se escriben solas: «Sí, es este» / «No es este».
 */
export function SegurosInmueble({ datos: d, soloLectura = false }: { datos: SegurosDeInmueble; soloLectura?: boolean }) {
  // Inmueble archivado: se ve, no se toca (sin enlazar, desenlazar ni declarar).
  const datos = soloLectura ? { ...d, puedeEnlazar: false } : d
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useState('')
  const [precio, setPrecio] = useState<null | 'pedido' | 'ya_pedido'>(null)
  const [precioComunidad, setPrecioComunidad] = useState<null | 'pedido' | 'ya_pedido'>(null)

  async function enviar(cuerpo: Record<string, unknown>) {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/inmuebles/${datos.inmuebleId}/seguros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(ERRORES[j.error ?? ''] ?? 'No se ha podido guardar. Inténtalo de nuevo.')
        return
      }
      setElegida('')
      router.refresh()
    } catch {
      setError('No se ha podido guardar. Revisa tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  async function pedirPrecio(tipo?: 'comunidad') {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/inmuebles/${datos.inmuebleId}/pedir-precio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tipo ? { tipo } : {}),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; yaExistia?: boolean }
      if (!res.ok) {
        setError(ERRORES[j.error ?? ''] ?? 'No se ha podido enviar. Inténtalo de nuevo.')
        return
      }
      if (tipo === 'comunidad') setPrecioComunidad(j.yaExistia ? 'ya_pedido' : 'pedido')
      else setPrecio(j.yaExistia ? 'ya_pedido' : 'pedido')
    } catch {
      setError('No se ha podido enviar. Revisa tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  const infra = textoInfraseguro(datos)

  const enlazar = (p: { tipo: string; id: string }, estado: 'confirmado' | 'rechazado', origen?: string) =>
    enviar({ accion: 'enlazar', tipo: p.tipo, polizaId: p.id, estado, origen })

  const boton: React.CSSProperties = { minHeight: 44 }
  const fila: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <p className="aviso-linea" role="status" style={{ margin: 0, overflowWrap: 'anywhere' }}>
        {datos.estado === 'con_seguro' && <>✓ Asegurado.</>}
        {datos.estado === 'enlazado_sin_comprobar' && <>Hay un seguro enlazado, pero ahora no podemos comprobar si sigue en vigor.</>}
        {datos.estado === 'sin_seguro' && (
          <>⚠ Nos dijiste que no tiene seguro{datos.sinSeguroDeclaradoEn ? ` (el ${fechaEs(datos.sinSeguroDeclaradoEn)})` : ''}.</>
        )}
        {datos.estado === 'con_seguro_no_vigente' && <>⚠ El seguro que enlazaste ya no está en vigor.</>}
        {datos.estado === 'sin_mirar' && <>¿Tiene seguro? Revísalo: enlaza el que tenga o dinos que no tiene.</>}
      </p>
      {infra && (
        <p className={infra.aviso ? 'aviso-linea' : 'suave'} role={infra.aviso ? 'status' : undefined} style={{ margin: 0, fontSize: infra.aviso ? undefined : 14, overflowWrap: 'anywhere' }}>
          {infra.texto}
        </p>
      )}
      {datos.puedePedirPrecio && !soloLectura && (
        <div style={{ display: 'grid', gap: 8 }}>
          {precio === null ? (
            <>
              <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                Si quieres, pedimos precio de un seguro para este inmueble. Solo te contactaremos por esta petición que haces tú.
              </p>
              <div style={fila}>
                <button type="button" className="boton" style={boton} disabled={enviando} onClick={() => pedirPrecio()}>
                  Pedir precio
                </button>
              </div>
            </>
          ) : (
            <p role="status" style={{ margin: 0 }}>
              {precio === 'ya_pedido'
                ? 'Ya habías pedido precio para este inmueble: el equipo de Grupo ASegura lo tiene en marcha.'
                : 'Hecho. El equipo de Grupo ASegura ha recibido tu petición y se pondrá en contacto contigo para darte precio.'}
            </p>
          )}
        </div>
      )}
      {datos.enPisoEnEdificio === true && datos.puedeEnlazar && !soloLectura && (
        <label style={{ ...fila, minHeight: 44, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={datos.presidenteComunidad === true}
            disabled={enviando}
            onChange={(e) => enviar({ accion: 'presidente_comunidad', valor: e.target.checked })}
            style={{ width: 20, height: 20 }}
          />
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>Soy el presidente o el administrador de la comunidad de este edificio</span>
        </label>
      )}
      {datos.ofreceComunidad && !soloLectura && (
        <div style={{ display: 'grid', gap: 8 }}>
          {precioComunidad === null ? (
            <>
              <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                Como presidente o administrador, puedes pedirnos precio para el seguro de la comunidad. Solo te contactaremos por esta petición que haces tú.
              </p>
              <div style={fila}>
                <button type="button" className="boton" style={boton} disabled={enviando} onClick={() => pedirPrecio('comunidad')}>
                  Seguro de la comunidad
                </button>
              </div>
            </>
          ) : (
            <p role="status" style={{ margin: 0 }}>
              {precioComunidad === 'ya_pedido'
                ? 'Ya habías pedido precio para el seguro de la comunidad: el equipo de Grupo ASegura lo tiene en marcha.'
                : 'Hecho. El equipo de Grupo ASegura ha recibido tu petición del seguro de la comunidad y se pondrá en contacto contigo.'}
            </p>
          )}
        </div>
      )}
      {datos.estado === 'sin_seguro' && datos.enComunidad === true && (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>
          El edificio suele estar en el seguro de la comunidad: aquí hablamos del contenido y de tu responsabilidad como propietario.
        </p>
      )}
      {datos.sinComprobar && (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>
          Ahora no hemos podido leer todos tus seguros: puede que falte alguno en esta lista.
        </p>
      )}

      {datos.enlaces.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {datos.enlaces.map((e) => (
            <li key={e.id} style={{ ...fila, minWidth: 0 }}>
              <span style={{ flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
                {e.poliza ? <>{nombrePoliza(e.poliza)} — {vigencia(e.poliza)}</> : 'Seguro enlazado por otra persona con acceso'}
              </span>
              {datos.puedeEnlazar && (
                <button type="button" className="boton-tenue" style={boton} disabled={enviando}
                  onClick={() => enviar({ accion: 'quitar', enlaceId: e.id })}>
                  Desenlazar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {datos.puedeEnlazar && datos.propuestas.map((p) => (
        <div key={`${p.tipo}:${p.id}`} className="seccion" style={{ margin: 0, display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
            ¿Este seguro es de <strong>{datos.alias}</strong>? {nombrePoliza(p)}
          </p>
          <div style={fila}>
            <button type="button" className="boton" style={boton} disabled={enviando} onClick={() => enlazar(p, 'confirmado', p.origen)}>
              Sí, es este
            </button>
            <button type="button" className="boton-secundario" style={boton} disabled={enviando} onClick={() => enlazar(p, 'rechazado', p.origen)}>
              No es este
            </button>
          </div>
        </div>
      ))}

      {datos.puedeEnlazar && (
        <div style={{ display: 'grid', gap: 8 }}>
          {datos.enlazables.length > 0 && (
            <form style={fila} onSubmit={(e) => {
              e.preventDefault()
              const p = datos.enlazables.find((x) => `${x.tipo}:${x.id}` === elegida)
              if (p) void enlazar(p, 'confirmado')
            }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, flex: '1 1 240px', minWidth: 0 }}>
                Enlazar un seguro
                <select value={elegida} onChange={(e) => setElegida(e.target.value)} style={{ minHeight: 44, maxWidth: '100%' }}>
                  <option value="">Elige uno de tus seguros…</option>
                  {datos.enlazables.map((p) => (
                    <option key={`${p.tipo}:${p.id}`} value={`${p.tipo}:${p.id}`}>{nombrePoliza(p)}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="boton" style={boton} disabled={enviando || elegida === ''}>Enlazar</button>
            </form>
          )}
          <div style={fila}>
            <Link className="boton-secundario" href="/boveda" style={{ ...boton, display: 'inline-flex', alignItems: 'center' }}>
              Añadir póliza
            </Link>
            {datos.sinSeguroDeclaradoEn !== null ? (
              // Un enlace confirmado gana a la declaración: si sigue escrita, se ofrece quitarla.
              <button type="button" className="boton-tenue" style={boton} disabled={enviando}
                onClick={() => enviar({ accion: 'sin_seguro', valor: false })}>
                {datos.estado === 'sin_seguro' ? 'Sí tiene seguro' : 'Quitar «no tiene seguro»'}
              </button>
            ) : datos.estado !== 'con_seguro' && datos.estado !== 'enlazado_sin_comprobar' ? (
              <button type="button" className="boton-tenue" style={boton} disabled={enviando}
                onClick={() => enviar({ accion: 'sin_seguro', valor: true })}>
                No tiene seguro
              </button>
            ) : null}
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  )
}
