import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { origenRetarificacion } from '@/lib/cartera-ficha'
import {
  precalificarAuto,
  tipoViaDelTomador,
  tipoViaTextoDelTomador,
  type Resueltos,
} from '@/lib/codeoscopic/desde-cartera'
import { resolverConfig, explicarConfig, simulacionActiva } from '@/lib/codeoscopic/config'
import { estadoConsumo } from '@/lib/codeoscopic/cotizar'
import {
  estadosCiviles,
  municipiosPorCp,
  fechaMatriculacionDeMatricula,
  tiposDeVia,
  emparejar,
  type Opcion,
} from '@/lib/codeoscopic/catalogos'
import { peticion } from '@/lib/codeoscopic/cliente'
import type { ConfigCodeoscopic } from '@/lib/codeoscopic/config'
import { prisma } from '@/lib/tenant'
import {
  sanearSupuestos,
  sanearReparos,
  type SupuestoPublico,
  type ReparoPublico,
} from '@/lib/codeoscopic/precalificar-publica'
import { registrarErrorCartera } from '@/lib/error-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/codeoscopic/precalificar?polizaId=…` — **todo lo que la
 * pantalla de retarificación de `apps/plataforma` → `/correduria` necesita para
 * pintarse**, calculado aquí, que es donde se sabe calcularlo.
 *
 * ─── Por qué nace (03/09/2026) ─────────────────────────────────────────────
 * La retarificación de auto se mudó a plataforma para que Alberto no salte de
 * dominio (el enlace ↗ a asegura le echaba al login: `GET /cartera/poliza/…
 * → 307 /login`, medido en producción). La mudanza dejó un hueco: el puerto
 * servía los catálogos y la cotización, pero **no la precalificación de la
 * póliza**, así que la pantalla nueva abría con `vehiculo = null` y se perdía
 * la preselección de marca y modelo desde la ficha. Los desplegables salían
 * vacíos sobre una ficha que SÍ trae marca y modelo — un «no lo sé» pintado
 * encima de un dato que estaba.
 *
 * ─── Qué NO hace ───────────────────────────────────────────────────────────
 * 🚨 **Es un `GET` y no gasta NADA.** No pasa por el embudo de pago; lo único
 * que llama al vendor son consultas de catálogo (`/marital-statuses`,
 * `/towns`, `/car/registration-date`), y por eso —igual que `/lineas` y
 * `/catalogos`— corre con el interruptor de tarificación APAGADO
 * (`ignorarInterruptor: true`): saber qué falta tiene que poder hacerse ANTES
 * de que nadie decida pagar 0,50€. Toda respuesta lleva `gastado: '0,00€'`.
 *
 * ─── El código postal se queda DENTRO ──────────────────────────────────────
 * `apps/asegura/CLAUDE.md` es explícito: la dirección del tomador no sale por
 * el puerto. El CP es parte de esa dirección. Pero la cotización **no necesita
 * el CP**: necesita el **id de municipio del catálogo del vendor**, que no es
 * un dato personal. Así que aquí se resuelve CP → municipios (`municipiosPorCp`)
 * y se publica **solo la lista ya resuelta**. La alternativa que se descartó
 * —preguntarle el CP a Alberto en la pantalla— sacaba el dato igual, por la vía
 * más lenta y pidiéndole teclear algo que la ficha ya tiene.
 * Los supuestos pasan por `sanearSupuestos()` por la misma razón: uno de ellos
 * («el coche circula donde vive el tomador») llevaba el CP dentro.
 *
 * ─── Tres estados en CADA campo, no dos ────────────────────────────────────
 * La regla dura de `CLAUDE.md` («dato que NO hay ≠ dato que NO se ha mirado»)
 * aquí no es teórica: `faltan: []` significa «revisado y no falta nada» y **es
 * lo que enciende el botón que cuesta 0,50€**. Por eso:
 *   - `faltan`      → `null` = no se ha podido precalificar · `[]` = revisado, nada falta.
 *   - `vehiculo`    → `null` = no se ha podido leer · con marca/modelo a `null` = la ficha no los trae.
 *   - `municipios`  → `null` = no se ha podido mirar el catálogo · `[]` = mirado y no hay (con su `municipiosMotivo`).
 *   - `estadoCivil` → `null` = no se ha emparejado, y `estadoCivilMotivo` dice por qué.
 *   - `consumo`     → `{ error }` cuando el libro no se pudo leer; nunca «gastado 0».
 *
 * ─── Respuesta ─────────────────────────────────────────────────────────────
 *   `{ estado:'ok', ramo, … }`               · 200
 *   `{ estado:'sin_configurar', mensaje }`   · 503 — NO es «no falta nada»
 *   `{ estado:'error', causa, mensaje }`     · 400 parámetro · 404 póliza · 502 lectura
 * La `causa` la clasifica `lib/error-cartera.ts`, como en las otras rutas del
 * puerto: un fallo de lectura nunca sale pelado.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const polizaId = (new URL(req.url).searchParams.get('polizaId') ?? '').trim()
  if (polizaId === '') {
    return error(400, 'otro', 'falta el parámetro polizaId')
  }

  // 🛡️ Aislamiento: la póliza se busca SIEMPRE dentro de esta correduría. La
  // conexión tiene BYPASSRLS, así que un id ajeno no daría error — daría la
  // póliza de otro.
  let correduriaId: string
  try {
    const c = await correduriaUnica()
    if (!c) {
      return error(
        503,
        'sin_correduria',
        'La base responde pero no hay ninguna correduría, así que ni se consulta la cartera sin ' +
          'filtro ni se precalifica. Esto NO significa que la póliza no exista.',
      )
    }
    correduriaId = c.id
  } catch (e) {
    return error(502, registrarErrorCartera('precalificar/correduria', e), 'No se ha podido resolver la correduría.')
  }

  let origen: Awaited<ReturnType<typeof origenRetarificacion>>
  try {
    origen = await origenRetarificacion(correduriaId, polizaId)
  } catch (e) {
    return error(
      502,
      registrarErrorCartera('precalificar/ficha', e),
      'No se ha podido leer la ficha de esta póliza. Esto NO significa que la póliza no exista: ' +
        'significa que la consulta a la cartera ha fallado.',
    )
  }
  if (!origen) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'póliza no encontrada en la cartera de esta correduría', gastado: '0,00€' },
      { status: 404 },
    )
  }

  const simulacion = simulacionActiva(process.env)

  // ── Ramos que no son auto ─────────────────────────────────────────────────
  // No se precalifican aquí (hogar tiene su propia pieza, con Catastro), así que
  // NO se devuelve `faltan: []`: eso diría «revisado y no falta nada» y
  // encendería el botón. `null` es «no se ha mirado», que es la verdad.
  if (origen.tipo !== 'auto') {
    return NextResponse.json(
      {
        estado: 'ok',
        ramo: origen.tipo,
        precalificado: false,
        motivo:
          origen.retarificacion.motivo ??
          `esta ruta solo precalifica auto; el ramo de esta póliza es «${origen.tipo}»`,
        vehiculo: null,
        faltan: null,
        supuestos: [],
        fechaMatriculacion: null,
        notaMatricula: null,
        municipios: null,
        municipiosMotivo: null,
        estadoCivil: null,
        estadoCivilMotivo: null,
        tiposVia: null,
        tipoVia: null,
        tipoViaMotivo: null,
        consumo: { error: 'no se ha mirado el libro de consumo: este ramo no se precalifica aquí' },
        simulacion,
        gastado: '0,00€',
      },
      { status: 200 },
    )
  }

  // ── Catálogos: gratis y con el interruptor APAGADO ────────────────────────
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { estado: 'sin_configurar', mensaje: explicarConfig(r), gastado: '0,00€' },
      { status: 503 },
    )
  }
  const cfg = r.config

  // 🔒 El CP no sale de esta función: entra en `municipiosPorCp` y lo que viaja
  // es la lista de municipios, que son ids de un catálogo público del vendor.
  const cpTomador = origen.cliente.codigoPostal
  const [civiles, muni, fm, vias] = await Promise.all([
    estadosCiviles(cfg).then(
      (o): Opcion[] | null => o,
      (): Opcion[] | null => null,
    ),
    cpTomador
      ? municipiosPorCp(cfg, cpTomador).then(
          (o): Opcion[] | null => o,
          (): Opcion[] | null => null,
        )
      : Promise.resolve<Opcion[] | null>([]),
    origen.poliza.matricula
      ? fechaMatriculacionDeMatricula(cfg, origen.poliza.matricula)
      : Promise.resolve({ estado: 'error' as const, detalle: 'la póliza no tiene matrícula' }),
    // El catálogo de tipos de vía (`/road-types`), gratis: el Submit exige
    // `roadType.id` y es una referencia de catálogo, así que la pantalla lo
    // elige de aquí y nunca lo teclea.
    tiposDeVia(cfg).then(
      (o): Opcion[] | null => o,
      (): Opcion[] | null => null,
    ),
    // 🔎 Diagnóstico de la clave del correo (ver la función). Solo escribe en
    // el log; no forma parte de la respuesta y un fallo suyo no tumba nada.
    registrarEstructuraPersonaVendor(cfg, correduriaId, polizaId),
  ])

  // 🛣️ Tipo de vía: emparejado EXACTO del que trocea la calle de la ficha
  // («CL» → Calle) contra el catálogo vivo — dentro de `desde-cartera.ts`, la
  // calle no se nombra aquí. Sin match no se preselecciona nada (el caso de
  // Pilar Franco Ruz: «Severo Ochoa 12», sin tipo) y se elige a mano.
  const tipoViaTexto = tipoViaTextoDelTomador(origen.cliente)
  const tipoViaAuto = vias === null ? null : tipoViaDelTomador(origen.cliente, vias)
  const tipoViaMotivo =
    vias === null
      ? 'No se ha podido leer el catálogo de tipos de vía de Codeoscopic. Sin él no se puede elegir.'
      : tipoViaAuto !== null
        ? null
        : tipoViaTexto === null
          ? 'La calle de la ficha no empieza por un tipo de vía reconocible (Calle, Avenida…): elígelo a mano. ' +
            'La compañía lo exige para emitir.'
          : `La ficha dice «${tipoViaTexto}» y el catálogo de Codeoscopic no tiene esa opción con ese nombre exacto: elígelo a mano.`

  // `null` = el catálogo no llegó. NO se degrada a `[]`, que se leería como
  // «ese código postal no tiene municipios» o «no hay estados civiles».
  const municipiosMotivo =
    muni === null
      ? 'No se ha podido leer el catálogo de municipios de Codeoscopic. No es que no haya: no se ha podido mirar.'
      : cpTomador === null
        ? 'La ficha del tomador no trae código postal, así que no hay municipio que resolver. El código ' +
          'postal no cruza el puerto (es un dato personal del tomador), así que tampoco se teclea en ' +
          'plataforma: se corrige en la ficha del cliente, en asegura.'
        : muni.length === 0
          ? 'El código postal de la ficha no ha devuelto ningún municipio en el catálogo de Codeoscopic. ' +
            'Revisa el código postal en la ficha del cliente.'
          : null

  const estadoCivilAuto = civiles === null ? null : emparejar(civiles, origen.cliente.estadoCivil)
  const estadoCivilMotivo =
    civiles === null
      ? 'No se ha podido leer el catálogo de estados civiles de Codeoscopic.'
      : estadoCivilAuto !== null
        ? null
        : origen.cliente.estadoCivil === null || origen.cliente.estadoCivil.trim() === ''
          ? 'La ficha del cliente no dice el estado civil, así que no hay nada que emparejar: elígelo a mano.'
          : `La ficha dice «${origen.cliente.estadoCivil}» y el catálogo de Codeoscopic no tiene esa opción ` +
            'con ese nombre exacto. No se preselecciona por parecido: elígela a mano.'

  const fechaMatriculacion = fm.estado === 'ok' ? fm.fecha : null
  const notaMatricula =
    fm.estado === 'ok'
      ? 'La ha devuelto Codeoscopic desde la matrícula. El propio fabricante avisa de que es ' +
        'APROXIMADA: orienta para el precio, no vale para emitir.'
      : fm.estado === 'no-encontrada'
        ? 'Codeoscopic no ha encontrado la fecha de esta matrícula. Eso es «no la he encontrado», no «el ' +
          'coche no tiene fecha»: hay que ponerla a mano.'
        : `No se ha podido preguntar la fecha de matriculación (${fm.detalle}). Tampoco es una ausencia: no se sabe.`

  // ── La precalificación, con la MISMA función que la pantalla de asegura ───
  // No se reimplementa nada: `origenRetarificacion()` + `precalificarAuto()` son
  // las dos piezas que ya están probadas, y reproducir su secuencia aquí es lo
  // único que hace esta ruta. Si divergieran, plataforma y asegura enseñarían
  // huecos distintos sobre la misma póliza.
  const resueltos: Resueltos = {
    municipioId: muni !== null && muni.length === 1 ? Number(muni[0].id) : null,
    estadoCivilId: estadoCivilAuto?.id ?? null,
    fechaMatriculacion,
    codigoVehiculo: null, // lo elige el corredor: es el único que no se deduce
    garaje: null,
    tipoViaId: tipoViaAuto?.id ?? null,
  }
  const pre = precalificarAuto(origen.cliente, origen.poliza, resueltos, hoyIso())

  // El libro de consumo. `estadoConsumo()` mira el interruptor de verdad (no lo
  // ignora), así que con la tarificación apagada devuelve `{ error }` — que es
  // «no se ha podido mirar», nunca «quedan 0».
  const consumo = await estadoConsumo(correduriaId)

  const supuestos: SupuestoPublico[] = sanearSupuestos(pre.supuestos)
  const faltan: ReparoPublico[] = sanearReparos(pre.faltan)

  return NextResponse.json(
    {
      estado: 'ok',
      ramo: 'auto',
      precalificado: true,
      motivo: null,
      // Marca, modelo y las versiones vistas en otras pólizas de la misma
      // matrícula. Es lo que devuelve la preselección de la pantalla.
      vehiculo: origen.poliza.vehiculo,
      faltan,
      supuestos,
      fechaMatriculacion,
      notaMatricula,
      municipios: muni,
      municipiosMotivo,
      estadoCivil: estadoCivilAuto,
      estadoCivilMotivo,
      tiposVia: vias,
      tipoVia: tipoViaAuto,
      tipoViaMotivo,
      consumo,
      simulacion,
      gastado: '0,00€',
    },
    { status: 200 },
  )
}

