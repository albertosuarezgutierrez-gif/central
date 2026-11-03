/**
 * Fase 4 de la unificación de la ingesta CIMA (spec 2026-11-02) — comparador en SOMBRA.
 *
 * `compararSombra` repite los ficheros crudos que el CRM ya guardó
 * (`cima_cuarentena_crudo`, descifrados por el caller) por el pipeline de CENTRAL
 * (`buildCimaPullDeps` + `runCimaPull`) sobre un `db` GRABADOR (`grabador.ts`): las
 * lecturas van a la BD real (solo lectura) y las escrituras se graban sin ejecutarse.
 * Luego reconstruye lo que central ESCRIBIRÍA en pólizas, recibos, siniestros y cuenta
 * de efectivo y lo compara, por clave natural, con lo que el CRM dejó en la BD.
 *
 * Seguridad (por qué no escribe ni confirma nada aunque el pipeline corra «en real»):
 *  1. El pipeline NO recibe ninguna conexión: solo el grabador, construido aquí dentro.
 *  2. El adaptador de TIREA que recibe LANZA ante cualquier llamada, `confirm` también,
 *     y las opciones llevan `sinConfirmarTirea: true` (el pipeline ni lo intenta).
 *  3. Si el entorno REAL (`opts.env` o `process.env`) dice `CIMA_ESCRITOR=central`, aborta:
 *     la sombra solo corre con el escritor real en `crm`/`ninguno`.
 *  4. El gate de escritura de la capa de BD (`exigirEscritorCentral`) lee el env que se le
 *     INYECTA; para que el pipeline llegue a «escribir» en el grabador, ese env interno de
 *     la sombra (`ENV_INTERNO_SOMBRA`) dice `central`. Ese env nunca sale de esta función
 *     ni acompaña a un `db` real.
 *
 * Límites (conocidos, no se maquillan):
 *  - Las lecturas del pipeline ven el estado FINAL que dejó el CRM, no el intermedio de
 *    cada fichero; y dentro de la tx emulada no ven las escrituras previas de la sombra.
 *  - Una expresión del SET que no se sabe evaluar (p. ej. el merge jsonb de
 *    `datos_especificos`) NO se compara: se cuenta en `noComparados`.
 *  - Solo se comparan las 4 tablas principales; clientes, coberturas, intervinientes,
 *    terceros, liquidaciones, ledger y eventos se cuentan como sentencias, no se comparan.
 */
import { buildCimaPullDeps, type BuildCimaPullDepsOptions } from "../db/pull-deps.ts";
import type { AlertasCima } from "../db/alertas.ts";
import { cimaEscritorActivo } from "../db/escritor.ts";
import { runCimaPull, type CimaPullOptions } from "../ingest-pipeline.ts";
import { sanitizePiiES } from "../pii-sanitizer.ts";
import type { FicheroParseado } from "../wse-schemas.ts";
import { crearDbGrabador, type EscrituraGrabada, type LectorSql } from "./grabador.ts";
import { compararValores, enmascararInforme, normalizarValor, valorVisible } from "./informe.ts";
import { parsearEscritura, type EscrituraParseada, type ExprSql } from "./sql-escrituras.ts";

export const TABLAS_COMPARADAS = ["polizas", "poliza_recibos", "siniestros", "cuenta_efectivo"] as const;
export type TablaComparada = (typeof TABLAS_COMPARADAS)[number];

/** Clave natural de cada tabla (las de los `on conflict` de persist-*). */
export const CLAVES_NATURALES: Readonly<Record<TablaComparada, readonly string[]>> = {
  polizas: ["correduria_id", "id_poliza_entidad", "codigo_entidad_dgs"],
  poliza_recibos: ["correduria_id", "id_recibo", "codigo_entidad_dgs"],
  siniestros: ["correduria_id", "id_siniestro_entidad", "codigo_entidad_dgs"],
  cuenta_efectivo: ["correduria_id", "codigo_entidad_dgs", "periodo_inicio", "periodo_fin"],
};

/** Columnas que no se comparan nunca (técnicas o del reloj). */
const COLUMNAS_IGNORADAS = new Set(["id", "created_at", "updated_at"]);

/** Opciones del pipeline en la sombra: real (para que «persista» en el grabador),
 * reprocess (el ledger ya tiene estos ficheros) y SIN hablar NUNCA con TIREA. */
