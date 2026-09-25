'use client'

// El panel de EMISIÓN REAL, construido el 11/09/2026 sobre el caso de Pilar
// Franco Ruz. Sustituye a la maqueta `preemision-mock.tsx` (borrada): esto SÍ
// llama a Codeoscopic, dos veces.
//
// 🚨 SIN SANDBOX y sin fixture del fabricante para las dos llamadas de aquí
// detrás (ReRate y Submit) — ver `apps/asegura/lib/codeoscopic/emitir.ts`.
// Por eso el paso 2 (los «campos adicionales») es un JSON en bruto y no un
// formulario bonito por compañía: los nombres de esos campos NO están
// confirmados contra el fabricante, y un formulario con etiquetas inventadas
// prometería un contrato que no existe. Lo que SÍ hace el paso 2 es mostrar,
// literalmente, la lista que el propio vendor dice que le falta (`faltan` +
// `campos`, servidos por `GET .../policy-application-fields`) para que se
// puedan rellenar con esos nombres exactos, no con una suposición.
//
// Dos pasos, cada uno con su propia confirmación — nunca uno solo que
// encadene las dos llamadas: el coste/compromiso de cada una es distinto y
// ninguna de las dos se puede deshacer sola.

import { useEffect, useRef, useState } from 'react'
import { eur } from '@/lib/dinero'
import { pedirOferta, pedirEmision, pedirCatalogo, pedirCoberturas } from './acciones'
import type { RespuestaCoberturas } from '@/lib/retarificar-asegura'
import { ProductFormWidget } from './ProductFormWidget'
import type { AvisoCuenta, CuentaConocida, Opcion, SolicitudEmisionVista } from '@/lib/retarificar-asegura'
import { fechaEs } from '@/lib/ficha-asegura'

type EstadoPanel =
  | { paso: 'inicio' }
  | { paso: 'confirmando' }
  | {
      paso: 'oferta'
      offerId: string
      primaEur: number | null
      firmeza: string
      caducaEn: string | null
      avisos: string[]
      // El `projectId` que hace falta para el Submit lo devuelve `pedirOferta`.
      projectId: string
      // La cuenta de cargo que asegura YA conoce del cliente, enmascarada. Se
      // enseña ANTES de emitir y no viaja sin confirmarla (Alberto, 12/09/2026).
      cuenta: CuentaConocida | null
      cuentaAviso: AvisoCuenta | null
      /** El `mainQuote` del vendor, sin parsear — lo pinta el widget de la
       *  Product Form Library (`ProductFormWidget`). `null` = asegura no lo
       *  trajo (respuesta vieja, o el vendor no lo devolvió). */
      quoteCrudo: unknown
    }
  | { paso: 'emitiendo' }
  | {
      paso: 'faltan_campos'
      faltan: string[]
      campos: unknown
      projectId: string
      mensaje: string | null
      cuenta: CuentaConocida | null
      cuentaAviso: AvisoCuenta | null
    }
  /**
   * La compañía pide, al confirmar el precio, un dato que el proyecto no tiene y
   * la ficha tampoco (12/09/2026). No es un error: son huecos que se teclean
   * aquí y asegura escribe en el proyecto (gratis) antes de repetir el ReRate.
   */
  | {
      paso: 'faltan_vendor'
      faltan: { campo: string; motivo: string }[]
      sugeridos: Record<string, string>
      noReconocidos: string[]
      mensaje: string
    }
  | { paso: 'emitido'; referenciaVendor: string | null; cuenta: CuentaConocida | null }
  | { paso: 'emitido_sin_acunar'; mensaje: string }
  /**
   * El último Submit acabó en 5xx o corte de red («quizá emitido», 13/09/2026,
   * proyecto 40685793): asegura no reenvía a ciegas. Se enseña el proyecto tal
   * cual lo devuelve el vendor (gratis) y el corredor decide, mirándolo y Avant2.
   */
  | {
      paso: 'reintento_sin_confirmar'
      mensaje: string
      ultimoError: string | null
      consejo: string | null
      /** `policyApplications[]` tal cual las documenta el portal (con veredicto). */
      solicitudes: SolicitudEmisionVista[]
      /** No vacío = el proyecto YA cuenta una solicitud de emisión. */
      rastro: unknown[]
      proyectoLegible: boolean
      crudo: unknown
      projectId: string
      cuenta: CuentaConocida | null
      cuentaAviso: AvisoCuenta | null
    }
  /**
   * La compañía pide, al confirmar el precio, un campo de SU FORMULARIO
   * (`product.options` del ReRate: vehículo/producto, no la persona) que el
   * proyecto no trae — visto real con Occident (leasing/renting, tipo de
   * adquisición). DISTINTO de `faltan_vendor`: aquí no hay un valor suelto
   * que teclear, se ofrece el Product Form Library del vendor
   * (`ProductFormWidget`) montado sobre el `quoteCrudo` de ESTE precio
   * (antes de que exista ninguna oferta confirmada).
   */
  | { paso: 'faltan_producto'; campos: string[]; quoteCrudo: unknown; mensaje: string }
  /** `reintento`: con qué volver a llamar a asegura (sin confirmar) para que
   *  enseñe el estado del proyecto en vez de mandar al ReRate. */
  | {
      paso: 'error'
      mensaje: string
      quizaEmitido?: boolean
      consejo?: string
      reintento?: { projectId: string; cuenta: CuentaConocida | null; cuentaAviso: AvisoCuenta | null }
    }

function euroODash(n: number | null): string {
  return n === null || !Number.isFinite(n) ? '—' : eur(n)
}

/**
 * Cómo se llama cada hueco en castellano. Un campo que no esté aquí se pinta
 * con su nombre técnico: mejor feo que invisible. Los valores nunca se
 * suponen — se teclean, o vienen `sugeridos` de la ficha para comprobar.
 */
