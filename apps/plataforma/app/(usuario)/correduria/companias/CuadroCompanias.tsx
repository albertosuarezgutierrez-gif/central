'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { BarChart3, ChevronRight, ClipboardList, Copy, Printer } from 'lucide-react'
import { etiquetaRamo, semaforoSiniestralidad, variacionPct, type CuadroCompaniaAnio, type FilaRamoCuadro, type SemaforoSiniestralidad } from '@central/module-seguros'
import { Badge, TablaScroll, btnStyle, type Tono } from '@/components/ui'
import type { RespuestaAcuerdos, RespuestaProductividad } from '@/lib/acuerdos-asegura'
import { semaforoObjetivo } from '@/lib/acuerdos-asegura'
import { eur } from '@/lib/dinero'
import {
  aniosSelector, enteroONada, eurONada, filasResumen, ordenarResumen, pctONada, siniestralidadMaxima,
  textoSiniestralidad, textoVariacion, type ColumnaResumen, type FilaResumen, type LibroCompania, type RespuestaCuadro,
} from '@/lib/cuadro-companias'
import { textoCompetitividad, type RespuestaCompetitividad } from '@/lib/competitividad-companias'
import { textoReunion } from '@/lib/preparar-reunion'

/**
 * Cuadro de mando por compañía y AÑO NATURAL (07/11/2026): lo que Alberto lleva a las reuniones con las
 * compañías. Tabla resumen ordenable + detalle por compañía en cuatro bloques (cartera, producción,
 * siniestralidad informativa, comisión). Todo el cálculo vive en `@central/module-seguros`
 * (`cuadro-compania.ts`) y en `lib/cuadro-companias.ts`; aquí solo se pinta.
 *
 * Rentabilidad = COMISIÓN. La siniestralidad es información para la compañía: no resta a nada.
 * null ≠ 0: «—» = no consta; «sin importes de la compañía» no es 0 %. Responsive: tabla con scroll
 * horizontal y detalle en rejilla que se apila; botones ≥ 44 px.
 */
const gris = { color: 'var(--muted)' } as const

type Datos = {
  anio: number
  cuadro: RespuestaCuadro
  libro: Record<string, LibroCompania> | null
  libroAnterior: Record<string, LibroCompania> | null
}
type Carga = { datos: Datos | null; cargando: boolean; error: string | null }

/** Pide el cuadro del año. Mientras recarga, CONSERVA los datos anteriores (no desmonta la tabla). */
function useCuadro(anio: number | null): Carga {
  const [estado, setEstado] = useState<Carga>({ datos: null, cargando: true, error: null })
  useEffect(() => {
    const ac = new AbortController()
    setEstado((s) => ({ ...s, cargando: true, error: null }))
    fetch(`/api/correduria/companias/cuadro${anio === null ? '' : `?anio=${anio}`}`, { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'sin permiso' : `HTTP ${r.status}`)
        const j = (await r.json()) as Datos
        setEstado({ datos: j, cargando: false, error: null })
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setEstado((s) => ({ ...s, cargando: false, error: e instanceof Error ? e.message : 'red' }))
      })
    return () => ac.abort()
  }, [anio])
  return estado
}

type CargaCompetitividad = { respuesta: RespuestaCompetitividad | null; cargando: boolean }

/** Competitividad de precio del año. Va APARTE del cuadro: si falla, el cuadro se pinta igual y el bloque lo dice. */
function useCompetitividad(anio: number | null): CargaCompetitividad {
  const [estado, setEstado] = useState<CargaCompetitividad>({ respuesta: null, cargando: true })
  useEffect(() => {
    const ac = new AbortController()
    setEstado((s) => ({ ...s, cargando: true }))
    fetch(`/api/correduria/companias/competitividad${anio === null ? '' : `?anio=${anio}`}`, { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'sin_permiso' : `HTTP ${r.status}`)
        const j = (await r.json()) as { competitividad: RespuestaCompetitividad }
        setEstado({ respuesta: j.competitividad, cargando: false })
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setEstado({ respuesta: { estado: 'error', motivo: e instanceof Error ? e.message : 'red' }, cargando: false })
      })
    return () => ac.abort()
  }, [anio])
  return estado
}

