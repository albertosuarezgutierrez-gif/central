'use client'
import { useState, useEffect, useCallback } from 'react'
import { describirCausaAsegura } from '@/lib/correduria-puerto'
import { Shield, CalendarClock, Landmark, FolderOpen, Plus, House } from 'lucide-react'
import { Pagina, PageHeader, BtnLink, Badge } from '@/components/ui'
import { companiaLabel, COMPANIA_OTRAS, COMPANIAS_CONOCIDAS } from '@/lib/correduria'
import { eur } from '@/lib/dinero'
import CuadreComisiones from './CuadreComisiones'
import BuscadorCartera from './BuscadorCartera'
import Retencion from './Retencion'
import Duplicadas from './Duplicadas'
import SinCanal from './SinCanal'
import PartesPortal from './PartesPortal'
import Bloque from './Bloque'
import Renovaciones, { type RespVencimientos } from './Renovaciones'
import Secciones, { type ContadoresSeccion } from './Secciones'
import { MOTIVOS, type MotivoError } from './estado-puerto'
import {
  agregarContadores, contarAccionables, seccionDeParametro, type Seccion,
} from './secciones'

/**
 * La pantalla de la correduría.
 *
 * ─── Rediseño del 03/09/2026: de una tira de ocho bloques a cuatro secciones ─
 * Antes era un scroll único con ocho bloques del MISMO peso visual: los partes
 * que ha abierto un cliente y nadie ha mirado pesaban igual que la matriz de
 * comisiones cobradas de hace tres años, y cada uno pintaba su propia caja con
 * borde y radio, así que ninguno decía «mírame a mí primero». Lo que hace
 * productiva una pantalla no es enseñar más: es que lo primero que se ve sea lo
 * único que hay que hacer.
 *
 * Ahora: el buscador arriba (lo más usado), y cuatro secciones —Hoy · Cartera ·
 * Comisiones · Datos— con CONTADOR en la barra, que es lo que impide que una
 * pestaña esconda trabajo. Ver `secciones.ts` para el reparto y `Bloque.tsx`
 * para por qué un bloque ya no es una caja.
 *
 * ─── Qué NO cambia, y por qué ───────────────────────────────────────────────
 * · Todos los bloques se MONTAN siempre, aunque su sección esté oculta: así
 *   piden sus datos y reportan su contador, que es de donde salen los badges.
 *   Es la misma red que hoy (los mismos fetch en paralelo al abrir), no una
 *   carga extra. Lo que se oculta es el DOM, no la lectura.
 * · El buscador y las colas de trabajo son HERMANOS de la cartera, nunca hijos:
 *   `CarteraResumen` hace `return` temprano cuando el puerto falla, y anidado
 *   ahí dentro desaparecerían justo el día que asegura no responde.
 * · La matriz compañía×mes NO se borra: su modal de desglose es el ÚNICO camino
 *   para reclasificar un movimiento y para que aprendan `correduria_reglas` y
 *   `banca_destino_reglas`.
 * · Esta pantalla no compone ninguna URL de asegura (desde el 03/09/2026):
 *   retarificar —lo que gasta 0,50€— tiene su propia pantalla DENTRO de
 *   plataforma, con su confirmación delante.
 */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function mesKey(año: number, mesIdx: number) {
  return `${año}-${String(mesIdx + 1).padStart(2, '0')}`
}

// Fecha siempre en formato español día/mes/año: "2026-06-03" → "03/06/2026".
function fmtFecha(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

// Destinos a los que se puede mover un movimiento que NO es de seguros.
const DESTINOS_RECLASIF: { v: string; label: string }[] = [
  { v: 'personal', label: 'Personal' },
  { v: 'turistico_pisos', label: 'Pisos turísticos' },
  { v: 'turistico_duplex', label: 'Dúplex' },
  { v: 'traspaso_interno', label: 'Traspaso interno' },
]

interface Fila {
  compania: string
  meses: Record<string, number>
  total: number
}

interface MovDetalle {
  id: string
  fecha: string
  concepto: string
  contraparte: string
  banco: string
  importe: number
  confirmado: boolean
  compania: string
  companiaManual: boolean
  motivo: 'nombre' | 'descarte'
}

interface ModalInfo {
  titulo: string
  compania: string
  mes?: string
}

type Cartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo?: MotivoError; causa?: string }
  | {
      estado: 'ok'; nombre: string | null; clientes: number; leads: number
      polizasVigentes: number; polizasPendientesFecha: number; polizasNoVigentes: number
      siniestrosAbiertos: number
      // null = el puerto no informa vencimientos todavía. «—», nunca 0.
      vence30?: number | null; vence60?: number | null
    }

