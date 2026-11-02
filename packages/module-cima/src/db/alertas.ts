/**
 * PORT central (fase 3) — contrato de las alertas que dispara la capa de BD de la
 * ingesta. En el CRM eran llamadas directas a `@/lib/telegram/alertas` (Telegram del
 * CRM). Aquí se INYECTAN: el paquete no conoce el canal (central usará
 * el bot único de central (paquete core-telegram) cuando se cablee la ruta, en otra fase).
 *
 * Tipos copiados LITERALES de `asegura/src/lib/telegram/alertas.ts`.
 */

/** Payload de un `cima_fichero_review` (sin PII). */
export interface CimaReviewAlertaInput {
  nombreFichero: unknown;
  codigoEntidad: unknown;
  reviewKind: unknown;
  reason?: unknown;
  reviewReasons?: unknown;
}

/** Payload de un `cima_situacion_desconocida` (código EIAC SituacionPoliza sin mapear). */
export interface CimaSituacionDesconocidaAlertaInput {
  nombreFichero: unknown;
  codigoEntidad: unknown;
  idPolizaEntidad: unknown;
  situacion: unknown;
}

/** Canal de alertas que recibe la capa de BD. Best-effort: el caller hace `void`. */
export interface AlertasCima {
  cimaReview: (payload: CimaReviewAlertaInput) => Promise<void>;
  cimaSituacionDesconocida: (payload: CimaSituacionDesconocidaAlertaInput) => Promise<void>;
}

/**
 * Sin canal inyectado: deja la señal en el log (sin PII: nombres de fichero y
 * códigos). Nunca silencio: una alerta perdida en silencio es peor que una en log.
 */
export const ALERTAS_SOLO_LOG: AlertasCima = {
  async cimaReview(payload) {
    console.warn(JSON.stringify({ source: "cima.alertas", event: "cima_fichero_review", ...payload }));
  },
  async cimaSituacionDesconocida(payload) {
    console.warn(JSON.stringify({ source: "cima.alertas", event: "cima_situacion_desconocida", ...payload }));
  },
};
