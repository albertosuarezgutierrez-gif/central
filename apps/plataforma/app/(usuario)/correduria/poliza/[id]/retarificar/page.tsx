import Link from 'next/link'
import { polizaAsegura } from '@/lib/poliza-asegura'
import {
  catalogoAsegura,
  precalificacionAsegura,
  type Precalificacion,
  type RespuestaCatalogo,
  type RespuestaPrecalificacion,
} from '@/lib/retarificar-asegura'
import { urlRetarificarHogarAsegura } from '@/lib/ficha-asegura'
import Retarificador, { ValorSupuesto } from './retarificador'

export const dynamic = 'force-dynamic'

/**
 * ⏱️ La cotización del vendor puede tardar **hasta 150 s** (límite documentado
 * por Codeoscopic). Este `maxDuration` cubre a las acciones de servidor de
 * `./acciones.ts`, que corren dentro del segmento de ruta de esta página. Sin
 * él, plataforma cortaría a los 15 s por defecto y nos quedaríamos sin saber si
 * nos han cobrado — que es justo el estado más caro. Va por delante del timeout
 * del cliente del puerto (170 s) para que el que corte sea aquel, que sabe
 * redactar la duda.
 */
export const maxDuration = 180

/**
 * **Retarificar, DENTRO de `/correduria`.**
 *
 * Hasta el 03/09/2026 esto era un enlace ↗ a `apps/asegura`, que es otro dominio
 * con otra sesión: en producción, `GET /cartera/poliza/9588dad8-… → 307 /login`.
 * Alberto trabaja en una sola pantalla, así que la operación se sirve por el
 * puerto de operador y se pinta aquí. `apps/asegura` sigue siendo la trastienda:
 * tiene la cartera y es la única que habla con Codeoscopic.
 */
