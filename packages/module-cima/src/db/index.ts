/**
 * `@central/module-cima/db/index` — capa de BD y de red de la ingesta CIMA (fase 3).
 *
 * Separada de la raíz del paquete a propósito: importar `@central/module-cima` (lógica
 * pura) NO carga drizzle ni postgres. Nada aquí lee env ni abre conexiones al importar:
 * `db`, adaptador, alertas y env entran inyectados.
 *
 * 🚨 Aún NO lo importa ninguna app (el corte es la fase 5 de la spec). `CIMA_ESCRITOR=central`
 * (`escritor.ts`) se exige DENTRO de cada función exportada que escribe datos:
 * `persistCima*` y `escribirMotivosExclusion` (+ claves PII, vía `exigirGateEscritura`)
 * y `recordCima*Event`; en cada escritura y `confirm` de `buildCimaPullDeps`; y en el
 * cliente del adaptador ante cualquier ruta que confirme (`../client.ts`). El candado
 * (`*CandadoIngesta`) NO lleva el gate a propósito: es la fila de coordinación entre
 * escritores (mig 0109), no datos de la cartera.
 */
export { crearDbCima, exigirClavesPii, exigirGateEscritura, ClavePiiAusenteError, CLAVES_PII_OBLIGATORIAS, type CimaDb } from "./conexion.ts";
export { cimaEscritorActivo, exigirEscritorCentral, CimaEscritorNoCentralError, type CimaEscritor } from "./escritor.ts";
export { ALERTAS_SOLO_LOG, type AlertasCima } from "./alertas.ts";
export { buildCimaPullDeps, CRUDO_RETENCION_DIAS, type BuildCimaPullDepsOptions } from "./pull-deps.ts";
export { persistCimaFichero, getIngestaCorreduriaId } from "./pull-persist.ts";
export { persistCimaSiniestro } from "./persist-siniestro.ts";
export { persistCimaRecibo } from "./persist-recibo.ts";
export { persistCimaCef } from "./persist-cef.ts";
export { recordCimaPullLifecycleEvent, recordCimaCandadoEvent } from "./pull-audit.ts";
export { getCimaHealthSnapshot } from "./health-snapshot.ts";
export {
  adquirirCandadoIngesta,
  liberarCandadoIngesta,
  ejecutarConCandadoIngesta,
  CANDADO_INGESTA_CIMA,
} from "./ingesta-candado.ts";
export { escribirMotivosExclusion } from "./cobertura-motivos.ts";
export { columnaExiste } from "./columna-opcional.ts";
