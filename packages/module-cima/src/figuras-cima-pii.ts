/**
 * Cifrado de las FIGURAS / TERCEROS de CIMA (04/10/2026). Ver `figuras-cima.ts`.
 *
 * Mismo criterio que el resto de PII Tier-1 del producto (`poliza_intervinientes`,
 * `siniestro_contrarios`, `datos_especificos.direccion`): AES-256-GCM (`v1:…`) con
 * `encryptFieldNullable`. Se cifran: `nombre`, `telefono`, `email`, `matricula`,
 * `domicilio.direccion` (y `domicilioDanos.direccion`), `fechaNacimiento` y el documento, que se guarda como
 * `documentoCifrado` (la clave `documento` en claro NO llega nunca a la BD).
 * En claro: papel, claseFigura, tipoPersona, tipoDocumento, cp/localidad/provincia/
 * país, orden/porcentaje y los datos de la compañía del contrario.
 *
 * 🚨 Guarda `v1:`: sin `PII_ENCRYPTION_KEY`, `encryptField` devuelve el texto plano.
 * Un campo cuyo cifrado no empieza por `v1:` se escribe `null` (no se sabe), nunca
 * en claro. Perderlo se ve; escribirlo en claro no se ve nunca.
 */
import { decryptFieldNullable, encryptFieldNullable } from "@central/module-seguros-pii";
import { documentoNormalizado, type FiguraCima } from "./figuras-cima.ts";

/** Campos de primer nivel de una figura que se cifran (además de domicilio.direccion y el documento). */
export const FIGURA_CAMPOS_CIFRADOS = ["nombre", "telefono", "email", "matricula", "fechaNacimiento"] as const;

/**
 * Bloques de domicilio de una figura cuya `direccion` se cifra. 20/10/2026:
 * `domicilioDanos` (bien dañado del contrario en un SIN). Un bloque nuevo que no esté
 * aquí iría con la vía EN CLARO: el cepo de `figuras-cima.test.ts` lo vigila.
 */
export const FIGURA_DOMICILIOS_CIFRADOS = ["domicilio", "domicilioDanos"] as const;

function cifra(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const c = encryptFieldNullable(v);
  return typeof c === "string" && c.startsWith("v1:") ? c : null;
}

function descifra(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  try {
    return decryptFieldNullable(v) ?? null;
  } catch {
    return null;
  }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Una figura EN CLARO (salida del mapper) → forma PERSISTIBLE: PII cifrada,
 * `documento` → `documentoCifrado`. Idempotente sobre lo ya cifrado (un `v1:` no se
 * vuelve a cifrar). PURA salvo el cifrado.
 */
export function cifrarFigura(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...f };
  for (const k of FIGURA_CAMPOS_CIFRADOS) {
    if (!(k in out)) continue;
    const v = out[k];
    out[k] = typeof v === "string" && v.startsWith("v1:") ? v : cifra(v);
  }
  if ("documento" in out || "documentoCifrado" in out) {
    const ya = out.documentoCifrado;
    out.documentoCifrado = typeof ya === "string" && ya.startsWith("v1:") ? ya : cifra(out.documento);
    delete out.documento;
  }
  for (const k of FIGURA_DOMICILIOS_CIFRADOS) {
    const bloque = out[k];
    if (!esObjeto(bloque)) continue;
    const d = { ...bloque };
    const dir = d.direccion;
    d.direccion = typeof dir === "string" && dir.startsWith("v1:") ? dir : cifra(dir);
    out[k] = d;
  }
  return out;
}

/** Lista de figuras → persistible. No-objetos fuera. */
export function cifrarFigurasCima(lista: unknown): Record<string, unknown>[] {
  if (!Array.isArray(lista)) return [];
  return lista.filter(esObjeto).map(cifrarFigura);
}

/**
 * LECTURA: descifra nombre, teléfono, email, matrícula, fecha de nacimiento y la
 * dirección. `documentoCifrado` se deja CIFRADO a propósito: quien necesite el
 * documento lo descifra aparte y con motivo (el portal no lo pinta).
 */
export function descifrarFigurasCima(lista: unknown): Record<string, unknown>[] {
  if (!Array.isArray(lista)) return [];
  return lista.filter(esObjeto).map((f) => {
    const out: Record<string, unknown> = { ...f };
    for (const k of FIGURA_CAMPOS_CIFRADOS) if (k in out) out[k] = descifra(out[k]);
    for (const k of FIGURA_DOMICILIOS_CIFRADOS) {
      const bloque = out[k];
      if (esObjeto(bloque)) out[k] = { ...bloque, direccion: descifra(bloque.direccion) };
    }
    return out;
  });
}

/**
 * `datos_especificos` de un POL → cifra la PII ANIDADA que `encryptPolizaDatosEspecificos`
 * (solo primer nivel: `iban`, `direccion`) no ve: `figuras[]`, `vida.persona`,
 * `decesos.persona` y lo mismo dentro de cada `riesgos[]`. Devuelve copia.
 */
export function cifrarPiiAnidadaCima(datos: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...datos };
  if ("figuras" in out) out.figuras = cifrarFigurasCima(out.figuras);
  const conPersona = (o: Record<string, unknown>) => {
    for (const k of ["vida", "decesos"]) {
      const b = o[k];
      if (!esObjeto(b)) continue;
      o[k] = { ...b, persona: esObjeto(b.persona) ? cifrarFigura(b.persona) : null };
    }
  };
  conPersona(out);
  if (Array.isArray(out.riesgos)) {
    out.riesgos = out.riesgos.map((r) => {
      if (!esObjeto(r)) return r;
      const item = { ...r };
      conPersona(item);
      return item;
    });
  }
  return out;
}