export default async function RetarificarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await polizaAsegura(id)

  if (r.estado !== 'ok') {
    return (
      <Marco>
        <Cabecera sub="" />
        <div className="card err">
          No se ha podido leer la póliza en asegura, así que no se puede cotizar nada.{' '}
          {r.estado === 'no_encontrado'
            ? 'La póliza no está en la cartera de esta correduría.'
            : 'Esto NO significa que la póliza no exista: no se ha podido mirar.'}
        </div>
      </Marco>
    )
  }

  const p = r.poliza
  const cancelada = p.estado === 'cancelada'
  const ramo = p.retarificacion?.ramo ?? null
  const sub = `${p.cliente.nombre} · ${p.aseguradora}${p.numeroPoliza ? ` · nº ${p.numeroPoliza}` : ''}`

  // ── Las puertas, en el mismo orden que las aplica asegura ────────────────
  if (cancelada) {
    return (
      <Marco>
        <Cabecera sub={sub} polizaId={p.id} />
        <div className="card">
          <h2>Esta póliza está cancelada en CIMA</h2>
          <p>No hay nada que retarificar.</p>
        </div>
      </Marco>
    )
  }
  if (!p.retarificable || ramo === null) {
    return (
      <Marco>
        <Cabecera sub={sub} polizaId={p.id} />
        <div className="card">
          <h2>Esta póliza no se puede retarificar todavía</h2>
          <p>
            {p.retarificacion?.motivo ??
              'Hoy solo se retarifican auto y hogar, y no consta que esta sea de ninguno de los dos.'}
          </p>
        </div>
      </Marco>
    )
  }

  // 🚨 Hogar TODAVÍA no está portado a plataforma: su retarificador es otro
  // componente (pide m², año, capitales y Catastro). No se inventa una pantalla
  // a medias ni se finge que no se puede — se manda al sitio donde SÍ funciona,
  // que es lo que había antes de este cambio. Lo demás de la correduría ya no
  // sale de aquí.
  if (ramo === 'hogar') {
    return (
      <Marco>
        <Cabecera sub={sub} polizaId={p.id} />
        <div className="card">
          <h2>Hogar se sigue retarificando en asegura</h2>
          <p>
            La pantalla de hogar pide datos que esta todavía no sabe pedir (metros, año de
            construcción, capitales y el Catastro del riesgo). Está{' '}
            <strong>pendiente de traer</strong>: hasta entonces se hace allí.
          </p>
          <p className="muted">
            Es otro dominio, así que puede pedirte la contraseña de asegura.
          </p>
          <p>
            <a
              href={urlRetarificarHogarAsegura(p.id)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontWeight: 700 }}
            >
              Retarificar hogar en asegura ↗
            </a>
          </p>
        </div>
      </Marco>
    )
  }

  // ── AUTO ─────────────────────────────────────────────────────────────────
  //
  // Los dos catálogos que no dependen de ningún dato del tomador se bajan aquí
  // (son gratis y así el primer render ya los tiene). Marcas, modelos, motores y
  // versiones los pide el componente según va eligiendo el corredor.
  //
  // La precalificación va con ellos, en paralelo: las tres son lecturas GRATIS
  // al otro lado (corren con el interruptor de tarificación apagado). Es la que
  // trae marca y modelo preseleccionados, la fecha de matriculación, el
  // municipio ya resuelto, el estado civil, los supuestos y el veredicto del tope.
  const [garajes, civiles, precal] = await Promise.all([
    catalogoAsegura({ tipo: 'garajes' }),
    catalogoAsegura({ tipo: 'estados-civiles' }),
    precalificacionAsegura(p.id),
  ])

  // 🚨 `null` = la precalificación no ha llegado. NO se sustituye por un objeto
  // a ceros: `faltan: []` diría «revisado y no falta nada» y encendería el botón
  // que cuesta 0,50€; `municipios: []` diría «el tomador no tiene municipio».
  const pre: Precalificacion | null = precal.estado === 'ok' ? precal.pre : null
  const falloPre = pre === null ? explicarPrecalificacion(precal) : null

  // 🚨 Sin catálogos NO hay ids válidos que mandar, así que no se puede cotizar.
  // Se dice con el motivo del puerto: «no se ha podido leer» y «no está
  // configurado» se arreglan en sitios distintos.
  const falla = fallaCatalogos(garajes, civiles)

  return (
    <Marco>
      <Cabecera sub={`${sub} · auto`} polizaId={p.id} />

      {falla && <div className="card err">{falla}</div>}

      {/* 🚨 Si la precalificación falla se DICE. Lo que no se puede hacer es
          pintar la pantalla como si la ficha no tuviera datos: la póliza sí
          trae marca, modelo y código postal — lo que ha fallado es mirarlos. */}
      {falloPre && <div className="card err">{falloPre}</div>}

      <div className="card">
        <h2>Lo que se manda desde la ficha</h2>
        <p className="muted">
          Se pide precio como si se cambiara de compañía: la póliza actual pasa a ser la
          «anterior», que es lo que da la antigüedad y el bonus. Eso lo compone asegura con la
          ficha; aquí solo se eligen los datos que la ficha no trae.
        </p>
        <div className="table-wrap">
          <table>
            <tbody>
              <Fila etiqueta="Compañía actual (código DGS)" valor={p.codigoEntidadDgs} />
              <Fila etiqueta="Póliza anterior" valor={p.numeroPoliza} />
              <Fila etiqueta="Asegurado desde" valor={p.fechaEfectoInicial} />
              <Fila etiqueta="Vencimiento actual" valor={p.fechaVencimiento} />
              <Fila
                etiqueta="Fecha de matriculación"
                valor={pre?.fechaMatriculacion ?? null}
                nota={pre?.notaMatricula ?? null}
              />
            </tbody>
          </table>
        </div>
      </div>

      <Supuestos supuestos={pre?.supuestos ?? []} />

      <Retarificador
        polizaId={p.id}
        // 🚨 `null`, no `[]`. Sin precalificación NO se ha revisado qué falta, y
        // `[]` diría «se ha revisado y no falta nada», que es lo contrario. Los
        // huecos los canta entonces el 422 del servidor, que corta antes de gastar.
        faltanInicial={pre?.faltan ?? null}
        garajes={garajes.estado === 'ok' ? garajes.opciones : []}
        civiles={civiles.estado === 'ok' ? civiles.opciones : []}
        // 🔒 Ya resueltos por asegura desde el CP de la ficha. El CP no cruza el
        // puerto (dato personal); el id de municipio del catálogo del vendor, sí.
        municipios={pre?.municipios ?? null}
        municipiosMotivo={pre?.municipiosMotivo ?? falloPre}
        estadoCivilAuto={pre?.estadoCivil ?? null}
        fechaMatriculacion={pre?.fechaMatriculacion ?? null}
        // Ver el tipo `VehiculoConocido`: `null` = no se ha podido mirar.
        vehiculo={pre?.vehiculo ?? null}
        consumo={
          pre?.consumo ?? {
            estado: 'no_disponible',
            porque:
              'la precalificación de asegura no ha llegado, así que desde aquí no se sabe cuántas cotizaciones quedan hoy.',
          }
        }
        // El interruptor de simulación vive en el entorno de asegura y lo publica
        // el puerto. Si no se ha podido preguntar va `false`: la duda sobre el
        // dinero se resuelve hacia «esto CUESTA». Y lo que decide de verdad si un
        // precio es simulado sigue siendo el campo `simulado` de la RESPUESTA.
        simulacion={pre?.simulacion ?? false}
        deshabilitado={falla !== null}
      />
    </Marco>
  )
}