const num = (n: number) => n.toLocaleString('es-ES')

export default function CorreduriaClient() {
  const añoActual = new Date().getFullYear()
  const [año, setAño] = useState(añoActual)
  const [seccion, setSeccion] = useState<Seccion>('hoy')
  const [filas, setFilas] = useState<Fila[]>([])
  const [pendiente, setPendiente] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ModalInfo | null>(null)

  // Los datos del puerto que alimentan MÁS DE UN sitio se piden aquí una vez:
  // los vencimientos los pintan «Hoy» (solo los accionables) y «Cartera» (la
  // ventana entera), y montarlos dos veces serían dos llamadas para lo mismo.
  const [cartera, setCartera] = useState<Cartera | null>(null)
  const [vencimientos, setVencimientos] = useState<RespVencimientos | null>(null)

  // Contadores que los bloques reportan hacia arriba. `undefined` = todavía no
  // ha contestado; `null` = contestó que no se puede saber. No es lo mismo.
  const [nPartes, setNPartes] = useState<number | null | undefined>(undefined)
  const [nRetencion, setNRetencion] = useState<number | null | undefined>(undefined)
  const [nSinCanal, setNSinCanal] = useState<number | null | undefined>(undefined)
  const [nDuplicadas, setNDuplicadas] = useState<number | null | undefined>(undefined)
  const [nCuadre, setNCuadre] = useState<number | null | undefined>(undefined)

  // La sección inicial viaja en la URL (`?s=`), y los cambios la reescriben con
  // `history.replaceState`: un enlace sigue llevando donde debe, pero cambiar
  // de pestaña NO navega —eso remontaría la pantalla y volvería a pedirle todo
  // al puerto de asegura en cada clic.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s')
    if (s) setSeccion(seccionDeParametro(s))
  }, [])

  const cambiarSeccion = useCallback((s: Seccion) => {
    setSeccion(s)
    const url = new URL(window.location.href)
    url.searchParams.set('s', s)
    window.history.replaceState(null, '', url)
  }, [])

  const cargarMatriz = useCallback(() => {
    setLoading(true)
    setError('')
    fetch(`/api/correduria?año=${año}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar datos'); return r.json() })
      .then(d => { setFilas(d.filas || []); setPendiente(d.pendiente || 0); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [año])

  useEffect(() => { cargarMatriz() }, [cargarMatriz])

  useEffect(() => {
    fetch('/api/correduria/cartera')
      .then(r => (r.ok ? r.json() : { estado: 'error' }))
      .then(setCartera)
      .catch(() => setCartera({ estado: 'error' }))
    fetch('/api/correduria/vencimientos?dias=90')
      .then(r => (r.ok ? r.json() : { estado: 'error' }))
      .then(setVencimientos)
      .catch(() => setVencimientos({ estado: 'error' }))
  }, [])

  const totalAnual = filas.reduce((s, f) => s + f.total, 0)
  const totalesMes = MESES.map((_, i) => {
    const key = mesKey(año, i)
    return filas.reduce((s, f) => s + (f.meses[key] ?? 0), 0)
  })
  const compañiasActivas = filas.length

  // Renovaciones que son trabajo de HOY (dentro de la ventana de preaviso).
  // Mientras el puerto no conteste vale `undefined`; si contesta que no se
  // puede leer, `null` — y el badge dirá «!», no «0».
  const nRenovaciones = vencimientos === null
    ? undefined
    : vencimientos.estado === 'ok'
      ? contarAccionables(vencimientos.polizas)
      : null

  const contadores: ContadoresSeccion = {
    hoy: {
      contador: agregarContadores([nPartes, nRetencion, nRenovaciones]),
      tono: 'malo',
      title: 'Partes sin atender, recibos que reclamar y renovaciones dentro del plazo de preaviso',
    },
    comisiones: {
      contador: agregarContadores([nCuadre]),
      tono: 'aviso',
      title: 'Periodos de comisiones sin cuadrar',
    },
    datos: {
      contador: agregarContadores([nDuplicadas, nSinCanal]),
      tono: 'aviso',
      title: 'Pólizas duplicadas y clientes a los que no se puede avisar',
    },
  }

  // Estilo común de toda celda clicable con importe.
  const cellBtn: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    font: 'inherit', color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted',
    textDecorationColor: 'var(--border)', textUnderlineOffset: 3,
  }

  /** Una sección oculta sigue MONTADA: es de donde salen los contadores. */
  const panel = (s: Seccion): React.CSSProperties => ({ display: seccion === s ? 'block' : 'none' })

  return (
    <Pagina ancho="tabla">
      <PageHeader
        titulo="Correduría"
        icono={<Shield size={20} strokeWidth={1.75} />}
        acciones={
          <>
            <BtnLink href="/correduria/cliente/nuevo" variante="primario">
              <Plus size={15} strokeWidth={1.75} aria-hidden /> Nuevo cliente
            </BtnLink>
            <BtnLink href="/correduria/hogar" variante="secundario">
              <House size={15} strokeWidth={1.75} aria-hidden /> Presupuesto de hogar
            </BtnLink>
          </>
        }
      />

      {/* ── EL BUSCADOR, SIEMPRE ────────────────────────────────────────────
          Lo primero y lo más usado. Va FUERA de las secciones a propósito: se
          busca un cliente estés donde estés, y además es HERMANO de la cartera
          —nunca hijo—, porque `CarteraResumen` hace `return` temprano cuando el
          puerto falla y anidado ahí dentro desaparecería justo ese día. */}
      <div style={{ marginBottom: 20 }}>
        <BuscadorCartera />
      </div>

      <Secciones activa={seccion} contadores={contadores} onCambiar={cambiarSeccion} />

      {/* ══ HOY ══════════════════════════════════════════════════════════════
          Lo que se hace con el teléfono en la mano y caduca. El orden es el de
          la urgencia REAL, no el del dinero. */}
      <div role="tabpanel" aria-label="Hoy" className="corr-panel" style={panel('hoy')}>
        {/* Los partes de siniestro que ha abierto el CLIENTE desde el portal y
            nadie ha mirado. Van los primeros —antes incluso que el teléfono—
            porque quien lo mandó cree que su compañía ya lo sabe, y hasta que
            se abra allí no lo sabe nadie. */}
        <PartesPortal onContador={setNPartes} />

        {/* Recibos devueltos y vencidos sin cobrar, por urgencia real (art. 15
            LCS). Es la pantalla comercial: lo único de aquí que se hace con el
            teléfono en la mano. */}
        <Retencion onContador={setNRetencion} />

        <Bloque
          titulo="Renovaciones en plazo de preaviso"
          Icono={CalendarClock}
          sub="Las que aún se pueden mover: dentro del mes de preaviso el tomador ya no puede oponerse a la prórroga (LCS art. 22). La ventana completa de 90 días está en «Cartera»."
        >
          <Renovaciones datos={vencimientos} filtro="accionables" />
        </Bloque>
      </div>

      {/* ══ CARTERA ══════════════════════════════════════════════════════════ */}
      <div role="tabpanel" aria-label="Cartera" className="corr-panel" style={panel('cartera')}>
        <CarteraResumen cartera={cartera} />

        <Bloque
          titulo="Renovaciones · próximos 90 días"
          Icono={CalendarClock}
          sub="Las pólizas sin fecha de vencimiento no salen aquí: no es que no venzan, es que la compañía no ha informado la fecha."
        >
          <Renovaciones datos={vencimientos} filtro="todas" />
        </Bloque>
      </div>

      {/* ══ COMISIONES ═══════════════════════════════════════════════════════
          El cuadre devengado → liquidado → cobrado va ANTES de la matriz del
          banco porque la matriz solo ve el ingreso (la remesa) y la cifra que
          va a la renta es el bruto. */}
      <div role="tabpanel" aria-label="Comisiones" className="corr-panel" style={panel('comisiones')}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={() => setAño(a => a - 1)}
            aria-label="Año anterior"
            style={{ minHeight: 44, minWidth: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16 }}
          >←</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 50, textAlign: 'center', color: 'var(--text)' }}>{año}</span>
          <button
            onClick={() => setAño(a => a + 1)}
            disabled={año >= añoActual}
            aria-label="Año siguiente"
            style={{ minHeight: 44, minWidth: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16, opacity: año >= añoActual ? 0.35 : 1 }}
          >→</button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            El año gobierna esta sección — no la cartera viva ni las renovaciones.
          </span>
        </div>

        <CuadreComisiones año={año} onContador={setNCuadre} />

        {/* Movimientos de seguros sin confirmar a qué compañía son. Fuera del
            gate `totalAnual > 0` a propósito: ese gate lo escondía un año sin
            ingreso bancario, que es justo cuando más importa. */}
        {!loading && !error && pendiente > 0 && (
          <Bloque titulo="Pendiente de confirmar" Icono={Landmark} tono="aviso" destacado>
            <button
              onClick={() => setModal({ titulo: 'Pendiente de confirmar', compania: '__PENDIENTE__' })}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', minHeight: 44, color: 'var(--text)' }}
            >
              <strong>{eur(pendiente)}</strong> en movimientos de seguros sin confirmar a qué compañía
              son → revisar
            </button>
          </Bloque>
        )}

        <Bloque
          titulo={`Detalle del banco · ${año}`}
          Icono={Landmark}
          sub={loading
            ? 'Cargando liquidaciones…'
            : `${eur(totalAnual)} cobrado · ${compañiasActivas} compañía(s). Salen de los movimientos bancarios con destino «correduría de seguros»; pincha cualquier importe para ver y confirmar su desglose.`}
        >
          {error && (
            <div style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', borderRadius: 8, padding: '12px 16px', color: 'var(--negative)' }}>
              {error}
            </div>
          )}

          {!loading && !error && filas.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Sin liquidaciones en {año}. Los datos se actualizan solos con los movimientos bancarios
              clasificados como correduría.
            </p>
          )}

          {!loading && !error && filas.length > 0 && (
            <div className="corr-table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 12px 8px 0', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                      Compañía
                    </th>
                    {MESES.map(m => (
                      <th key={m} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)', minWidth: 60 }}>{m}</th>
                    ))}
                    <th style={{ padding: '8px 0 8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => {
                    const esOtras = f.compania === COMPANIA_OTRAS
                    return (
                      <tr key={f.compania} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px 8px 0', fontWeight: 600, color: esOtras ? 'var(--warning)' : 'var(--text)', whiteSpace: 'nowrap' }}>
                          {companiaLabel(f.compania)}
                          {esOtras && <> <Badge tono="aviso">sin identificar</Badge></>}
                        </td>
                        {MESES.map((_, i) => {
                          const key = mesKey(año, i)
                          const val = f.meses[key] ?? 0
                          return (
                            <td key={i} style={{ padding: '8px 10px', textAlign: 'right', color: val > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {val > 0
                                ? <button style={cellBtn} onClick={() => setModal({ titulo: `${companiaLabel(f.compania)} · ${MESES[i]} ${año}`, compania: f.compania, mes: key })}>{eur(val)}</button>
                                : '—'}
                            </td>
                          )
                        })}
                        <td style={{ padding: '8px 0 8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                          <button style={{ ...cellBtn, fontWeight: 700, color: 'var(--primary)' }} onClick={() => setModal({ titulo: `${companiaLabel(f.compania)} · ${año}`, compania: f.compania })}>{eur(f.total)}</button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px 8px 0', fontWeight: 700, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Total
                    </td>
                    {totalesMes.map((t, i) => (
                      <td key={i} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: t > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {t > 0
                          ? <button style={{ ...cellBtn, fontWeight: 600 }} onClick={() => setModal({ titulo: `Todas · ${MESES[i]} ${año}`, compania: '__TOTAL__', mes: mesKey(año, i) })}>{eur(t)}</button>
                          : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '8px 0 8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                      <button style={{ ...cellBtn, fontWeight: 800, fontSize: 15, color: 'var(--primary)' }} onClick={() => setModal({ titulo: `Todas · ${año}`, compania: '__TOTAL__' })}>{eur(totalAnual)}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Bloque>
      </div>

      {/* ══ DATOS ════════════════════════════════════════════════════════════
          Calidad del dato: no caduca hoy, pero decide si mañana se puede avisar
          a alguien. Fuera de «Hoy» para que no compita con lo que sí urge. */}
      <div role="tabpanel" aria-label="Datos" className="corr-panel" style={panel('datos')}>
        {/* Pólizas duplicadas en la cartera viva (guardián Codeoscopic↔CIMA). */}
        <Duplicadas onContador={setNDuplicadas} />

        {/* El reverso de la cola de retención: los clientes de la cartera viva
            sin email ni teléfono. No hay nada que enviarles —el aviso de
            vencimiento se pierde y no pueden entrar al portal—, así que el
            trabajo es pedir el correo la próxima vez que se hable con ellos. */}
        <SinCanal onContador={setNSinCanal} />
      </div>

      {modal && (
        <DesgloseModal
          info={modal}
          año={año}
          onClose={() => setModal(null)}
          onChanged={cargarMatriz}
        />
      )}
    </Pagina>
  )
}

// ── Cartera en vivo ──────────────────────────────────────────────────────────
// Tres estados: «sin conectar» NUNCA se pinta como cartera vacía, y un fallo es
// visible. Los datos los pide la pantalla (los vencimientos que van debajo son
// de otra consulta y ya no cuelgan de este bloque).

function CarteraResumen({ cartera }: { cartera: Cartera | null }) {
  if (cartera === null) {
    return (
      <Bloque titulo="Cartera en vivo" Icono={FolderOpen} primero>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Cargando cartera…</p>
      </Bloque>
    )
  }

  if (cartera.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Cartera en vivo · pendiente de conectar" Icono={FolderOpen} tono="aviso" destacado>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Falta el puerto con central-asegura (env <code>ASEGURA_OPERADOR_SECRET</code> en los dos
          proyectos). Esto NO significa que no haya cartera: los datos siguen en su base y se verán
          aquí al conectar.
        </p>
      </Bloque>
    )
  }

  if (cartera.estado === 'error') {
    return (
      <Bloque titulo="Cartera en vivo · sin respuesta" Icono={FolderOpen} tono="malo" destacado>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          La cartera NO está vacía — el puerto con central-asegura ha fallado:{' '}
          {MOTIVOS[cartera.motivo ?? 'respuesta_ilegible']}
          {describirCausaAsegura(cartera.causa) && (
            <> <strong>Causa que declara asegura:</strong> {describirCausaAsegura(cartera.causa)}.</>
          )}
        </p>
      </Bloque>
    )
  }

  // Vencimientos: `null` significa «el puerto todavía no lo informa» y se pinta
  // «—» con su nota. Un 0 aquí diría «no vence nada», que es otra cosa.
  const vence = (n: number | null | undefined) => (typeof n === 'number' ? num(n) : '—')

  // 🚨 De ocho KPIs a TRES. Los que se fueron no eran datos de menos: eran
  // aritmética mental. «Vencen en 60» no dispara ninguna acción distinta de
  // «vencen en 30» (la ventana que manda es la del preaviso, LCS art. 22);
  // «Históricas» y «Leads» son el MISMO volcado de 2013-2018 contado en dos
  // unidades y nunca cambian; y «Sin fecha» no es un KPI sino una advertencia
  // sobre la calidad del dato, así que baja a subtítulo del que sí lo es.
  const kpis = [
    {
      label: 'Vencen en 30 días',
      value: vence(cartera.vence30),
      sub: 'la ventana de la LCS art. 22',
      color: (cartera.vence30 ?? 0) > 0 ? 'var(--warning)' : 'var(--muted)',
    },
    {
      label: 'Cartera viva',
      value: `${num(cartera.polizasVigentes)} pólizas`,
      sub:
        `${num(cartera.clientes)} clientes` +
        (cartera.polizasPendientesFecha > 0
          ? ` · ${num(cartera.polizasPendientesFecha)} sin fecha de vencimiento informada`
          : ''),
      color: 'var(--primary)',
    },
    {
      label: 'Siniestros abiertos',
      value: num(cartera.siniestrosAbiertos),
      sub: cartera.siniestrosAbiertos > 0 ? 'en tramitación' : 'ninguno abierto',
      color: cartera.siniestrosAbiertos > 0 ? 'var(--negative)' : 'var(--text)',
    },
  ]

  return (
    <Bloque
      titulo={`Cartera en vivo${cartera.nombre ? ` · ${cartera.nombre}` : ''}`}
      Icono={FolderOpen}
      primero
      sub="«En vigor» = estado vigente y vencimiento hoy o futuro; las pólizas sin fecha NO se cuentan como vigentes ni vencidas."
    >
      {/* Estas SÍ son cajas: cada KPI es un objeto, no una sección. */}
      <div className="corr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* El volcado histórico: una línea, no dos tarjetas. Son 28.729 pólizas
          de 2013-2018 que no cambian nunca y competían con los números que sí
          deciden algo. */}
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
        Además hay {num(cartera.polizasNoVigentes)} póliza(s) del volcado histórico y{' '}
        {num(cartera.leads)} lead(s): vencimientos de 2013-2018, sin actividad. Se buscan igual, pero
        no generan avisos.
      </p>
      {cartera.vence30 === null && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
          Los vencimientos aún no llegan por el puerto (central-asegura pendiente de desplegar con esta
          versión). «—» significa que no se sabe, no que no venza nada.
        </p>
      )}
    </Bloque>
  )
}

function DesgloseModal({ info, año, onClose, onChanged }: { info: ModalInfo; año: number; onClose: () => void; onChanged: () => void }) {
  const [movs, setMovs] = useState<MovDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [reclasif, setReclasif] = useState<string | null>(null)
  const [picker, setPicker] = useState<string | null>(null)   // id con el selector de compañía abierto
  const [otra, setOtra] = useState('')                          // texto de "Otra…"

  const cargar = useCallback(() => {
    setLoading(true)
    setError('')
    const qs = new URLSearchParams({ año: String(año), compania: info.compania })
    if (info.mes) qs.set('mes', info.mes)
    fetch(`/api/correduria/detalle?${qs.toString()}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar el desglose'); return r.json() })
      .then(d => { setMovs(d.movimientos || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [año, info])

  useEffect(() => { cargar() }, [cargar])

  // Confirma que es de seguros y, si se indica, asigna la compañía (override). compania=null →
  // "no lo sé" (se queda en Sin identificar). Tras confirmar, recarga el desglose (el movimiento
  // puede salir de este listado si estaba filtrado por pendiente o por otra compañía) y la matriz.
  async function confirmar(id: string, compania: string | null) {
    setBusy(id)
    await fetch('/api/banca/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirmado: true, compania }) })
    setPicker(null)
    setOtra('')
    setBusy(null)
    onChanged()
    cargar()
  }

  async function reclasificar(id: string, destino: string) {
    setBusy(id)
    await fetch('/api/banca/destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, destino }) })
    // Sale de seguros → desaparece de la correduría.
    setMovs(prev => prev.filter(m => m.id !== id))
    setReclasif(null)
    setBusy(null)
    onChanged()
  }

  const total = movs.reduce((s, m) => s + m.importe, 0)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, maxWidth: 760, width: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: 'var(--shadow-lift)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--surface)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{info.titulo}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{movs.length} movimiento{movs.length === 1 ? '' : 's'} · {eur(total)}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', minWidth: 44, minHeight: 44 }}>×</button>
        </div>

        <div style={{ padding: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>Cargando…</div>}
          {error && <div style={{ color: 'var(--negative)', padding: 12 }}>{error}</div>}
          {!loading && !error && movs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No quedan movimientos en este desglose.</div>
          )}
          {!loading && !error && movs.map(m => {
            const sospechoso = m.motivo === 'descarte' && !m.confirmado
            return (
              <div key={m.id} style={{ border: `1px solid ${sospechoso ? 'var(--warning)' : 'var(--border)'}`, background: sospechoso ? 'var(--warning-bg)' : 'transparent', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{m.concepto || m.contraparte || '(sin concepto)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {fmtFecha(m.fecha)} · {m.banco}{m.contraparte ? ` · ${m.contraparte}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {m.motivo === 'nombre'
                        ? <Badge tono="positivo">Clasificado por nombre de aseguradora</Badge>
                        : <Badge tono="aviso" title={`Clasificado por descarte (${m.banco}) — revisa que sea de seguros`}>Clasificado por descarte</Badge>}
                      {m.confirmado && <Badge tono="positivo">Confirmado</Badge>}
                      {m.companiaManual && <Badge tono="info">Compañía asignada a mano</Badge>}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 5, color: 'var(--muted)' }}>
                      Compañía: <strong style={{ color: m.compania === COMPANIA_OTRAS ? 'var(--warning)' : 'var(--text)' }}>{companiaLabel(m.compania)}</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{eur(m.importe)}</div>
                </div>
                {picker === m.id ? (
                  <div style={{ marginTop: 10, padding: 10, border: '1px dashed var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>¿De qué compañía es?</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {COMPANIAS_CONOCIDAS.map(c => (
                        <button key={c} disabled={busy === m.id} onClick={() => confirmar(m.id, c)}
                          style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                          {c}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input value={otra} onChange={e => setOtra(e.target.value)} placeholder="Otra compañía…"
                        style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, flex: '1 1 160px', minWidth: 0 }} />
                      <button disabled={busy === m.id || !otra.trim()} onClick={() => confirmar(m.id, otra.trim())}
                        style={{ padding: '5px 10px', border: '1px solid var(--positive)', borderRadius: 8, background: otra.trim() ? 'var(--positive)' : 'var(--surface)', color: otra.trim() ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: otra.trim() ? 'pointer' : 'default' }}>
                        Usar
                      </button>
                      <button disabled={busy === m.id} onClick={() => confirmar(m.id, null)}
                        style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                        No lo sé
                      </button>
                      <button onClick={() => { setPicker(null); setOtra('') }} style={{ padding: '5px 8px', border: 'none', background: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>cancelar</button>
                    </div>
                  </div>
                ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!m.confirmado ? (
                    <button disabled={busy === m.id} onClick={() => { setPicker(m.id); setOtra('') }}
                      style={{ padding: '6px 12px', border: '1px solid var(--positive)', borderRadius: 8, background: 'var(--positive)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Es de seguros · elegir compañía
                    </button>
                  ) : (
                    <button disabled={busy === m.id} onClick={() => { setPicker(m.id); setOtra('') }}
                      style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {m.compania === COMPANIA_OTRAS ? 'Asignar compañía' : 'Cambiar compañía'}
                    </button>
                  )}
                  {reclasif === m.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Mover a:</span>
                      {DESTINOS_RECLASIF.map(d => (
                        <button key={d.v} disabled={busy === m.id} onClick={() => reclasificar(m.id, d.v)}
                          style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                          {d.label}
                        </button>
                      ))}
                      <button onClick={() => setReclasif(null)} style={{ padding: '5px 8px', border: 'none', background: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>cancelar</button>
                    </span>
                  ) : (
                    <button disabled={busy === m.id} onClick={() => setReclasif(m.id)}
                      style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      No es de seguros ▾
                    </button>
                  )}
                </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
