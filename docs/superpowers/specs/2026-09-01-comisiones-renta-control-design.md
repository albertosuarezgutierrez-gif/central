# Control de comisiones de la correduría: devengo → liquidación → cobro → renta

**Fecha:** 01/09/2026
**Vertical:** `apps/plataforma` (`/correduria`), leyendo la BD de la correduría **por el puerto HTTP de
`apps/asegura`** (`/api/operador/comisiones`, Bearer `ASEGURA_OPERADOR_SECRET`).
**Estado:** implementado (01/09/2026).

> 🚨 **Corrección al diseño original.** Este documento decía que plataforma leería la BD de la correduría
> directamente por `ASEGURA_DATABASE_URL`. **Es falso: esa env solo existe en `apps/asegura`** (comprobado
> por `grep` en los manifiestos de Vercel de las dos apps), y darle a plataforma la conexión de otra app
> rompería el aislamiento entre apps del monorepo, que es el mismo patrón por el que ia-rest y iarrhh se
> leen por HTTP y no por Prisma. Lo implementado es el **puerto operador**, como `lib/cartera-asegura.ts`.
> Las menciones a `ASEGURA_DATABASE_URL` que quedan abajo se leen como «la fuente de datos que sirve el
> puerto»; la env sigue viviendo solo en `apps/asegura`.

---

## 1. El problema, dicho por Alberto

> «Controlar que me pagan lo que me deben y que está ingresado en cuenta.»

Y su consecuencia fiscal: las comisiones son **rendimiento de actividad económica** en su IRPF, así que
la cifra que salga de aquí tiene que poder **contrastarse con el borrador de la AEAT** cuando la
declaración pase por la asesoría.

### Lo que hoy pasa de verdad

Del hilo **IRPF 2025** con la asesoría (01/06/2026), su gestora escribió:

> «Actividad Económica Alberto. Necesitaría el **libro registro de gastos e ingresos**. De no tenerlo,
> ¿pongo los ingresos que aparecen en los datos fiscales? Ingresos 8.593,76 € y 1.267,58 € de retención.»

Y la respuesta fue: **«Ingresos los que aparece en el borrador, gastos te adjunto excel».**

Es decir: **hoy el borrador no se cuadra, se copia.** No existe libro registro. La retención implícita
(1.267,58 / 8.593,76 = **14,75 %**) confirma el **15 % de IRPF** que las compañías declaran en el
modelo 190, que es justo lo que alimenta el borrador.

### Por qué el cuadre no es trivial

Los tres números **no son el mismo número**, y confundirlos es el fallo por defecto:

| Concepto | Quién lo dice | Dónde acaba |
|---|---|---|
| **Comisión bruta** | recibo / extracto de la compañía | **modelo 190 → borrador AEAT** |
| **Retención (IRPF 15 %)** | ídem | casilla de retenciones del IRPF |
| **Remesa / líquido** | extracto de liquidación | **ingreso en la cuenta del BBVA** |

El cron actual compara el «neto» de CIMA contra la suma bancaria con un umbral fijo de 5 €. Con una
diferencia estructural del 15 % **eso descuadra siempre**.

---

## 2. Hallazgos medidos (01/09/2026)

Todo lo de este apartado está comprobado contra datos reales, no supuesto.

### 2.1 CIMA ya está parseado — pero no por nuestro código

La BD de la correduría tiene `cuenta_efectivo` y `liquidaciones`, rellenadas por el **JAR oficial de
TIREA** vía el adaptador Java de Fly, con **comisión, retención y remesa separadas**:

| Compañía | Periodo | Comisión | Retención | Remesa |
|---|---|---|---|---|
| Allianz `C0109` | feb/2026 | 95,03 € | 14,26 € | **80,77 €** |
| Allianz `C0109` | may/2026 | 23,11 € | 3,47 € | **19,64 €** |
| Occident `C0468` | jul/2026 | **−346,20 €** | 51,90 € | **0,00 €** |

95,03 − 14,26 = 80,77 exacto. 14,26 / 95,03 = **15,006 %**. La cadena entera queda validada con datos.

Frente a eso, `apps/plataforma/lib/cima.ts` habla SOAP directo contra `ws.cimaseg.es`, **nunca se
validó** (el endpoint devolvía 404, y por eso el cron está apagado tras `CIMA_WSE_ENABLED !== 'true'`),
su parser del fichero LIQ está adivinado por su propio comentario («intentamos extraer el mayor número
del pie») y su mapa de compañías usa códigos numéricos (`0131`, `0507`) cuando **los reales son
`C0109` / `C0468` / `C0058` / `C0613`**. Está mal y sobra.