export const CIMA_SOMBRA_OPTS: Readonly<CimaPullOptions> = Object.freeze({
  dryRun: false,
  reprocess: true,
  sinConfirmarTirea: true,
});

/** Env interno del pipeline (ver «Seguridad» 4). Solo acompaña al grabador. */
const ENV_INTERNO_SOMBRA = { CIMA_ESCRITOR: "central" } as const;

export type FilaBd = Record<string, unknown>;

/** Lectura del estado actual que dejó el CRM (en la sombra real, BD en solo lectura). */
export interface LectorEstadoActual {
  porClave: (tabla: TablaComparada, clave: Readonly<Record<string, unknown>>) => Promise<FilaBd | null>;
  porId: (tabla: TablaComparada, id: string) => Promise<FilaBd | null>;
  /** Filas cuyo `eiac_xml_hash` es uno de estos (para detectar lo que solo tiene el CRM). */
  porXmlHash: (tabla: TablaComparada, hashes: readonly string[]) => Promise<FilaBd[]>;
}

/** Un fichero crudo YA DESCIFRADO (lo descifra el caller; aquí no hay claves). */
export interface CrudoSombra {
  nombreFichero: string;
  tipoObjeto: string;
  codigoEntidad: string | null;
  xmlHash: string;
  datos: unknown;
  rawXml: string | null;
}

export class CimaSombraEscritorCentralError extends Error {
  constructor() {
    super("cima_sombra_escritor_central: la sombra no corre con CIMA_ESCRITOR=central");
    this.name = "CimaSombraEscritorCentralError";
  }
}

/** PURO. Aborta si el escritor REAL es central (en cualquiera de los entornos dados). */
export function exigirEscritorNoCentral(...envs: ReadonlyArray<Readonly<Record<string, string | undefined>>>): void {
  for (const e of envs) if (cimaEscritorActivo(e) === "central") throw new CimaSombraEscritorCentralError();
}

export type Clasificacion = "igual" | "difiere" | "solo_central" | "solo_crm";

export interface DiferenciaCampo {
  campo: string;
  central: unknown;
  crm: unknown;
}

export interface EntidadInforme {
  tabla: TablaComparada;
  clave: Record<string, unknown>;
  clasificacion: Clasificacion;
  campos?: DiferenciaCampo[];
  ficheros?: string[];
}

export interface ResumenTabla {
  iguales: number;
  difieren: number;
  soloCentral: number;
  soloCrm: number;
}

export interface InformeSombra {
  version: 1;
  generadoEn: string;
  modo: "sombra_solo_lectura";
  crudos: { total: number; porTipo: Record<string, number> };
  pipeline: { porEstado: Record<string, number>; errores: Array<{ nombreFichero: string; motivo: string }> };
  sentencias: { lecturasReenviadas: number; escriturasGrabadas: number; escriturasRevertidas: number };
  resumen: ResumenTabla & { porTabla: Record<TablaComparada, ResumenTabla>; camposQueDifieren: Record<string, number> };
  noComparados: { expresiones: number; cifradosSinClave: number };
  detalle: EntidadInforme[];
  detalleTruncado: boolean;
}

/** Estado de central reconstruido para una entidad (tabla + clave natural). */
export interface EntidadCentral {
  tabla: TablaComparada;
  clave: string;
  claveValores: Record<string, unknown>;
  columnas: Map<string, unknown>;
  noEvaluables: Set<string>;
  ficheros: Set<string>;
  crm: FilaBd | null;
}

const esComparada = (t: string | null): t is TablaComparada => (TABLAS_COMPARADAS as readonly string[]).includes(t ?? "");

/** PURO. Clave natural como texto estable, o `null` si falta alguna parte. */
export function claveNatural(tabla: TablaComparada, fila: Readonly<Record<string, unknown>>): string | null {
  const partes = CLAVES_NATURALES[tabla].map((c) => normalizarValor(fila[c]));
  if (partes.some((p) => p === null || p === "")) return null;
  return `${tabla}|${partes.map((p) => String(p)).join("|")}`;
}

const NO_EVALUABLE = Symbol("no_evaluable");

