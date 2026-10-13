'use client'

// «Historial y bonificaciones» del riesgo (10/10/2026; 13/10/2026 todo editable). Las bonificaciones las consultan las
// COMPAÑÍAS en SINCO (TIREA) con la compañía anterior + nº de póliza (Codeoscopic pide los 5 últimos); nosotros no
// consultamos SINCO: aquí se CAPTURA bien. Se editan (POST `editar` con `historialDeclarado`, guardado FUERA de
// `seguroAnterior`: lo declarado nunca pasa por leído de una póliza) seguro actual sí/no, compañía, nº de póliza (entero
// si se da), años asegurado / en la compañía / sin siniestros y siniestros en 5 años. El carné, de la ficha del conductor.
// El cotizador auto embebido los enseña en resumen («Editar arriba») y los manda desde aquí.
//
// Tres estados por fila (lógica en `lib/historial-riesgo.ts`): «Sin dato» (borde discontinuo) = no se sabe, nunca un 0;
// 0 = revisado (se pinta el valor); con valor = el dato.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pendiente, btnStyle, cardStyle } from '@/components/ui'
import { historialDeclaradoDe, incoherenciaHistorialDeclarado, ultimosDigitosPoliza, type HistorialDeclaradoRiesgo } from '@central/module-seguros'
import { companiaDeLista, filasHistorial, filtrarCompanias, nombreCompaniaDeclarada, tipoCatalogoCompanias, type OpcionCompania } from '@/lib/historial-riesgo'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'
import { digitosPolizaSospechosos } from '@/lib/poliza-digitos-sospechosos'
import type { Riesgo } from '@/lib/riesgo-asegura'

const INPUT: React.CSSProperties = { minHeight: 44, minWidth: 0, width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }

type Declarado = HistorialDeclaradoRiesgo
/**
 * Lista de compañías de Codeoscopic (catálogo GRATIS de Avant2, la misma que valida el cotizador). `null` = aún no
 * pedida; `error` = no se pudo leer (se teclea a mano, como antes: nunca una lista vacía que parezca «no hay ninguna»).
 */
type CatalogoCompanias = null | { estado: 'cargando' } | { estado: 'ok'; opciones: OpcionCompania[] } | { estado: 'error'; mensaje: string }
const ETIQ: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 600, minWidth: 0 }

/** Texto de un entero (0..max) tecleado: vacío = null (sin dato); otra cosa = 'invalido' (nunca 0). */
function enteroTecleado(t: string, max: number): number | null | 'invalido' {
  const v = t.trim()
  if (v === '') return null
  return /^\d{1,3}$/.test(v) && Number(v) <= max ? Number(v) : 'invalido'
}
const txt = (n: number | null) => (n === null ? '' : String(n))

/**
 * Edición inline del historial DECLARADO (13/10/2026): seguro actual sí/no, compañía, nº de póliza (entero si se da; a
 * Codeoscopic van los 5 últimos), años asegurado / en la compañía / sin siniestros y siniestros en 5 años. Vacío = null
 * (sin dato); 0 = dato. Solo se envían las claves que cambian; la coherencia la mira también el servidor.
 */