const hoyLocal = () => new Date().toLocaleDateString('en-CA')

function SelectorAnio({ anio, cambiar, cargando }: { anio: number; cambiar: (a: number) => void; cargando: boolean }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={gris}>Año</span>
      <select
        value={anio}
        onChange={(e) => cambiar(Number(e.target.value))}
        style={{ minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'inherit', font: 'inherit' }}
      >
        {aniosSelector(hoyLocal()).map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      {cargando && <span style={{ fontSize: 12, ...gris }}>Cargando…</span>}
    </label>
  )
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Dato({ etiqueta, valor, sub, title }: { etiqueta: string; valor: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div title={title} style={{ display: 'grid', gap: 2, minWidth: 0, alignContent: 'start' }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, ...gris }}>{etiqueta}</span>
      <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{valor}</span>
      {sub && <span style={{ fontSize: 11, ...gris }}>{sub}</span>}
    </div>
  )
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-quicksand, inherit)' }}>{titulo}</h4>
      {nota && <p style={{ margin: 0, fontSize: 11, ...gris }}>{nota}</p>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>{children}</div>
    </section>
  )
}

/** «+12 % vs 2030» o nada si no hay base. */
function vs(actual: number | null | undefined, anterior: number | null | undefined, anio: number): string | null {
  const t = textoVariacion(variacionPct(actual, anterior))
  return t === null ? null : `${t} vs ${anio - 1}`
}

function porRamo(filas: FilaRamoCuadro[], conPrima = true): string {
  if (filas.length === 0) return 'ninguna'
  return filas.map((f) => `${etiquetaRamo(f.ramo)} ${f.polizas}${conPrima && f.prima !== null ? ` (${eurONada(f.prima)})` : ''}`).join(' · ')
}

const TONO_SEMAFORO: Record<SemaforoSiniestralidad, { tono: Tono; texto: string }> = {
  sin_dato: { tono: 'neutral', texto: 'Sin dato para comparar' },
  cumple: { tono: 'positivo', texto: 'Dentro del tope' },
  justo: { tono: 'aviso', texto: 'Justo en el tope' },
  supera: { tono: 'negativo', texto: 'Supera el tope' },
}

// ─── Detalle de UNA compañía ─────────────────────────────────────────────────