function evaluar(
  e: ExprSql,
  params: readonly unknown[],
  excluded: Readonly<Record<string, unknown>>,
  actual: Readonly<Record<string, unknown>>,
): unknown {
  switch (e.k) {
    case "param":
      return params[e.i] ?? null;
    case "null":
      return null;
    case "excluded":
      return excluded[e.col] ?? null;
    case "actual":
      return actual[e.col] ?? null;
    case "coalesce": {
      for (const a of e.args) {
        const v = evaluar(a, params, excluded, actual);
        if (v === NO_EVALUABLE) return NO_EVALUABLE;
        if (v !== null && v !== undefined) return v;
      }
      return null;
    }
    default:
      return NO_EVALUABLE;
  }
}

/** Valores de una fila de VALUES (sin `default`; lo no evaluable, marcado). */
function valoresFila(p: EscrituraParseada, fila: readonly ExprSql[], params: readonly unknown[]) {
  const valores: Record<string, unknown> = {};
  const noEval: string[] = [];
  p.columnas.forEach((col, i) => {
    const ex = fila[i];
    if (!ex || ex.k === "default") return;
    const v = evaluar(ex, params, {}, {});
    if (v === NO_EVALUABLE) noEval.push(col);
    else valores[col] = v;
  });
  return { valores, noEval };
}

interface Corrida {
  lector: LectorEstadoActual;
  cachePorClave: Map<string, FilaBd | null>;
  /** id (real o sintético del grabador) → clave natural de la entidad. */
  idAClave: Map<string, { tabla: TablaComparada; clave: string; valores: Record<string, unknown> }>;
  sinteticos: number;
}

async function filaCrmPorClave(c: Corrida, tabla: TablaComparada, valores: Record<string, unknown>) {
  const clave = claveNatural(tabla, valores);
  if (!clave) return { clave: null, fila: null };
  if (!c.cachePorClave.has(clave)) {
    const claveValores = Object.fromEntries(CLAVES_NATURALES[tabla].map((k) => [k, valores[k]]));
    c.cachePorClave.set(clave, await c.lector.porClave(tabla, claveValores));
  }
  return { clave, fila: c.cachePorClave.get(clave) ?? null };
}

const idSintetico = (c: Corrida) => `00000000-0000-4000-8000-${String(++c.sinteticos).padStart(12, "0")}`;

/** Responde a una escritura grabada: filas del `returning` con ids coherentes (el real si
 * la entidad ya existe en la BD, uno sintético si no) y `xmax = 0` según exista. */