function EditorHistorial({ oportunidadId, inicial, leido, catalogo, onCerrar }: {
  oportunidadId: string
  inicial: Declarado
  catalogo: CatalogoCompanias
  /** Lo leído de su póliza, solo como pista (placeholder): no se guarda como declarado si no se teclea. */
  leido: { compania: string | null; numeroPoliza: string | null; aniosSinSiniestros: number | null; siniestrosUltimos5: number | null }
  onCerrar: () => void
}) {
  const router = useRouter()
  const [tiene, setTiene] = useState<'' | 'si' | 'no'>(inicial.tieneSeguroActual === null ? '' : inicial.tieneSeguroActual ? 'si' : 'no')
  const [compania, setCompania] = useState(inicial.companiaActual ?? '')
  const [buscar, setBuscar] = useState('')
  const lista = catalogo?.estado === 'ok' ? catalogo.opciones : null
  // Con la lista, lo guardado se lleva a su CÓDIGO (un nombre viejo que casa sin ambigüedad); si no casa, se queda tal
  // cual y se dice (no se inventa una compañía).
  useEffect(() => {
    if (!lista) return
    setCompania((c) => (c !== '' && c === (inicial.companiaActual ?? '') ? companiaDeLista(lista, c) ?? c : c))
  }, [lista, inicial.companiaActual])
  const companiaFuera = lista !== null && compania !== '' && !lista.some((o) => o.id === compania) ? compania : null
  const [poliza, setPoliza] = useState(inicial.numeroPoliza ?? '')
  const [asegurado, setAsegurado] = useState(txt(inicial.aniosAsegurado))
  const [enCompania, setEnCompania] = useState(txt(inicial.aniosEnCompania))
  const [sinSiniestros, setSinSiniestros] = useState(txt(inicial.aniosSinSiniestros))
  const [siniestros5, setSiniestros5] = useState(txt(inicial.siniestrosUltimos5))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const sinSeguro = tiene === 'no'
  const cinco = ultimosDigitosPoliza(poliza)

  async function guardar() {
    const nums = {
      aniosAsegurado: enteroTecleado(asegurado, 100),
      aniosEnCompania: enteroTecleado(enCompania, 100),
      aniosSinSiniestros: enteroTecleado(sinSiniestros, 100),
      siniestrosUltimos5: enteroTecleado(siniestros5, 50),
    }
    if (Object.values(nums).some((v) => v === 'invalido')) return setError('Años y siniestros: un número entero (años hasta 100, siniestros hasta 50), o vacío si no se sabe.')
    const pol = sinSeguro ? '' : poliza.trim()
    if (pol !== '' && pol.replace(/[^0-9A-Za-z]/g, '').length < 5) return setError('El nº de póliza necesita al menos los 5 últimos caracteres (es lo que piden las compañías para consultar SINCO).')
    const nuevo: Declarado = {
      ...(nums as Record<keyof typeof nums, number | null>),
      tieneSeguroActual: tiene === '' ? null : tiene === 'si',
      companiaActual: sinSeguro || compania.trim() === '' ? null : compania.trim(),
      numeroPoliza: pol === '' ? null : pol,
    }
    const choque = incoherenciaHistorialDeclarado(nuevo)
    if (choque) return setError(choque)
    const historialDeclarado: Partial<Record<keyof Declarado, unknown>> = {}
    for (const k of Object.keys(nuevo) as (keyof Declarado)[]) if (nuevo[k] !== inicial[k]) historialDeclarado[k] = nuevo[k]
    if (Object.keys(historialDeclarado).length === 0) return onCerrar()
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/oportunidad', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'editar', id: oportunidadId, historialDeclarado }) })
      const json = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (!r.ok || json?.estado !== 'ok') return setError(`No se ha guardado: ${json?.motivo ?? `HTTP ${r.status}`}`)
      onCerrar()
      router.refresh()
    } catch {
      setError('No se ha guardado: sin conexión. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const leidoTxt = (v: string | number | null) => (v === null ? 'sin dato' : `leído: ${v}`)
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={REJILLA}>
        <label style={ETIQ}>
          ¿Tiene seguro ahora?
          <select style={INPUT} value={tiene} onChange={(e) => setTiene(e.target.value as '' | 'si' | 'no')}>
            <option value="">Sin dato</option>
            <option value="si">Sí, tiene seguro en vigor</option>
            <option value="no">No tiene seguro ahora</option>
          </select>
        </label>
        <SelectorCompania
          lista={lista}
          catalogo={catalogo}
          valor={sinSeguro ? '' : compania}
          fuera={companiaFuera}
          buscar={buscar}
          onBuscar={setBuscar}
          onElegir={setCompania}
          deshabilitado={sinSeguro}
          pista={sinSeguro ? 'no aplica' : leidoTxt(leido.compania)}
        />
        <label style={ETIQ}>
          Nº de póliza actual
          <input style={INPUT} value={sinSeguro ? '' : poliza} disabled={sinSeguro} onChange={(e) => setPoliza(e.target.value)} placeholder={sinSeguro ? 'no aplica' : leido.numeroPoliza ? `leído: ${leido.numeroPoliza}` : 'completo, o al menos los 5 últimos'} />
          {!sinSeguro && cinco && <span style={{ fontWeight: 400 }}>A Codeoscopic van los 5 últimos: {cinco}</span>}
          {!sinSeguro && digitosPolizaSospechosos(poliza) && (
            <span role="alert" style={{ fontWeight: 600, color: 'var(--negative)' }}>Varios ceros seguidos: puede ser un número de relleno y la compañía no encontrar el historial en SINCO.</span>
          )}
        </label>
        <label style={ETIQ}>
          Años asegurado
          <input style={INPUT} inputMode="numeric" value={asegurado} onChange={(e) => setAsegurado(e.target.value)} placeholder="sin dato" />
        </label>
        <label style={ETIQ}>
          Años en la compañía
          <input style={INPUT} inputMode="numeric" value={enCompania} onChange={(e) => setEnCompania(e.target.value)} placeholder="sin dato" />
        </label>
        <label style={ETIQ}>
          Años sin siniestros
          <input style={INPUT} inputMode="numeric" value={sinSiniestros} onChange={(e) => setSinSiniestros(e.target.value)} placeholder={leidoTxt(leido.aniosSinSiniestros)} />
        </label>
        <label style={ETIQ}>
          Siniestros en los últimos 5 años
          <input style={INPUT} inputMode="numeric" value={siniestros5} onChange={(e) => setSiniestros5(e.target.value)} placeholder={leidoTxt(leido.siniestrosUltimos5)} />
        </label>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Vacío = sin dato (no se sabe). 0 = revisado. Los años sin siniestros y en la compañía no pueden pasar de los años asegurado.
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={guardar} disabled={guardando} style={btnStyle('primario')}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={onCerrar} disabled={guardando} style={btnStyle('secundario')}>Cancelar</button>
      </div>
    </div>
  )
}

/**
 * Compañía actual (13/10/2026, «los campos son siempre los de Avant2»): se ELIGE de la lista de Codeoscopic, con
 * búsqueda, y se guarda su código. Sin lista (no se pudo leer), se teclea a mano como antes y se dice por qué.
 */
function SelectorCompania({ lista, catalogo, valor, fuera, buscar, onBuscar, onElegir, deshabilitado, pista }: {
  lista: OpcionCompania[] | null
  catalogo: CatalogoCompanias
  valor: string
  /** Lo guardado que no está en la lista (texto viejo): se enseña para que se elija la buena. */
  fuera: string | null
  buscar: string
  onBuscar: (t: string) => void
  onElegir: (v: string) => void
  deshabilitado: boolean
  pista: string
}) {
  if (lista === null) {
    const cargando = catalogo === null || catalogo.estado === 'cargando'
    return (
      <label style={ETIQ}>
        Compañía actual
        <input style={INPUT} value={valor} disabled={deshabilitado || cargando} onChange={(e) => onElegir(e.target.value)} placeholder={cargando ? 'cargando la lista de Codeoscopic…' : pista} />
        {!cargando && !deshabilitado && (
          <span role="status" style={{ fontWeight: 400, color: 'var(--warning)' }}>
            No se ha podido leer la lista de compañías de Codeoscopic{catalogo?.estado === 'error' ? ` (${catalogo.mensaje})` : ''}: escribe el código DGS (p. ej. M0083) o el nombre.
          </span>
        )}
      </label>
    )
  }
  const { opciones, total } = filtrarCompanias(lista, buscar)
  // La elegida siempre está en el desplegable, aunque la búsqueda la deje fuera.
  const elegida = lista.find((o) => o.id === valor) ?? null
  const visibles = elegida && !opciones.some((o) => o.id === elegida.id) ? [elegida, ...opciones] : opciones
  return (
    <div style={{ ...ETIQ, alignContent: 'start' }}>
      <label htmlFor="historial-compania" style={{ fontWeight: 600 }}>Compañía actual</label>
      <input
        type="search" aria-label="Buscar compañía" style={INPUT} value={buscar} disabled={deshabilitado}
        onChange={(e) => onBuscar(e.target.value)} placeholder={deshabilitado ? 'no aplica' : `buscar entre ${lista.length} compañías…`}
      />
      <select id="historial-compania" style={INPUT} value={valor} disabled={deshabilitado} onChange={(e) => onElegir(e.target.value)}>
        <option value="">{deshabilitado ? 'no aplica' : 'Sin dato'}</option>
        {fuera && <option value={fuera}>«{fuera}» (tecleada a mano: no está en la lista)</option>}
        {visibles.map((o) => <option key={o.id} value={o.id}>{o.nombre} · {o.id}</option>)}
      </select>
      {!deshabilitado && total > opciones.length && <span style={{ fontWeight: 400 }}>{total - opciones.length} más: escribe para afinar.</span>}
      {!deshabilitado && total === 0 && <span style={{ fontWeight: 400 }}>Ninguna con «{buscar}».</span>}
      {!deshabilitado && fuera && (
        <span role="alert" style={{ fontWeight: 600, color: 'var(--warning)' }}>«{fuera}» no está en la lista de Codeoscopic: elige la compañía de la lista para que viaje a la cotización.</span>
      )}
      {!deshabilitado && !fuera && valor === '' && pista !== 'sin dato' && <span style={{ fontWeight: 400 }}>{pista}</span>}
    </div>
  )
}

const REJILLA: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }

