/**
 * Fase 4 (sombra) — PURO. Clasifica y DESCOMPONE las sentencias SQL que genera Drizzle
 * (`pg-core`) para la capa de BD de la ingesta, sin ejecutarlas.
 *
 * Dos usos:
 *  1. `esLectura` decide qué sentencia puede REENVIARSE a la BD real (solo lectura) y cuál
 *     se GRABA sin ejecutar. Ante la duda, NO es lectura (se graba): una lectura mal
 *     clasificada como escritura solo empobrece la sombra; al revés, Postgres la rechazaría
 *     igualmente (transacción READ ONLY), pero no se arriesga.
 *  2. `parsearEscritura` saca tabla, columnas, VALUES, el SET (de un UPDATE o del
 *     `on conflict do update`) y el id objetivo, para reconstruir QUÉ escribiría central.
 *     Solo entiende las formas que emite Drizzle; lo demás queda como `{ k: "otro" }` y
 *     NO se compara (se cuenta como no evaluable), nunca se inventa.
 */

/** Expresión de un VALUES o de un SET, reducida a lo que se sabe evaluar. */
export type ExprSql =
  | { k: "param"; i: number }
  | { k: "default" }
  | { k: "excluded"; col: string }
  | { k: "actual"; col: string }
  | { k: "coalesce"; args: ExprSql[] }
  | { k: "null" }
  | { k: "otro" };

export interface EscrituraParseada {
  verbo: "insert" | "update" | "delete" | "otro";
  tabla: string | null;
  /** INSERT: columnas en orden. */
  columnas: string[];
  /** INSERT: una lista de expresiones por fila de VALUES (mismo orden que `columnas`). */
  filas: ExprSql[][];
  /** INSERT … ON CONFLICT … */
  onConflict: "ninguno" | "nada" | "actualizar";
  /** UPDATE o `on conflict do update set`. */
  set: Array<{ col: string; expr: ExprSql }>;
  /** UPDATE: `"tabla"."id" = $n` del WHERE (si lo hay). */
  idObjetivo: ExprSql | null;
  /** Elementos del RETURNING tal cual (sin comillas exteriores). */
  returning: string[];
}

/** Quita el bloqueo final (`for update`, `for share`…) de un SELECT: en una transacción
 * READ ONLY Postgres lo rechaza, y la sombra no necesita bloquear nada. */
export function quitarBloqueo(sql: string): string {
  return sql.replace(/\s+for\s+(?:no\s+key\s+update|key\s+share|update|share)(?:\s+of\s+[\w"., ]+)?(?:\s+nowait|\s+skip\s+locked)?\s*;?\s*$/i, "");
}

const PALABRAS_ESCRITURA =
  /\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|copy|call|do|lock|vacuum|analyze|refresh|reindex|cluster|comment|security|listen|notify|prepare|execute|nextval|setval|pg_advisory\w*|pg_try_advisory\w*|lo_\w+|dblink\w*|pg_terminate_backend|pg_cancel_backend|set_config|pg_notify)\b/i;

/** Quita literales de texto e identificadores entre comillas: una columna llamada
 * «delete» o un literal 'update' no deben confundir al clasificador. */
function sinLiterales(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
}

/** PURO. `true` solo si la sentencia (ya sin bloqueo final) es un SELECT/WITH sin
 * ninguna palabra de escritura o de efecto lateral. */
export function esLectura(sql: string): boolean {
  const s = sinLiterales(quitarBloqueo(sql)).trim();
  if (!/^(select|with)\b/i.test(s)) return false;
  if (s.includes(";")) return false;
  return !PALABRAS_ESCRITURA.test(s);
}

/** Divide por `sep` a nivel superior (fuera de paréntesis y comillas). */
export function dividirNivelSuperior(s: string, sep = ","): string[] {
  const out: string[] = [];
  let prof = 0;
  let q: string | null = null;
  let ini = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === "(") prof++;
    else if (c === ")") prof--;
    else if (prof === 0 && s.startsWith(sep, i)) {
      out.push(s.slice(ini, i).trim());
      ini = i + sep.length;
    }
  }
  const resto = s.slice(ini).trim();
  if (resto) out.push(resto);
  return out;
}

/** Posición de la palabra clave `kw` (minúsculas, rodeada de espacios) a nivel superior. */
function buscarNivelSuperior(s: string, kw: string, desde = 0): number {
  let prof = 0;
  let q: string | null = null;
  const bajo = s.toLowerCase();
  for (let i = desde; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === "(") prof++;
    else if (c === ")") prof--;
    else if (prof === 0 && bajo.startsWith(kw, i) && /\s/.test(s[i - 1] ?? " ")) {
      const fin = s[i + kw.length];
      if (fin === undefined || /[\s(]/.test(fin)) return i;
    }
  }
  return -1;
}

const ident = (s: string) => s.trim().replace(/^"|"$/g, "");

/** Columna de una referencia `"tabla"."col"`, `"col"` o `col`. */
function columnaDe(ref: string): { tabla: string | null; col: string } | null {
  const m = ref.trim().match(/^(?:"?([\w]+)"?\.)?"?([\w]+)"?$/);
  if (!m) return null;
  return { tabla: m[1] ?? null, col: m[2]! };
}

/** `true` si el paréntesis que abre la primera vez es el que cierra al final
 * (`coalesce(a) || coalesce(b)` NO es un coalesce). */
function parentesisCierraAlFinal(t: string): boolean {
  const ini = t.indexOf("(");
  let prof = 0;
  let q: string | null = null;
  for (let i = ini; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === "(") prof++;
    else if (c === ")" && --prof === 0) return i === t.length - 1;
  }
  return false;
}

