/**
 * «RESTO» DE CIMA — toda hoja del EIAC que ningún extractor específico ha leído
 * se guarda en `cimaExtra` (03/10/2026, Alberto: «todo campo que manda CIMA se
 * guarda y se enseña, salvo una lista explícita de sensibles»).
 *
 * CÓMO SE SABE QUÉ ESTÁ «CONSUMIDO» (por qué no una lista de prefijos a mano):
 * el mismo principio que el medidor de cobertura (`field-coverage.ts`). Se ejecuta
 * el mapper específico UNA vez sobre una vista con Proxy que anota cada ruta cuyo
 * VALOR lee (`get`), CON índices de array (`Riesgo.1.Capitales…`): así el segundo
 * riesgo de una póliza no se da por leído porque se leyó el primero. Esa salida se
 * descarta; el mapper de verdad corre después sobre el árbol original. Una lista de
 * rutas consumidas escrita a mano se desincroniza en silencio en cuanto alguien
 * toca un extractor; el Proxy no puede.
 *
 * Después se recorre el objeto: cada HOJA no consumida, no denegada
 * (`cima-extra-denegados.ts`) y con valor útil → `{ ruta, valor }`. La hoja que se
 * guarda se lee por `get` (el medidor de cobertura la cuenta como LEÍDA: está
 * guardada); la denegada o descartada se mira con `leerSinContar` y sigue saliendo
 * como no leída. Así el «sin leer» del Monitor = denegado + descartado, nada más.
 *
 * PURO: sin BD, sin red, sin env.
 */
import { leerSinContar } from "./field-coverage.ts";
import { motivoExclusionCima } from "./cima-extra-denegados.ts";
import { taparNumerosLargos, esOtroDatoPersonal } from "./eiac-pol-mapper.ts";

export { CIMA_EXTRA_DENEGADOS, motivoExclusionCima } from "./cima-extra-denegados.ts";

/** Una hoja del EIAC guardada tal cual. `ruta` canónica: sin `ProcesosEIAC.`/`Objetos.` ni índices. */
export interface CimaExtraEntrada {
  ruta: string;
  valor: string;
}

