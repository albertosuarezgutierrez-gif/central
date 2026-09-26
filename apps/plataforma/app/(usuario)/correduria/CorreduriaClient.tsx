'use client'

import ContactosMovil from './ContactosMovil'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { describirCausaAsegura } from '@/lib/correduria-puerto'
import { CalendarClock, Landmark, FolderOpen, Antenna, Megaphone, TriangleAlert, Activity } from 'lucide-react'
import { Pagina, Badge, btnStyle } from '@/components/ui'
import { companiaLabel, COMPANIA_OTRAS, COMPANIAS_CONOCIDAS } from '@/lib/correduria'
import { eur } from '@/lib/dinero'
import CuadreComisiones from './CuadreComisiones'
import InformeMediacion from './InformeMediacion'
import Formacion from './Formacion'
import FichasIpid from './FichasIpid'
import LineaBase from './LineaBase'
import DescuadresComisiones from './DescuadresComisiones'
import BuscadorCartera from './BuscadorCartera'
import AccionesCabecera from './AccionesCabecera'
import Retencion from './Retencion'
import Sustituciones from './Sustituciones'
import Actividad from './Actividad'
import Duplicadas from './Duplicadas'
import Calidad from './Calidad'
import SinCanal from './SinCanal'
import ExportRgpd from './ExportRgpd'
import Companias from './Companias'
import RadarRecibos from './RadarRecibos'
import PartesPortal from './PartesPortal'
import Supresiones from './Supresiones'
import DiferenciasCima from './DiferenciasCima'
import Quejas from './Quejas'
import Bloque from './Bloque'
import Redes from './Redes'
import Blog from './Blog'
import LeadsPortal from './LeadsPortal'
import Renovaciones, { type RespVencimientos } from './Renovaciones'
import DeclaradasVencer from './DeclaradasVencer'
import ListaCartera from './ListaCartera'
import Recaptacion from './Recaptacion'
import LeadsWebConversion from './LeadsWebConversion'
import PanelIngesta, { AvisoIngesta } from './Ingesta'
import Secciones, { type ContadoresSeccion } from './Secciones'
import HoyCockpit from './HoyCockpit'
import {
  contadorIngesta, interpretarVistaIngesta, type VistaIngesta,
} from '@/lib/correduria/ingesta-pantalla'
import { MOTIVOS, type MotivoError } from './estado-puerto'
import {
  agregarContadores, combinarContadores, contarAccionables, destinoDeParametro,
  type BloqueMas, type Destino, type Seccion,
} from './secciones'