### 2.2 La cartera de recibos da la comisión ESPERADA y el % por ramo

`poliza_recibos` trae `prima_neta`, `comision_bruta`, `comision_liquida`, `situacion`
(pendiente / cobrado / anulado / devuelto), `fecha_situacion` y `codigo_entidad_dgs`, con join a
`polizas.ramo_dgs`. Sobre los recibos **cobrados**:

| Cía | Ramo DGS | Recibos | Prima | Comisión | % |
|---|---|---|---|---|---|
| Mapfre `C0058` | 241 | 76 | 28.441,24 € | 2.894,61 € | 10,18 % |
| Mapfre `C0058` | 2151 | 12 | 2.635,33 € | 465,54 € | 17,67 % |
| Mapfre `C0058` | 282 | 4 | 1.375,73 € | 254,50 € | 18,50 % |
| Allianz `C0109` | 241 | 5 | 1.650,63 € | 200,98 € | 12,18 % |
| Occident `C0468` | 2151 | 4 | 1.213,43 € | 303,35 € | **25,00 %** |
| Occident `C0468` | 282 | 2 | 493,38 € | 74,01 € | **15,00 %** |

⚠️ **El % no es constante dentro de un ramo.** 25,00 % y 15,00 % clavados son tarifa de contrato;
10,18 % o 12,18 % son promedios de cosas mezcladas (campañas, extracomisiones, subproductos). Sirve
para detectar que una compañía paga por debajo de lo suyo, **no como número contractual**.

⚠️ **Falta la tabla de ramos DGS.** Los códigos `241` / `2151` / `282` se guardan crudos; no hay
diccionario en el repo. Hasta que lo haya, la UI muestra el código, **no un nombre inventado**.

### 2.3 El PDF de Allianz es legible y cuadra con CIMA

`mediador@allianz.es` manda **«Cuenta Agente»** mensual con **PDF adjunto real**
(`ADYP_260803_A0018638_Ct10270_003153.pdf`). El texto va en **EBCDIC** dentro del PDF (se decodifica
con `cp500`), y trae dos páginas útiles:

- **Extracto de Cuenta Mediador:** saldo mes anterior, cobros del mes (recibos banco / físicos, vida y
  no vida), regularizaciones, condiciones especiales (incentivos, **retención**, otros), remesas,
  pagos de siniestros, saldo mes y saldo total.
- **Relación de recibos:** una línea por recibo con `Póliza | Recibo | Venc. | Ramo | Tomador |
  Comisión | IRPF | T.Recibo`.

Un recibo de moto del extracto de julio/2026: **comisión 29,52 € / IRPF 4,43 € / recibo 249,34 €**.
El **mismo recibo** está en CIMA con `comision_bruta 29,52` y `comision_liquida 25,09` (= 29,52 − 4,43).
Dos fuentes independientes coinciden al céntimo.

🚨 **Y el extracto revela dinero parado:** el saldo de Allianz es **558,88 €**, con el aviso *«Si quiere
regularizar automáticamente su saldo, facilite la cuenta bancaria en la sucursal»*. Allianz reconoce la
deuda y no la ingresa porque falta el alta de cuenta bancaria — gestión que se pidió el 21/06/2026 y
murió en un «no puedo abrir el enlace, enviad un pdf».

### 2.4 Cobertura real por compañía

| Cía | Recibos (CIMA) | Liquidación (CIMA) | Correo con importe | Estado |
|---|---|---|---|---|
| **Mapfre** `C0058` | ✅ 144 recibos | ❌ ninguna | enlace + NIF, caduca 90 d, **duplicado** | devenga y no consta liquidación |
| **Allianz** `C0109` | ✅ | ✅ | ✅ **PDF adjunto** | liquida pero no ingresa (558,88 €) |
| **Occident** `C0468` | ✅ | ✅ (saldo deudor) | ❌ solo campañas | comisión negativa 4 meses seguidos |
| **Reale** `C0613` | ✅ (primer recibo 01/09/2026) | ❌ | ❌ solo avisos EIAC sin importes | recién adherido |
| **Generali** | ❌ | ❌ | ❌ (solo certificado trimestral) | sin acceso CIMA |