/** Texto normalizado para comparar identidad (no se guarda así). */
function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, " ") : "";
}

/**
 * ¿Es la MISMA persona? (en claro). Mismo papel y:
 *  - los dos con documento → el mismo documento (documentos distintos = personas distintas);
 *  - a alguno le falta → mismo nombre (una entrada guardada sin documento y otra nueva
 *    que sí lo trae son la misma persona: se fusionan, no se crea otra);
 *  - ninguno trae nombre → misma matrícula y compañía (contrario sin persona);
 *  - ni eso → mismo domicilio del bien dañado (cp + dirección, en claro);
 *  - sin ningún identificador → nunca la misma persona.
 */
export function mismoTercero(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (norm(a.papel) !== norm(b.papel)) return false;
  const da = documentoNormalizado(typeof a.documento === "string" ? a.documento : null);
  const db = documentoNormalizado(typeof b.documento === "string" ? b.documento : null);
  if (da && db) return da === db;
  const na = norm(a.nombre);
  const nb = norm(b.nombre);
  if (na || nb) return na === nb;
  const ma = norm(a.matricula), mb = norm(b.matricula), ca = norm(a.compania), cb = norm(b.compania);
  if (!ma && !mb && !ca && !cb) {
    // Último identificador: el domicilio del bien dañado (contrario que solo trae
    // `ImplicadoDiversos/Domicilio`). Sin él tampoco, no se funden dos desconocidos.
    const ka = claveDomicilioDanos(a);
    return ka !== null && ka === claveDomicilioDanos(b);
  }
  return ma === mb && ca === cb;
}

/**
 * Clave de identidad del `domicilioDanos` EN CLARO: cp + dirección normalizados. null
 * si no hay dirección legible (falta, o sigue cifrada porque no se pudo descifrar:
 * el IV aleatorio haría distintas dos copias del mismo dato) → no identifica a nadie.
 */
function claveDomicilioDanos(f: Record<string, unknown>): string | null {
  const d = f.domicilioDanos;
  if (!esObjeto(d)) return null;
  const dir = norm(d.direccion);
  if (!dir || dir.startsWith("V1:")) return null;
  return `${norm(d.cp)}|${dir}`;
}

/**
 * Fusión CAMPO A CAMPO de la misma persona: el valor no nulo de `gana` se queda; uno
 * nulo NO borra lo que trae `otro`. También dentro de `domicilio`.
 */
export function fusionarCampos(gana: Record<string, unknown>, otro: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...otro };
  for (const [k, v] of Object.entries(gana)) {
    if (v === null || v === undefined) {
      if (!(k in out)) out[k] = v ?? null;
      continue;
    }
    out[k] = esObjeto(v) && esObjeto(out[k]) ? fusionarCampos(v, out[k] as Record<string, unknown>) : v;
  }
  return out;
}

/** Descifra si puede; si no (clave rotada, dato corrupto), deja el valor guardado tal cual. */
function descifraOConserva(v: unknown): unknown {
  if (typeof v !== "string" || v.length === 0) return v ?? null;
  try {
    return decryptFieldNullable(v) ?? null;
  } catch {
    return v;
  }
}

/** Un tercero guardado (cifrado) → en claro, con `documento` en vez de `documentoCifrado`. */
function terceroEnClaro(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p };
  for (const k of FIGURA_CAMPOS_CIFRADOS) if (k in out) out[k] = descifraOConserva(out[k]);
  for (const k of FIGURA_DOMICILIOS_CIFRADOS) {
    const bloque = out[k];
    if (esObjeto(bloque)) out[k] = { ...bloque, direccion: descifraOConserva(bloque.direccion) };
  }
  if ("documentoCifrado" in out) {
    out.documento = descifraOConserva(out.documentoCifrado);
    delete out.documentoCifrado;
  }
  return out;
}

/** Tope de terceros guardados por siniestro. */
export const MAX_TERCEROS = 60;

/**
 * `siniestros.cima_extra.terceros` tras aplicar un SIN. El SIN es un DELTA (EIAC
 * §6.1.3): un tercero que el fichero no trae NO se borra. La misma persona
 * (`mismoTercero`, comparada EN CLARO: el cifrado lleva IV aleatorio) se FUSIONA campo
 * a campo (`fusionarCampos`): gana lo no nulo del fichero, salvo `ganaExistente`
 * (relleno: fichero más viejo que lo aplicado), y un nulo nunca borra un dato.
 * Devuelve la lista CIFRADA, o `undefined` si no hay nada guardado ni entrante
 * (no se escribe la clave: null ≠ []).
 */
export function fusionarTercerosCima(
  guardado: unknown,
  entrantes: FiguraCima[] | undefined,
  ganaExistente: boolean,
): Record<string, unknown>[] | undefined {
  const previos = (Array.isArray(guardado) ? guardado.filter(esObjeto) : []).map(terceroEnClaro);
  const nuevos = (entrantes ?? []).map((n) => ({ ...(n as unknown as Record<string, unknown>) }));
  if (previos.length === 0 && nuevos.length === 0) return undefined;
  const acumulado: Record<string, unknown>[] = [...previos];
  for (const n of nuevos) {
    const i = acumulado.findIndex((g) => mismoTercero(g, n));
    if (i === -1) acumulado.push(n);
    else acumulado[i] = ganaExistente ? fusionarCampos(acumulado[i], n) : fusionarCampos(n, acumulado[i]);
  }
  return acumulado.slice(0, MAX_TERCEROS).map(cifrarFigura);
}