export function parsearExpr(texto: string): ExprSql {
  const t = texto.trim();
  const p = t.match(/^\$(\d+)(?:::[\w ]+)?$/);
  if (p) return { k: "param", i: Number(p[1]) - 1 };
  if (/^default$/i.test(t)) return { k: "default" };
  if (/^null$/i.test(t)) return { k: "null" };
  const ex = t.match(/^excluded\."?([\w]+)"?$/i);
  if (ex) return { k: "excluded", col: ex[1]! };
  const co = t.match(/^coalesce\s*\(([\s\S]*)\)$/i);
  if (co && parentesisCierraAlFinal(t)) {
    const args = dividirNivelSuperior(co[1]!).map(parsearExpr);
    return args.some((a) => a.k === "otro") ? { k: "otro" } : { k: "coalesce", args };
  }
  const c = columnaDe(t);
  if (c && t.includes('"')) return { k: "actual", col: c.col };
  return { k: "otro" };
}

function parsearSet(trozo: string): Array<{ col: string; expr: ExprSql }> {
  const out: Array<{ col: string; expr: ExprSql }> = [];
  for (const asig of dividirNivelSuperior(trozo)) {
    const i = asig.indexOf("=");
    if (i < 0) continue;
    const c = columnaDe(asig.slice(0, i));
    if (!c) continue;
    out.push({ col: c.col, expr: parsearExpr(asig.slice(i + 1)) });
  }
  return out;
}

function parsearReturning(sql: string, desde: number): string[] {
  const r = buscarNivelSuperior(sql, "returning", desde);
  if (r < 0) return [];
  return dividirNivelSuperior(sql.slice(r + "returning".length));
}

const VACIA = (verbo: EscrituraParseada["verbo"], tabla: string | null): EscrituraParseada => ({
  verbo,
  tabla,
  columnas: [],
  filas: [],
  onConflict: "ninguno",
  set: [],
  idObjetivo: null,
  returning: [],
});

/** PURO. Descompone una escritura de Drizzle. Lo que no reconoce → `verbo: "otro"`. */
export function parsearEscritura(sqlTexto: string): EscrituraParseada {
  const sql = sqlTexto.trim().replace(/\s+/g, " ");
  const ins = sql.match(/^insert into ("?[\w]+"?(?:\."?[\w]+"?)?) \(([^)]*)\) values /i);
  if (ins) {
    const tabla = ident(ins[1]!.split(".").pop()!);
    const columnas = ins[2]!.split(",").map(ident);
    const e = VACIA("insert", tabla);
    e.columnas = columnas;
    let i = ins[0].length;
    // Tuplas de VALUES: `(…), (…)` hasta `on conflict` / `returning` / fin.
    while (i < sql.length && sql[i] === "(") {
      let prof = 0;
      let q: string | null = null;
      let j = i;
      for (; j < sql.length; j++) {
        const c = sql[j]!;
        if (q) {
          if (c === q) q = null;
          continue;
        }
        if (c === "'" || c === '"') q = c;
        else if (c === "(") prof++;
        else if (c === ")" && --prof === 0) break;
      }
      e.filas.push(dividirNivelSuperior(sql.slice(i + 1, j)).map(parsearExpr));
      i = j + 1;
      while (sql[i] === "," || sql[i] === " ") i++;
    }
    const oc = buscarNivelSuperior(sql, "on conflict", i - 1);
    if (oc >= 0) {
      const du = sql.toLowerCase().indexOf(" do update set ", oc);
      if (du >= 0) {
        e.onConflict = "actualizar";
        const ini = du + " do update set ".length;
        const fin = [buscarNivelSuperior(sql, "where", ini), buscarNivelSuperior(sql, "returning", ini)]
          .filter((x) => x >= 0)
          .sort((a, b) => a - b)[0];
        e.set = parsearSet(sql.slice(ini, fin ?? sql.length));
      } else if (/ do nothing/i.test(sql.slice(oc))) {
        e.onConflict = "nada";
      }
    }
    e.returning = parsearReturning(sql, i - 1);
    return e;
  }
  const upd = sql.match(/^update ("?[\w]+"?(?:\."?[\w]+"?)?)(?: [a-z_]\w*)? set /i);
  if (upd) {
    const tabla = ident(upd[1]!.split(".").pop()!);
    const e = VACIA("update", tabla);
    const ini = upd[0].length;
    // `update … set … from (values …)` (motivos de exclusión): no se descompone.
    if (buscarNivelSuperior(sql, "from", ini) >= 0) return { ...e, verbo: "otro" };
    const w = buscarNivelSuperior(sql, "where", ini);
    const r = buscarNivelSuperior(sql, "returning", ini);
    const finSet = [w, r].filter((x) => x >= 0).sort((a, b) => a - b)[0] ?? sql.length;
    e.set = parsearSet(sql.slice(ini, finSet));
    if (w >= 0) {
      const where = sql.slice(w, r >= 0 ? r : sql.length);
      const m = where.match(/(?:^|[\s(])(?:"[\w]+"\.)?"id"\s*=\s*(\$\d+(?:::[\w ]+)?)/i);
      if (m) e.idObjetivo = parsearExpr(m[1]!);
    }
    e.returning = parsearReturning(sql, ini);
    return e;
  }
  const del = sql.match(/^delete from ("?[\w]+"?(?:\."?[\w]+"?)?)/i);
  if (del) return VACIA("delete", ident(del[1]!.split(".").pop()!));
  return VACIA("otro", null);
}
