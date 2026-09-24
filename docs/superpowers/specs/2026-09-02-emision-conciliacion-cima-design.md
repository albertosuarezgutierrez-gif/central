# Emisión en central y conciliación Codeoscopic ↔ CIMA — diseño (02/09/2026)

> Punto 1 del orden de trabajo de `docs/CORREDURIA-CRM-VISION.md` (§5 y §9). **Pendiente de OK de
> Alberto**: sin él no se escribe código de emisión. Lo que SÍ está hecho ya (PR de hoy): la ficha
> distingue «confirmada por CIMA» de «emitida, pendiente de CIMA», el estado del cliente se deriva de
> eso, y el guardián de duplicadas vigila la cartera viva.

## 1. El problema, medido

| Hecho | Dónde |
|---|---|
| La emisión legacy escribe solo `numero_poliza`, `aseguradora`, `tipo`, `prima_anual`, fechas interinas. `origen` queda en el default (`gestionada_correduria`, el MISMO que pone CIMA), `import_ref` NULL, `id_poliza_entidad`/`codigo_entidad_dgs`/`datos_especificos` NULL | `/home/user/asegura/src/lib/codeoscopic/mint-poliza-on-emit.ts:102-116` |
| CIMA empareja por (1) `numero_poliza` normalizado + `aseguradora` EXACTA; (2) `cliente_id` + `aseguradora` + `fecha_inicio`; (3) inserta. `import_ref` no interviene. Si casa, `update` reescribe incluido `cliente_id` | `/home/user/asegura/src/lib/integrations/cima/poliza-matching.ts:199-253`, `pull-persist.ts:478` |
| Hoy: 109 vivas, **todas** con `id_poliza_entidad`; 0 emitidas por nosotros; 0 duplicadas | SQL 02/09/2026 |

Consecuencia: la PRIMERA póliza que emitamos por Codeoscopic acaba **duplicada** (nombre de compañía
distinto o número provisional) o **pisada** (si casa, CIMA sobrescribe y nuestro `codeoscopic_projects.poliza_id`
apunta a una fila que ya no es «nuestra»).

## 2. Decisiones de diseño

### D1. La emisión vive en `apps/asegura` (central), no se reactiva en el legacy
El legacy queda como motor de ingesta de CIMA y se apagará cuando central ingiera CIMA. Reactivar allí
la emisión sería invertir en lo que se va a apagar. Prerrequisito medido: el sandbox de Codeoscopic
nunca cerró la batería Quote → preemisión → Submit → webhook, y el envío **no es idempotente de punta a
punta** (`apps/asegura/CLAUDE.md`, «Condición para encender ese flag»). Antes de emitir en producción:
**mandar el mismo `attempt_id` dos veces contra el sandbox y ver si deduplican.**

### D2. Lo que se escribe al emitir (para que CIMA case y no pise)
En `polizas`, en la misma transacción que `codeoscopic_projects.poliza_id`:

| Campo | Valor | Por qué |
|---|---|---|
| `origen` | **nuevo valor del enum `poliza_origen`: `emitida_codeoscopic`** (migración) | Es la marca «esta la emitimos nosotros» que hoy no existe |
| `codigo_entidad_dgs` | del catálogo de Codeoscopic (`/insurance-companies` → mapa a DGS, tabla propia `companias_dgs`) | CIMA identifica por código, no por nombre |
| `aseguradora` | **el texto EXACTO que CIMA usa para ese código**, leído de las vivas existentes (`select distinct aseguradora where codigo_entidad_dgs = X`) | Para que el nivel (1) del matching de CIMA case aunque no se toque el legacy |
| `numero_poliza` | el que devuelva Codeoscopic (aunque sea provisional) | Clave del matching |
| `datos_especificos` | el riesgo tarificado (matrícula/versión, o dirección+m²+año) | Lo que CIMA NO manda y la ficha necesita |
| `import_ref` | NULL | Cara viva |
| `id_poliza_entidad` | NULL hasta que CIMA la confirme | Es lo que hoy distingue «pendiente» de «confirmada» |

Con esto, el matching actual del legacy casa por número + nombre y hace `update` → **la fila
sobrevive con nuestro id**, `codeoscopic_projects.poliza_id` sigue válido, y CIMA rellena
`id_poliza_entidad`, vencimiento real, recibos y coberturas. El `cliente_id` que CIMA escribe es el
que resuelve por hash del DNI: **si el tomador se dio de alta con DNI, es el mismo id**. Por eso el
alta de lead sin DNI es un riesgo aquí: antes de emitir, la identidad se verifica (fase 2 del
principio «presupuesto rápido, verificación al emitir»).

### D3. Lo que CIMA no debe pisar (y hoy pisa)
Cuando central ingiera CIMA (o si se parchea el legacy), al casar con una `emitida_codeoscopic`:
- **CIMA manda** en `estado`, `fecha_inicio`, `fecha_vencimiento`, `numero_poliza` definitivo,
  `id_poliza_entidad`, recibos, coberturas EIAC.
