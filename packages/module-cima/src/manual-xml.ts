/**
 * Conversión XML → JSON de un fichero EIAC para el rescate MANUAL de una
 * póliza (`POST /api/internal/cima/ingerir-manual`).
 *
 * Contexto (17/09/2026): la carga masiva 199 de Generali C0072 del 13/09
 * dejó `6E-G-475000053` (RiesgoComunidades) en `review` — el mapper de
 * entonces no reconocía ese riesgo (arreglado en LOO-829, 16/09). Como el
 * fichero se confirmó igual (13/14 pólizas SÍ persistieron), TIREA lo
 * dequeueó para siempre y `cima_cuarentena_crudo` todavía no existía ese
 * día: no hay copia propia que reprocesar por el camino automático.
 *
 * Alberto pudo descargar el XML original desde el propio Portal de CIMA.
 * Esta ruta permite volver a alimentar el pipeline REAL (mapper + persist +
 * cifrado PII) con ese XML, sin depender de que TIREA lo reenvíe.
 *
 * La app NUNCA había parseado XML (lo hace el adaptador Java, LOO-522): este
 * módulo es la ÚNICA puerta que lo hace, y a propósito solo para este caso
 * de rescate manual — el pull normal sigue recibiendo JSON ya convertido.
 *
 * Opciones FIJAS y no configurables, para que el árbol resultante case con
 * el que consume `eiac-pol-mapper.ts` (fixtures y comentarios del propio
 * mapper dicen "fast-xml-parser colapsa arrays de 1 elemento a objeto"):
 *   - `parseTagValue: false` — todo hoja es STRING. Los fixtures del mapper
 *     usan `"300.00"`/`"41003"` como texto; dejar que fast-xml-parser
 *     adivine tipos convertiría un importe o un CP en number y rompería el
 *     parseo de `importeEiac()` aguas abajo (que exige el patrón `NNN.NN`).
 *   - `ignoreAttributes: true` — el EIAC no lleva datos de negocio en
 *     atributos XML (solo `xmlns`/`xsi:schemaLocation` de la raíz).
 */
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

/**
 * Convierte un XML EIAC crudo al árbol que espera `mapEiacPolAll`/`mapEiacPol`.
 *
 * `fast-xml-parser` es DELIBERADAMENTE laxo: un texto que no es XML, o un XML
 * mal cerrado, no lanza — devuelve `{}` o un árbol parcial en silencio
 * (verificado: `parseEiacXml("esto no es xml")` → `{}`). El endpoint que
 * llama a esto (`ingerir-manual`) confía en que un `throw` aquí es la única
 * señal de "XML inválido" (`catch` → 400 `xml_ilegible`); sin esta guarda, un
 * fichero corrupto o un `rawXml` pegado a medias pasaría como `datos: {}` y
 * el pipeline lo procesaría como «0 pólizas», que es indistinguible de un
 * fichero EIAC legítimo sin objetos — el mismo «no lo sé» disfrazado de «no
 * hay» que el resto del repo evita.
 */
export function parseEiacXml(rawXml: string): unknown {
  const parsed = parser.parse(rawXml) as Record<string, unknown>;
  const objetos =
    (parsed?.ProcesosEIAC as Record<string, unknown> | undefined)?.Objetos ??
    parsed?.Objetos;
  if (objetos == null) {
    throw new Error("XML sin <Objetos> ni <ProcesosEIAC><Objetos> reconocible — no parece un EIAC válido");
  }
  return parsed;
}