/**
 * La pantalla de la correduría.
 *
 * ─── Rediseño del 03/09/2026: de una tira de ocho bloques a cinco secciones ─
 * Antes era un scroll único con ocho bloques del MISMO peso visual: los partes
 * que ha abierto un cliente y nadie ha mirado pesaban igual que la matriz de
 * comisiones cobradas de hace tres años, y cada uno pintaba su propia caja con
 * borde y radio, así que ninguno decía «mírame a mí primero». Lo que hace
 * productiva una pantalla no es enseñar más: es que lo primero que se ve sea lo
 * único que hay que hacer.
 *
 * Ahora: el buscador arriba (lo más usado), y cinco secciones —Hoy · Clientes ·
 * Cartera · Comisiones · Datos— con CONTADOR en la barra, que es lo que impide
 * que una pestaña esconda trabajo. Ver `secciones.ts` para el reparto y
 * `Bloque.tsx` para por qué un bloque ya no es una caja.
 *
 * ─── Qué NO cambia, y por qué ───────────────────────────────────────────────
 * · Una sección se MONTA la primera vez que se abre (24/09/2026, Alberto: «la
 *   carga es súper lenta»). Antes se montaban las ocho al entrar: ~34 peticiones,
 *   ~28 al puerto de asegura, que atiende 5 a la vez, para enseñar solo «Hoy».
 *   Excepción: Recaptación y Blog se montan siempre porque su contador entra en
 *   «esperan tu OK» de Hoy. Coste asumido: el badge de una pestaña que aún no
 *   se ha abierto no se pinta (no se sabe todavía), nunca un 0.
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
  // Secciones ya abiertas: se montan la primera vez y se quedan montadas (su estado no se pierde).
  const [vistas, setVistas] = useState<ReadonlySet<Seccion>>(() => new Set<Seccion>(['hoy']))
  useEffect(() => { setVistas(v => (v.has(seccion) ? v : new Set(v).add(seccion))) }, [seccion])
  const montada = (s: Seccion) => vistas.has(s)
  const comisionesVista = vistas.has('comisiones')
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
  // La salud de la ingesta de CIMA alimenta DOS sitios —la tarjeta de «Hoy»
  // (solo si hay algo) y la sección «Ingesta»— y por eso se lee aquí una vez:
  // montarla dos veces serían dos llamadas al puerto para el mismo dato.
  // `null` = todavía no ha contestado; NO es «no se ha podido comprobar».
  const [ingesta, setIngesta] = useState<VistaIngesta | null>(null)

  // Contadores que los bloques reportan hacia arriba. `undefined` = todavía no
  // ha contestado; `null` = contestó que no se puede saber. No es lo mismo.
  const [nPartes, setNPartes] = useState<number | null | undefined>(undefined)
  const [nLeads, setNLeads] = useState<number | null | undefined>(undefined)
  const [nSupresiones, setNSupresiones] = useState<number | null | undefined>(undefined)
  const [nQuejas, setNQuejas] = useState<number | null | undefined>(undefined)
  const [nCima, setNCima] = useState<number | null | undefined>(undefined)
  const [nDescuadres, setNDescuadres] = useState<number | null | undefined>(undefined)
  const [nRetencion, setNRetencion] = useState<number | null | undefined>(undefined)
  const [nSustituciones, setNSustituciones] = useState<number | null | undefined>(undefined)
  const [nSinCanal, setNSinCanal] = useState<number | null | undefined>(undefined)
  const [nCalidad, setNCalidad] = useState<number | null | undefined>(undefined)
  const [nDuplicadas, setNDuplicadas] = useState<number | null | undefined>(undefined)
  const [nExportRgpd, setNExportRgpd] = useState<number | null | undefined>(undefined)
  const [nFormacion, setNFormacion] = useState<number | null | undefined>(undefined)
  const [nCuadre, setNCuadre] = useState<number | null | undefined>(undefined)
  const [nClientes, setNClientes] = useState<number | null | undefined>(undefined)
  const [nRecaptacion, setNRecaptacion] = useState<number | null | undefined>(undefined)
  const [nBlog, setNBlog] = useState<number | null | undefined>(undefined)
  const [nTareasHoy, setNTareasHoy] = useState<number | null | undefined>(undefined)
  // Su contador ya NO se suma en «Hoy» (ver el comentario junto a `agregarContadores`
  // de la sección `hoy`, más abajo): el valor no hace falta, solo la función.
  const [, setNDeclaradas] = useState<number | null | undefined>(undefined)

  // La sección inicial viaja en la URL (`?s=`), y los cambios la reescriben con
  // `history.replaceState`: un enlace sigue llevando donde debe, pero cambiar
  // de pestaña NO navega —eso remontaría la pantalla y volvería a pedirle todo
  // al puerto de asegura en cada clic.
  // Un destino que es un bloque de «Más» (`?s=ingesta`, el botón «Ver» de la
  // avería de CIMA…) abre esa pestaña y baja al bloque. El scroll espera a que
  // el panel se haya montado y pintado: antes no existe el ancla.
  const [bajarA, setBajarA] = useState<BloqueMas | null>(null)
  // La actividad NO se monta al abrir «Más»: al montarse marca la visita como
  // vista (`correduria:actividad:visto`), y abrir «Más» para mirar la ingesta
  // se comería los puntos de «nuevo desde tu última visita». Se monta al ir a
  // ella (`?s=actividad`, el «Todo» de «Hoy») o al pulsar su botón.
  const [verActividad, setVerActividad] = useState(false)
  useEffect(() => {
    if (!bajarA) return
    if (bajarA === 'actividad') setVerActividad(true)
    // Varios intentos: los bloques de encima cargan sus datos DESPUÉS de abrir
    // la pestaña y empujan el ancla hacia abajo. Un solo scroll a los 60 ms
    // dejaría a la vista el bloque de arriba, no el pedido.
    const ir = () => document.getElementById(`mas-${bajarA}`)?.scrollIntoView({ block: 'start' })
    const ts = [60, 600, 1500].map(ms => window.setTimeout(ir, ms))
    const fin = window.setTimeout(() => setBajarA(null), 1600)
    return () => { ts.forEach(window.clearTimeout); window.clearTimeout(fin) }
  }, [bajarA, seccion])

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s')
    if (!s) return
    const d = destinoDeParametro(s)
    setSeccion(d.seccion)
    setBajarA(d.bloque)
  }, [])

  const cambiarSeccion = useCallback((destino: Destino) => {
    const d = destinoDeParametro(destino)
    setSeccion(d.seccion)
    setBajarA(d.bloque)
    const url = new URL(window.location.href)
    url.searchParams.set('s', destino)
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

  useEffect(() => { if (comisionesVista) cargarMatriz() }, [cargarMatriz, comisionesVista])

  useEffect(() => {
    fetch('/api/correduria/cartera')
      .then(r => (r.ok ? r.json() : { estado: 'error' }))
      .then(setCartera)
      .catch(() => setCartera({ estado: 'error' }))
    fetch('/api/correduria/vencimientos?dias=90')
      .then(r => (r.ok ? r.json() : { estado: 'error' }))
      .then(setVencimientos)
      .catch(() => setVencimientos({ estado: 'error' }))
    // 🚨 La forma se vuelve a validar al llegar: un 500 de Vercel o un HTML de
    // error no pueden acabar pintados como «la ingesta va bien».
    fetch('/api/correduria/ingesta')
      .then(async r => interpretarVistaIngesta(r.status, await r.json().catch(() => null)))
      .catch((): VistaIngesta => ({ estado: 'error', motivo: 'red' }))
      .then(setIngesta)
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

  const cIngesta = contadorIngesta(ingesta)
  // Datos solo cuenta cuando se ha abierto «Más» (se monta perezoso): antes, sus
  // colas no han contestado y no pueden sumar ni restar.
  const cDatos = montada('mas')
    ? agregarContadores([nCalidad, nDuplicadas, nSinCanal, nExportRgpd, nFormacion])
    : undefined
  const cMas = combinarContadores([cIngesta, cDatos, nBlog === undefined ? undefined : agregarContadores([nBlog])])

  // Lo que la franja de «Hoy» llama incidencias: lo que ya está roto o con un
  // plazo corriendo. `undefined` mientras cargan; `null` si ninguna se pudo leer.
  // Hasta que contestan las cuatro no se pinta nada: un «0» con tres colas
  // aún cargando sería una afirmación que nadie ha comprobado.
  const colasIncid = [nPartes, nSupresiones, nRetencion, nSustituciones, nDescuadres]
  const nIncidencias = colasIncid.some(n => n === undefined) ? undefined : agregarContadores(colasIncid)

  const contadores: ContadoresSeccion = {
    hoy: {
      // 🚨 `nDeclaradas` NO entra aquí. `DeclaradasVencer` y `LeadsPortal` leen
      // la MISMA tabla (`portal_poliza_declarada`) con ventanas casi idénticas:
      // una póliza que cumple las dos se pintaba (y se contaba) dos veces. El
      // criterio de urgencia real es el de `LeadsPortal` (preaviso LCS art. 22,
      // `nLeads`); `DeclaradasVencer` se conserva SOLO como vista de llamada
      // rápida (teléfono/email en claro) para las ya vinculadas ≤60 días, pero
      // ya no suma un segundo aviso de lo mismo.
      contador: agregarContadores([nPartes, nSupresiones, nQuejas, nCima, nRetencion, nRenovaciones, nLeads, nSustituciones, nTareasHoy, nDescuadres]),
      tono: 'malo',
      title: 'Tareas de seguimiento para hoy, partes sin atender, solicitudes de supresión con el plazo corriendo, recibos que reclamar, renovaciones dentro del plazo de preaviso, pólizas de otras compañías cuya ventana se cierra, declaradas de otra compañía a punto de renovar y sustituciones pendientes de que CIMA confirme la nueva',
    },
    clientes: {
      // El listado NO es trabajo pendiente (cuántos clientes cumplen el
      // filtro), pero la recaptación SÍ lo es (leads a los que contactar) —
      // igual que «Hoy» suma varias colas de una sección en un solo número.
      contador: agregarContadores([nClientes, nRecaptacion]),
      title: 'Clientes que cumplen el filtro actual y leads pendientes de recaptar',
    },
    comisiones: {
      contador: agregarContadores([nCuadre]),
      tono: 'aviso',
      title: 'Periodos de comisiones sin cuadrar',
    },
    // «Más» agrupa cuatro bloques (ver `BLOQUES_MAS`) y su badge SUMA los que
    // son trabajo: la calidad del dato, las señales de pérdida de la ingesta de
    // CIMA y los artículos del blog que esperan tu OK. Actividad no cuenta: no
    // es una cola. Los borradores de LinkedIn tampoco (ver `secciones.ts`).
    // 🚨 La ingesta NO suma en «Hoy» aunque su tarjeta se pinte allí: contar lo
    // mismo en dos badges haría que atender la avería no bajara ninguno.
    // Mientras nada ha contestado, `combinarContadores` da `undefined` y la
    // clave no se pone: un badge no puede gritar «!» el segundo que tarda.
    ...(cMas === undefined ? {} : {
      mas: {
        contador: cMas,
        // Rojo solo con pérdida MEDIDA en la ingesta; lo demás es ámbar.
        tono: (cIngesta != null && cIngesta.n > 0 ? 'malo' : 'aviso') as 'malo' | 'aviso',
        title: 'Señales de pérdida de datos de CIMA, artículos del blog pendientes de tu OK, pólizas duplicadas y clientes a los que no se puede avisar',
      },
    }),
  }

  // Estilo común de toda celda clicable con importe.
  const cellBtn: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    font: 'inherit', color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted',
    textDecorationColor: 'var(--border)', textUnderlineOffset: 3,
  }

  /** Una sección ya abierta sigue MONTADA aunque se oculte: no se vuelve a pedir nada al volver. */
  const panel = (s: Seccion): React.CSSProperties => ({ display: seccion === s ? 'block' : 'none' })

  return (
    <Pagina ancho="tabla">
      {/* ── SIN CABECERA VISIBLE (04/09/2026, pedido de Alberto) ────────────
          El escudo + «Correduría» costaban ~62px de la primera pantalla
          (38px de icono, 20px de h1 y 24px de `margin-bottom` del
          `.page-header`) para decir dónde estás… en la pantalla que abres a
          propósito y cuyo nombre ya sale en el menú lateral. En un móvil de
          740px útiles eso es un 8% del alto para cero trabajo.

          El `<h1>` NO se borra, se oculta a la vista: sin él la página se
          queda sin encabezado para un lector de pantalla y para el título del
          documento. Lo mismo hace `Bloque` con sus rótulos. */}
      <h1 className="solo-lectores">Correduría</h1>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <AccionesCabecera />
      </div>

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
        {/* El cockpit (pieza 1-4): franja + tareas de hoy + lo que espera tu OK
            + lo que han hecho los clientes en el portal. Las incidencias son
            los bloques de siempre, justo debajo: la franja solo las cuenta. */}
        <HoyCockpit
          ingesta={ingesta}
          nIncidencias={nIncidencias}
          nRecaptacion={nRecaptacion}
          nBlog={nBlog}
          onIr={cambiarSeccion}
          onContadorTareas={setNTareasHoy}
        />

        {/* Los partes de siniestro que ha abierto el CLIENTE desde el portal y
            nadie ha mirado. Van los primeros —antes incluso que el teléfono—
            porque quien lo mandó cree que su compañía ya lo sabe, y hasta que
            se abra allí no lo sabe nadie. */}
        <PartesPortal onContador={setNPartes} />

        {/* Las solicitudes de supresión (art. 17 RGPD) que abre el cliente en
            el portal. Van aquí arriba porque llevan un reloj legal de UN MES
            corriendo desde que la persona pulsó —no desde que se miran—, y
            porque hasta que existió este bloque ese plazo se incumplía solo, sin
            que nada fallara ni saliera en ninguna pantalla. */}
        <Supresiones onContador={setNSupresiones} />
        <Quejas onContador={setNQuejas} />

        {/* Datos de la ficha que no coinciden con lo que manda CIMA de esa
            persona: decide Alberto («Usar CIMA» / «Mantener el mío»). Los
            huecos los rellena solo el cron `cima-sincro`. */}
        <DiferenciasCima onContador={setNCima} />

        {/* Si lo que mandan las compañías por CIMA NO está entrando. Se pinta
            SOLO cuando hay algo que decir —incidencia o «no se ha podido
            comprobar»—: con la ingesta al día no ocupa ni un píxel, que es lo
            que pidió Alberto. Va aquí arriba porque un recibo o un siniestro
            que no entra no aparece en ninguna otra pantalla, y su comisión
            tampoco; el detalle vive en la sección «Ingesta». */}
        <AvisoIngesta datos={ingesta} />

        {/* Recibos devueltos y vencidos sin cobrar, por urgencia real (art. 15
            LCS). Es la pantalla comercial: lo único de aquí que se hace con el
            teléfono en la mano. */}
        <Retencion onContador={setNRetencion} />

        {/* Cambios de compañía ya emitidos, esperando a que CIMA confirme que
            el cliente paga la nueva. Justo después de Retención porque es la
            otra cara del mismo teléfono: aquí no se llama, se comprueba. */}
        <Sustituciones onContador={setNSustituciones} />

        {/* Comisiones por reclamar (descuadre, o liquidadas y sin llegar al banco pasado el plazo). */}
        <DescuadresComisiones onContador={setNDescuadres} onIr={cambiarSeccion} />

        {/* Pólizas que el cliente declaró de OTRA compañía y vencen pronto:
            la venta cruzada, con el teléfono en la mano en vez de un precio
            automático que la muestra no soporta (idea F del banco de ideas). */}
        <DeclaradasVencer onContador={setNDeclaradas} />

        <Bloque
          titulo="Renovaciones en plazo de preaviso"
          Icono={CalendarClock}
          sub="Las que aún se pueden mover: dentro del mes de preaviso el tomador ya no puede oponerse a la prórroga (LCS art. 22). La ventana completa de 90 días está en «Cartera»."
        >
          <Renovaciones datos={vencimientos} filtro="accionables" />
        </Bloque>

        {/* La pantalla de VENDER: los dos carriles (clientes y leads) con su
            seguimiento. Aquí solo el acceso: la lista vive en su página. */}
        <Link href="/correduria/vencimientos" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', minHeight: 44, borderRadius: 'var(--radius)', background: 'var(--primary-light)', color: 'var(--primary)', textDecoration: 'none' }}>
          <span style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Vencimientos · clientes y leads</span>
            <span style={{ fontSize: 13 }}>Próximos 90 días, por probabilidad de venta × prima, con su seguimiento</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>

        {/* Las pólizas que los clientes suben al portal y que NO lleva la casa.
            Va la última de «Hoy» a propósito: una renovación propia se PIERDE
            si no se atiende; un lead solo se aplaza un año. Pero está aquí y no
            en otra pestaña porque caduca igual — pasado el mes de preaviso el
            cliente ya no puede oponerse a la prórroga. */}
        <LeadsPortal onContador={setNLeads} />
      </div>

      {/* ══ CLIENTES ═════════════════════════════════════════════════════════
          El listado FILTRABLE de la cartera: filtrar por ramo, compañía,
          provincia, vencimiento o hueco de venta cruzada, y sacar la lista.
          Es la herramienta de trabajo; «Cartera» es la foto. */}
      <div role="tabpanel" aria-label="Clientes" className="corr-panel" style={panel('clientes')}>
        {montada('clientes') && <ContactosMovil />}
        {montada('clientes') && <ListaCartera onContador={setNClientes} />}

        {/* Leads del volcado sin vencimiento, con contacto, que hoy no son
            cliente vivo por CIMA: recaptarlos es venta, no mantenimiento de
            cartera, pero comparte pestaña con el listado de clientes porque
            ambos parten de la misma base y compiten por el mismo hueco de
            atención comercial. */}
        <Recaptacion onContador={setNRecaptacion} />

        {/* De los leads captados por apps/asegura-web, cuántos son hoy cartera
            viva. Sin contador: con 1 lead medido el 15/09/2026 es infraestructura
            de medición que necesita acumular datos, no un aviso accionable hoy
            (ver LeadsWebConversion.tsx). Movido de «Datos» aquí (20/09/2026):
            es un embudo COMERCIAL, no calidad de dato, y comparte pestaña con
            Recaptación por el mismo motivo que ella. */}
        {montada('clientes') && <LeadsWebConversion />}
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
        {montada('comisiones') && (<>
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
        <InformeMediacion año={año} />

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
        </>)}
      </div>

      {/* ══ MÁS ═══════════════════════════════════════════════════════════════
          Lo que no se trabaja a diario, en cuatro bloques con ancla (ver
          `BLOQUES_MAS`): la ingesta de CIMA (lo que urge ya sube a «Hoy» como
          tarjeta), lo que se va a publicar, la calidad del dato y lo que hacen
          los clientes en el portal. `?s=ingesta` y compañía bajan a su bloque. */}
      <div role="tabpanel" aria-label="Más" className="corr-panel" style={panel('mas')}>
        {/* El panel de la ingesta y el blog se montan siempre: la ingesta ya
            está leída arriba (alimenta la tarjeta de «Hoy») y el blog reporta
            el contador de «esperan tu OK». El resto espera a que se abra. */}
        <SubMas id="ingesta" Icono={Antenna} titulo="Ingesta de CIMA" primero />
        <PanelIngesta datos={ingesta} />

        <SubMas id="redes" Icono={Megaphone} titulo="Redes y blog" />
        <Blog onContador={setNBlog} />
        {montada('mas') && <Redes />}

        {montada('mas') && (<>
        <SubMas id="datos" Icono={TriangleAlert} titulo="Calidad del dato" />
        {/* Incidencias de calidad del dato (sin prima, DNI duplicado, vencida sin
            renovar, etc.): hallazgos medidos que el scanner detecta en la cartera
            en vigor. */}
        <Calidad onContador={setNCalidad} />

        {/* Pólizas duplicadas en la cartera viva (guardián Codeoscopic↔CIMA). */}
        <Duplicadas onContador={setNDuplicadas} />

        {/* Formación continua IDD: horas por persona y año; el contador sube con los atrasados. */}
        <Formacion onContador={setNFormacion} />
        <FichasIpid />
        <LineaBase />

        {/* El reverso de la cola de retención: los clientes de la cartera viva
            sin email ni teléfono. No hay nada que enviarles —el aviso de
            vencimiento se pierde y no pueden entrar al portal—, así que el
            trabajo es pedir el correo la próxima vez que se hable con ellos. */}
        <SinCanal onContador={setNSinCanal} />
        {/* Derecho de acceso (art. 15) y portabilidad (art. 20). Va en
            «Datos» y no en «Hoy» a propósito: no es una cola que se vacía —la
            petición llega por correo o por teléfono, no por una tabla— sino la
            herramienta para atenderla. Hasta hoy el puerto de asegura existía
            SIN consumidor: el derecho no lo podía ejercer nadie porque no
            había dónde atenderlo. El contador solo sube cuando un paquete sale
            INCOMPLETO (eso es trabajo: no se puede entregar así), y un fallo
            reporta `null`, nunca 0. */}
        <ExportRgpd onContador={setNExportRgpd} />

        {/* Directorio de contacto por compañía, minado del correo. Sin
            contador: es referencia, no trabajo pendiente. */}
        <Companias />

        {/* Qué compañías reconocidas nunca han avisado de un recibo por correo
            (20/09/2026). Sin contador: es radar, no trabajo pendiente. */}
        <RadarRecibos />

        {/* Qué hacen los clientes en el portal. Sin contador a propósito: no es
            una cola de trabajo (partes, supresiones y leads ya cuentan en «Hoy»). */}
        <SubMas id="actividad" Icono={Activity} titulo="Actividad de los clientes" />
        {verActividad
          ? <Actividad />
          : (
            <button type="button" onClick={() => setVerActividad(true)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, marginTop: 8 }}>
              Ver lo que han hecho los clientes en el portal
            </button>
          )}
        </>)}
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