/** Solo NOMBRES de campo y el tipo de su valor: ningún dato personal. */
type EstructuraPersonaVendor = {
  projectId: string
  /** Claves de `holder` tal y como las devuelve el vendor. */
  holder: string[]
  /** Claves de `holder.addresses[0]`. */
  domicilio: string[]
  /** Las claves de `holder` que contienen «mail», con el TIPO de su valor. */
  correo: { clave: string; tipo: string }[]
}

/** Tope propio del diagnóstico: no puede retrasar la pantalla más que esto. */
const TIMEOUT_DIAGNOSTICO_MS = 5_000

/**
 * 🔎 Diagnóstico GRATIS (una lectura `GET /insurances/{id}`) del último
 * proyecto REAL de esta póliza: la ESTRUCTURA de la persona que devuelve el
 * vendor — solo nombres de campo y el tipo de cada valor, nunca los valores.
 * Escribe en el log del servidor y NADA más: no viaja por el puerto.
 *
 * Por qué existe (12/09/2026): el Submit exige el correo, el PATCH con la
 * clave `email` devolvió 200 y al releer el proyecto 40685666 el correo no
 * estaba (`patch_no_aplicado`), mientras que `roadName` por el mismo PATCH sí
 * se aplicó. O la clave no es la suya o la forma es otra (`emails[]`) — y sin
 * sandbox ni OpenAPI a mano, la única fuente de verdad es lo que el propio
 * vendor devuelve. Con esto se fija `CLAVE_EMAIL_VENDOR` con un dato y no con
 * otro 0,50€. Solo corre si la póliza YA tiene un proyecto real (hoy, una), con
 * tope de 5 s, y los tres desenlaces se distinguen en el log: sin proyecto ·
 * leído · no se pudo leer. ⏳ Temporal: cuando la clave esté confirmada, se quita.
 */