/**
 * Por qué no hay precalificación, en la frase que dice DÓNDE mirar.
 *
 * Nunca se degrada a «la ficha no tiene datos»: la póliza sí trae marca, modelo
 * y código postal — lo que ha fallado es leerlos. El corredor puede seguir
 * eligiendo a mano en el catálogo (que es gratis), y eso se dice.
 */
function explicarPrecalificacion(r: RespuestaPrecalificacion): string {
  const cola =
    ' Puedes seguir: elige marca, modelo, versión y municipio abajo (el catálogo es gratis). ' +
    'Lo que NO se sabe desde aquí es qué datos faltan, así que el botón se apoya en la ' +
    'comprobación del servidor, que corta antes de gastar.'
  if (r.estado === 'sin_configurar') {
    return `No se ha podido precalificar la póliza: ${r.mensaje}${cola}`
  }
  if (r.estado === 'error') {
    return `No se han podido leer los datos de la póliza en asegura: ${r.mensaje}${cola}`
  }
  // No debería llegar aquí (`ok` tiene precalificación), pero un «no lo sé» se
  // dice igual antes que callarse.
  return `No se ha podido precalificar la póliza.${cola}`
}

/**
 * Lo que se ha SUPUESTO para poder pedir precio. Va ANTES del botón a propósito:
 * es la letra pequeña de la cifra, y verla después no sirve de nada.
 */