export function DetalleCuadro({ codigo, datos, acuerdos, productividad, pactado, competitividad }: {
  codigo: string
  datos: Datos
  /** Competitividad de precio del año (`null` = aún no cargada). */
  competitividad?: RespuestaCompetitividad | null
  acuerdos: RespuestaAcuerdos | null
  productividad: RespuestaProductividad | null
  /** % firmado frente al real (el `ComisionReal` de la ficha). Sin él, enlaza a la ficha. */
  pactado?: ReactNode
}) {
  if (datos.cuadro.estado !== 'ok') return null
  const { cuadro } = datos.cuadro
  const anio = cuadro.anio
  const c: CuadroCompaniaAnio | undefined = cuadro.companias.find((x) => x.companiaCodigoDgs === codigo)
  const a: CuadroCompaniaAnio | undefined = cuadro.anterior.find((x) => x.companiaCodigoDgs === codigo)
  if (!c) {
    return <p style={{ margin: 0, fontSize: 12, ...gris }}>Esta compañía no tiene pólizas, siniestros ni recibos en {anio}.{a ? ` En ${anio - 1} sí: ${a.cartera.polizas} pólizas.` : ''}</p>
  }
  const sin = textoSiniestralidad(c.siniestros)
  const tope = siniestralidadMaxima(acuerdos, codigo, anio)
  const sem = tope === null ? null : semaforoSiniestralidad(c.siniestros.ratioPct, tope)
  const libro = datos.libro === null ? null : datos.libro[codigo] ?? undefined
  const objetivosAcuerdo = acuerdos?.estado === 'ok' ? acuerdos.acuerdos.filter((x) => x.companiaCodigoDgs === codigo).flatMap((x) => x.objetivos) : null
  const evaluados = productividad?.estado === 'ok' ? productividad.objetivos.filter((o) => o.companiaCodigoDgs === codigo) : null

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {(cuadro.truncado || cuadro.produccionTruncada) && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--warning)' }}>La lectura llegó a su techo: las cifras son un mínimo, no el total.</p>
      )}

      <Seccion
        titulo="Cartera"
        nota={c.cartera.reconstruida
          ? `A 31/12/${anio}, RECONSTRUIDA (efecto inicial y fecha de baja): CIMA no guarda la foto de un año cerrado.`
          : `En vigor a ${c.cartera.fecha.slice(8, 10)}/${c.cartera.fecha.slice(5, 7)}/${c.cartera.fecha.slice(0, 4)}.`}
      >
        <Dato etiqueta="Pólizas" valor={enteroONada(c.cartera.polizas)} sub={vs(c.cartera.polizas, a?.cartera.polizas, anio)} />
        <Dato
          etiqueta="Prima"
          valor={eurONada(c.cartera.prima)}
          sub={[c.cartera.sinPrima > 0 ? `${c.cartera.sinPrima} sin prima (total incompleto)` : null, vs(c.cartera.prima, a?.cartera.prima, anio)].filter(Boolean).join(' · ') || undefined}
        />
        <Dato etiqueta="Por ramo" valor={<span style={{ fontSize: 12, fontWeight: 500 }}>{porRamo(c.cartera.porRamo)}</span>} />
      </Seccion>

      <Seccion titulo="Producción" nota="Nuevas = efecto inicial en el año. Baja = póliza cancelada con fecha. CIMA no manda el motivo de la baja.">
        <Dato
          etiqueta="Nuevas pólizas"
          valor={enteroONada(c.produccion.nuevas.polizas)}
          sub={[`Prima ${eurONada(c.produccion.nuevas.prima)}${c.produccion.nuevas.sinPrima > 0 ? ` (${c.produccion.nuevas.sinPrima} sin prima)` : ''}`, vs(c.produccion.nuevas.polizas, a?.produccion.nuevas.polizas, anio)].filter(Boolean).join(' · ')}
        />
        <Dato
          etiqueta="Bajas"
          valor={enteroONada(c.produccion.bajas.polizas)}
          sub={[c.produccion.bajasSinFecha > 0 ? `${c.produccion.bajasSinFecha} canceladas sin fecha, fuera de todo año` : null, vs(c.produccion.bajas.polizas, a?.produccion.bajas.polizas, anio)].filter(Boolean).join(' · ') || 'sin motivo de baja en CIMA'}
        />
        <Dato
          etiqueta="Retención"
          valor={pctONada(c.produccion.retencionPct)}
          sub={c.produccion.retencionPct === null ? 'sin pólizas a 1 de enero' : `${c.produccion.bajasDeBase} bajas de ${c.produccion.baseInicio} pólizas de enero`}
          title="1 − bajas del año de las pólizas que ya existían el 1 de enero / esas pólizas"
        />
        <Dato etiqueta="Nuevas por ramo" valor={<span style={{ fontSize: 12, fontWeight: 500 }}>{porRamo(c.produccion.nuevas.porRamo, false)}</span>} />
      </Seccion>

      <Seccion titulo="Siniestralidad (informativa)" nota="Es lo que piden las compañías; a ti no te resta comisión. Incurrido = indemnización + reserva; las asistencias (grupo 11) van aparte.">
        <Dato
          etiqueta="Siniestros"
          valor={enteroONada(c.siniestros.n)}
          sub={[c.siniestros.asistencias > 0 ? `+${c.siniestros.asistencias} asistencia${c.siniestros.asistencias === 1 ? '' : 's'} aparte` : null, vs(c.siniestros.n, a?.siniestros.n, anio)].filter(Boolean).join(' · ') || undefined}
        />
        <Dato etiqueta="Incurrido" valor={eurONada(c.siniestros.incurrido)} sub={sin.cobertura ?? undefined} />
        <Dato etiqueta="Sobre prima neta cobrada" valor={<span style={{ fontSize: c.siniestros.ratioPct === null ? 13 : 16 }}>{sin.titular}</span>} sub={a?.siniestros.ratioPct != null ? `${pctONada(a.siniestros.ratioPct)} en ${anio - 1}` : undefined} />
        {tope !== null && sem !== null && (
          <Dato
            etiqueta="Condición del acuerdo"
            valor={<Badge tono={TONO_SEMAFORO[sem].tono}>{TONO_SEMAFORO[sem].texto}</Badge>}
            sub={`Máximo ${pctONada(tope, 0)}${c.siniestros.estado === 'parcial' || c.siniestros.muestraPequena ? ' · orientativo' : ''}`}
          />
        )}
        {sin.aviso && <p style={{ margin: 0, fontSize: 12, color: 'var(--warning)', gridColumn: '1 / -1' }}>{sin.aviso}</p>}
      </Seccion>

      <Seccion
        titulo="Competitividad de precio"
        nota="Tarificaciones guardadas (Avant2 y bots): solo se compara el mismo riesgo, el mismo nivel de cobertura y en pocos días. Sin precios incoherentes ni «no contratable»."
      >
        <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6, minWidth: 0 }}>
          <BloqueCompetitividad r={competitividad ?? null} codigo={codigo} />
        </div>
      </Seccion>

      <Seccion titulo="Comisión (tu rentabilidad)" nota="Devengada = comisión de los recibos cobrados con efecto en el año (CIMA). Liquidada y cobrada vienen del libro de comisiones.">
        <Dato
          etiqueta="Devengada"
          valor={eurONada(c.comision.devengada)}
          sub={[c.comision.recibos > 0 ? `${c.comision.recibos} recibos` : 'sin recibos cobrados', c.comision.ilegibles > 0 ? `${c.comision.ilegibles} ilegibles` : null, vs(c.comision.devengada, a?.comision.devengada, anio)].filter(Boolean).join(' · ')}
        />
        <Dato etiqueta="% real" valor={pctONada(c.comision.pctReal, 2)} sub={c.comision.pctReal === null ? 'sin base o con importes ilegibles' : `sobre ${eurONada(c.comision.primaNetaCobrada)} de prima neta`} />
        <Dato etiqueta="Media por póliza" valor={eurONada(c.comision.mediaPorPoliza)} sub="devengada / pólizas en cartera" />
        <Dato
          etiqueta="Liquidada"
          valor={datos.libro === null ? 'no se ha podido leer' : eurONada(libro?.liquidado)}
          sub={libro === undefined ? 'sin periodos en el libro' : libro === null ? undefined : libro.completo ? 'libro completo' : `${libro.periodosSinLiquidar} de ${libro.periodos} periodos sin liquidar${libro.noLeidos > 0 ? ` · ${libro.noLeidos} no leídos` : ''}`}
        />
        <Dato
          etiqueta="Cobrada en banco"
          valor={datos.libro === null ? 'no se ha podido leer' : eurONada(libro?.cobrado)}
          sub={libro === undefined || libro === null ? undefined : `${libro.periodosSinBanco} de ${libro.periodos} periodos sin abono casado`}
        />
      </Seccion>

      <Seccion titulo="% firmado frente al real">
        <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
          {pactado ?? (
            <Link href={`/correduria/companias/${encodeURIComponent(codigo)}`} style={{ ...btnStyle('secundario', 'md'), textDecoration: 'none' }}>
              Ver el % firmado frente al real en la ficha →
            </Link>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Objetivos y rappel del acuerdo">
        <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6, minWidth: 0 }}>
          {objetivosAcuerdo === null ? (
            <span style={{ fontSize: 12, ...gris }}>Acuerdos: no se han podido comprobar. No significa que no haya.</span>
          ) : objetivosAcuerdo.length === 0 ? (
            <span style={{ fontSize: 12, ...gris }}>
              Sin objetivos cargados. <Link href={`/correduria/companias/${encodeURIComponent(codigo)}`}>Cárgalos en la ficha de la compañía</Link> para ver el avance.
            </span>
          ) : evaluados === null ? (
            <span style={{ fontSize: 12, ...gris }}>{objetivosAcuerdo.length} objetivo(s) cargados, pero su avance no se ha podido leer.</span>
          ) : (
            <>
              {productividad?.estado === 'ok' && productividad.anio !== anio && (
                <span style={{ fontSize: 11, ...gris }}>El avance de los objetivos es el del {productividad.anio}, no el del año elegido.</span>
              )}
              {evaluados.map((o) => {
                const s = semaforoObjetivo(o.estado)
                const e = o.estado
                return (
                  <div key={o.objetivoId} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline', fontSize: 13 }}>
                    <Badge tono={s.tono}>{s.punto} {s.texto}</Badge>
                    {e.color !== 'pendiente' && (
                      <span style={{ fontSize: 12, ...gris }}>
                        {e.medido.toLocaleString('es-ES')} de {e.umbral.toLocaleString('es-ES')}
                        {e.falta !== null && ` · faltan ${e.falta.toLocaleString('es-ES')} al siguiente tramo`}
                        {e.rappelEstimado !== null && ` · rappel estimado ${eur(e.rappelEstimado)}`}
                      </span>
                    )}
                  </div>
                )
              })}
              {evaluados.length === 0 && <span style={{ fontSize: 12, ...gris }}>Hay objetivos cargados pero ninguno evaluado todavía.</span>}
            </>
          )}
        </div>
      </Seccion>
    </div>
  )
}