**La coincidencia es adversa:** la única que manda desglose usable por correo es Allianz, que es
precisamente la que ya entra por CIMA. **El correo no tapa el agujero.**

### 2.5 El banco no sabe de quién viene el dinero

Movimientos con `destino = 'seguros'` e importe positivo:

| Año | Total | Sin identificar compañía |
|---|---|---|
| 2025 | 8.316,85 € | **4.877,57 € (59 %)** |
| 2026 (a 31/08) | 11.714,42 € | **9.898,04 € (85 %)** |

El borrador de 2025 decía 8.593,76 € brutos − 1.267,58 € de retención = **7.326,18 € netos**, y el banco
dice 8.316,85 €. **Sobran ~991 € sin explicar.** No se afirma la causa (puede ser compañías que no
retienen, o movimientos que cayeron en `seguros` por descarte): explicarla es precisamente el objetivo.

---

## 3. Objetivo y alcance

**Objetivo:** un libro de comisiones que, por compañía y mes, responda a tres preguntas y sepa decir
cuándo **no** las puede responder:

1. ¿Cuánto he **devengado**? (recibos cobrados)
2. ¿Cuánto me han **liquidado**? (extracto CIMA o PDF de la compañía)
3. ¿Cuánto me han **ingresado**? (BBVA)

Y, agregado por año, la suma de **brutos** y de **retenciones** que va a la asesoría y se contrasta
contra el borrador.

**Dentro de alcance:** 2026 en adelante.

**Fuera de alcance (decisión explícita de Alberto):**
- Descargar o descifrar el PDF de Mapfre (enlace + NIF). Solo aviso y confirmación manual.
- Reconstruir 2025.
- Escribir en la BD de la correduría. **Solo lectura.**
- Emitir el modelo 190 o cualquier declaración. Esto produce un libro registro, no una presentación.

---

## 4. Diseño

### 4.1 Modelo de datos

Tabla nueva `comisiones_devengo` en la BD compartida (schema `public`, junto a `movimientos_bancarios`).
**Una fila por (cuenta, compañía, periodo).**

```
cuenta_id            uuid    NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE
compania_codigo      text    NOT NULL   -- 'C0109' (DGS), la clave real
compania             text    NOT NULL   -- 'Allianz', legible
periodo_inicio       date    NOT NULL
periodo_fin          date    NOT NULL

-- eje 1: DEVENGADO (recibos cobrados en el periodo)
esperado_bruto       numeric(12,2)      -- NULL = no calculado
esperado_recibos     integer
esperado_calculado_at timestamptz

-- eje 2: LIQUIDADO (extracto CIMA o PDF de la compañía)
liq_bruto            numeric(12,2)      -- NULL = no ha llegado
liq_retencion        numeric(12,2)
liq_remesa           numeric(12,2)
liq_origen           text               -- 'cima' | 'pdf' | 'manual'
liq_hash             text               -- eiac_xml_hash o hash del PDF: idempotencia
liq_email_message_id text               -- correo que lo originó, si aplica
liq_confirmado_at    timestamptz        -- solo si liq_origen='manual'

-- eje 3: COBRADO (BBVA)
banco_total          numeric(12,2)      -- NULL = no conciliado
banco_movimiento_ids uuid[]

leido_ok             boolean NOT NULL DEFAULT true  -- false = la lectura de la fuente falló
actualizado_at       timestamptz NOT NULL DEFAULT now()

PRIMARY KEY (cuenta_id, compania_codigo, periodo_inicio, periodo_fin)
```

Decisiones que no son cosméticas:

- **Los tres importes son nullables y NUNCA se colapsan a 0.** `NULL` = no ha llegado; `0` = comprobado
  y es cero. Es la regla del `CLAUDE.md`, y aquí es la diferencia entre «Mapfre no me ha liquidado» y
  «Mapfre me liquidó 0 €».
- **El periodo se guarda como dos fechas, no como `'YYYY-MM'`.** CIMA trae periodos como
  31/05/2026 → 01/07/2026 que un `'YYYY-MM'` destruiría. La tabla `cima_liquidaciones` actual comete
  ese error.
- **`compania_codigo` es la clave, no el nombre.** El nombre legible cambia (Catalana Occidente →
  Occident); el código DGS no.
- **`leido_ok`** distingue «no hay dato» de «no pude mirar». Un `catch` que deje esto en `true` con
  importes a `NULL` convierte una caída de red en un «la compañía no te ha pagado».