function Supuestos({
  supuestos,
}: {
  supuestos: Array<{ campo: string; valor: unknown; porque: string; optimista?: boolean; oculto?: boolean }>
}) {
  if (supuestos.length === 0) return null
  return (
    <div className="card">
      <h2>⚠️ Lo que se ha supuesto</h2>
      <p className="muted">
        Ninguno de estos datos está en la ficha. El precio sale con ellos, así que forman parte de
        la letra pequeña: si alguno no es cierto, la prima real cambia.
      </p>
      <ul>
        {supuestos.map((s, i) => (
          <li key={`${s.campo}-${String(s.valor)}-${i}`}>
            <ValorSupuesto s={s} /> — {s.porque}
            {s.optimista && (
              <>
                {' '}
                <span className="badge warn">puede abaratar el precio</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** El motivo por el que no se puede cotizar, o `null` si se puede. */
function fallaCatalogos(garajes: RespuestaCatalogo, civiles: RespuestaCatalogo): string | null {
  const malos = [garajes, civiles].filter(
    (c): c is Exclude<RespuestaCatalogo, { estado: 'ok' }> => c.estado !== 'ok',
  )
  if (malos.length === 0) return null
  const detalle = malos.map((c) => c.mensaje).join(' ')
  // «No está configurado» y «no se ha podido leer» se arreglan en sitios
  // distintos, así que no comparten mensaje.
  if (malos.some((c) => c.estado === 'sin_configurar')) {
    return `Codeoscopic no está configurado al otro lado, así que no hay catálogos ni se puede cotizar. ${detalle}`
  }
  return (
    'No se han podido leer los catálogos de Codeoscopic. Sin ellos no hay ids válidos que mandar, ' +
    `así que no se puede cotizar todavía. Esto no es un problema de la ficha: ${detalle}`
  )
}

function Cabecera({ sub, polizaId }: { sub: string; polizaId?: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/correduria">← Correduría</Link>
        {polizaId && (
          <>
            <span>·</span>
            <Link href={`/correduria/poliza/${polizaId}`}>Ficha de la póliza</Link>
          </>
        )}
      </div>
      <h1 style={{ fontSize: 20, margin: '4px 0 2px' }}>Retarificar</h1>
      {sub && <p className="muted" style={{ margin: 0 }}>{sub}</p>}
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string
  valor: string | null
  /** La letra pequeña del dato: de dónde sale, o por qué no está. */
  nota?: string | null
}) {
  return (
    <tr>
      <th style={{ width: '46%' }}>{etiqueta}</th>
      {/* 🚨 `null` es «la ficha no lo trae», no un cero ni una cadena vacía. */}
      <td>
        {valor ?? <span className="muted">sin dato</span>}
        {nota && (
          <>
            <br />
            <span className="muted" style={{ fontSize: 12, whiteSpace: 'normal' }}>
              {nota}
            </span>
          </>
        )}
      </td>
    </tr>
  )
}

/**
 * El marco de la pantalla, con **el CSS que el retarificador da por supuesto**.
 *
 * El componente se trajo de `apps/asegura` tal cual (tres pasos, combustible
 * antes de versión, banners, badges) y esas clases —`.card`, `.muted`, `.err`,
 * `.badge`, `.form-grid`, `.table-wrap`, `button.primary`— viven en el
 * `globals.css` de asegura, que aquí no existe: sin esto la pantalla se pinta
 * como una lista sin formato. Se declaran ACOTADAS a este contenedor y sobre los
 * tokens de plataforma (`--surface`, `--muted`, `--positive`…), así que la
 * pantalla sigue el tema claro/oscuro del panel y no se toca `globals.css`, que
 * es de todos.
 *
 * 📱 Móvil: el `minmax(0, 1fr)` del grid NO es decorativo (mismo caso que la
 * ficha de póliza) — sin él la pista implícita se dimensiona con su contenido
 * más ancho, la tabla de precios (que declara `min-width`) arrastra la página
 * entera fuera de la pantalla y anula su propio `overflow-x` envolvente.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px 48px' }}>
      <style>{CSS_RETARIFICADOR}</style>
      <div
        className="retarificar"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}
      >
        {children}
      </div>
    </main>
  )
}

const CSS_RETARIFICADOR = `
.retarificar {
  --brand: var(--primary);
  --brand-soft: var(--primary-light);
  --panel: var(--surface);
  --panel2: var(--bg);
  --ok: var(--positive);
  --warn: var(--warning);
  --danger: var(--negative);
}
.retarificar .card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.retarificar .muted { color: var(--muted); }
.retarificar h1 { font-size: 20px; margin: 0 0 4px; }
.retarificar h2 { font-size: 16px; margin: 0 0 8px; }
.retarificar h3 { font-size: 14px; margin: 0 0 6px; }
.retarificar .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.retarificar table { width: 100%; border-collapse: collapse; min-width: 520px; }
.retarificar th, .retarificar td {
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.retarificar th {
  color: var(--muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .03em;
}
.retarificar .badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--brand-soft);
  color: var(--brand);
}
.retarificar .badge.ok { background: var(--positive-bg); color: var(--ok); }
.retarificar .badge.warn { background: var(--warning-bg); color: var(--warn); }
.retarificar .badge.danger { background: var(--negative-bg); color: var(--danger); }
.retarificar label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 4px;
}
.retarificar input, .retarificar select, .retarificar textarea, .retarificar button { font: inherit; }
.retarificar input, .retarificar select, .retarificar textarea {
  width: 100%;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
/* 160px de mínimo: por debajo de 360px de viewport una sola columna, que es lo
   que hace falta en el móvil de Alberto. */
.retarificar .form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.retarificar button.primary {
  padding: 10px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  min-height: 44px;
}
.retarificar button.primary:disabled { opacity: .6; cursor: default; }
.retarificar button.ghost {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}
.retarificar .err {
  background: var(--negative-bg);
  color: var(--danger);
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}
.retarificar a { color: var(--primary); }
`