const ETIQUETAS_HUECO: Record<string, { etiqueta: string; tipo: string; pista?: string }> = {
  nombreVia: { etiqueta: 'Calle (nombre de la vía)', tipo: 'text', pista: 'Solo el nombre: «San Vicente», sin número ni piso' },
  numeroVia: { etiqueta: 'Número de la calle', tipo: 'text' },
  tipoVia: { etiqueta: 'Tipo de vía', tipo: 'text' },
  cpResidencia: { etiqueta: 'Código postal de residencia', tipo: 'text' },
  municipioResidenciaId: { etiqueta: 'Municipio (id del catálogo)', tipo: 'text' },
  dni: { etiqueta: 'DNI/NIE', tipo: 'text' },
  nombre: { etiqueta: 'Nombre', tipo: 'text' },
  apellido1: { etiqueta: 'Primer apellido', tipo: 'text' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', tipo: 'date' },
  sexo: { etiqueta: 'Sexo (hombre/mujer)', tipo: 'text' },
  estadoCivil: { etiqueta: 'Estado civil', tipo: 'text' },
  telefono: { etiqueta: 'Teléfono móvil', tipo: 'tel' },
  fechaCarnet: { etiqueta: 'Fecha del carnet de conducir', tipo: 'date' },
  email: { etiqueta: 'Email', tipo: 'email' },
}

/**
 * Campos de `faltan_vendor` que son referencia de CATÁLOGO del vendor
 * (`GET /<tipo>`, gratis, sin parámetros) y no texto libre: se piden UNA vez
 * y se pintan como desplegable por nombre — el valor que viaja sigue siendo
 * el id real del catálogo. `municipioResidenciaId` se queda fuera a
 * propósito: su catálogo (`municipios`) exige un CP que esta pantalla no
 * pide (es un dato personal del tomador, ver el comentario de `municipioId`
 * más abajo), así que no se puede resolver con el mismo mecanismo.
 */
const CATALOGO_DE_CAMPO: Record<string, string> = {
  tipoVia: 'vias',
  estadoCivil: 'estados-civiles',
}

/**
 * Con cuenta conocida, emitir exige haberla confirmado O haber tecleado otra;
 * sin cuenta conocida no hay nada que confirmar (si la compañía la exige, su
 * 400 vuelve como hueco y entonces sí se teclea). PURO, para poder verlo fallar.
 */
function cuentaDecidida(cuenta: CuentaConocida | null, cuentaOk: boolean, iban: string): boolean {
  if (iban.trim() !== '') return true
  if (cuenta === null) return true
  return cuentaOk
}

/**
 * La cuenta de cargo del recibo. 🚨 «iban importante siempre confirmar»
 * (Alberto, 12/09/2026): la que la ficha ya conoce se pinta ENMASCARADA con su
 * origen y una casilla que el corredor marca a mano; la caja de texto es para
 * usar otra. Nada se preselecciona: un checkbox marcado por defecto no es una
 * confirmación, es la misma sorpresa con un clic menos.
 */
function CuentaCargo({
  cuenta,
  aviso,
  obligatoria,
  cuentaOk,
  onCuentaOk,
  iban,
  onIban,
}: {
  cuenta: CuentaConocida | null
  aviso: AvisoCuenta | null
  obligatoria: boolean
  cuentaOk: boolean
  onCuentaOk: (v: boolean) => void
  iban: string
  onIban: (v: string) => void
}) {
  const otra = iban.trim() !== ''
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
      <span style={{ fontWeight: 600 }}>Cuenta de cargo del recibo</span>
      {cuenta ? (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cuentaOk && !otra}
            disabled={otra}
            onChange={(e) => onCuentaOk(e.target.checked)}
            style={{ width: 22, height: 22, marginTop: 2, flex: '0 0 auto' }}
          />
          <span>
            Confirmo que el recibo se domicilie en <code style={{ fontSize: 14 }}>{cuenta.enmascarada}</code>
            {cuenta.descripcion && <span className="muted"> — {cuenta.descripcion}</span>}
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              Solo se enseñan país y últimos cuatro dígitos; asegura no manda esta cuenta sin esta casilla.
            </span>
          </span>
        </label>
      ) : aviso === 'ilegible' ? (
        <p className="err" style={{ margin: 0, fontSize: 12 }}>
          La ficha TIENE una cuenta guardada pero central-asegura no la puede descifrar (clave PII): revisa la
          clave en Vercel, o tecléala aquí.
        </p>
      ) : aviso === 'invalida' ? (
        <p className="err" style={{ margin: 0, fontSize: 12 }}>
          La ficha tiene una cuenta guardada que no es un IBAN válido (CCC antiguo o errata): tecléala aquí.
        </p>
      ) : aviso === 'no_comprobada' ? (
        <p className="err" style={{ margin: 0, fontSize: 12 }}>
          No se ha podido leer la ficha para buscar la cuenta (fallo de consulta en asegura): no es que no la
          tenga. Vuelve a confirmar el precio para reintentar, o tecléala aquí.
        </p>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {obligatoria
            ? 'Ni la póliza ni la ficha del cliente tienen cuenta: tecléala.'
            : 'Ni la póliza ni la ficha del cliente tienen cuenta. Si la compañía la exige para esta forma de pago, se pedirá aquí.'}
        </p>
      )}
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>{cuenta ? 'O usar otra cuenta (IBAN):' : 'IBAN:'}</span>
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="ES00 0000 0000 0000 0000 0000"
          value={iban}
          onChange={(e) => onIban(e.target.value)}
          style={{ width: '100%', minHeight: 44, boxSizing: 'border-box', fontFamily: 'monospace' }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          asegura comprueba los dígitos de control antes de mandarla; no se guarda en la ficha todavía.
        </span>
      </label>
    </div>
  )
}

/**
 * Coberturas de la oferta confirmada, bajo demanda (25/09/2026). Gratis: es una
 * lectura en el vendor. `incluida: null` NO es «no incluida»: el vendor dice que
 * entonces hay que leer el texto, así que se pinta «ver detalle», nunca ✗.
 */