- **Nosotros mandamos** en `datos_especificos` (se FUSIONA: CIMA rellena claves que falten, no
  sustituye el JSON), `prima_anual` ofertada (se guarda aparte como `prima_emision` si CIMA trae otra),
  `cliente_id` (no se cambia si el hash del DNI coincide; si no coincide → `review`, no `update`).
- Cada casamiento deja fila en `poliza_merge_log` (existe, sin escritor).

### D4. Emparejamiento por CÓDIGO, no por nombre
Nivel (1) pasa a `numero_poliza` normalizado (`normalizarNumeroPoliza`, ya en `module-seguros`) +
`codigo_entidad_dgs`. Respaldo: hash del DNI del tomador + código + `fecha_inicio` ±15 días. Sin
match → insert, como hoy. Ambigüedad → `review`, como hoy.

### D5. Guardián
`GET /api/operador/duplicados` (hecho hoy) + aviso en `/correduria`. Cuando exista ingesta propia,
además Telegram tras cada pull si aparece un grupo `emitidaYCima`.

## 3. Plan por PRs (cada uno con test y sin encender nada facturable)

> **OK de Alberto el 02/09/2026 («haz todo ok»). Estado tras esa tarde:**

1. ✅ **Migración** (aplicada en la BD el 02/09/2026): valor `emitida_codeoscopic` en `poliza_origen`
   (`seguros_enums_fuente_web_y_origen_emitida`; ⚠️ un valor de enum NO es reversible en Postgres,
   la tabla sí) y tabla **`companias_dgs`** sembrada con 15 códigos: 3 con `nombre_cima` medido en
   la cartera (Mapfre/Allianz/Occident), 2 adheridas a CIMA sin vivas (Generali, Reale) y 10
   verificados contra el catálogo del vendor por el legacy. **No hay «id Codeoscopic»**: el catálogo
   `/car/insurance-companies` del vendor ya devuelve el código DGS, así que la única traducción que
   hace falta es DGS → nombre CIMA. SQL en `apps/asegura/prisma/sql/2026-09-02_seguros_companias_dgs.sql`.
2. ✅ **Reglas puras en `@central/module-seguros` (`emision.ts`, 5 tests)**: `prepararPolizaEmitida`
   (D2, con avisos cuando no hay nombre CIMA, la compañía no está en CIMA o el vendor no dio número),
   `emparejarConCima` (D4) y `conciliarConCima` (D3). **BD en `apps/asegura/lib/emision.ts`**:
   `registrarPolizaEmitida` acuña la fila + enlaza `codeoscopic_projects.poliza_id` + historial en
   una transacción; exige DNI en la ficha del tomador (sin él CIMA resolvería otro cliente).
   Puerto `POST /api/operador/poliza/emitida`, **cerrado tras `CODEOSCOPIC_EMISION_ACTIVA=true`**
   (503 `emision_desactivada`): sin envío real, acuñar una «emitida» sería inventar una póliza.
3. ⏸️ **Flujo Codeoscopic Submit** (`POST /insurances/{id}/policy-applications`, multipart) — **NO
   construido, a propósito**. El gate que esta spec fija (mandar el mismo `attempt_id` dos veces y
   ver si deduplican) **no se puede correr**: `apps/asegura/CLAUDE.md` mide que «no hay sandbox
   utilizable» y las credenciales son de producción. Código de envío que no se puede probar contra
   el vendor es código que se estrena en producción con dinero y con un contrato del cliente.
   Cuando Codeoscopic dé entorno de pruebas (juan.fernandez@codeoscopic.com): transporte multipart
   nuevo (`peticion()` solo hace JSON), candado `submit_in_flight_at`, y ampliar la excepción del
   guardián `test/regression-asegura-gasto-codeoscopic.test.ts` (hoy tumba cualquier `metodo: 'POST'`
   fuera de `cotizar.ts`). Al recibir el `emision_ok`, llamar a `registrarPolizaEmitida`.
4. ⏸️ **Ingesta CIMA propia** (port de `cima-pull`) con D3/D4 y `poliza_merge_log`: las reglas puras
   ya están (`emparejarConCima`, `conciliarConCima`); falta el port del pull, que sigue APARCADO
   (`docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md`). Hasta entonces el legacy casa por nombre y D2 lo
   hace compatible.

## 4. Lo que NO se hace
- No se toca el legacy (`/home/user/asegura`) salvo emergencia: es el motor que trae CIMA hoy.
- No se enciende la emisión sin la prueba de idempotencia ni sin OK explícito (0,50 € por cotización;
  una emisión real compromete al cliente con una compañía).
- No se inventan datos personales para emitir (regla ya vigente en `desde-cartera.ts`).