/** Tope de entradas por objeto (póliza, recibo, siniestro, movimiento…). */
export const CIMA_EXTRA_MAX = 400;
/** Tope de longitud de un valor (texto libre larguísimo → recortado). */
export const CIMA_EXTRA_MAX_VALOR = 500;
const MAX_PROFUNDIDAD = 14;
/** Mismo criterio que `field-coverage.ts`: un segmento que no parece nombre XML es un valor disfrazado. */
const SEGMENTO_VALIDO = /^[A-Za-z_#@][A-Za-z0-9_:@#-]{0,63}$/;
/** Fechas de relleno («sin fecha») que mandan las compañías. */
const FECHA_RELLENO = /^(1900-01-01|9999-12-31)/;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Teléfono español (fijo o móvil, 9 cifras que empiezan por 6/7/8/9), con o sin +34/espacios. */
const VALOR_TELEFONO = /^(?:(?:\+|00)?34)?[6789]\d{8}$/;
/** Algo con forma de correo. */
const VALOR_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** IBAN (2 letras + 2 dígitos + ≥10 dígitos, con o sin separadores). */
const VALOR_IBAN = /^[A-Z]{2}\d{12,}$/i;

/**
 * PURA. Valor de hoja → texto guardable, o `null` si no aporta (vacío, fecha de
 * relleno) o PARECE un dato de persona por su VALOR (DNI/NIE/CIF, IBAN, correo,
 * teléfono) aunque venga bajo un campo de nombre inocuo. Un texto con espacios
 * (texto libre) pasa por `taparNumerosLargos`.
 */
export function valorCimaExtra(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") return null;
  const t = String(raw).trim();
  if (t === "" || FECHA_RELLENO.test(t)) return null;
  // Sin separadores: `12.345.678-Z`, `Y-1234567-X`, `600 11 12 22`, `ES91 2100…`.
  const compacto = t.replace(/[\s.\-/]/g, "");
  if (esOtroDatoPersonal(null, null, t) || esOtroDatoPersonal(null, null, compacto)) return null;
  if (VALOR_IBAN.test(compacto) || VALOR_EMAIL.test(t) || VALOR_TELEFONO.test(compacto)) return null;
  const limpio = /\s/.test(t) ? taparNumerosLargos(t) : t;
  return limpio.length > CIMA_EXTRA_MAX_VALOR ? `${limpio.slice(0, CIMA_EXTRA_MAX_VALOR)}…` : limpio;
}

/** Proxies vivos de la pasada de rastreo (solo para tests: simular un rastreo que falla). */
const PROXIES_RASTREO = new WeakSet<object>();

/** ¿Es `v` la vista instrumentada de una pasada de rastreo? */
export function esProxyDeRastreo(v: unknown): boolean {
  return esObjeto(v) && PROXIES_RASTREO.has(v);
}

/**
 * Ejecuta `fn(item)` sobre una vista instrumentada y devuelve las rutas (relativas
 * al item, CON índices) cuyo valor leyó. La salida de `fn` se descarta. Si `fn`
 * lanza, devuelve `null` (no se sabe qué consumió).
 */
export function rastrearLecturas(item: unknown, fn: (item: unknown) => unknown): Set<string> | null {
  const accedidas = new Set<string>();
  const revocaciones: Array<() => void> = [];
  const envolver = (valor: unknown, ruta: string, prof: number): unknown => {
    if (!esObjeto(valor) || prof > MAX_PROFUNDIDAD) return valor;
    const { proxy, revoke } = Proxy.revocable(valor, {
      get(target, clave, receiver) {
        const bruto = Reflect.get(target, clave, receiver);
        if (typeof clave === "symbol") return bruto;
        const hija = ruta ? `${ruta}.${clave}` : clave;
        accedidas.add(hija);
        return envolver(bruto, hija, prof + 1);
      },
    });
    PROXIES_RASTREO.add(proxy);
    revocaciones.push(revoke);
    return proxy;
  };
  desactivado += 1;
  try {
    fn(envolver(item, "", 0));
    return accedidas;
  } catch {
    return null;
  } finally {
    desactivado -= 1;
    for (const r of revocaciones) r();
  }
}

/**
 * >0 mientras corre una pasada de rastreo (un `conCimaExtra` anidado no recolecta)
 * o dentro de `sinCimaExtra`.
 */
let desactivado = 0;

/** Ejecuta `fn` con el colector APAGADO (sin clave `cimaExtra`). Para comparar en tests. */
export function sinCimaExtra<T>(fn: () => T): T {
  desactivado += 1;
  try {
    return fn();
  } finally {
    desactivado -= 1;
  }
}

export interface OpcionesCimaExtra {
  /** Subárboles (ruta relativa al item, sin índices) que recoge OTRO nivel. */
  excluir?: readonly string[];
  /**
   * true (defecto) = la hoja guardada se lee por `get` y el medidor la cuenta como
   * leída. false = solo se mira (`leerSinContar`): para un objeto cuyo `cimaExtra`
   * aún NO se persiste — contarlo diría «leído» de un dato que se tira.
   */
  contar?: boolean;
}

export interface ResultadoCimaExtra {
  /**
   * `null` = NO SE SABE (rastreo o colector fallaron, o colector apagado): no se
   * escribe la clave, para no pisar con `[]` el resto bueno anterior. `[]` = mirado
   * y no hay nada.
   */
  entradas: CimaExtraEntrada[] | null;
  /** true = se alcanzó `CIMA_EXTRA_MAX`: hay hojas sin guardar (y salen como no leídas). */
  truncado: boolean;
}

const SIN_SABER: ResultadoCimaExtra = { entradas: null, truncado: false };

/**
 * PURA, nunca lanza. Recorre `item` y devuelve las hojas no consumidas, no
 * denegadas y con valor. `raiz` = ruta canónica del item (`Poliza`, `Recibo`, …).
 * Un fallo → `entradas: null` y NINGUNA hoja contada como leída (las lecturas que
 * cuentan se hacen al final, solo si todo fue bien).
 */
export function recogerCimaExtra(
  item: unknown,
  raiz: string,
  consumidas: ReadonlySet<string>,
  opts: OpcionesCimaExtra = {},
): ResultadoCimaExtra {
  const entradas: CimaExtraEntrada[] = [];
  /** Hojas guardadas: se leen por `get` al final (el medidor las cuenta como leídas). */
  const aLeer: Array<[Record<string, unknown>, string]> = [];
  let truncado = false;
  const contar = opts.contar !== false;
  const excluir = opts.excluir ?? [];
  const vistos = new WeakSet<object>();

  const visitar = (nodo: unknown, rel: string, canon: string, prof: number): void => {
    if (truncado || !esObjeto(nodo) || prof > MAX_PROFUNDIDAD) return;
    if (Array.isArray(nodo)) {
      for (let i = 0; i < nodo.length; i += 1) {
        const peek = leerSinContar(nodo, String(i));
        visitar(esObjeto(peek) && contar ? nodo[i] : peek, rel ? `${rel}.${i}` : String(i), canon, prof);
      }
      return;
    }
    // ownKeys no cuenta como lectura en el medidor: enumerar nombres no es leer datos.
    for (const clave of Object.keys(nodo)) {
      if (truncado) return;
      if (!SEGMENTO_VALIDO.test(clave)) continue;
      const canonK = canon ? `${canon}.${clave}` : clave;
      const relK = rel ? `${rel}.${clave}` : clave;
      if (excluir.some((p) => canonK === p || canonK.startsWith(`${p}.`))) continue;
      const rutaCompleta = raiz ? `${raiz}.${canonK}` : canonK;
      if (motivoExclusionCima(rutaCompleta) !== null) continue;
      const peek = leerSinContar(nodo, clave);
      if (esObjeto(peek)) {
        if (vistos.has(peek)) continue;
        vistos.add(peek);
        // Por `get` (cuenta el CONTENEDOR, no sus hojas) para que las hojas que se
        // guarden debajo se lean a través del Proxy del medidor, si lo hay.
        visitar(contar ? (nodo as Record<string, unknown>)[clave] : peek, relK, canonK, prof + 1);
        continue;
      }
      if (consumidas.has(relK)) continue;
      const valor = valorCimaExtra(peek);
      if (valor === null) continue;
      if (entradas.length >= CIMA_EXTRA_MAX) {
        truncado = true;
        return;
      }
      if (contar) aLeer.push([nodo as Record<string, unknown>, clave]);
      entradas.push({ ruta: rutaCompleta, valor });
    }
  };

  try {
    visitar(item, "", "", 0);
    for (const [nodo, clave] of aLeer) void nodo[clave];
  } catch {
    return SIN_SABER;
  }
  return { entradas, truncado };
}

/**
 * Ejecuta el mapper específico de UN item y le añade su `cimaExtra`.
 * 1) pasada de rastreo (qué lee el mapper), 2) pasada real, 3) recolección.
 * Dentro de otra pasada de rastreo (niveles anidados de CEF) solo mapea.
 * Si el rastreo falla → `entradas: null` (no se puede saber qué es «resto»).
 */
export function conCimaExtra<T>(
  item: unknown,
  raiz: string,
  mapear: (item: unknown) => T,
  opts: OpcionesCimaExtra = {},
): { resultado: T; cimaExtra: ResultadoCimaExtra } {
  if (desactivado > 0) return { resultado: mapear(item), cimaExtra: SIN_SABER };
  if (!esObjeto(item)) return { resultado: mapear(item), cimaExtra: { entradas: [], truncado: false } };
  const consumidas = rastrearLecturas(item, mapear);
  const resultado = mapear(item);
  if (consumidas === null) return { resultado, cimaExtra: SIN_SABER };
  return { resultado, cimaExtra: recogerCimaExtra(item, raiz, consumidas, opts) };
}

/**
 * Claves que se fusionan en el jsonb destino. `[]` = revisado, no vino nada.
 * `entradas: null` (no se sabe) → `{}`: no se escribe la clave.
 */
export function camposCimaExtra(r: ResultadoCimaExtra): Record<string, unknown> {
  if (r.entradas === null) return {};
  return r.truncado ? { cimaExtra: r.entradas, cimaExtraTruncado: true } : { cimaExtra: r.entradas };
}

/** ¿Hay algo que fusionar? (`[]` sí cuenta: borra el resto viejo; `null` no). */
export function hayCamposCimaExtra(r: ResultadoCimaExtra): boolean {
  return r.entradas !== null;
}