export function CoberturasOferta({ projectId, offerId }: { projectId: string; offerId: string }) {
  const [r, setR] = useState<RespuestaCoberturas | 'cargando' | null>(null)
  async function cargar() {
    setR('cargando')
    try {
      setR(await pedirCoberturas(projectId, offerId))
    } catch (e) {
      // Un fallo de red en la acción no puede dejar el panel en «Leyendo…» para siempre.
      setR({ estado: 'error', mensaje: `No se han podido leer las coberturas (${e instanceof Error ? e.message : String(e)}).` })
    }
  }
  if (r === null) {
    return (
      <button type="button" onClick={cargar} style={{ minHeight: 44, marginTop: 6 }}>
        Ver coberturas de esta oferta
      </button>
    )
  }
  if (r === 'cargando') return <p className="muted">Leyendo coberturas…</p>
  if (r.estado === 'error') {
    return (
      <p className="err">
        {r.mensaje}{' '}
        <button type="button" onClick={cargar} style={{ minHeight: 44 }}>
          Reintentar
        </button>
      </p>
    )
  }
  if (r.coberturas.length === 0) {
    return <p className="muted">La compañía no ha devuelto ninguna cobertura para esta oferta.</p>
  }
  return (
    <details open style={{ marginTop: 6 }}>
      <summary>Coberturas ({r.coberturas.length})</summary>
      <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
        {r.coberturas.map((c, i) => (
          <li key={i} style={{ overflowWrap: 'anywhere' }}>
            <span aria-hidden>{c.incluida === true ? '✅ ' : c.incluida === false ? '❌ ' : 'ℹ️ '}</span>
            <strong>{c.nombre}</strong>
            {c.incluida === null && !c.texto && <span className="muted"> — sin detalle del vendor</span>}
            {c.texto && <span className="muted"> — {c.texto}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function Emision({
  tarificacionId,
  compania,
  categoria,
  primaEur,
  producto = null,
  fechaEfecto = null,
  onCerrar,
}: {
  tarificacionId: string
  compania: string
  categoria: string
  primaEur: number | null
  /** Producto de la fila pulsada: con varios precios de la misma compañía y nivel
   *  (Reale llegó a 8), asegura desempata por producto y prima (25/09/2026). */
  producto?: string | null
  /** Fecha de efecto con la que se cotizó (aaaa-mm-dd). Arranca el campo de fecha. */
  fechaEfecto?: string | null
  onCerrar: () => void
}) {
  const [estado, setEstado] = useState<EstadoPanel>({ paso: 'inicio' })
  // 📅 25/09/2026: la fecha de efecto se confirma AQUÍ, antes del precio, y viaja
  // en el ReRate (`mainQuote.effectiveDate`) solo si cambia respecto a la cotizada
  // o si ya ha pasado: así se rescata una cotización caducada sin otro 0,50€.
  const [fecha, setFecha] = useState(fechaEfecto ?? '')
  const [camposJson, setCamposJson] = useState('{}')
  // Lo que el corredor teclea para los huecos de `faltan_vendor` (campo → valor).
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({})
  // La cuenta bancaria del Submit (12/09/2026): la compañía la exige según forma
  // de pago. Si la ficha ya la tiene, se enseña enmascarada y el corredor la
  // CONFIRMA (`cuentaOk`) o teclea otra (`iban`); asegura la pone en
  // `payment.bankAccount.iban`. Nunca se inventa ni viaja sin confirmar.
  const [iban, setIban] = useState('')
  const [cuentaOk, setCuentaOk] = useState(false)
  // 17/09/2026: Alberto — `insuredFamilyInAllianz` no es un consentimiento a
  // secas, lleva descuento (bonificación de cartera). Por defecto sigue en
  // `false` en asegura (no se inventa un ahorro sin comprobarlo); esta caja
  // es la única forma de decirlo cuando el corredor SÍ lo sabe.
  const [familiaAllianz, setFamiliaAllianz] = useState(false)
  const esAllianz = compania.trim().toLowerCase().includes('allianz')
  // Lo que el corredor ha guardado del widget de la Product Form Library (el
  // formulario REAL de la compañía, ver `ProductFormWidget`). `null` mientras
  // no se pulse «Guardar»: sin esto no se manda ningún `product.options`
  // inventado — se deja que `conProductoPorDefecto` (asegura) decida, igual
  // que hasta ahora.
  const [productOptions, setProductOptions] = useState<unknown[] | null>(null)
  const [avisoProductForm, setAvisoProductForm] = useState<string | null>(null)
  // Lo mismo que arriba, pero para el paso ANTERIOR (`faltan_producto` del
  // ReRate) — estados separados porque son dos formularios de la Product
  // Form Library sobre dos `quote` distintos (antes y después de confirmar
  // el precio) y no se pueden confundir.
  const [productOptionsRerate, setProductOptionsRerate] = useState<unknown[] | null>(null)
  const [avisoProductFormRerate, setAvisoProductFormRerate] = useState<string | null>(null)

  // Catálogos de `faltan_vendor` (ver `CATALOGO_DE_CAMPO`): se piden UNA vez
  // por campo —gratis, con el interruptor apagado— y se pintan como
  // desplegable por NOMBRE; lo que viaja en `correcciones[campo]` sigue
  // siendo el id real del catálogo, nunca el nombre.
  type CatalogoEstado =
    | { paso: 'cargando' }
    | { paso: 'ok'; opciones: Opcion[] }
    /** `sin_configurar` es permanente (falta un secreto en el servidor): reintentar
     *  no lo arregla solo, así que se dice tal cual en vez de invitar a un botón
     *  «reintenta» que nunca va a funcionar. `error` sí es reintentable (red,
     *  asegura caída) y lleva su propio botón. */
    | { paso: 'sin_configurar'; mensaje: string }
    | { paso: 'error'; mensaje: string }
  const [catalogos, setCatalogos] = useState<Record<string, CatalogoEstado>>({})
  // `solicitados` vive en un ref, NO en estado: si estuviera en estado, marcar
  // un campo como "ya pedido" cambiaría la dependencia del efecto de abajo y
  // lo relanzaría a mitad del `await` — cancelando (`vivo=false`) la propia
  // petición que acaba de empezar antes de que el vendor responda, y el
  // desplegable se queda en «Cargando…» para siempre. Un ref no dispara render.
  const solicitados = useRef<Set<string>>(new Set())
  const vivoRef = useRef(true)
  useEffect(() => () => {
    vivoRef.current = false
  }, [])

  /** Pide UN catálogo y actualiza su estado. La usan el efecto de abajo (uno
   *  por campo pendiente, en paralelo) y el botón «Reintentar». */
  async function pedirCatalogoCampo(campo: string) {
    const tipo = CATALOGO_DE_CAMPO[campo]
    if (!tipo) return
    solicitados.current.add(campo)
    setCatalogos((prev) => ({ ...prev, [campo]: { paso: 'cargando' } }))
    const r = await pedirCatalogo({ tipo })
    if (!vivoRef.current) return
    setCatalogos((prev) => ({
      ...prev,
      [campo]: r.estado === 'ok' ? { paso: 'ok', opciones: r.opciones } : { paso: r.estado, mensaje: r.mensaje },
    }))
  }

  useEffect(() => {
    if (estado.paso !== 'faltan_vendor') return
    const pendientes = estado.faltan
      .map((f) => f.campo)
      .filter((campo): campo is string => campo in CATALOGO_DE_CAMPO && !solicitados.current.has(campo))
    for (const campo of pendientes) void pedirCatalogoCampo(campo)
  }, [estado])

  async function confirmarPrecio(conCorrecciones?: Record<string, string>, conProductOptions?: unknown[]) {
    setEstado({ paso: 'confirmando' })
    const limpias = Object.fromEntries(
      Object.entries(conCorrecciones ?? {}).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
    )
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
    const fechaNueva = fecha && (fecha !== fechaEfecto || (fechaEfecto != null && fechaEfecto < hoy)) ? fecha : undefined
    const r = await pedirOferta({
      tarificacionId,
      compania,
      categoria,
      producto: producto ?? undefined,
      primaEur: primaEur ?? undefined,
      ...(fechaNueva ? { fechaEfectoCorregida: fechaNueva } : {}),
      ...(Object.keys(limpias).length > 0 ? { correcciones: limpias } : {}),
      ...(conProductOptions ? { productOptions: conProductOptions } : {}),
    })
    if (r.estado === 'ok') {
      setEstado({
        paso: 'oferta',
        offerId: r.offerId,
        primaEur: r.primaEur,
        firmeza: r.firmeza,
        caducaEn: r.caducaEn,
        avisos: r.avisos,
        projectId: r.projectId,
        cuenta: r.cuenta,
        cuentaAviso: r.cuentaAviso,
        quoteCrudo: r.quoteCrudo,
      })
      // Una oferta nueva puede traer otra cuenta: la confirmación anterior no vale.
      setCuentaOk(false)
      // Y otro `quote`: lo que se hubiera guardado del formulario anterior ya no es de esta oferta.
      setProductOptions(null)
      setAvisoProductForm(null)
      return
    }
    if (r.estado === 'faltan_vendor') {
      // Se prerrellena con lo que asegura sacó de la ficha, sin pisar lo que el
      // corredor ya hubiera tecleado en una vuelta anterior.
      setCorrecciones((prev) => ({ ...r.sugeridos, ...prev }))
      setEstado({
        paso: 'faltan_vendor',
        faltan: r.faltan,
        sugeridos: r.sugeridos,
        noReconocidos: r.noReconocidos,
        mensaje: r.mensaje,
      })
      return
    }
    if (r.estado === 'faltan_producto') {
      // Es un formulario nuevo (quote distinto al de la vuelta anterior, si
      // la hubo): lo guardado antes ya no vale.
      setProductOptionsRerate(null)
      setAvisoProductFormRerate(null)
      setEstado({
        paso: 'faltan_producto',
        campos: r.campos,
        quoteCrudo: r.quoteCrudo,
        mensaje: r.mensaje,
      })
      return
    }
    if (r.estado === 'patch_no_aplicado') {
      setEstado({
        paso: 'error',
        mensaje:
          `${r.mensaje} Cierra este panel y usa «Descartar y pedir precio de cero» — es la única vía ` +
          'cuando el proyecto no admite el dato.',
      })
      return
    }
    setEstado({ paso: 'error', mensaje: r.mensaje })
  }

  async function emitir(
    projectId: string,
    cuenta: CuentaConocida | null,
    aviso: AvisoCuenta | null,
    opciones: { reintentoConfirmado?: boolean; acunarExistente?: boolean } = {},
  ) {
    let campos: Record<string, unknown>
    try {
      campos = JSON.parse(camposJson || '{}')
    } catch {
      setEstado({ paso: 'error', mensaje: 'Los campos adicionales no son un JSON válido.' })
      return
    }
    const yaTraeProduct = typeof campos.product === 'object' && campos.product !== null
    // Si el JSON avanzado ya trae `product`, asegura lo respeta tal cual y la
    // casilla de familia en Allianz no tiene ningún efecto (`conProductoPorDefecto`
    // nunca pisa un `product` puesto a mano) — se avisa ANTES de emitir en vez de
    // dejar creer que se ha pedido un descuento que no se ha pedido.
    if (esAllianz && familiaAllianz && yaTraeProduct) {
      setEstado({
        paso: 'error',
        mensaje:
          'Los "Campos adicionales" ya traen un `product` propio: la casilla de familia en Allianz no ' +
          'tiene efecto sobre él (asegura respeta el JSON avanzado tal cual). Quita esa clave del JSON o ' +
          'añade `insuredFamilyInAllianz: true` a mano dentro de su `options`.',
      })
      return
    }
    // Lo mismo con lo guardado del formulario de la compañía (Product Form
    // Library): si el JSON avanzado ya trae `product`, manda él — nunca se
    // pisa lo que el corredor ha tecleado a mano.
    if (productOptions !== null && yaTraeProduct) {
      setEstado({
        paso: 'error',
        mensaje:
          'Los "Campos adicionales" ya traen un `product` propio: lo guardado del formulario de la ' +
          'compañía no se va a mandar (asegura respeta el JSON avanzado tal cual). Quita esa clave del ' +
          'JSON si quieres que se use lo del formulario.',
      })
      return
    }
    if (productOptions !== null && !yaTraeProduct) {
      campos = { ...campos, product: { options: productOptions } }
    }
    const otraCuenta = iban.trim() !== ''
    if (otraCuenta) campos = { ...campos, iban: iban.trim() }
    // La máscara que el corredor ha visto y marcado: es lo ÚNICO que autoriza a
    // asegura a mandar la cuenta de la ficha. Un IBAN tecleado la sustituye.
    const cuentaConfirmada = !otraCuenta && cuentaOk && cuenta ? cuenta.enmascarada : null
    setEstado({ paso: 'emitiendo' })
    const r = await pedirEmision({
      projectId,
      campos,
      primaAnual: primaEur,
      cuentaConfirmada,
      reintentoConfirmado: opciones.reintentoConfirmado === true,
      acunarExistente: opciones.acunarExistente === true,
      familiaEnAllianz: esAllianz && familiaAllianz,
    })
    if (r.estado === 'reintento_sin_confirmar') {
      setEstado({
        paso: 'reintento_sin_confirmar',
        mensaje: r.mensaje,
        ultimoError: r.ultimoError,
        consejo: r.consejo,
        solicitudes: r.solicitudes,
        rastro: r.rastro,
        proyectoLegible: r.proyectoLegible,
        crudo: r.crudo,
        projectId,
        cuenta,
        cuentaAviso: aviso,
      })
      return
    }
    if (r.estado === 'faltan_campos') {
      setEstado({
        paso: 'faltan_campos',
        faltan: r.faltan,
        campos: r.campos,
        projectId,
        mensaje: r.mensaje,
        cuenta: r.cuenta,
        // Si asegura no trae cuenta ahora, vale lo que se supo al confirmar el precio.
        cuentaAviso: r.cuentaAviso ?? (r.cuenta ? null : aviso),
      })
      // La cuenta que se enseña puede ser OTRA (la ficha cambió, o llegó por el
      // 400 del vendor): la casilla marcada antes no confirma esta.
      setCuentaOk(false)
      return
    }
    if (r.estado === 'ok') {
      setEstado({ paso: 'emitido', referenciaVendor: r.referenciaVendor, cuenta: r.cuenta })
      return
    }
    if (r.estado === 'emitido_sin_acunar') {
      setEstado({ paso: 'emitido_sin_acunar', mensaje: r.mensaje })
      return
    }
    if (r.estado === 'en_vuelo') {
      setEstado({ paso: 'error', mensaje: r.mensaje })
      return
    }
    const quizaEmitido = r.estado === 'error' && r.quizaEmitido === true
    setEstado({
      paso: 'error',
      mensaje: r.mensaje,
      quizaEmitido,
      ...(r.estado === 'error' && r.consejo ? { consejo: r.consejo } : {}),
      ...(quizaEmitido ? { reintento: { projectId, cuenta, cuentaAviso: aviso } } : {}),
    })
  }

  return (
    <div className="card" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Emisión · {compania || '—'}</h2>
          {categoria && (
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {categoria}
            </p>
          )}
        </div>
        <button type="button" className="ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          border: '2px solid var(--warn)',
          background: 'rgba(217, 119, 6, 0.1)',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <p style={{ margin: 0, fontWeight: 800, color: 'var(--warn)' }}>
          🚨 Esto llama de verdad a Codeoscopic — sin sandbox
        </p>
        <p style={{ margin: '4px 0 0' }}>
          Un solo intento por paso. Si algo sale raro, el mensaje de la compañía se enseña tal cual:
          no se reintenta solo.
        </p>
      </div>

      {estado.paso === 'inicio' && (
        <div style={{ marginTop: 14 }}>
          <p className="muted">
            Precio en pantalla: <strong>{euroODash(primaEur)}</strong>. El primer paso lo confirma con
            la compañía (puede cambiar de «estimado» a un precio firme).
          </p>
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>Fecha de efecto</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required={fechaEfecto != null}
              style={{ minHeight: 44, maxWidth: '100%' }}
            />
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              {fechaEfecto
                ? 'La cotizada. Cámbiala si el cliente quiere otro día: se manda al confirmar el precio y el precio puede variar.'
                : 'Déjala vacía para usar la cotizada. Si pones otra, se manda al confirmar el precio y el precio puede variar.'}
            </span>
          </label>
          <button
            type="button"
            className="primary"
            onClick={() => confirmarPrecio()}
            disabled={fechaEfecto != null && fecha === ''}
            style={{ marginTop: 8, minHeight: 44 }}
          >
            Confirmar precio con la compañía
          </button>
        </div>
      )}

      {estado.paso === 'confirmando' && <p style={{ marginTop: 14 }}>Confirmando con la compañía…</p>}

      {estado.paso === 'faltan_producto' && (
        <div style={{ marginTop: 14 }}>
          <p className="err" style={{ margin: 0 }}>
            {compania || 'La compañía'} pide{' '}
            {estado.campos.length === 1 ? 'un dato de su formulario' : `${estado.campos.length} datos de su formulario`}{' '}
            para confirmar el precio. No se ha gastado nada.
          </p>
          <ul style={{ margin: '6px 0 10px', paddingLeft: 20, fontSize: 13 }}>
            {estado.campos.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
            No es un campo nuestro que se pueda teclear a ciegas: es el formulario REAL de{' '}
            {compania || 'la compañía'}, servido por Codeoscopic. Rellénalo y pulsa «Guardar», y se
            reintenta el precio con esas opciones.
          </p>
          <ProductFormWidget
            quoteCrudo={estado.quoteCrudo}
            onOptions={(opciones, aviso) => {
              setProductOptionsRerate(opciones)
              setAvisoProductFormRerate(aviso)
            }}
          />
          {productOptionsRerate !== null && (
            <p className="ok" style={{ fontSize: 12, margin: '6px 0 0' }}>
              ✅ {productOptionsRerate.length} opción(es) guardada(s) — pulsa «Reintentar» para confirmar el precio.
            </p>
          )}
          {avisoProductFormRerate && (
            <p className="err" style={{ fontSize: 12, margin: '6px 0 0' }}>
              El formulario no ha dado un resultado válido: {avisoProductFormRerate}
            </p>
          )}
          <button
            type="button"
            className="primary"
            disabled={productOptionsRerate === null}
            onClick={() => confirmarPrecio(undefined, productOptionsRerate ?? undefined)}
            style={{ marginTop: 10 }}
          >
            Reintentar con esas opciones
          </button>
        </div>
      )}

      {estado.paso === 'faltan_vendor' && (
        <div style={{ marginTop: 14 }}>
          <p className="err" style={{ margin: 0 }}>
            La compañía pide {estado.faltan.length === 1 ? 'un dato' : `${estado.faltan.length} datos`} para
            confirmar el precio. No se ha gastado nada.
          </p>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>
            Lo que venga relleno lo ha sacado asegura de la ficha del cliente: compruébalo. Lo vacío no está en
            ningún sitio — se teclea aquí y se escribe en el proyecto (gratis) antes de volver a confirmar.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {estado.faltan.filter((f) => ETIQUETAS_HUECO[f.campo]).map((f) => {
              const meta = ETIQUETAS_HUECO[f.campo]!
              const valor = correcciones[f.campo] ?? ''
              const deFicha = estado.sugeridos[f.campo] !== undefined && valor === estado.sugeridos[f.campo]
              return (
                <label key={f.campo} style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {meta.etiqueta}
                    {deFicha && <span className="badge warn" style={{ marginLeft: 8 }}>de la ficha · comprobar</span>}
                  </span>
                  {(() => {
                    const tipoCatalogo = CATALOGO_DE_CAMPO[f.campo]
                    if (!tipoCatalogo) {
                      return (
                        <input
                          type={meta.tipo}
                          value={valor}
                          onChange={(e) => setCorrecciones((prev) => ({ ...prev, [f.campo]: e.target.value }))}
                          style={{ width: '100%', minHeight: 44, boxSizing: 'border-box' }}
                          autoComplete="off"
                        />
                      )
                    }
                    const cat: CatalogoEstado = catalogos[f.campo] ?? { paso: 'cargando' }
                    // Sin catálogo (caído o sin configurar) se vuelve a la caja
                    // de texto: peor que el desplegable, pero mejor que un
                    // callejón sin salida en el que no se puede completar nada.
                    if (cat.paso === 'error' || cat.paso === 'sin_configurar') {
                      return (
                        <>
                          <input
                            type="text"
                            value={valor}
                            onChange={(e) => setCorrecciones((prev) => ({ ...prev, [f.campo]: e.target.value }))}
                            placeholder="Id del catálogo del vendor"
                            style={{ width: '100%', minHeight: 44, boxSizing: 'border-box' }}
                            autoComplete="off"
                          />
                          <p className="err" style={{ margin: '4px 0 0', fontSize: 12 }}>
                            {cat.mensaje}
                            {cat.paso === 'error' && (
                              <>
                                {' '}
                                <button
                                  type="button"
                                  className="ghost"
                                  style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }}
                                  onClick={() => void pedirCatalogoCampo(f.campo)}
                                >
                                  Reintentar
                                </button>
                              </>
                            )}
                          </p>
                        </>
                      )
                    }
                    return (
                      <select
                        value={valor}
                        onChange={(e) => setCorrecciones((prev) => ({ ...prev, [f.campo]: e.target.value }))}
                        disabled={cat.paso !== 'ok'}
                        style={{ width: '100%', minHeight: 44, boxSizing: 'border-box' }}
                      >
                        <option value="">{cat.paso === 'cargando' ? 'Cargando catálogo…' : 'Elige una opción'}</option>
                        {cat.paso === 'ok' &&
                          cat.opciones.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.nombre}
                            </option>
                          ))}
                      </select>
                    )
                  })()}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {CATALOGO_DE_CAMPO[f.campo]
                      ? 'Del catálogo del vendor — se elige, no se teclea. '
                      : meta.pista
                        ? `${meta.pista} · `
                        : ''}
                    {f.motivo}
                  </span>
                </label>
              )
            })}
          </div>
          {/* Lo que la compañía pide y NO es un dato de la persona (p. ej. la fecha de
              efecto, que el proyecto no deja cambiar): aquí no hay input que valga. */}
          {estado.faltan.some((f) => !ETIQUETAS_HUECO[f.campo]) && (
            <div style={{ marginTop: 10 }}>
              <p className="err" style={{ margin: 0, fontSize: 13 }}>
                Esto no se puede corregir sobre el proyecto ya creado — hay que «Descartar y pedir precio de cero»:
              </p>
              <ul style={{ margin: '4px 0 0' }}>
                {estado.faltan
                  .filter((f) => !ETIQUETAS_HUECO[f.campo])
                  .map((f) => (
                    <li key={f.campo}>
                      <code>{f.campo}</code> — {f.motivo}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {estado.noReconocidos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p className="err" style={{ margin: 0, fontSize: 13 }}>
                Y esto lo dice la compañía pero asegura no sabe a qué campo corresponde (hay que mapearlo):
              </p>
              <ul style={{ margin: '4px 0 0' }}>
                {estado.noReconocidos.map((t, i) => (
                  <li key={i}>
                    <code>{t}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 12 }}>
              Mensaje completo de la compañía
            </summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: '4px 0 0' }}>{estado.mensaje}</pre>
          </details>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="primary"
              style={{ minHeight: 44 }}
              disabled={
                estado.faltan.some((f) => !ETIQUETAS_HUECO[f.campo]) ||
                estado.faltan.some((f) => !(correcciones[f.campo] ?? '').trim()) ||
                // Con un catálogo aún cargando, el `sugerido` prerrellenado no se
                // ve en pantalla (el desplegable está deshabilitado): no se manda
                // un id que el corredor no ha podido leer ni comprobar.
                estado.faltan.some(
                  (f) => CATALOGO_DE_CAMPO[f.campo] && (catalogos[f.campo]?.paso ?? 'cargando') === 'cargando',
                )
              }
              onClick={() => confirmarPrecio(correcciones)}
            >
              Completar y volver a confirmar el precio
            </button>
          </div>
        </div>
      )}

      {estado.paso === 'oferta' && (
        <div style={{ marginTop: 14 }}>
          <p>
            Precio confirmado: <strong>{euroODash(estado.primaEur)}</strong>{' '}
            <span className={`badge ${estado.firmeza === 'firme' ? 'ok' : 'warn'}`}>{estado.firmeza}</span>
          </p>
          {estado.caducaEn && (
            <p className="muted">
              Válido hasta el {fechaEs(estado.caducaEn)}: después la compañía no lo emite y habría que confirmar
              otra vez (o pedir precio de nuevo).
            </p>
          )}
          {estado.avisos.length > 0 && (
            <ul>
              {estado.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          <CoberturasOferta key={estado.offerId} projectId={estado.projectId} offerId={estado.offerId} />
          <CuentaCargo
            cuenta={estado.cuenta}
            aviso={estado.cuentaAviso}
            obligatoria={false}
            cuentaOk={cuentaOk}
            onCuentaOk={setCuentaOk}
            iban={iban}
            onIban={setIban}
          />
          {esAllianz && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 44 }}>
              <input
                type="checkbox"
                checked={familiaAllianz}
                onChange={(e) => setFamiliaAllianz(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                El tomador ya tiene familiares asegurados en Allianz (aplica el descuento)
              </span>
            </label>
          )}

          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
              Formulario de {compania || 'la compañía'} (consentimientos para emitir)
            </p>
            <p className="muted" style={{ margin: '2px 0 8px', fontSize: 12 }}>
              Es el formulario REAL de la compañía, servido por Codeoscopic — no una lista adivinada.
              Rellénalo y pulsa «Guardar»; si no aplica nada, se puede emitir sin tocarlo.
            </p>
            <ProductFormWidget
              quoteCrudo={estado.quoteCrudo}
              onOptions={(opciones, aviso) => {
                setProductOptions(opciones)
                setAvisoProductForm(aviso)
              }}
            />
            {productOptions !== null && (
              <p className="ok" style={{ fontSize: 12, margin: '6px 0 0' }}>
                ✅ {productOptions.length} opción(es) guardada(s) del formulario — se mandan con la emisión.
              </p>
            )}
            {avisoProductForm && (
              <p className="err" style={{ fontSize: 12, margin: '6px 0 0' }}>
                El formulario no ha dado un resultado válido: {avisoProductForm}
              </p>
            )}
          </div>

          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              Campos adicionales (avanzado, opcional)
            </summary>
            <p className="muted" style={{ fontSize: 12 }}>
              JSON con lo que pida la compañía. Si falta algo, la respuesta dirá exactamente qué
              claves espera — no hay que adivinarlas.
            </p>
            <p className="err" style={{ fontSize: 12, margin: '4px 0 8px' }}>
              ⚠️ Si la compañía pide una fecha de efecto, tiene que ser <strong>HOY</strong> (o más
              tarde) — nunca una fecha pasada de esta cotización. Las compañías no admiten pólizas
              retroactivas.
            </p>
            <textarea
              value={camposJson}
              onChange={(e) => setCamposJson(e.target.value)}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </details>
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="primary"
              style={{ minHeight: 44 }}
              disabled={!cuentaDecidida(estado.cuenta, cuentaOk, iban)}
              onClick={() => emitir(estado.projectId, estado.cuenta, estado.cuentaAviso)}
            >
              Emitir la póliza
            </button>
            {estado.cuenta && !cuentaDecidida(estado.cuenta, cuentaOk, iban) && (
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                Confirma la cuenta de cargo o teclea otra antes de emitir.
              </p>
            )}
          </div>
        </div>
      )}

      {estado.paso === 'emitiendo' && <p style={{ marginTop: 14 }}>Enviando la emisión…</p>}

      {estado.paso === 'faltan_campos' && (
        <div style={{ marginTop: 14 }}>
          <p className="err" style={{ margin: 0 }}>
            La compañía pide {estado.faltan.length === 1 ? 'un dato' : 'estos datos'} antes de emitir. No se ha
            emitido nada.
          </p>
          {estado.mensaje && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              {estado.mensaje}
            </p>
          )}
          {estado.faltan.includes('iban') && (
            <CuentaCargo
              cuenta={estado.cuenta}
              aviso={estado.cuentaAviso}
              obligatoria
              cuentaOk={cuentaOk}
              onCuentaOk={setCuentaOk}
              iban={iban}
              onIban={setIban}
            />
          )}
          {estado.faltan.some((f) => f !== 'iban') && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Y estas claves, en el JSON (con esos nombres exactos):
              </p>
              <ul style={{ margin: '4px 0' }}>
                {estado.faltan
                  .filter((f) => f !== 'iban')
                  .map((f) => (
                    <li key={f}>
                      <code>{f}</code>
                    </li>
                  ))}
              </ul>
              <textarea
                value={camposJson}
                onChange={(e) => setCamposJson(e.target.value)}
                rows={4}
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="primary"
              style={{ minHeight: 44 }}
              disabled={
                estado.faltan.includes('iban') &&
                !(iban.trim() !== '' || (estado.cuenta !== null && cuentaOk))
              }
              onClick={() => emitir(estado.projectId, estado.cuenta, estado.cuentaAviso)}
            >
              Reintentar la emisión
            </button>
          </div>
        </div>
      )}

      {estado.paso === 'emitido' && (
        <div className="ok" style={{ marginTop: 14 }}>
          ✅ Emitida. {estado.referenciaVendor && <>Referencia de la compañía: {estado.referenciaVendor}. </>}
          {estado.cuenta ? (
            <>
              Recibo domiciliado en <code>{estado.cuenta.enmascarada}</code>
              {estado.cuenta.descripcion ? ` (${estado.cuenta.descripcion})` : ''}.{' '}
            </>
          ) : (
            <>Sin cuenta de cargo en el envío (la compañía no la exigió). </>
          )}
          Queda como «pendiente de confirmación por CIMA» en la ficha de la póliza.
        </div>
      )}

      {estado.paso === 'emitido_sin_acunar' && (
        <div className="err" style={{ marginTop: 14 }}>
          ⚠️ {estado.mensaje}
        </div>
      )}

      {estado.paso === 'error' && (
        <div className="err" style={{ marginTop: 14 }}>
          {estado.mensaje}
          {estado.quizaEmitido && (
            <>
              <p style={{ margin: '8px 0 0', fontWeight: 700 }}>
                ⚠️ Esto NO es un rechazo: Codeoscopic dejó de esperar a la compañía y no se sabe si llegó a
                emitir. No se ha cobrado nada por el envío.
              </p>
              {estado.consejo && (
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{estado.consejo}</p>
              )}
              {estado.reintento && (
                <button
                  type="button"
                  className="primary"
                  style={{ marginTop: 8, minHeight: 44 }}
                  onClick={() => emitir(estado.reintento!.projectId, estado.reintento!.cuenta, estado.reintento!.cuentaAviso)}
                >
                  Ver el estado del proyecto y decidir (gratis)
                </button>
              )}
            </>
          )}
        </div>
      )}

      {estado.paso === 'reintento_sin_confirmar' && (() => {
        // Mismo orden que `solicitudViva` en asegura: una aprobada manda sobre una pendiente.
        const aprobada = estado.solicitudes.find((s) => s.veredicto === 'aprobada') ?? null
        const viva = aprobada ?? estado.solicitudes.find((s) => s.veredicto === 'pendiente') ?? null
        return (
        <div style={{ marginTop: 14, border: '2px solid var(--warn)', borderRadius: 10, padding: 12 }}>
          {viva ? (
            <p style={{ margin: 0, fontWeight: 800, color: 'var(--danger)' }}>
              🛑 La compañía ya tiene una solicitud {viva.veredicto === 'aprobada' ? 'APROBADA' : 'en curso'}
              {viva.numeroPoliza ? ` · póliza ${viva.numeroPoliza}` : ''} — NO se reenvía
            </p>
          ) : estado.rastro.length > 0 ? (
            <p style={{ margin: 0, fontWeight: 800, color: 'var(--danger)' }}>
              🛑 El proyecto YA cuenta una solicitud de emisión en Codeoscopic
            </p>
          ) : (
            <p style={{ margin: 0, fontWeight: 800, color: 'var(--warn)' }}>
              ⚠️ El último envío acabó sin respuesta clara — no se sabe si la compañía emitió
            </p>
          )}
          <p style={{ margin: '6px 0 0' }}>{estado.mensaje}</p>
          {estado.consejo && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{estado.consejo}</p>
          )}
          {estado.solicitudes.length > 0 && (
            <div style={{ marginTop: 8, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Solicitud</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Estado (vendor)</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Nº póliza</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Enviada</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.solicitudes.map((s, i) => (
                    <tr key={s.id ?? i}>
                      <td style={{ padding: '4px 8px' }}><code>{s.id ?? '—'}</code></td>
                      <td style={{ padding: '4px 8px' }}>
                        {s.veredicto === 'aprobada' ? '🟢 ' : s.veredicto === 'rechazada' ? '🔴 ' : s.veredicto === 'pendiente' ? '🟠 ' : '❔ '}
                        {s.estadoNombre ?? s.estadoId ?? 'sin estado'}
                        {s.veredicto === 'desconocido' && s.estadoId ? ' (estado no reconocido: míralo en Avant2)' : ''}
                      </td>
                      <td style={{ padding: '4px 8px' }}>{s.numeroPoliza ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{s.creadaEn ? new Date(s.creadaEn).toLocaleString('es-ES') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {estado.rastro.length > 0 && (
            <details open style={{ marginTop: 8 }}>
              <summary>Lo que el proyecto cuenta de esa solicitud</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 240, overflow: 'auto' }}>
                {JSON.stringify(estado.rastro, null, 2)}
              </pre>
            </details>
          )}
          {estado.ultimoError && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12, wordBreak: 'break-word' }}>
              Último error: <code>{estado.ultimoError}</code>
            </p>
          )}
          {estado.proyectoLegible ? (
            <details style={{ marginTop: 8 }}>
              <summary>Proyecto tal cual lo devuelve Codeoscopic ahora (lectura gratis)</summary>
              <p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>
                Si aquí no aparece ninguna «policyApplication», el proyecto no cuenta ninguna solicitud —
                eso NO demuestra que la compañía no emitiera: compruébalo también en Avant2.
              </p>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 320, overflow: 'auto' }}>
                {JSON.stringify(estado.crudo, null, 2)}
              </pre>
            </details>
          ) : (
            <p className="err" style={{ margin: '8px 0 0' }}>
              No se ha podido leer el proyecto en Codeoscopic ahora mismo: compruébalo en Avant2 antes de
              reintentar.
            </p>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {aprobada && (
              <button
                type="button"
                className="primary"
                style={{ minHeight: 44 }}
                onClick={() =>
                  emitir(estado.projectId, estado.cuenta, estado.cuentaAviso, { acunarExistente: true })
                }
              >
                {aprobada.numeroPoliza
                  ? `Registrar en la cartera la póliza ${aprobada.numeroPoliza} ya emitida (no reenvía nada)`
                  : 'Registrar en la cartera la póliza ya aprobada (sin número todavía; no reenvía nada)'}
              </button>
            )}
            {!viva && (
              <button
                type="button"
                className={aprobada ? 'ghost' : 'primary'}
                style={{ minHeight: 44 }}
                onClick={() =>
                  emitir(estado.projectId, estado.cuenta, estado.cuentaAviso, { reintentoConfirmado: true })
                }
              >
                Lo he comprobado y no hay póliza: reintentar la emisión
              </button>
            )}
            {viva && !aprobada && (
              <p className="muted" style={{ margin: 0, fontSize: 13, alignSelf: 'center' }}>
                Hay una solicitud en curso en la compañía: no se ofrece reintento. Cuando pase a aprobada,
                vuelve aquí para registrarla; si la compañía la rechaza, se podrá reenviar.
              </p>
            )}
            <button type="button" className="ghost" style={{ minHeight: 44 }} onClick={onCerrar}>
              {viva ? 'Cerrar' : 'No reintentar'}
            </button>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
