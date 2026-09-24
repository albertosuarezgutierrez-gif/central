// El presupuesto, visto desde el PORTAL. Solo lectura (PR 2): ni se elige, ni
// se firma, ni se manda nada. Lo único que este fichero escribe son dos sellos
// que no son del cliente sino SOBRE el cliente: `visto_at` y la telemetría.
//
// Diseño: `docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md`
// (§3.1 la puerta, §4 la pantalla). Lo puro vive en `lib/presupuesto-vista.ts`.
//
// ─── La puerta, que es lo que hay que leer antes de tocar nada ───────────────
//
// 🚨 **EL TOKEN NO ABRE SESIÓN.** El token dice QUÉ presupuesto es; QUIÉN eres
// lo dice el código de un solo uso que llega a tu correo. Por tres razones que
// ya están medidas en `portal_invitacion` y valen igual aquí:
//
//   1. Un GET que consume estado se lo comen el antivirus del correo y el
//      prefetch antes de que la persona lo toque.
//   2. Un token en un correo es una llave REENVIABLE. Con el contenido detrás
//      del token, quien lee un buzón compartido ve el precio, la compañía y el
//      bien asegurado de un tercero — y en salud, vida o decesos eso roza un
//      dato de categoría especial.
//   3. «Aceptado por el que tenía el enlace» no es prueba de consentimiento
//      (art. 7.1 RGPD), y aquí encima se acabará firmando.
//
// ─── Quién lo puede ver, ya con sesión ───────────────────────────────────────
//
// DOS ramas, porque una persona puede tener dos correos suyos y entrar por el
// otro:
//   (a) el `portal_canal.valor_hash` de quien entra coincide con
//       `presupuesto.destino_hash` — o sea, entró por el mismísimo canal al que
//       Alberto lo mandó;
//   (b) su `portal_vinculo.cliente_id` es el `presupuesto.cliente_id`.
//
// 🚨 Y una landmine que hay que decir en voz alta: la rama (a) **no puede
// funcionar hasta que `apps/asegura` escriba `destino_hash` con ESTA misma
// función** (`hashCanal`, SHA-256 con `ASEGURA_PORTAL_CANAL_PEPPER`), que hoy
// es una pimienta que solo existe en el portal. Mientras la columna siga a NULL
// —que es como la deja el PR 1— la rama (a) no concede nada, y eso NO es «no
// coincide»: es «no consta a quién se avisó». Se trata como tal.
//
// ─── Aislamiento ─────────────────────────────────────────────────────────────
// No hay RLS que rescate un olvido: el rol es NOBYPASSRLS pero estas tablas no
// tienen políticas para él, así que una consulta sin filtro responde 200 con el
// presupuesto de cualquiera. Toda lectura parte de la identidad de la cookie
// (`lib/session`) y del vínculo (`portal_vinculo`). Ningún `clienteId` entra
// desde fuera de este fichero.

import { formatoTokenVistaValido, hashTokenVista } from '@central/module-seguros-portal'
import { WHERE_CARTERA_VIVA } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'

import { hashCanal } from './auth'
import { prisma } from './db'
import { getIdentidad } from './session'
import { coberturasDeJson, leerFirmeza, leerSinEquivalente, esPapel, type Firmeza, type PapelPortada, type SinEquivalente } from './presupuesto-vista'

// ─── Lo que la pantalla necesita ─────────────────────────────────────────────

export type OpcionCliente = {
  id: string
  orden: number
  compania: string
  producto: string
  modalidad: string | null
  /** `null` = no se pudo clasificar el nivel de cobertura. No es «sin cobertura». */
  grupoCobertura: string | null
  primaEur: number | null
  entradaEur: number | null
  /** 🚨 `null` = el producto NO declara franquicia. Jamás «sin franquicia». */
  franquiciaEur: number | null
  firmeza: Firmeza
  /** Las que la compañía manda con el precio. Se enseñan SIEMPRE. */
  avisos: string[]
  /** Las garantías congeladas. Vacío = **no se congelaron**, no «no cubre nada». */
  coberturas: string[]
  papeles: PapelPortada[]
  /** La de menor importe NO comparte cobertura con la actual. Se pinta. */
  coberturaDistinta: boolean
  esPortada: boolean
}