// ─── Competitividad de precio ────────────────────────────────────────────────

function BloqueCompetitividad({ r, codigo }: { r: RespuestaCompetitividad | null; codigo: string }) {
  if (r === null) return <span style={{ fontSize: 12, ...gris }}>Cargando…</span>
  if (r.estado === 'sin_configurar') return <span style={{ fontSize: 12, ...gris }}>Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto.</span>
  if (r.estado === 'error') return <span style={{ fontSize: 12, ...gris }}>No se ha podido calcular ({r.motivo}). No significa que no haya datos.</span>
  const c = r.competitividad
  const t = textoCompetitividad(c, codigo)
  const base = `${c.tarificaciones.avant2} de Avant2 y ${c.tarificaciones.bot} de bots leídas`
  const descartes = [
    c.excluidas.incoherentes > 0 ? `${c.excluidas.incoherentes} precios incoherentes` : null,
    c.excluidas.fueraDeRango > 0 ? `${c.excluidas.fueraDeRango} fuera de rango` : null,
    c.excluidas.sinPrima > 0 ? `${c.excluidas.sinPrima} sin prima` : null,
    c.descartadas.sinNivel > 0 ? `${c.descartadas.sinNivel} sin nivel de cobertura` : null,
  ].filter(Boolean).join(', ')
  return (
    <>
      {t.tipo === 'sin_datos' ? (
        <span style={{ fontSize: 13 }}>Sin datos: {t.texto}</span>
      ) : (
        <>
          {t.frases.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13, overflowWrap: 'anywhere' }}>
              {t.frases.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          {t.sinPrecio.length > 0 && (
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, ...gris }}>Sin precio / rechazos del riesgo (Avant2)</span>
              {t.sinPrecio.map((f) => <span key={f} style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{f}</span>)}
            </div>
          )}
        </>
      )}
      <span style={{ fontSize: 11, ...gris }}>
        Fuente: {base}{descartes ? ` · descartados: ${descartes}` : ''}. Los bots solo cubren algunas compañías y los rechazos solo constan en Avant2.
        {c.truncado ? ' La lectura llegó a su techo: son un mínimo.' : ''}
      </span>
    </>
  )
}

const escapaHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Botón «Preparar reunión»: el resumen de una pantalla, en texto plano, para copiar o imprimir. */
function PrepararReunion({ codigo, nombre, datos, acuerdos, competitividad }: {
  codigo: string
  nombre: string
  datos: Datos
  acuerdos: RespuestaAcuerdos | null
  competitividad: RespuestaCompetitividad | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)
  const texto = useMemo(() => {
    if (datos.cuadro.estado !== 'ok') return null
    const { cuadro } = datos.cuadro
    return textoReunion({
      codigo, nombre, anio: cuadro.anio,
      actual: cuadro.companias.find((x) => x.companiaCodigoDgs === codigo),
      anterior: cuadro.anterior.find((x) => x.companiaCodigoDgs === codigo),
      libro: datos.libro === null ? null : datos.libro[codigo] ?? undefined,
      competitividad,
      topeSiniestralidad: siniestralidadMaxima(acuerdos, codigo, cuadro.anio),
    })
  }, [codigo, nombre, datos, acuerdos, competitividad])
  if (texto === null) return null

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado('si')
    } catch {
      setCopiado('no')
    }
  }
  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Reunión con ${escapaHtml(nombre)}</title><body style="margin:24px;font:13px/1.45 system-ui,sans-serif"><pre style="white-space:pre-wrap;font:inherit">${escapaHtml(texto)}</pre></body>`)
    w.document.close()
    w.focus()
    w.print()
  }
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <button type="button" onClick={() => { setAbierto((a) => !a); setCopiado(null) }} aria-expanded={abierto} style={{ ...btnStyle(abierto ? 'secundario' : 'primario', 'md'), justifySelf: 'start' }}>
        <ClipboardList size={15} aria-hidden /> {abierto ? 'Cerrar el resumen' : 'Preparar reunión'}
      </button>
      {abierto && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface)' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit', fontSize: 12, lineHeight: 1.5 }}>{texto}</pre>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={copiar} style={btnStyle('secundario', 'md')}><Copy size={15} aria-hidden /> Copiar texto</button>
            <button type="button" onClick={imprimir} style={btnStyle('secundario', 'md')}><Printer size={15} aria-hidden /> Imprimir</button>
            {copiado === 'si' && <span role="status" style={{ fontSize: 12, color: 'var(--positive)' }}>Copiado</span>}
            {copiado === 'no' && <span role="status" style={{ fontSize: 12, color: 'var(--warning)' }}>No se ha podido copiar: selecciona el texto a mano</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tabla resumen de todas las compañías ────────────────────────────────────

const COLUMNAS: Array<{ clave: ColumnaResumen; titulo: string; derecha: boolean }> = [
  { clave: 'nombre', titulo: 'Compañía', derecha: false },
  { clave: 'polizas', titulo: 'Pólizas', derecha: true },
  { clave: 'prima', titulo: 'Prima', derecha: true },
  { clave: 'nuevas', titulo: 'Nuevas', derecha: true },
  { clave: 'bajas', titulo: 'Bajas', derecha: true },
  { clave: 'siniestros', titulo: 'Siniestros', derecha: true },
  { clave: 'comision', titulo: 'Comisión', derecha: true },
]

function Celda({ f, col, anio }: { f: FilaResumen; col: Exclude<ColumnaResumen, 'nombre'>; anio: number }) {
  const v = f[col]
  const t = vs(v, f.anterior?.[col], anio)
  return (
    <td style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      <div>{col === 'prima' || col === 'comision' ? eurONada(v) : enteroONada(v)}</div>
      {t && <div style={{ fontSize: 11, ...gris }}>{t}</div>}
    </td>
  )
}

export default function CuadroCompanias({ nombres, acuerdos, productividad }: {
  nombres: ReadonlyMap<string, string>
  acuerdos: RespuestaAcuerdos | null
  productividad: RespuestaProductividad | null
}) {
  const [anio, setAnio] = useState<number | null>(null)
  const { datos, cargando, error } = useCuadro(anio)
  const { respuesta: competitividad } = useCompetitividad(anio)
  const [orden, setOrden] = useState<{ col: ColumnaResumen; desc: boolean }>({ col: 'polizas', desc: true })
  const [abierta, setAbierta] = useState<string | null>(null)

  const anioMostrado = datos?.cuadro.estado === 'ok' ? datos.cuadro.cuadro.anio : datos?.anio ?? anio ?? Number(hoyLocal().slice(0, 4))
  const filas = useMemo(
    () => (datos?.cuadro.estado === 'ok' ? ordenarResumen(filasResumen(datos.cuadro.cuadro, nombres), orden.col, orden.desc) : []),
    [datos, nombres, orden],
  )

  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-quicksand, inherit)' }}>
          <BarChart3 size={15} strokeWidth={1.75} aria-hidden /> Cuadro de mando por compañía
        </h3>
        <SelectorAnio anio={anioMostrado} cambiar={setAnio} cargando={cargando} />
      </div>
      <p style={{ margin: 0, fontSize: 12, maxWidth: '78ch', ...gris }}>
        Año natural {anioMostrado}, con la variación frente a {anioMostrado - 1}. Rentabilidad = comisión; la siniestralidad es informativa.
        «—» = no consta. Toca una compañía para ver el detalle de cada reunión.
      </p>

      {error && datos === null && <p style={{ margin: 0, fontSize: 12, ...gris }}>No se ha podido cargar el cuadro ({error}). No significa que esté vacío.</p>}
      {error && datos !== null && <p style={{ margin: 0, fontSize: 12, color: 'var(--warning)' }}>No se ha podido actualizar ({error}); se muestran los datos anteriores.</p>}
      {datos?.cuadro.estado === 'sin_configurar' && <p style={{ margin: 0, fontSize: 12, ...gris }}>Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto.</p>}
      {datos?.cuadro.estado === 'error' && <p style={{ margin: 0, fontSize: 12, ...gris }}>No se ha podido calcular el cuadro ({datos.cuadro.motivo}). No significa que no haya datos.</p>}

      {datos?.cuadro.estado === 'ok' && (
        <>
          {filas.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, ...gris }}>Ninguna compañía tiene pólizas, siniestros ni recibos en {anioMostrado} ni en {anioMostrado - 1}.</p>
          ) : (
            <TablaScroll>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, opacity: cargando ? 0.6 : 1 }}>
                <thead>
                  <tr>
                    {COLUMNAS.map((c) => (
                      <th key={c.clave} aria-sort={orden.col === c.clave ? (orden.desc ? 'descending' : 'ascending') : 'none'} style={{ padding: 0, textAlign: c.derecha ? 'right' : 'left' }}>
                        <button
                          type="button"
                          onClick={() => setOrden((o) => ({ col: c.clave, desc: o.col === c.clave ? !o.desc : c.clave !== 'nombre' }))}
                          style={{ minHeight: 44, width: '100%', padding: '0 10px', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)', textAlign: c.derecha ? 'right' : 'left' }}
                        >
                          {c.titulo}{orden.col === c.clave ? (orden.desc ? ' ↓' : ' ↑') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <FilaTabla key={f.codigo} f={f} anio={anioMostrado} abierta={abierta === f.codigo} alternar={() => setAbierta((x) => (x === f.codigo ? null : f.codigo))}>
                      {abierta === f.codigo && <DetalleCuadro codigo={f.codigo} datos={datos} acuerdos={acuerdos} productividad={productividad} competitividad={competitividad} />}
                    </FilaTabla>
                  ))}
                </tbody>
              </table>
            </TablaScroll>
          )}
          {(datos.cuadro.cuadro.polizasSinCompania > 0 || datos.cuadro.cuadro.siniestrosSinCompania > 0) && (
            <p style={{ margin: 0, fontSize: 11, ...gris }}>
              Sin código de compañía, no asignables: {datos.cuadro.cuadro.polizasSinCompania} pólizas y {datos.cuadro.cuadro.siniestrosSinCompania} siniestros.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function FilaTabla({ f, anio, abierta, alternar, children }: { f: FilaResumen; anio: number; abierta: boolean; alternar: () => void; children: ReactNode }) {
  return (
    <>
      <tr style={abierta ? { background: 'var(--primary-light)' } : undefined}>
        <td style={{ borderTop: '1px solid var(--border)', padding: 0, verticalAlign: 'top' }}>
          <button
            type="button"
            onClick={alternar}
            aria-expanded={abierta}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, width: '100%', padding: '8px 10px', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', fontWeight: 700 }}
          >
            <ChevronRight size={14} aria-hidden style={{ flex: '0 0 auto', transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
            <span style={{ overflowWrap: 'anywhere' }}>{f.nombre}</span>
          </button>
        </td>
        {COLUMNAS.slice(1).map((c) => <Celda key={c.clave} f={f} col={c.clave as Exclude<ColumnaResumen, 'nombre'>} anio={anio} />)}
      </tr>
      {abierta && (
        <tr>
          <td colSpan={COLUMNAS.length} style={{ padding: '4px 12px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0, maxWidth: 'calc(100vw - 64px)' }}>
              {children}
              <Link href={`/correduria/companias/${encodeURIComponent(f.codigo)}`} style={{ ...btnStyle('secundario', 'md'), textDecoration: 'none', marginTop: 10 }}>
                Ficha completa →
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Para la ficha de UNA compañía ───────────────────────────────────────────

export function CuadroFicha({ codigo, nombre, acuerdos, productividad, pactado }: {
  codigo: string
  nombre: string
  acuerdos: RespuestaAcuerdos
  productividad: RespuestaProductividad
  pactado: ReactNode
}) {
  const [anio, setAnio] = useState<number | null>(null)
  const { datos, cargando, error } = useCuadro(anio)
  const { respuesta: competitividad } = useCompetitividad(anio)
  const mostrado = datos?.cuadro.estado === 'ok' ? datos.cuadro.cuadro.anio : datos?.anio ?? anio ?? Number(hoyLocal().slice(0, 4))
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <SelectorAnio anio={mostrado} cambiar={setAnio} cargando={cargando} />
      {datos?.cuadro.estado === 'ok' && <PrepararReunion codigo={codigo} nombre={nombre} datos={datos} acuerdos={acuerdos} competitividad={competitividad} />}
      {error && <p style={{ margin: 0, fontSize: 12, ...gris }}>No se ha podido cargar el cuadro ({error}). No significa que esté vacío.</p>}
      {datos?.cuadro.estado === 'sin_configurar' && <p style={{ margin: 0, fontSize: 12, ...gris }}>Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto.</p>}
      {datos?.cuadro.estado === 'error' && <p style={{ margin: 0, fontSize: 12, ...gris }}>No se ha podido calcular el cuadro ({datos.cuadro.motivo}). No significa que no haya datos.</p>}
      {datos?.cuadro.estado === 'ok' && (
        <div style={{ opacity: cargando ? 0.6 : 1 }}>
          <DetalleCuadro codigo={codigo} datos={datos} acuerdos={acuerdos} productividad={productividad} pactado={pactado} competitividad={competitividad} />
        </div>
      )}
    </div>
  )
}