async function responder(c: Corrida, e: EscrituraGrabada): Promise<unknown[]> {
  const p = parsearEscritura(e.sql);
  if (p.returning.length === 0) return [];
  const filas: unknown[][] = [];
  if (p.verbo === "insert") {
    for (const f of p.filas) {
      const { valores } = valoresFila(p, f, e.params);
      let existente: FilaBd | null = null;
      let clave: string | null = null;
      if (esComparada(p.tabla)) {
        ({ clave, fila: existente } = await filaCrmPorClave(c, p.tabla, valores));
        if (existente && p.onConflict === "ninguno") existente = null;
      }
      const id = typeof existente?.id === "string" ? existente.id : idSintetico(c);
      if (esComparada(p.tabla) && clave) c.idAClave.set(id, { tabla: p.tabla, clave, valores });
      filas.push(
        p.returning.map((r) => {
          if (/xmax\s*=\s*0/i.test(r)) return existente === null;
          const col = r.replace(/"/g, "").split(".").pop()!.trim();
          if (col === "id") return id;
          return existente?.[col] ?? valores[col] ?? null;
        }),
      );
    }
  } else if (p.verbo === "update") {
    const id = p.idObjetivo ? evaluar(p.idObjetivo, e.params, {}, {}) : null;
    filas.push(p.returning.map((r) => (r.replace(/"/g, "").split(".").pop() === "id" && typeof id === "string" ? id : idSintetico(c))));
  } else {
    filas.push(p.returning.map(() => idSintetico(c)));
  }
  return e.modo === "all" ? filas : filas.map((f) => Object.fromEntries(p.returning.map((r, i) => [r.replace(/"/g, ""), f[i]])));
}

/** Reconstruye, en orden y sin las revertidas, el estado que central dejaría por entidad. */
async function reconstruir(c: Corrida, escrituras: readonly EscrituraGrabada[]) {
  const entidades = new Map<string, EntidadCentral>();
  let sinClave = 0;
  const entidad = (tabla: TablaComparada, clave: string, claveValores: Record<string, unknown>, crm: FilaBd | null) => {
    let ent = entidades.get(clave);
    if (!ent) {
      ent = { tabla, clave, claveValores, columnas: new Map(), noEvaluables: new Set(), ficheros: new Set(), crm };
      entidades.set(clave, ent);
    }
    return ent;
  };
  const actualDe = (ent: EntidadCentral) => ({ ...(ent.crm ?? {}), ...Object.fromEntries(ent.columnas) });
  const aplicarSet = (ent: EntidadCentral, p: EscrituraParseada, params: readonly unknown[], excluded: Record<string, unknown>) => {
    const actual = actualDe(ent);
    for (const { col, expr } of p.set) {
      const v = evaluar(expr, params, excluded, actual);
      if (v === NO_EVALUABLE) {
        ent.noEvaluables.add(col);
        ent.columnas.delete(col);
      } else {
        ent.columnas.set(col, v);
        ent.noEvaluables.delete(col);
      }
    }
  };

  for (const e of escrituras) {
    if (e.revertida) continue;
    const p = parsearEscritura(e.sql);
    if (!esComparada(p.tabla)) continue;
    const tabla = p.tabla;
    if (p.verbo === "insert") {
      for (const f of p.filas) {
        const { valores, noEval } = valoresFila(p, f, e.params);
        const { clave: k, fila } = await filaCrmPorClave(c, tabla, valores);
        const clave = k ?? `${tabla}|sin-clave|${++sinClave}`;
        const claveValores = Object.fromEntries(CLAVES_NATURALES[tabla].map((x) => [x, valores[x] ?? null]));
        const ent = entidad(tabla, clave, claveValores, fila);
        if (e.fichero) ent.ficheros.add(e.fichero);
        const existe = ent.crm !== null || ent.columnas.size > 0;
        if (existe && p.onConflict === "actualizar") aplicarSet(ent, p, e.params, valores);
        else if (existe && p.onConflict === "nada") continue;
        else {
          for (const [col, v] of Object.entries(valores)) ent.columnas.set(col, v);
          for (const col of noEval) ent.noEvaluables.add(col);
        }
      }
    } else if (p.verbo === "update") {
      const id = p.idObjetivo ? evaluar(p.idObjetivo, e.params, {}, {}) : null;
      if (typeof id !== "string") continue;
      let ref = c.idAClave.get(id);
      if (!ref) {
        const fila = await c.lector.porId(tabla, id);
        if (!fila) continue;
        const clave = claveNatural(tabla, fila) ?? `${tabla}|id|${id}`;
        c.cachePorClave.set(clave, fila);
        ref = { tabla, clave, valores: fila };
        c.idAClave.set(id, ref);
      }
      const crm = c.cachePorClave.get(ref.clave) ?? null;
      const claveValores = Object.fromEntries(CLAVES_NATURALES[tabla].map((x) => [x, ref!.valores[x] ?? null]));
      const ent = entidad(tabla, ref.clave, claveValores, crm);
      if (e.fichero) ent.ficheros.add(e.fichero);
      aplicarSet(ent, p, e.params, {});
    }
  }
  return entidades;
}

/** PURO. Clasifica las entidades de central frente a la BD, y añade lo que solo tiene el CRM. */
export function clasificarEntidades(
  entidades: Iterable<EntidadCentral>,
  filasCrmDeLosCrudos: ReadonlyArray<{ tabla: TablaComparada; fila: FilaBd }>,
  descifrar?: (v: string) => string | null,
): { entidades: EntidadInforme[]; noComparados: { expresiones: number; cifradosSinClave: number } } {
  const out: EntidadInforme[] = [];
  const vistas = new Set<string>();
  const idsVistos = new Set<string>();
  const noComparados = { expresiones: 0, cifradosSinClave: 0 };
  for (const ent of entidades) {
    vistas.add(ent.clave);
    if (typeof ent.crm?.id === "string") idsVistos.add(ent.crm.id);
    noComparados.expresiones += ent.noEvaluables.size;
    const ficheros = [...ent.ficheros];
    if (!ent.crm) {
      out.push({ tabla: ent.tabla, clave: ent.claveValores, clasificacion: "solo_central", ficheros });
      continue;
    }
    const campos: DiferenciaCampo[] = [];
    for (const [col, v] of ent.columnas) {
      if (COLUMNAS_IGNORADAS.has(col)) continue;
      const r = compararValores(v, ent.crm[col], descifrar);
      if (r === "no_comparable") noComparados.cifradosSinClave++;
      else if (r === "distinto") campos.push({ campo: col, central: valorVisible(col, v), crm: valorVisible(col, ent.crm[col]) });
    }
    out.push(
      campos.length === 0
        ? { tabla: ent.tabla, clave: ent.claveValores, clasificacion: "igual", ficheros }
        : { tabla: ent.tabla, clave: ent.claveValores, clasificacion: "difiere", campos, ficheros },
    );
  }
  for (const { tabla, fila } of filasCrmDeLosCrudos) {
    const clave = claveNatural(tabla, fila);
    if ((clave && vistas.has(clave)) || (typeof fila.id === "string" && idsVistos.has(fila.id))) continue;
    vistas.add(clave ?? `${tabla}|id|${String(fila.id)}`);
    const claveValores = Object.fromEntries(CLAVES_NATURALES[tabla].map((x) => [x, fila[x] ?? null]));
    out.push({ tabla, clave: claveValores, clasificacion: "solo_crm" });
  }
  return { entidades: out, noComparados };
}

const ALERTAS_MUDAS: AlertasCima = { cimaReview: async () => {}, cimaSituacionDesconocida: async () => {} };

const adaptadorProhibido = {
  invokeWse: async (): Promise<never> => {
    throw new Error("cima_sombra_adaptador_prohibido: la sombra no habla con TIREA");
  },
};

/** Lectura por defecto sin BD (como el golden): catálogo de columnas → «existe»; resto vacío. */
const leerSinBd: LectorSql = async (sql, _params, modo) =>
  /pg_catalog\.pg_attribute/.test(sql) ? (modo === "all" ? [[true]] : [{ existe: true }]) : [];

export interface CompararSombraOpts {
  /** Crudos YA descifrados, en el orden en que se repiten (fecha del dato). */
  crudos: readonly CrudoSombra[];
  leerEstadoActual: LectorEstadoActual;
  /** Reenvío de las LECTURAS del pipeline a la BD (solo lectura). Default: sin BD. */
  leerSelect?: LectorSql;
  /** Correduría de los crudos (`CIMA_INGESTA_CORREDURIA_ID` de `process.env` tiene que coincidir). */
  correduriaId: string;
  /** Entorno REAL (claves PII; `CIMA_ESCRITOR` ≠ central). */
  env: Readonly<Record<string, string | undefined>>;
  /** Descifra `v1:` para comparar campos cifrados (nunca se imprime el resultado). */
  descifrar?: (v: string) => string | null;
  ahora?: () => Date;
  /** Máximo de entidades en `detalle` (el resumen cuenta todas). Default 2000. */
  maxDetalle?: number;
  /** Solo tests: sustituir `buildCimaPullDeps`. */
  construirDeps?: (o: BuildCimaPullDepsOptions) => ReturnType<typeof buildCimaPullDeps>;
}

export async function compararSombra(opts: CompararSombraOpts): Promise<InformeSombra> {
  exigirEscritorNoCentral(opts.env, process.env);
  if (process.env.CIMA_INGESTA_CORREDURIA_ID?.trim() !== opts.correduriaId) {
    throw new Error("cima_sombra_correduria_no_coincide");
  }
  const corrida: Corrida = { lector: opts.leerEstadoActual, cachePorClave: new Map(), idAClave: new Map(), sinteticos: 0 };
  const grabador = crearDbGrabador({
    leerSelect: opts.leerSelect ?? leerSinBd,
    alEscribir: (e) => responder(corrida, e),
  });
  const construir = opts.construirDeps ?? buildCimaPullDeps;
  const deps = await construir({
    log: () => {},
    db: grabador.db,
    adaptador: adaptadorProhibido,
    alertas: ALERTAS_MUDAS,
    env: { ...opts.env, ...ENV_INTERNO_SOMBRA },
  });
  // La sombra repite TODO tipo de fichero, con o sin los flags de producción.
  const depsSombra = {
    ...deps,
    sinEnabled: true,
    recEnabled: true,
    cefEnabled: true,
    confirm: async (): Promise<never> => {
      throw new Error("cima_sombra_confirm_prohibido");
    },
  };

  const porTipo: Record<string, number> = {};
  const porEstado: Record<string, number> = {};
  const errores: InformeSombra["pipeline"]["errores"] = [];
  for (const crudo of opts.crudos) {
    porTipo[crudo.tipoObjeto] = (porTipo[crudo.tipoObjeto] ?? 0) + 1;
    grabador.fijarFichero(crudo.nombreFichero);
    const fichero = {
      nombreFicheroComprimido: crudo.nombreFichero,
      tipoObjeto: crudo.tipoObjeto,
      versionEiac: null,
      codigoEntidad: crudo.codigoEntidad,
      checksumVerified: false,
      datos: crudo.datos,
      // La copia preventiva no guarda el XML (solo `datos`): el hash es el guardado.
      rawXml: crudo.rawXml || `<!-- sombra ${crudo.xmlHash} -->`,
      zipEntryCount: 1,
    } as FicheroParseado;
    const r = await runCimaPull([fichero], { ...depsSombra, computeXmlHash: () => crudo.xmlHash }, CIMA_SOMBRA_OPTS);
    for (const o of r.outcomes) {
      porEstado[o.estado] = (porEstado[o.estado] ?? 0) + 1;
      if (o.estado === "error") errores.push({ nombreFichero: o.nombreFichero, motivo: sanitizePiiES(o.reason, { maxLength: 160 }) });
    }
  }
  grabador.fijarFichero(null);

  const entidades = await reconstruir(corrida, grabador.escrituras);
  const hashes = [...new Set(opts.crudos.map((c) => c.xmlHash))];
  const filasCrm: Array<{ tabla: TablaComparada; fila: FilaBd }> = [];
  if (hashes.length > 0) {
    for (const t of TABLAS_COMPARADAS) {
      for (const fila of await opts.leerEstadoActual.porXmlHash(t, hashes)) filasCrm.push({ tabla: t, fila });
    }
  }
  const { entidades: clasificadas, noComparados } = clasificarEntidades(entidades.values(), filasCrm, opts.descifrar);

  const vacio = (): ResumenTabla => ({ iguales: 0, difieren: 0, soloCentral: 0, soloCrm: 0 });
  const porTabla = Object.fromEntries(TABLAS_COMPARADAS.map((t) => [t, vacio()])) as Record<TablaComparada, ResumenTabla>;
  const total = vacio();
  const camposQueDifieren: Record<string, number> = {};
  const campo = { igual: "iguales", difiere: "difieren", solo_central: "soloCentral", solo_crm: "soloCrm" } as const;
  for (const e of clasificadas) {
    porTabla[e.tabla][campo[e.clasificacion]]++;
    total[campo[e.clasificacion]]++;
    for (const d of e.campos ?? []) camposQueDifieren[`${e.tabla}.${d.campo}`] = (camposQueDifieren[`${e.tabla}.${d.campo}`] ?? 0) + 1;
  }
  const max = opts.maxDetalle ?? 2000;
  // En el detalle, primero lo que no cuadra.
  const orden = { difiere: 0, solo_crm: 1, solo_central: 2, igual: 3 } as const;
  const detalle = clasificadas
    .slice()
    .sort((a, b) => orden[a.clasificacion] - orden[b.clasificacion])
    .slice(0, max)
    .map((e) => ({
      ...e,
      clave: Object.fromEntries(
        Object.entries(e.clave)
          .filter(([k]) => k !== "correduria_id")
          .map(([k, v]) => [k, valorVisible(k, v)]),
      ),
    }));

  const informe: InformeSombra = {
    version: 1,
    generadoEn: (opts.ahora?.() ?? new Date()).toISOString(),
    modo: "sombra_solo_lectura",
    crudos: { total: opts.crudos.length, porTipo },
    pipeline: { porEstado, errores },
    sentencias: {
      lecturasReenviadas: grabador.contadores.lecturasReenviadas,
      escriturasGrabadas: grabador.contadores.escriturasGrabadas,
      escriturasRevertidas: grabador.escrituras.filter((e) => e.revertida).length,
    },
    resumen: { ...total, porTabla, camposQueDifieren },
    noComparados,
    detalle,
    detalleTruncado: clasificadas.length > max,
  };
  return enmascararInforme(informe);
}
