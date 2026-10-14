// Tarificador RPA — reglas PURAS del orquestador (05/10/2026). Sin BD ni red: `node --test`.
//
// El canal: apps/asegura encola en `seguros.tarificacion_trabajos`, lanza una máquina EFÍMERA de Fly
// (app `asegura-tarificador`, auto_destroy) por trabajo, y el worker le pide el riesgo y le devuelve
// el resultado por HTTP con su propio Bearer (`TARIFICADOR_WORKER_SECRET`). TARIFICAR ≠ EMITIR.

import { MOTIVOS_FIN, type MotivoFin } from './tarificador-explorador-reglas.ts'
import {
  claveCompania, envDeMaquina, esCif, esDniNie, esTipoError, normalizarDocumento, esVersionBot, referenciaPresupuestoValida, sanearInventarioDom, validarFormularioAuto, validarOfertas, validarOpcionesPoblacion, validarOpcionesVersion, validarRiesgoComunidad, validarTraza,
  type CandidatoVersion, type FormularioAuto, type InventarioDom, type OfertaNormalizada, type OpcionPoblacion, type PasoTraza, type RiesgoComunidad, type TipoError,
} from '@central/module-tarificacion'

/** Entrada de `POST /encolar` ya validada: el ramo discrimina el riesgo (13/10/2026: comunidades o moto). */
export type EntradaRamo = { ramo: 'comunidades'; riesgo: RiesgoComunidad } | { ramo: 'moto'; riesgo: FormularioAuto }
export type ValidacionEntradaRamo = { ok: true; entrada: EntradaRamo } | { ok: false; mensaje: string; errores?: string[] }

/** Cada ramo con SU validador (el worker repite la misma validación antes de abrir el navegador). */
/** Ramos con adaptador de TARIFICACIÓN (lo que acepta `validarEntradaRamo`). Una integración de otro ramo (Hogar) solo explora. */
export const RAMOS_TARIFICABLES_RPA = ['comunidades', 'moto'] as const

export function validarEntradaRamo(ramo: unknown, riesgo: unknown): ValidacionEntradaRamo {
  if (ramo === 'comunidades') {
    const v = validarRiesgoComunidad(riesgo)
    return v.ok ? { ok: true, entrada: { ramo, riesgo: v.riesgo } } : { ok: false, mensaje: 'riesgo inválido', errores: v.errores }
  }
  if (ramo === 'moto') {
    const v = validarFormularioAuto(riesgo)
    if (!v.ok) return { ok: false, mensaje: 'riesgo inválido', errores: v.errores }
    if (v.formulario.ramo !== 'moto') return { ok: false, mensaje: 'riesgo inválido', errores: ['ramo: el formulario de un trabajo moto tiene que ser de moto'] }
    return { ok: true, entrada: { ramo, riesgo: v.formulario } }
  }
  return { ok: false, mensaje: 'ramo no soportado por el tarificador RPA (comunidades o moto)' }
}

// ─── NIF del tomador para Mapfre (14/10/2026, decisión de Alberto) ──────────
// Mapfre NSEI busca al tomador por NIF en el paso 1. Lo rellena ASEGURA en el servidor desde la ficha del cliente
// (descifrada aquí), solo en trabajos de Mapfre y solo si el riesgo no lo trae. El DNI entero NUNCA cruza a plataforma:
// ni en la respuesta del encolado ni en un motivo de rechazo; y NO está en la lista blanca de la purga (se borra al cerrar).

/** Compañías cuyo bot busca al tomador por NIF (hoy solo Mapfre). */
export const COMPANIAS_CON_NIF_TOMADOR = ['mapfre'] as const

/** Lectura del NIF de la ficha: `sin_nif` = la ficha no lo tiene; `ilegible` = cifrado que no abre (no se ha podido mirar). */
export type LecturaNifFicha = { estado: 'ok'; documento: string } | { estado: 'sin_nif' } | { estado: 'ilegible' } | { estado: 'no_valido' }

/**
 * NIF de la ficha → lectura. `v1:` se descifra con `descifrar` (la clave de la cartera); si lanza → `ilegible` (nunca
 * «no hay»). En claro (legado) → tal cual. Tiene que ser DNI/NIE/CIF válido (letra de control incluida). PURA.
 */
