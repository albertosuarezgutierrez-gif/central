/**
 * COBERTURA DE CAMPOS EIAC — ¿qué nos manda CIMA y qué de eso leemos?
 *
 * Por qué existe (16/09/2026, hermano de la cuarentena de crudo `mig 0096`):
 * la cuarentena sólo salta cuando hay INCIDENCIA (review/error). Si CIMA manda
 * un campo que el mapper sencillamente NO LEE —sin error, sin review— el dato se
 * pierde EN SILENCIO: el fichero se confirma a TIREA, se dequeuea para siempre y
 * nadie se entera de que ese campo existía. Es el mismo agujero del incidente
 * Occident C0468 una capa más abajo: allí faltaba clasificar un ramo (y al menos
 * eso dejaba rastro en `review`); aquí no queda rastro de ninguna clase.
 *
 * QUÉ MIDE: por fichero, el conjunto de RUTAS del árbol EIAC (`fichero.datos`) y
 * cuáles de ellas el mapper leyó de verdad. «Leyó» = accedió al VALOR de esa
 * ruta durante su ejecución, observado con un Proxy revocable sobre el árbol.
 *
 * POR QUÉ UN PROXY Y NO UNA LISTA: una lista de campos leídos escrita a mano se
 * queda obsoleta en cuanto alguien toca el mapper, y encima lo hace en silencio
 * y en la dirección peligrosa («creemos que leemos esto» cuando ya no). El Proxy
 * deriva la medición del mapper REAL, así que no puede desincronizarse: si
 * mañana el mapper deja de leer `Riesgo.RiesgoHogar.Situacion`, esa ruta aparece
 * como no leída al siguiente fichero, sin que nadie actualice nada.
 *
 * 🚨 SIN PII. Sólo se emiten NOMBRES DE RUTA (`DatosRiesgos.Riesgo.RiesgoHogar.
 * Situacion.CodigoPostal`) y contadores — NUNCA valores. Es la misma línea que ya
 * traza `describeRiesgoShape` en el mapper POL, generalizada. Los índices de
 * array se ELIDEN a propósito (`Riesgo[0]`/`Riesgo[1]` → `Riesgo`): sin eso la
 * agregación por ruta no agregaría nada, y un índice tampoco aporta información.
 * Además, un segmento de ruta que no parezca un nombre de elemento XML se
 * DESCARTA y se cuenta aparte (`rutasDescartadas`): si el árbol trajera alguna
 * vez un mapa cuyas CLAVES son valores (un DNI, una matrícula), sus rutas serían
 * PII y no deben salir de aquí.
 *
 * PURO: sin BD, sin red, sin `process.env`, sin crypto. El caller (pipeline)
 * inyecta el mapper y persiste el resultado.
 */
import { motivoExclusionCima } from "./cima-extra-denegados.ts";

/** Profundidad máxima explorada. El EIAC 6.0 anida poco; el tope es un cortafuegos. */
export const COBERTURA_MAX_PROFUNDIDAD = 12;
/** Tope de rutas distintas por fichero. Si se alcanza, `truncado = true`. */
export const COBERTURA_MAX_RUTAS = 2000;

/**
 * Un segmento de ruta válido = nombre de elemento/atributo XML. `#text` y `@_x`
 * (prefijos de fast-xml-parser) entran; cualquier otra cosa (espacios, tildes de
 * un valor, números sueltos, cadenas largas) NO: sería un valor disfrazado de
 * clave, y eso es PII saliendo por la puerta de atrás.
 */