/** Lo que el cliente tiene HOY. `null` entero = venta nueva (`poliza_id IS NULL`). */
export type ActualCliente = {
  compania: string
  ramo: string
  /** El bien, descrito. NUNCA el número de póliza como identificador. */
  bien: string | null
  ubicacion: string | null
  fechaVencimiento: Date | null
  primaAnual: number | null
  /** `null` = no se ha podido leer el desglose; `[]` = leído y vacío. */
  coberturas: string[] | null
}

export type PresupuestoCliente = {
  id: string
  ramo: string
  creadoAt: Date
  venceEl: Date
  caducado: boolean
  /** Retirado por el corredor. El motivo NO cruza: es una nota interna suya. */
  retirado: boolean
  enviadoAt: Date | null
  elegidoAt: Date | null
  aceptadoAt: Date | null
  emitidoAt: Date | null
  /** Por qué no hay equivalente, cuando no lo hay. DOS motivos, no uno. */
  motivoSinEquivalente: SinEquivalente | null
  opciones: OpcionCliente[]
  actual: ActualCliente | null
  /** `true` cuando quien mira es Alberto con la vista de corredor. */
  vistaDeCorredor: boolean
  /** Lo que el cliente pidió, según lo anotó el corredor. `null` = no consta por escrito. */
  necesidades: string | null
}

export type LecturaPresupuesto =
  | { estado: 'ok'; presupuesto: PresupuestoCliente }
  /** No existe, o no es de nadie que podamos nombrar. Texto NEUTRO. */
  | { estado: 'no_encontrado' }
  /** Existe y NO es de quien mira. 403 neutro + `presupuesto_evento`. */
  | { estado: 'ajeno' }
  /** El correo de quien mira aparece en más de una ficha: lo revisa el corredor. */
  | { estado: 'vinculo_ambiguo' }
  | { estado: 'sin_sesion' }
  | { estado: 'error' }

// ─── La carátula pública: solo si el enlace VIVE ─────────────────────────────

export type Caratula =
  /** El enlace vale. `id` se usa para llevar a la pantalla de dentro TRAS entrar. */
  | { estado: 'viva'; id: string }
  /** No existe, caducó, se retiró o no tiene ni forma de token: **lo mismo**. */
  | { estado: 'muerta' }

/**
 * Resuelve el token del enlace, SIN sesión y SIN contar nada.
 *
 * 🚨 Devuelve `{estado, id}` y ni un dato más: hasta que hay sesión no hay a
 * quien enseñarle nada. Y los cuatro finales malos se colapsan en `muerta` a
 * propósito — distinguir «no existe» de «ya no vale» convierte esta URL en un
 * oráculo con el que averiguar tokens válidos a base de probar.
 *
 * Es la ÚNICA consulta de este fichero sin identidad, igual que
 * `invitacionPorToken`: el token no concede nada, solo dice si merece la pena
 * pintar el formulario de entrada.
 */
export async function caratulaPorToken(tokenCrudo: unknown): Promise<Caratula> {
  // La FORMA se valida antes de tocar la BD: un valor cualquiera metido en la
  // URL no tiene por qué llegar a una consulta.
  if (!formatoTokenVistaValido(tokenCrudo)) return { estado: 'muerta' }
  try {
    const fila = await prisma.presupuesto.findUnique({
      where: { tokenHash: await hashTokenVista(tokenCrudo) },
      select: { id: true, retiradoAt: true },
    })
    // 🚨 Un presupuesto CADUCADO sigue vivo para esta puerta: la pantalla de
    // dentro lo sigue enseñando con los precios marcados como caducados (es
    // información suya, tachar la página sería peor). Lo único que mata el
    // enlace es que el corredor lo retire.
    if (!fila || fila.retiradoAt !== null) return { estado: 'muerta' }
    return { estado: 'viva', id: fila.id }
  } catch (e) {
    registrar('caratulaPorToken', e)
    // Un fallo de BD NO se cuenta como enlace muerto hacia fuera: se colapsa
    // igual (no hay nada que enseñar) pero queda en el log para saber que la
    // causa fue nuestra y no del enlace.
    return { estado: 'muerta' }
  }
}