async function registrarEstructuraPersonaVendor(
  cfg: ConfigCodeoscopic,
  correduriaId: string,
  polizaId: string,
): Promise<void> {
  try {
    const filas = await prisma.$queryRaw<{ project_id_codeoscopic: string }[]>`
      select t.project_id_codeoscopic
      from tarificaciones t
      where t.correduria_id = ${correduriaId}::uuid
        and t.poliza_id = ${polizaId}::uuid
        and t.project_id_codeoscopic is not null
        and t.simulado = false
      order by t.creado_at desc
      limit 1
    `
    const projectId = filas[0]?.project_id_codeoscopic
    if (!projectId) {
      console.log('[precalificar] estructura persona vendor: esta póliza no tiene proyecto real todavía')
      return
    }
    const crudo = await peticion(cfg, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}`,
      timeoutMs: Math.min(cfg.timeoutGenericoMs, TIMEOUT_DIAGNOSTICO_MS),
    })
    const obj = (v: unknown): Record<string, unknown> =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    const holder = obj(obj(crudo).holder)
    const domicilio = obj((Array.isArray(holder.addresses) ? holder.addresses : [])[0])
    const tipoDe = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? `array(${v.length})` : typeof v)
    const estructura: EstructuraPersonaVendor = {
      projectId,
      holder: Object.keys(holder).sort(),
      domicilio: Object.keys(domicilio).sort(),
      correo: Object.keys(holder)
        .filter((k) => /mail/i.test(k))
        .map((k) => ({ clave: k, tipo: tipoDe(holder[k]) })),
    }
    console.log('[precalificar] estructura de la persona que devuelve el vendor:', JSON.stringify(estructura))
  } catch (e) {
    console.log('[precalificar] estructura persona vendor: no se pudo leer —', e instanceof Error ? e.message : String(e))
  }
}

function error(status: number, causa: string, mensaje: string) {
  return NextResponse.json({ estado: 'error', causa, mensaje, gastado: '0,00€' }, { status })
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}