/** `hoy` (aaaa-mm-dd, Madrid) lo calcula el SERVIDOR (page.tsx) y baja por prop: calcularlo aquí daba un desajuste de hidratación. */
export default function HistorialRiesgo({ riesgo, hoy }: { riesgo: Riesgo; hoy: string }) {
  const op = riesgo.oportunidad
  const [editando, setEditando] = useState(false)
  const hd = riesgo.historial?.historialDeclarado ?? null
  const sa = riesgo.historial?.seguroAnterior ?? null
  // La lista de compañías de Codeoscopic (gratis) solo se pide si hace falta: al editar o para nombrar lo guardado.
  const [catalogo, setCatalogo] = useState<CatalogoCompanias>(null)
  const necesitaLista = editando || (hd?.companiaActual ?? null) !== null
  useEffect(() => {
    if (!necesitaLista || catalogo !== null) return
    setCatalogo({ estado: 'cargando' })
    pedirCatalogo({ tipo: tipoCatalogoCompanias(op.ramo) })
      .then((c) => setCatalogo(
        c.estado === 'ok' && c.opciones.length > 0
          ? { estado: 'ok', opciones: c.opciones.map((o) => ({ id: o.id, nombre: o.nombre })) }
          : { estado: 'error', mensaje: c.estado === 'ok' ? 'la lista ha llegado vacía' : c.mensaje },
      ))
      .catch(() => setCatalogo({ estado: 'error', mensaje: 'sin conexión' }))
  }, [necesitaLista, catalogo, op.ramo])
  const lista = catalogo?.estado === 'ok' ? catalogo.opciones : null
  const r = filasHistorial(riesgo.historial, {
    compania: op.aseguradoraActual === true ? op.aseguradora : null, hoy,
    nombreCompania: (v) => nombreCompaniaDeclarada(lista, v),
  })

  return (
    <section id="historial-riesgo" aria-labelledby="historial-riesgo-titulo" style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <div id="historial-riesgo-titulo" style={{ fontSize: 14, fontWeight: 600 }}>
          Historial y bonificaciones <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(las compañías lo comprueban en SINCO con la compañía y el nº de póliza)</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Nosotros no consultamos SINCO: la compañía a la que se pide precio lo hace con la compañía actual y el nº de póliza
          (Codeoscopic manda los 5 últimos). Aquí se declara bien y de aquí va a la cotización. «Sin dato» es que no se sabe, no que sea cero.
        </div>
      </div>

      {r.estado === 'sin_leer' ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          No se ha podido leer el historial de este riesgo ahora. No es que no tenga: recarga la página.
        </p>
      ) : (
        <dl style={{ ...REJILLA, margin: 0 }}>
          {r.filas.map((f) => (
            <div key={f.clave} style={{ display: 'grid', gap: 2, minWidth: 0, alignContent: 'start' }}>
              <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{f.etiqueta}</dt>
              <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                {f.estado === 'pendiente' ? (
                  <Pendiente texto="Sin dato" />
                ) : (
                  <span style={{ fontWeight: 600, color: f.tono === 'aviso' ? 'var(--warning)' : 'var(--text)' }}>{f.texto}</span>
                )}
                {f.nota && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{f.nota}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {r.estado === 'ok' && (editando ? (
        <EditorHistorial
          oportunidadId={op.id}
          inicial={historialDeclaradoDe(hd)}
          catalogo={catalogo}
          leido={{
            compania: op.aseguradoraActual === true ? op.aseguradora : null,
            numeroPoliza: sa?.numeroPoliza ?? null,
            aniosSinSiniestros: sa?.aniosSinSiniestros ?? null,
            siniestrosUltimos5: sa?.siniestrosUltimos5 ?? null,
          }}
          onCerrar={() => setEditando(false)}
        />
      ) : (
        <div>
          <button type="button" onClick={() => setEditando(true)} style={btnStyle('secundario')}>Editar historial (seguro actual, póliza, años y siniestros)</button>
        </div>
      ))}
    </section>
  )
}