Tabla auxiliar `comisiones_cobertura` — qué fuente cubre a cada compañía y desde cuándo. Sin ella el
total anual parecería completo estando ciego a Generali.

```
cuenta_id, compania_codigo, compania,
tiene_recibos_cima   boolean,  desde_recibos    date,
tiene_liq_cima       boolean,  desde_liq        date,
tiene_correo_importe boolean,  remitente        text,
nota_gestion         text     -- 'pendiente adhesión EIAC', 'solicitar acceso a TIREA'…
```

### 4.2 Estados del cuadre — helper puro

`apps/plataforma/lib/correduria/cuadre.ts` + `cuadre.test.ts`. **Lógica pura, sin BD ni red**, al
patrón de `lib/subastas/resumen-docs.ts`. La UI no decide nada; solo pinta lo que devuelve.

Por (compañía, periodo), **nunca dos estados, siempre estos nueve**:

| Estado | Significado | Semáforo |
|---|---|---|
| `no-comprobado` | falló la lectura de una fuente. **No** es «no hay» | ⚪ |
| `sin-cobertura` | esa compañía no tiene ninguna fuente de importe. Hay una **gestión** pendiente | 🟠 |
| `sin-datos` | hay cobertura y aún no ha llegado nada de ese periodo | ⚪ |
| `esperado-sin-liquidar` | devengaste y la compañía no ha liquidado | 🔴 |
| `liquidado-sin-cobrar` | te lo reconoce y no te lo ingresa | 🔴 |
| `cobrado-sin-liquidar` | entró dinero que ninguna fuente explica | 🟠 |
| `deudor` | comisión negativa y remesa 0 €. **No es impago ni descuadre**: saldo a favor de la compañía | 🟠 |
| `descuadra` | dos fuentes hablan del mismo periodo y no coinciden, con el delta | 🔴 |
| `cuadra` | bruto − retención = remesa = ingreso BBVA | 🟢 |

`deudor` existe porque Occident lleva cuatro periodos seguidos así; pintarlo en rojo sería mentir.

**Tolerancias, no un umbral único:**
- `bruto − retencion = remesa` es **aritmética exacta**: tolerancia de 1 céntimo (redondeos).
- `remesa ↔ banco` admite ventana de días y tolerancia mayor (configurable, arranca en 1 €).
- El umbral fijo de 5 € del cron actual **desaparece**.

### 4.3 Flujo

1. **Ingesta CIMA (recibos + liquidaciones).** El cron `/api/cron/cima-liq` deja de hablar SOAP y lee
   por el **puerto HTTP de `apps/asegura`** (`GET /api/operador/comisiones?desde=`, Bearer
   `ASEGURA_OPERADOR_SECRET`), que sirve desde su propia BD (`ASEGURA_DATABASE_URL`, que NO sale de esa app):
   - `poliza_recibos` con `situacion = 'cobrado'` y `fecha_situacion` dentro del periodo → `esperado_bruto`.
   - `cuenta_efectivo` + `liquidaciones` → `liq_bruto` / `liq_retencion` / `liq_remesa`, con
     `eiac_xml_hash` como clave de idempotencia.
   - Se **borran** `apps/plataforma/lib/cima.ts`, la tabla `cima_liquidaciones` y el mapa de compañías.

2. **Ingesta correo.** El triaje de correo (cron existente, IMAP) reconoce los remitentes de
   liquidación y, según el caso:
   - **Allianz** (`mediador@allianz.es`, asunto «Cuenta Agente»): descarga el PDF adjunto, lo decodifica
     (`cp500`) y extrae extracto + relación de recibos → `liq_origen='pdf'`.
   - **Mapfre** (`Comisiones-Mapfre@info.mapfre.com`): **no se descarga nada.** Aviso por Telegram con
     el enlace y un botón que abre la ficha del periodo para que Alberto teclee el importe →
     `liq_origen='manual'` + `liq_confirmado_at`.
   - **Dedupe obligatorio:** Mapfre manda el mismo correo dos veces, minutos aparte. Clave de dedupe:
     remitente + periodo + ventana de 24 h.
   - **El periodo se lee del CUERPO, nunca del asunto.** Allianz fechó «Noviembre de 2026» un correo
     de agosto. Es la regla del `CLAUDE.md`: la clave de un dato es su periodo, no la etiqueta del
     documento que lo publica.

3. **Conciliación banco.** Se compara contra `liq_remesa`, **no contra el bruto**. Reutiliza
   `detectarCompania` / `correduria_reglas`, que ya existen.