export function lecturaNifFicha(guardado: string | null | undefined, descifrar: (v: string) => string): LecturaNifFicha {
  if (typeof guardado !== 'string' || guardado.trim() === '') return { estado: 'sin_nif' }
  let claro: string
  if (guardado.startsWith('v1:')) {
    try {
      claro = descifrar(guardado)
    } catch {
      return { estado: 'ilegible' }
    }
  } else claro = guardado
  if (typeof claro !== 'string' || claro.trim() === '') return { estado: 'sin_nif' }
  const d = normalizarDocumento(claro.trim())
  return esDniNie(d) || esCif(d) ? { estado: 'ok', documento: d } : { estado: 'no_valido' }
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** ¿Este trabajo necesita que asegura ponga el NIF del tomador? Mapfre + auto/moto + el riesgo no trae documento. PURA. */
export function necesitaNifTomador(compania: string, ramo: string, riesgo: unknown): boolean {
  if (!(COMPANIAS_CON_NIF_TOMADOR as readonly string[]).includes(claveCompania(compania))) return false
  if (ramo !== 'auto' && ramo !== 'moto') return false
  if (!esObj(riesgo)) return true
  const doc = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return !doc(riesgo.documentoTomador) && !(esObj(riesgo.tomador) && doc(riesgo.tomador.documentoIdentidad))
}

export type NifTomadorAplicado = { ok: true; riesgo: unknown } | { ok: false; status: 422 | 503; motivo: string }

/**
 * Aplica la regla al riesgo que se va a encolar. PURA (la lectura de la ficha la trae quien llama, solo si hace falta):
 *   · compañía que no busca por NIF → el riesgo SIN `documentoTomador` (no se guarda un dato personal que nadie usa);
 *   · Mapfre y el riesgo ya trae documento → tal cual;
 *   · Mapfre sin documento → el de la ficha; sin NIF / ilegible / no válido → rechazo claro SIN encolar.
 * Ningún motivo lleva el documento.
 */
export function aplicarNifTomador(compania: string, ramo: string, riesgo: unknown, leer: () => LecturaNifFicha): NifTomadorAplicado {
  if (!(COMPANIAS_CON_NIF_TOMADOR as readonly string[]).includes(claveCompania(compania))) {
    if (esObj(riesgo) && 'documentoTomador' in riesgo) {
      const { documentoTomador: _fuera, ...resto } = riesgo
      return { ok: true, riesgo: resto }
    }
    return { ok: true, riesgo }
  }
  if (!necesitaNifTomador(compania, ramo, riesgo)) return { ok: true, riesgo }
  const l = leer()
  if (l.estado === 'ok') return { ok: true, riesgo: { ...(esObj(riesgo) ? riesgo : {}), documentoTomador: l.documento } }
  if (l.estado === 'ilegible') return { ok: false, status: 503, motivo: 'nif_tomador_ilegible: el NIF de la ficha del cliente no se puede descifrar (clave de la cartera); no se encola' }
  if (l.estado === 'no_valido') return { ok: false, status: 422, motivo: 'nif_tomador_no_valido: el NIF/CIF de la ficha del cliente no es válido; corrígelo en la ficha (Mapfre busca al tomador por NIF)' }
  return { ok: false, status: 422, motivo: 'falta_nif_tomador: la ficha del cliente no tiene NIF/CIF y Mapfre busca al tomador por NIF; complétalo en la ficha' }
}

/** Interruptor general. APAGADO salvo `TARIFICADOR_RPA_ACTIVO=1` exacto (fail-closed). */
export function rpaActivo(env: Record<string, string | undefined>): boolean {
  return env.TARIFICADOR_RPA_ACTIVO === '1'
}

/** Región de Fly del worker (París, la más cercana con buena latencia a los portales españoles). */
export const REGION_FLY = 'cdg'
/** Lease de un trabajo `en_curso`: el worker tiene 4 min de tope global; 6 min dan margen al arranque. */
export const LEASE_MS = 6 * 60_000
// ─── Cola: lease, huecos y duplicados (13/10/2026) ───────────────────────────
// La decisión vive aquí (pura); `tarificador.ts` solo trae las filas y aplica lo decidido.

/**
 * ¿El lease de un trabajo `en_curso` ya venció? `null` (no debería existir: CHECK `trabajo_en_curso_con_lease`)
 * = «no se sabe» → NO vencido: el estado conservador es seguir contándolo como ocupado antes que lanzar un
 * segundo bot con la misma credencial.
 */
export function leaseVencido(leaseHasta: Date | null, ahora: Date): boolean {
  if (!leaseHasta || Number.isNaN(leaseHasta.getTime())) return false
  return leaseHasta.getTime() <= ahora.getTime()
}

/** Reparte los `en_curso` de una compañía: los vivos ocupan hueco; los vencidos se dan por fallo de infra. */
export function repartirEnCurso<T extends { leaseHasta: Date | null }>(filas: readonly T[], ahora: Date): { vivos: T[]; vencidos: T[] } {
  const vivos: T[] = []
  const vencidos: T[] = []
  for (const f of filas) (leaseVencido(f.leaseHasta, ahora) ? vencidos : vivos).push(f)
  return { vivos, vencidos }
}

/** Huecos libres bajo `max_concurrencia`. Sin integración autorizada (`null`) o con un tope raro → 0 (fail-closed). */
export function huecosLibres(max: number | null, vivos: number): number {
  if (max === null || !Number.isInteger(max) || max < 1) return 0
  return Math.max(0, max - Math.max(0, vivos))
}

/**
 * Clave de deduplicación al ENCOLAR: un mismo cliente no pide dos veces el mismo riesgo a la misma compañía y ramo.
 * El riesgo NO va en la clave (se compara en SQL como `jsonb`, que ya es igualdad semántica: no importa el orden de
 * las claves); la clave solo serializa a los que encolan lo mismo (`pg_advisory_xact_lock(hashtext(clave))`).
 */
export function claveEncolar(p: { correduriaId: string; clienteId: string; compania: string; ramo: string }): string {
  return ['tarificador:encolar', p.correduriaId, p.clienteId, p.compania, p.ramo].join(':')
}

/** Estados en los que un trabajo previo cuenta como «ese mismo encargo sigue vivo» y el nuevo es duplicado. */
export const ESTADOS_DUPLICADO = ['pendiente', 'en_curso', 'error_reintentable'] as const

/**
 * ¿Un trabajo previo con el MISMO riesgo hace que el nuevo sea duplicado? `pendiente` sí; `en_curso` solo con lease
 * vivo (uno colgado no bloquea pedirlo otra vez); `error_reintentable` solo bajo el tope de intentos (el barrido lo
 * devolverá a `pendiente`: sería el mismo encargo dos veces). Lo terminado, cancelado o pendiente de una persona, no.
 * Un trabajo de EMISIÓN o de EXPLORACIÓN nunca cuenta (es otro encargo, aunque lleve el mismo riesgo).
 */
export function bloqueaDuplicado(
  f: { estado: string; leaseHasta: Date | null; intentos: number; modo: string | null },
  ahora: Date,
  maxIntentos: number,
): boolean {
  if (f.modo === 'emision' || f.modo === 'exploracion') return false
  if (f.estado === 'pendiente') return true
  if (f.estado === 'en_curso') return !leaseVencido(f.leaseHasta, ahora)
  if (f.estado === 'error_reintentable') return Number.isInteger(f.intentos) && f.intentos < maxIntentos
  return false
}

/** Techo de cada PDF/captura (la tabla `documentos` admite 10 MB; el cuerpo de Vercel, ~4,5 MB). */
export const MAX_BYTES_ADJUNTO = 4 * 1024 * 1024
/** Techo del HTML de evidencia (se guarda como documento; más es ruido). */
export const MAX_BYTES_HTML = 2 * 1024 * 1024

export type ConfigFly = { token: string; app: string; imagen: string; apiUrl: string }

export function configFly(env: Record<string, string | undefined>): { ok: true; cfg: ConfigFly } | { ok: false; faltan: string[] } {
  const leer = (k: string) => (env[k] ?? '').trim()
  const faltan = ['FLY_API_TOKEN', 'TARIFICADOR_FLY_APP', 'TARIFICADOR_FLY_IMAGE', 'TARIFICADOR_API_URL'].filter((k) => !leer(k))
  if (faltan.length) return { ok: false, faltan }
  return {
    ok: true,
    cfg: { token: leer('FLY_API_TOKEN'), app: leer('TARIFICADOR_FLY_APP'), imagen: leer('TARIFICADOR_FLY_IMAGE'), apiUrl: leer('TARIFICADOR_API_URL') },
  }
}

/**
 * La petición a la API de Fly Machines que crea la máquina de UN trabajo. El `env` sale de la lista
 * blanca de `envDeMaquina` (JOB_ID + URL): ni DATABASE_URL, ni CODEOSCOPIC_*, ni el Bearer, ni
 * credenciales de portal (esas son fly secrets de la app del worker).
 */
export function peticionMaquina(cfg: ConfigFly, jobId: string): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  const env = envDeMaquina({ jobId, apiUrl: cfg.apiUrl })
  const body = {
    name: `tarificar-${jobId.slice(0, 8)}`,
    region: REGION_FLY,
    config: {
      image: cfg.imagen,
      env,
      auto_destroy: true,
      restart: { policy: 'no' },
      guest: { cpu_kind: 'shared', cpus: 2, memory_mb: 2048 },
      metadata: { trabajo: jobId, canal: 'rpa' },
    },
  }
  return {
    url: `https://api.machines.dev/v1/apps/${encodeURIComponent(cfg.app)}/machines`,
    init: { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  }
}

// ─── El cuerpo del POST /api/tarificador/resultado ───────────────────────────

/** Traza y versión del bot (08/10/2026). `pasos` vacío = sin traza (o rechazada: ver `trazaRechazada`). */
export type MetaWorker = { pasos: PasoTraza[]; botVersion: string | null; trazaRechazada?: string[] }

export type ResultadoWorker =
  | ({ tipo: 'ok'; trabajoId: string; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; contenido: Buffer }[] } & MetaWorker)
  | ({
      tipo: 'error'
      trabajoId: string
      /** `opcionesVersion` (13/10/2026): lista COMPLETA de versiones de un `requiere_eleccion_version`; se guarda en el
       *  `error` jsonb del trabajo y es la lista contra la que se valida cualquier elección (IA o bandeja). */
      /** `inventarioDom` (13/10/2026): ESTRUCTURA de la pantalla de un hueco de mapa (`ErrorMapaIncompleto`), saneada otra
       *  vez aquí (sin valores de campos, sin datos personales, ≤60 KB); se guarda en el `error` jsonb. Nunca se loguea. */
      error: { tipo: TipoError; mensaje: string; url: string | null; opcionesVersion?: CandidatoVersion[]; opcionesPoblacion?: OpcionPoblacion[]; inventarioDom?: InventarioDom }
      captura: Buffer | null
      html: string | null
    } & MetaWorker)
  /**
   * Exploración terminada (13/10/2026): el MAPA ya está en su cabecera (cierre); aquí el desenlace del trabajo y, si se guardó
   * el presupuesto (14/10/2026), su PDF (como mucho uno) y la referencia del portal (`null` = no se vio).
   */
  | ({ tipo: 'explorado'; trabajoId: string; motivoFin: MotivoFin; presupuesto: PresupuestoExplorado | null } & MetaWorker)