// ─── La pantalla de dentro ───────────────────────────────────────────────────

/**
 * El presupuesto `id`, para la identidad de la cookie.
 *
 * El `id` viene de la URL, así que **la autorización va antes de cualquier otra
 * lectura**: primero se decide si esta persona lo puede ver y solo después se
 * bajan las opciones y la póliza actual.
 */
export async function presupuestoDeSesion(id: string): Promise<LecturaPresupuesto> {
  const identidad = await getIdentidad()
  if (!identidad) return { estado: 'sin_sesion' }
  const identidadId = identidad.id
  const vistaDeCorredor = identidad.corredor !== null

  if (!UUID.test(id)) return { estado: 'no_encontrado' }

  try {
    const p = await prisma.presupuesto.findUnique({
      where: { id },
      select: {
        id: true,
        correduriaId: true,
        clienteId: true,
        polizaId: true,
        ramo: true,
        destinoHash: true,
        venceEl: true,
        creadoAt: true,
        enviadoAt: true,
        vistoAt: true,
        elegidoAt: true,
        aceptadoAt: true,
        emitidoAt: true,
        retiradoAt: true,
        necesidades: true,
      },
    })
    if (!p) return { estado: 'no_encontrado' }

    // ── ¿Quién mira? ──────────────────────────────────────────────────────
    //
    // Rama (b): el vínculo identidad ↔ ficha, que es la costura de siempre. El
    // `where` lleva el `identidadId` de la cookie DENTRO, no comprobado en la
    // línea siguiente.
    const vinculo = await prisma.portalVinculo.findFirst({
      where: { identidadId, clienteId: p.clienteId },
      select: { id: true, correduriaId: true },
    })

    // Rama (a): el canal por el que entró es el mismo al que se avisó.
    //
    // 🚨 `destinoHash === null` **no es «no coincide»**: es «no consta a quién
    // se avisó» (hoy, todas las filas — el envío es el PR 3). Un `null` que
    // entrara en la comparación daría acceso a cualquiera cuyo canal hashee a
    // `null`, o sea a nadie, pero escrito de forma que el día que alguien
    // relaje el tipo se abra solo. Se corta antes.
    let porCanal = false
    if (p.destinoHash !== null && p.destinoHash !== '') {
      const canal = await prisma.portalCanal.findFirst({
        where: { identidadId, valorHash: p.destinoHash },
        select: { id: true },
      })
      porCanal = canal !== null
    }

    // 🚨 Cinturón de la rama (a), simétrico al de la (b) de más abajo:
    // `portal_canal` no lleva `correduria_id` (un canal es de la identidad, no
    // de una correduria), así que no hay con qué comprobarlo directamente. Lo
    // que SÍ se puede comprobar es que esta identidad no tenga ya un vínculo
    // establecido con OTRA correduria: si lo tiene, coincidir por canal aquí
    // no basta para creer que es la misma persona en ESTA correduria. Hoy es
    // inalcanzable (una sola correduria en todo el sistema), pero el día que
    // haya una segunda, esta guarda ya está puesta.
    if (porCanal) {
      const otraCorreduria = await prisma.portalVinculo.findFirst({
        where: { identidadId, correduriaId: { not: p.correduriaId } },
        select: { id: true },
      })
      if (otraCorreduria !== null) porCanal = false
    }

    if (vinculo === null && !porCanal) {
      // ¿Es que su correo está en dos fichas? Entonces no es «esto no es tuyo»:
      // es «no lo hemos podido decidir», y se dice con la misma frase que ya
      // usa la bóveda. Un «no eres tú» sobre un empate es una acusación falsa.
      const estadoVinculo = await ultimoVinculoDe(identidadId)
      if (estadoVinculo === 'ambiguo') return { estado: 'vinculo_ambiguo' }
      await anotarAperturaAjena(p.id)
      return { estado: 'ajeno' }
    }

    // Cinturón: el presupuesto y el vínculo tienen que ser de la MISMA
    // correduría. Con un rol sin RLS, un id de otra correduría no falla: da los
    // datos de otro.
    if (vinculo !== null && vinculo.correduriaId !== p.correduriaId) {
      await anotarAperturaAjena(p.id)
      return { estado: 'ajeno' }
    }

    const hoy = new Date()
    const caducado = p.venceEl.getTime() < hoy.getTime()

    const [opciones, actual] = await Promise.all([
      leerOpciones(p.id),
      p.polizaId === null ? Promise.resolve(null) : leerActual(p.polizaId, p.clienteId, p.correduriaId),
    ])

    // ── El sello ──────────────────────────────────────────────────────────
    //
    // 🚨 Alberto mirando con la vista de corredor NO sella `visto_at`. Si lo
    // hiciera, la cola de Hoy diría «el cliente lo ha abierto» sobre una
    // pantalla que abrió él — y eso decide si se le vuelve a llamar o se le
    // deja en paz creyendo que ya lo ha visto.
    if (!vistaDeCorredor) await sellarVisto(p.id, p.clienteId, p.vistoAt)

    return {
      estado: 'ok',
      presupuesto: {
        id: p.id,
        ramo: p.ramo,
        creadoAt: p.creadoAt,
        venceEl: p.venceEl,
        caducado,
        retirado: p.retiradoAt !== null,
        enviadoAt: p.enviadoAt,
        elegidoAt: p.elegidoAt,
        aceptadoAt: p.aceptadoAt,
        emitidoAt: p.emitidoAt,
        motivoSinEquivalente: motivoSinEquivalenteDe(opciones, actual),
        opciones,
        actual,
        vistaDeCorredor,
        necesidades: p.necesidades?.trim() || null,
      },
    }
  } catch (e) {
    registrar('presupuestoDeSesion', e)
    return { estado: 'error' }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Por qué no hay «la equivalente». Se DERIVA, porque el motivo que calculó
 * `elegirPortada()` al preparar no se guarda en ninguna columna (lo devuelve
 * `PresupuestoPreparado` y muere ahí).
 *
 * 🚨 Los dos motivos NO se colapsan, que es lo que exige el §4.2: sin póliza
 * actual o sin su desglose, es `actual_sin_coberturas` («no puedo compararlo
 * con lo que tienes»); con desglose leído y ninguna opción marcada equivalente,
 * es `sin_equivalente` («ninguna compañía me ha dado tu misma cobertura»).
 *
 * ⚠️ Derivarlo es una aproximación declarada: si algún día el preparador congela
 * su `motivoSinEquivalente` en una columna, esta función se cambia por esa
 * lectura — no se dejan las dos.
 */
function motivoSinEquivalenteDe(opciones: OpcionCliente[], actual: ActualCliente | null): SinEquivalente | null {
  if (opciones.some((o) => o.papeles.includes('equivalente'))) return null
  const sinDesglose = actual === null || actual.coberturas === null || actual.coberturas.length === 0
  return leerSinEquivalente(sinDesglose ? 'actual_sin_coberturas' : 'sin_equivalente')
}

async function leerOpciones(presupuestoId: string): Promise<OpcionCliente[]> {
  const filas = await prisma.presupuestoOpcion.findMany({
    where: { presupuestoId },
    orderBy: { orden: 'asc' },
    select: {
      id: true,
      orden: true,
      compania: true,
      producto: true,
      modalidad: true,
      grupoCobertura: true,
      primaEur: true,
      entradaEur: true,
      franquiciaEur: true,
      firmeza: true,
      avisos: true,
      coberturas: true,
      papeles: true,
    },
  })
  return filas.map((f) => {
    const papeles = f.papeles.filter(esPapel)
    return {
      id: f.id,
      orden: f.orden,
      compania: f.compania,
      producto: f.producto,
      modalidad: f.modalidad,
      grupoCobertura: f.grupoCobertura,
      primaEur: decimal(f.primaEur),
      entradaEur: decimal(f.entradaEur),
      franquiciaEur: decimal(f.franquiciaEur),
      firmeza: leerFirmeza(f.firmeza),
      avisos: coberturasDeJson(f.avisos),
      coberturas: coberturasDeJson(f.coberturas),
      papeles,
      // `coberturaDistinta` tampoco se congela: se deriva de que la opción haga
      // de «menor importe» sin que ninguna haga de equivalente, que es
      // exactamente la condición con la que `elegirPortada()` la marca.
      coberturaDistinta:
        papeles.includes('mas_barata') && !filas.some((o) => o.papeles.includes('equivalente')),
      esPortada: papeles.length > 0,
    }
  })
}

/**
 * La póliza que se compara. Se lee por su id **y** por el `cliente_id` del
 * presupuesto: un `poliza_id` que apuntara a otra ficha no puede pintar aquí la
 * casa de otro.
 *
 * Y se exige cartera VIVA: una del volcado histórico (vencimientos 2013-2018)
 * pintada como «lo que tienes hoy» sería una comparación contra un seguro que
 * ya no existe.
 */
async function leerActual(polizaId: string, clienteId: string, correduriaId: string): Promise<ActualCliente | null> {
  // `WHERE_CARTERA_VIVA` va DENTRO del `AND`: es un `OR` de dos brazos y
  // esparcirlo al lado de los demás filtros lo convertiría en un `OR` que se
  // come el resto de la consulta (la misma trampa que ya documenta
  // `cartera-lectura.ts`).
  const p = await prisma.poliza.findFirst({
    where: {
      AND: [{ id: polizaId, clienteId, correduriaId, mergedIntoPolizaId: null }, WHERE_CARTERA_VIVA],
    },
    select: {
      aseguradora: true,
      tipo: true,
      fechaVencimiento: true,
      primaAnual: true,
      datosEspecificos: true,
    },
  })
  if (!p) return null

  // 🚨 `null` = NO SE HA PODIDO LEER, nunca `[]`. Si esta consulta falla, la
  // tabla de garantías tiene que poder decir «no lo sé» en vez de pintar cada
  // garantía de la nueva como una mejora.
  let coberturas: string[] | null = null
  try {
    const cob = await prisma.polizaCobertura.findMany({
      where: { polizaId, correduriaId },
      orderBy: { numeroOrden: 'asc' },
      select: { descripcion: true },
    })
    coberturas = cob.map((c) => c.descripcion).filter((d): d is string => typeof d === 'string' && d.trim() !== '')
  } catch (e) {
    registrar('leerActual/coberturas', e)
  }

  const { bien, ubicacion } = describirBienDeDatos(p.datosEspecificos)

  return {
    compania: p.aseguradora ?? 'tu compañía',
    ramo: p.tipo ?? 'seguro',
    // 🚨 `numero_poliza` NO viaja: regla permanente del portal, el número de
    // póliza no identifica una póliza para el cliente. Nadie se lo sabe, y la
    // pantalla del corredor ya aprendió que dos hogares de la misma compañía se
    // distinguen por la casa, no por un número de trece dígitos.
    bien,
    ubicacion,
    fechaVencimiento: p.fechaVencimiento,
    primaAnual: decimal(p.primaAnual),
    coberturas,
  }
}

/**
 * El bien, en corto. No se usa `describirBien()` del módulo porque aquí no hace
 * falta la ficha entera: en la cabecera de la comparativa cabe una línea.
 *
 * La dirección viaja CIFRADA dentro de `datos_especificos` (`v1:iv:cipher:tag`).
 * Si no se abre, se devuelve `null` — un criptograma en pantalla es peor que un
 * hueco, y un hueco aquí no afirma nada.
 */
function describirBienDeDatos(datos: unknown): { bien: string | null; ubicacion: string | null } {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return { bien: null, ubicacion: null }
  const d = datos as Record<string, unknown>
  const partes = [d.marca, d.modelo, d.matricula].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  const bien = partes.length > 0 ? partes.join(' · ') : null
  return { bien, ubicacion: direccion(d) }
}

function direccion(d: Record<string, unknown>): string | null {
  const bruta = d.direccion
  if (typeof bruta !== 'string' || bruta.trim() === '') return null
  let clara = bruta
  if (bruta.startsWith('v1:')) {
    try {
      clara = decryptField(bruta)
    } catch {
      return null
    }
  }
  // Sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el sobre TAL CUAL. Un
  // `v1:…` en pantalla no es una dirección: es la prueba de que falta la clave.
  if (clara.startsWith('v1:')) return null
  const localidad = typeof d.localidad === 'string' ? d.localidad.trim() : ''
  return [clara.trim(), localidad].filter((s) => s !== '').join(', ')
}

/**
 * `enviado → visto`, filtrado por el `cliente_id` que YA se ha autorizado
 * arriba, y solo la primera vez (`coalesce(visto_at, now())` escrito como un
 * `where vistoAt: null`).
 *
 * Best-effort a propósito: el presupuesto ya se está enseñando, y un sello que
 * falla no puede convertirse en una pantalla que no carga. Lo que se pierde es
 * que la cola de Hoy diga que lo abrió.
 *
 * ⚠️ Decisión que la spec no cierra, dicha en voz alta: **no se exige
 * `enviado_at`** aunque su tabla de transiciones diga «enviado → visto». Con el
 * enlace de WhatsApp el mensaje sale del móvil de Alberto y `enviado_at` solo
 * se sella si él marca «ya lo he mandado» — una casilla opcional. Si el sello
 * exigiera `enviado_at`, el caso más valioso de todos (alguien con su correo
 * probado abre un presupuesto que consta solo como `enlazado`, o sea: SÍ se
 * mandó) no dejaría rastro. Lo que `visto_at` afirma es «consta que lo abrió
 * quien puede verlo», y eso es cierto en las dos ramas.
 */
async function sellarVisto(id: string, clienteId: string, vistoAt: Date | null): Promise<void> {
  if (vistoAt !== null) return
  try {
    await prisma.presupuesto.updateMany({
      where: { id, clienteId, vistoAt: null },
      data: { vistoAt: new Date() },
    })
  } catch (e) {
    registrar('sellarVisto', e)
  }
}

/**
 * Alguien con sesión ha abierto un presupuesto que no es suyo. Se anota para
 * que Alberto lo sepa (§3.1) — no para bloquear a nadie.
 *
 * ⚠️ **Se anota UNA vez por hora y por presupuesto**, no una por recarga: la
 * tabla es append-only y un F5 sostenido la llenaría. Es un aviso, no un
 * registro de auditoría; el detalle del embudo vive en la telemetría del PR 3.
 *
 * 🚫 Y en el `detalle` NO va ni el correo ni la identidad de quien abrió: el
 * historial de la casa no guarda valores de datos de identidad.
 */
async function anotarAperturaAjena(presupuestoId: string): Promise<void> {
  try {
    const desde = new Date(Date.now() - 60 * 60 * 1000)
    const ya = await prisma.presupuestoEvento.findFirst({
      where: { presupuestoId, tipo: 'apertura_ajena', ocurridoAt: { gte: desde } },
      select: { id: true },
    })
    if (ya) return
    await prisma.presupuestoEvento.createMany({
      data: [{ presupuestoId, tipo: 'apertura_ajena', origen: 'cliente' }],
    })
  } catch (e) {
    registrar('anotarAperturaAjena', e)
  }
}

/**
 * Cómo salió el último intento de vínculo de esta identidad. Se LEE del sello
 * que dejó el canje del código: aquí no existe el correo en claro, así que no
 * se puede recalcular.
 */
async function ultimoVinculoDe(identidadId: string): Promise<string | null> {
  try {
    const i = await prisma.portalIdentidad.findUnique({
      where: { id: identidadId },
      select: { ultimoVinculo: true },
    })
    return i?.ultimoVinculo ?? null
  } catch (e) {
    registrar('ultimoVinculoDe', e)
    return null
  }
}

/** Prisma devuelve `numeric` como `Decimal`. Se convierte en UN solo sitio. */
function decimal(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

/** El motivo sí se registra; ni el token, ni el hash del canal, ni el correo. */
function registrar(donde: string, e: unknown): void {
  console.error(`[portal/presupuesto] ${donde}:`, e instanceof Error ? e.message : e)
}

/** `hashCanal` se re-exporta para que el cepo vea que la rama (a) usa ESTA función. */
export { hashCanal }