4. **Pantalla `/correduria`.** Se amplía con la matriz esperado → liquidado → cobrado por compañía y
   mes, la tabla de cobertura, y la ficha del periodo con el formulario de confirmación manual.
   Móvil ≥ 320 px (cards apiladas), listas con montaje perezoso y paginación, importes con `eur()`
   (`2.162,49€`).

5. **Libro registro / renta.** Por año: Σ `liq_bruto` y Σ `liq_retencion`. Es la cifra que va a la
   asesoría y contra la que se contrasta el borrador. **El total nunca se presenta como cerrado** si hay
   periodos en `sin-datos`, `sin-cobertura` o `no-comprobado`: se dice cuántos faltan y de qué compañía.

### 4.4 Errores

- Si la BD de la correduría no responde → `leido_ok = false` y estado `no-comprobado`. **Nunca**
  `catch → []` seguido de «no hay comisiones».
- Correo duplicado → se descarta el segundo, no se suma.
- Compañía sin ninguna fuente → `sin-cobertura` y la gestión concreta en el aviso, no un hueco mudo.
- Un aviso de Telegram que se ponga verde porque una consulta devolvió vacío es el fallo más caro que
  hay: los avisos llevan siempre el recuento de lo **no comprobado**.

### 4.5 Tests

Helper puro, contra los casos medidos hoy:

- Allianz feb/2026: 95,03 − 14,26 = 80,77 → `cuadra`.
- Occident jul/2026: −346,20 / 51,90 / 0,00 → `deudor`, **no** `liquidado-sin-cobrar` ni `descuadra`.
- Mapfre: 3.614,65 € esperados y `liq_bruto IS NULL` → `esperado-sin-liquidar`, no `cuadra`.
- Allianz con `liq_remesa` y `banco_total IS NULL` → `liquidado-sin-cobrar`.
- Generali sin fuentes → `sin-cobertura`, y **no** `sin-datos`.
- Periodo 31/05 → 01/07 no se colapsa a `'YYYY-MM'`.
- Correo duplicado de Mapfre no suma dos veces.
- Fallo de lectura → `no-comprobado`, y el total anual no se presenta como cerrado.
- Decodificación EBCDIC del PDF de Allianz sobre un fixture real (sin datos de tomadores).

---

## 5. Gestiones administrativas (no son código)

Salen de los propios correos y bloquean cobertura o cobro:

1. **Allianz — dar de alta la cuenta bancaria** en `sucursal.209@allianz.es` para activar la
   regularización automática. Hay **558,88 €** parados esperando eso.
2. **Generali** — solicitar acceso CIMA a TIREA; Generali lo abre cuando TIREA se lo confirme
   (indicación de su director regional, 19/05/2026).
3. **Reale** — terminar la adhesión a EIAC del código de mediador; las claves ya se entregaron el
   13/04/2026 y el primer recibo entró el 01/09/2026.
4. **Mapfre** — pedir que la liquidación entre por CIMA, no solo la cartera de recibos.
5. **Occident** — cerrar el traspaso automático de saldos a cierre de mes que se ofreció en oct/2025 y
   quedó sin contestar; hoy el saldo es deudor.

⚠️ Ninguna de estas se envía sin autorización expresa de Alberto para ese envío concreto (regla global
de comunicaciones salientes). Se preparan como borrador.

---

## 6. Riesgos y preguntas abiertas

- **Dependencia de la infra de Manuel.** La BD que se lee es suya hasta el traspaso. Es una dependencia
  que ya existe para toda la correduría, y `leido_ok` la hace visible en vez de silenciosa.
- **El «esperado» no es una deuda.** Un recibo devengado se puede caer: el de 29,52 € figura
  «Pendiente» en el PDF de julio y `anulado` en CIMA a 01/08/2026. La UI lo dice.
- **La hipótesis «recibo cobrado en el mes X → comisión liquidada en X+1» no está validada.** Allianz es
  el único caso con las tres fuentes; la validación se hace en implementación con sus periodos reales, y
  el desfase se guarda por compañía en vez de asumirse constante.
- **Formato del PDF de Allianz.** Si Allianz cambia la plantilla, el parseo se rompe. Debe degradar a
  `sin-datos` con aviso, nunca a un importe a medias.
- **Los ~991 € de descuadre de 2025** quedan sin explicar por decisión de alcance. Se anotan para
  cuando haya un año completo con el libro nuevo.