// ── Rótulo de un bloque de «Más» ─────────────────────────────────────────────
// Lleva el ancla (`mas-<bloque>`) a la que bajan `?s=ingesta` y los botones de
// «Hoy». El `scrollMarginTop` deja sitio a la barra de secciones, que es
// pegajosa: sin él el rótulo quedaría tapado justo debajo de ella.
function SubMas({ id, titulo, Icono, primero = false }: {
  id: BloqueMas
  titulo: string
  Icono: typeof Antenna
  primero?: boolean
}) {
  return (
    <h2
      id={`mas-${id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, scrollMarginTop: 64,
        fontSize: 17, fontWeight: 700, color: 'var(--text)',
        margin: primero ? '0 0 4px' : '36px 0 4px',
      }}
    >
      <Icono size={18} strokeWidth={1.75} aria-hidden style={{ color: 'var(--primary)' }} />
      {titulo}
    </h2>
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

/**
 * Botón de la ficha de un movimiento del desglose.
 *
 * 🚨 Existe porque estos nueve botones estaban escritos a mano con
 * `padding:'5px 10px'` y sin `minHeight`: ~26px de alto, muy por debajo de los
 * **44px táctiles** que garantiza `btnStyle()` y que el resto del repo respeta.
 * Se reclasifica un movimiento con el pulgar y en el móvil, que es donde
 * trabaja Alberto — un objetivo de 26px se falla y se pulsa el de al lado.
 * `minHeight` sin padding vertical necesita el `inline-flex` + `center`, o el
 * texto se queda pegado arriba.
 */
function btnMini(tono: 'ok' | 'neutral' | 'plano' = 'neutral', activo = true): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, padding: tono === 'plano' ? '0 8px' : '0 12px',
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: activo ? 'pointer' : 'default', whiteSpace: 'nowrap',
  }
  if (tono === 'plano') return { ...base, border: 'none', background: 'none', color: 'var(--muted)', fontWeight: 400 }
  if (tono === 'ok') {
    return {
      ...base, border: '1px solid var(--positive)',
      background: activo ? 'var(--positive)' : 'var(--surface)',
      color: activo ? '#fff' : 'var(--muted)',
    }
  }
  return { ...base, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }
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
                          style={btnMini('neutral')}>
                          {c}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input value={otra} onChange={e => setOtra(e.target.value)} placeholder="Otra compañía…"
                        style={{ padding: '0 10px', minHeight: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 16, flex: '1 1 160px', minWidth: 0 }} />
                      <button disabled={busy === m.id || !otra.trim()} onClick={() => confirmar(m.id, otra.trim())}
                        style={btnMini('ok', !!otra.trim())}>
                        Usar
                      </button>
                      <button disabled={busy === m.id} onClick={() => confirmar(m.id, null)}
                        style={btnMini('neutral')}>
                        No lo sé
                      </button>
                      <button onClick={() => { setPicker(null); setOtra('') }} style={btnMini('plano')}>cancelar</button>
                    </div>
                  </div>
                ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!m.confirmado ? (
                    <button disabled={busy === m.id} onClick={() => { setPicker(m.id); setOtra('') }}
                      style={btnMini('ok')}>
                      Es de seguros · elegir compañía
                    </button>
                  ) : (
                    <button disabled={busy === m.id} onClick={() => { setPicker(m.id); setOtra('') }}
                      style={btnMini('neutral')}>
                      {m.compania === COMPANIA_OTRAS ? 'Asignar compañía' : 'Cambiar compañía'}
                    </button>
                  )}
                  {reclasif === m.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Mover a:</span>
                      {DESTINOS_RECLASIF.map(d => (
                        <button key={d.v} disabled={busy === m.id} onClick={() => reclasificar(m.id, d.v)}
                          style={btnMini('neutral')}>
                          {d.label}
                        </button>
                      ))}
                      <button onClick={() => setReclasif(null)} style={btnMini('plano')}>cancelar</button>
                    </span>
                  ) : (
                    <button disabled={busy === m.id} onClick={() => setReclasif(m.id)}
                      style={btnMini('neutral')}>
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