/** El presupuesto GUARDADO por el explorador: PDF descargado (o `null`) y referencia (o `null`). */
export type PresupuestoExplorado = { referencia: string | null; pdf: { nombre: string; contenido: Buffer } | null }

/**
 * Traza y versión del cuerpo del worker. La traza es ACCESORIA: si trae una clave que no es de las cinco permitidas
 * (p. ej. un dato personal) se descarta ENTERA y el resultado del trabajo se guarda igual (`trazaRechazada` dice por qué,
 * sin repetir valores). Una versión que no sea semver → `null`.
 */
export function leerMetaWorker(e: Record<string, unknown>): MetaWorker {
  const v = validarTraza(e.pasos)
  const botVersion = esVersionBot(e.botVersion) ? e.botVersion : null
  return v.ok ? { pasos: v.pasos, botVersion } : { pasos: [], botVersion, trazaRechazada: v.errores.slice(0, 5) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function base64(v: unknown, campo: string, errores: string[], max: number): Buffer | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) {
    errores.push(`${campo}: no es base64`)
    return null
  }
  const b = Buffer.from(v, 'base64')
  if (b.length === 0) errores.push(`${campo}: vacío`)
  else if (b.length > max) errores.push(`${campo}: ${b.length} bytes supera el techo de ${max}`)
  return b.length && b.length <= max ? b : null
}

const esPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-'
const esPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG'

export function leerResultadoWorker(entrada: unknown): { ok: true; r: ResultadoWorker } | { ok: false; errores: string[] } {
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['el cuerpo tiene que ser un objeto JSON'] }
  const trabajoId = typeof e.trabajoId === 'string' ? e.trabajoId.trim() : ''
  if (!UUID.test(trabajoId)) return { ok: false, errores: ['trabajoId no es un uuid'] }
  const errores: string[] = []

  if (e.resultado === 'ok') {
    const lista = Array.isArray(e.pdfs) ? e.pdfs : []
    if (lista.length > 10) return { ok: false, errores: ['más de 10 PDF en un resultado'] }
    const pdfs: { nombre: string; contenido: Buffer }[] = []
    lista.forEach((p, i) => {
      const o = obj(p)
      if (!o || o.base64 === undefined || o.base64 === null) {
        errores.push(`pdfs[${i}].base64: falta`)
        return
      }
      const b = base64(o.base64, `pdfs[${i}].base64`, errores, MAX_BYTES_ADJUNTO)
      if (b && !esPdf(b)) errores.push(`pdfs[${i}]: no empieza por %PDF-`)
      const nombre = typeof o.nombre === 'string' && o.nombre.trim() ? o.nombre.trim().slice(0, 120) : `oferta-${i + 1}.pdf`
      if (b) pdfs.push({ nombre, contenido: b })
    })
    const v = validarOfertas(e.ofertas, lista.length)
    if (!v.ok) errores.push(...v.errores)
    if (errores.length || !v.ok) return { ok: false, errores }
    return { ok: true, r: { tipo: 'ok', trabajoId, ofertas: v.ofertas, pdfs, ...leerMetaWorker(e) } }
  }

  if (e.resultado === 'error') {
    const err = obj(e.error)
    if (!esTipoError(err?.tipo)) errores.push('error.tipo desconocido')
    const mensaje = typeof err?.mensaje === 'string' && err.mensaje.trim() ? err.mensaje.trim().slice(0, 2000) : null
    if (!mensaje) errores.push('error.mensaje falta')
    const captura = base64(e.capturaBase64, 'capturaBase64', errores, MAX_BYTES_ADJUNTO)
    if (captura && !esPng(captura)) errores.push('capturaBase64: no es un PNG')
    const html = typeof e.html === 'string' && e.html !== '' ? e.html : null
    if (html && Buffer.byteLength(html, 'utf8') > MAX_BYTES_HTML) errores.push('html supera el techo')
    const url = typeof err?.url === 'string' ? err.url.slice(0, 500) : null
    // Accesoria, como la traza: una lista inválida se DESCARTA (sin lista no hay elección por código) y el fallo se guarda igual.
    const opcionesVersion = err?.tipo === 'captcha' ? validarOpcionesVersion(err.opcionesVersion) : null
    // Poblaciones de un CP ambiguo (13/10/2026): accesoria igual que la de versiones (inválida → se descarta).
    const opcionesPoblacion = err?.tipo === 'captcha' ? validarOpcionesPoblacion(err.opcionesPoblacion) : null
    // Accesorio también: se RE-SANEA (lista blanca + filtro de datos personales + tope de bytes); sin forma → se descarta.
    const inventarioDom = err?.inventarioDom !== undefined ? sanearInventarioDom(err.inventarioDom) : null
    if (errores.length) return { ok: false, errores }
    return {
      ok: true,
      r: { tipo: 'error', trabajoId, error: { tipo: err!.tipo as TipoError, mensaje: mensaje!, url, ...(opcionesVersion ? { opcionesVersion } : {}), ...(opcionesPoblacion ? { opcionesPoblacion } : {}), ...(inventarioDom ? { inventarioDom } : {}) }, captura, html, ...leerMetaWorker(e) },
    }
  }

  if (e.resultado === 'explorado') {
    const motivoFin = MOTIVOS_FIN.find((m) => m === e.motivoFin)
    if (!motivoFin) return { ok: false, errores: ['motivoFin fuera de lista'] }
    // Presupuesto guardado (14/10/2026): opcional; si viene, forma ESTRICTA (un PDF de verdad, referencia sin forma de dato personal).
    let presupuesto: PresupuestoExplorado | null = null
    if (e.presupuesto !== undefined && e.presupuesto !== null) {
      const pr = obj(e.presupuesto)
      if (!pr || Object.keys(pr).some((k) => !['referencia', 'pdf'].includes(k))) return { ok: false, errores: ['presupuesto con forma no válida'] }
      const referencia = pr.referencia === undefined || pr.referencia === null ? null : referenciaPresupuestoValida(pr.referencia) ? pr.referencia : undefined
      if (referencia === undefined) return { ok: false, errores: ['presupuesto.referencia no válida'] }
      let pdf: PresupuestoExplorado['pdf'] = null
      if (pr.pdf !== undefined && pr.pdf !== null) {
        const o = obj(pr.pdf)
        const b = o ? base64(o.base64, 'presupuesto.pdf.base64', errores, MAX_BYTES_ADJUNTO) : null
        if (!o) errores.push('presupuesto.pdf no es un objeto')
        else if (!b) errores.push('presupuesto.pdf.base64: falta')
        else if (!esPdf(b)) errores.push('presupuesto.pdf: no empieza por %PDF-')
        if (errores.length) return { ok: false, errores }
        const nombre = typeof o!.nombre === 'string' && /^[\w.() -]{1,120}$/.test(o!.nombre.trim()) ? o!.nombre.trim() : 'presupuesto.pdf'
        pdf = { nombre, contenido: b! }
      }
      presupuesto = { referencia, pdf }
    }
    return { ok: true, r: { tipo: 'explorado', trabajoId, motivoFin, presupuesto, ...leerMetaWorker(e) } }
  }

  return { ok: false, errores: ['resultado tiene que ser «ok», «error» o «explorado»'] }
}