const SEGMENTO_VALIDO = /^[A-Za-z_#@][A-Za-z0-9_:@#-]{0,63}$/;

/**
 * Claves que NO son datos del árbol: las pide el runtime (JSON.stringify, await,
 * `Array.isArray`…), no el mapper. Contarlas como «leídas» falsearía la medida.
 */
const CLAVES_DE_RUNTIME = new Set<string>([
  "length",
  "constructor",
  "prototype",
  "toJSON",
  "toString",
  "valueOf",
  "then",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "inspect",
  "nodeType",
]);

/**
 * Lee `obj[clave]` SIN que la medición de cobertura lo cuente como «leído».
 *
 * Para qué: hay lecturas que NO son aprovechar el dato, sino mirarle la forma —
 * `describeRiesgoShape` del mapper POL lee el valor de cada clave de un bloque
 * `RiesgoXxx` sólo para saber si es objeto y poder listar sus sub-claves. Si eso
 * contara como lectura, la cobertura diría que leemos un ramo entero (hogar,
 * comunidades) cuyo contenido en realidad estamos TIRANDO — justo la mentira
 * tranquilizadora que esta medición existe para evitar.
 *
 * Cómo: el descriptor de propiedad no pasa por el trap `get` del Proxy. Sobre un
 * árbol JSON parseado (sin getters) devuelve exactamente lo mismo que `obj[clave]`.
 *
 * ⚠️ Volver a `obj[clave]` en un helper de diagnóstico NO rompe nada visible:
 * infla la cobertura en silencio. Lo vigila `field-coverage-mapper.test.ts`
 * («el contenido de RiesgoComunidades se pierde HOY y la medición lo dice»).
 */
export function leerSinContar(obj: object, clave: string): unknown {
  return Object.getOwnPropertyDescriptor(obj, clave)?.value;
}

/** Una ruta del árbol EIAC vista en un fichero. Sólo nombres y banderas. */
export interface RutaCampo {
  /** Ruta con puntos, índices de array elididos. p.ej. `DatosRiesgos.Riesgo.RiesgoHogar.Situacion`. */
  ruta: string;
  /** true = hoja (valor escalar). false = contenedor (objeto/array con hijos). */
  hoja: boolean;
  /** true = el mapper accedió al valor de esta ruta en ESTE fichero. */
  leido: boolean;
  /**
   * 03/10/2026 — hoja NO leída que está en la lista de exclusión de `cimaExtra`
   * (`cima-extra-denegados.ts`): motivo legible («dato bancario», «dirección»…).
   * Es «excluido a propósito», no dato perdido. Ausente = sin motivo (o leída).
   */
  excluido?: string;
}

export interface CoberturaCampos {
  rutas: RutaCampo[];
  /** Nº de rutas distintas vistas (contenedores incluidos). */
  total: number;
  /** Nº de rutas HOJA (los «campos» de verdad). El ratio que se publica usa esto. */
  hojas: number;
  /** Nº de rutas hoja que el mapper leyó. */
  hojasLeidas: number;
  /** Nº de hojas NO leídas excluidas a propósito (lista de exclusión de `cimaExtra`). */
  hojasExcluidas: number;
  /** Rutas descartadas por segmento no-nombre (posible PII). Se cuentan, no se emiten. */
  rutasDescartadas: number;
  /**
   * true = se alcanzó `COBERTURA_MAX_RUTAS`/`COBERTURA_MAX_PROFUNDIDAD`: la lista
   * NO es completa. Quien la lea no puede decir «CIMA manda N campos», sólo
   * «manda al menos N». Es la diferencia entre «no hay más» y «no he mirado más».
   */
  truncado: boolean;
  /**
   * true = el mapper lanzó durante la pasada instrumentada. Las rutas leídas son
   * PARCIALES, así que `leido:false` puede ser un falso negativo. Se conserva a
   * propósito (sobra-marcar como «no leído» empuja a mirar; lo contrario
   * tranquilizaría en falso), pero el caller debe poder decir que pasó.
   */
  mapperFallo: boolean;
}

interface Aplanado {
  /** ruta → hoja. Contenedor gana sobre hoja si la ruta aparece de las dos formas. */
  rutas: Map<string, boolean>;
  descartadas: number;
  truncado: boolean;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * PURA: aplana el árbol a rutas. Índices de array elididos; contenedores y hojas
 * ambos presentes. Nunca lanza (un árbol basura devuelve lo que pueda).
 */
export function aplanarRutas(datos: unknown): Aplanado {
  const rutas = new Map<string, boolean>();
  let descartadas = 0;
  let truncado = false;
  const vistos = new WeakSet<object>();

  const anotar = (ruta: string, hoja: boolean) => {
    if (rutas.has(ruta)) {
      // Contenedor gana: si una misma ruta aparece como objeto en un elemento y
      // como escalar en otro, sus hijos son los campos reales.
      if (!hoja) rutas.set(ruta, false);
      return;
    }
    if (rutas.size >= COBERTURA_MAX_RUTAS) {
      truncado = true;
      return;
    }
    rutas.set(ruta, hoja);
  };

  const visitar = (valor: unknown, ruta: string, profundidad: number): void => {
    if (profundidad > COBERTURA_MAX_PROFUNDIDAD) {
      truncado = true;
      return;
    }
    if (Array.isArray(valor)) {
      if (vistos.has(valor)) return;
      vistos.add(valor);
      // El array NO añade segmento: `Riesgo[0]` y `Riesgo[1]` son la misma ruta.
      for (const item of valor) visitar(item, ruta, profundidad);
      return;
    }
    if (esObjeto(valor)) {
      if (vistos.has(valor)) return;
      vistos.add(valor);
      if (ruta) anotar(ruta, false);
      for (const clave of Object.keys(valor)) {
        if (!SEGMENTO_VALIDO.test(clave)) {
          descartadas += 1;
          continue;
        }
        visitar(valor[clave], ruta ? `${ruta}.${clave}` : clave, profundidad + 1);
      }
      return;
    }
    // Escalar (string/number/boolean/null/undefined) → hoja.
    if (ruta) anotar(ruta, true);
  };

  visitar(datos, "", 0);
  return { rutas, descartadas, truncado };
}

/**
 * Envuelve `datos` en Proxies revocables que anotan en `accedidas` la ruta de
 * cada lectura de VALOR (trap `get`). `ownKeys` NO cuenta: `Object.keys(x)` mira
 * los nombres, no los datos — y contarlo marcaría como leído todo lo que el
 * mapper sólo enumera para diagnosticar (`unrecognizedRiesgoBlocks`).
 */
function envolver(
  valor: unknown,
  ruta: string,
  profundidad: number,
  accedidas: Set<string>,
  revocaciones: Array<() => void>,
): unknown {
  if (!esObjeto(valor)) return valor;
  if (profundidad > COBERTURA_MAX_PROFUNDIDAD) return valor;
  const { proxy, revoke } = Proxy.revocable(valor, {
    get(target, clave, receiver) {
      const bruto = Reflect.get(target, clave, receiver);
      if (typeof clave === "symbol") return bruto;
      const esIndice = Array.isArray(target) && /^\d+$/.test(clave);
      // Los índices no añaden segmento (misma ruta) y no cuentan como lectura de
      // campo: iterar un array no dice nada sobre qué campos se miran dentro.
      const hijaRuta = esIndice ? ruta : ruta ? `${ruta}.${clave}` : clave;
      if (!esIndice && !CLAVES_DE_RUNTIME.has(clave) && SEGMENTO_VALIDO.test(clave)) {
        accedidas.add(hijaRuta);
      }
      return envolver(bruto, hijaRuta, profundidad + 1, accedidas, revocaciones);
    },
  });
  revocaciones.push(revoke);
  return proxy;
}

/**
 * 28/09/2026 — el árbol llega CON o SIN el envoltorio `<ProcesosEIAC>` según
 * quién lo convierta (el adaptador Java lo quita; el rescate manual
 * `manual-xml.ts` lo conserva, y los mappers aceptan las dos formas). Sin
 * normalizar, el mismo campo contaba como dos rutas distintas
 * (`ProcesosEIAC.Objetos.Poliza.X` y `Objetos.Poliza.X`) y la agregación por ruta
 * partía la medición en dos. Se quita el prefijo; la raíz `ProcesosEIAC` sola
 * (el contenedor) devuelve `null` y no se emite.
 */
export function normalizarRutaEiac(ruta: string): string | null {
  if (ruta === "ProcesosEIAC") return null;
  return ruta.startsWith("ProcesosEIAC.") ? ruta.slice("ProcesosEIAC.".length) : ruta;
}

/**
 * 03/10/2026 — CANÓNICA para ESCRIBIR: normaliza el prefijo `ProcesosEIAC.` de cada
 * ruta y FUSIONA las que colisionan (`leido` = OR, contenedor gana sobre hoja), ordenado.
 * Es la última barrera antes de la BD: la tabla `cima_cobertura_campos` llegó a tener
 * dos filas por campo (`ProcesosEIAC.Objetos.…` y `Objetos.…`), y las del prefijo
 * (veces_leido = 0) hacían parecer «sin leer» campos que sí se leen. También evita que
 * un único INSERT … ON CONFLICT lleve dos filas de la misma clave. PURA.
 */
export function consolidarRutasCobertura(rutas: readonly RutaCampo[]): RutaCampo[] {
  const porRuta = new Map<string, RutaCampo>();
  for (const r of rutas) {
    const ruta = normalizarRutaEiac(r.ruta);
    if (ruta === null) continue;
    const previa = porRuta.get(ruta);
    const hoja = previa ? previa.hoja && r.hoja : r.hoja;
    const leido = previa ? previa.leido || r.leido : r.leido;
    // El motivo de exclusión (03/10/2026) solo describe una hoja NO leída; se
    // conserva el primero que llegue (pull-deps re-consolida antes de escribir).
    const excluido = leido ? undefined : (previa?.excluido ?? r.excluido);
    porRuta.set(ruta, excluido ? { ruta, hoja, leido, excluido } : { ruta, hoja, leido });
  }
  return [...porRuta.values()].sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
}

/**
 * Mide la cobertura de campos de UN fichero: ejecuta `ejecutarMapper` sobre una
 * vista instrumentada del árbol y cruza lo accedido con lo que el árbol trae.
 *
 * ⚠️ El resultado del mapper se DESCARTA: esta pasada es sólo para medir, y su
 * salida contendría Proxies. El mapper de verdad corre aparte, sobre el árbol
 * original. Coste: una segunda ejecución de una función pura.
 *
 * Nunca lanza: un fallo del mapper se refleja en `mapperFallo`.
 */
export function medirCoberturaCampos(
  datos: unknown,
  ejecutarMapper: (datos: unknown) => unknown,
): CoberturaCampos {
  const { rutas, descartadas, truncado } = aplanarRutas(datos);
  const accedidas = new Set<string>();
  const revocaciones: Array<() => void> = [];
  let mapperFallo = false;
  try {
    const instrumentado = envolver(datos, "", 0, accedidas, revocaciones);
    ejecutarMapper(instrumentado);
  } catch {
    // El mapper POL/SIN/REC/CEF documenta «PURA, nunca throw»; si aun así
    // lanza, nos quedamos con las rutas leídas HASTA ese punto. El resto
    // quedará marcado como no leído, que es el lado conservador (empuja a
    // mirar) y no el que tranquiliza.
    mapperFallo = true;
  } finally {
    // Revocar corta cualquier referencia que el mapper hubiera guardado: nada
    // de esta pasada puede seguir vivo (ni leerse) después de medir.
    for (const revocar of revocaciones) {
      try {
        revocar();
      } catch {
        /* revoke no lanza; el catch es por si un motor exótico lo hace */
      }
    }
  }

  const bruto: RutaCampo[] = [];
  for (const [rutaCruda, hoja] of rutas) {
    bruto.push({ ruta: rutaCruda, hoja, leido: accedidas.has(rutaCruda) });
  }
  // Normaliza (quita `ProcesosEIAC.`, descarta el propio envoltorio) y fusiona colisiones.
  const salida = consolidarRutasCobertura(bruto);
  let hojas = 0;
  let hojasLeidas = 0;
  let hojasExcluidas = 0;
  for (const r of salida) {
    if (r.hoja) {
      hojas += 1;
      if (r.leido) hojasLeidas += 1;
      else {
        const motivo = motivoExclusionCima(r.ruta);
        if (motivo !== null) {
          r.excluido = motivo;
          hojasExcluidas += 1;
        }
      }
    }
  }

  return {
    rutas: salida,
    total: salida.length,
    hojas,
    hojasLeidas,
    hojasExcluidas,
    rutasDescartadas: descartadas,
    truncado,
    mapperFallo,
  };
}
