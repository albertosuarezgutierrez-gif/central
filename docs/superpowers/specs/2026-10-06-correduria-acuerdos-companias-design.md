# Acuerdos con compañías y productividad por compañía — spec de diseño (06/10/2026)

> Modo arquitectura: solo diseño. Nada implementado, nada migrado. Medido contra la BD real
> (`wswbehlcuxqxyinousql`) y el código de `main` en `616f54543`.
> Contexto leído: `docs/CORREDURIA-CRM-VISION.md`, `CLAUDE.md` raíz, `apps/asegura/CLAUDE.md` (puerto),
> `apps/plataforma/CLAUDE.md` (libro de comisiones, secciones).
> PRs abiertos: ninguno toca compañías, comisiones ni productividad (el #4183, de duplicados vivos, no se
> cruza con esto).
> ⚠️ El grafo propio (`grafo_*`) **no existe en este proyecto Supabase**: solo están
> `grafo_embed_textos`/`grafo_guardar_clave`. La localización se ha hecho con grep acotado.

---

## 0. Lo que hay que saber antes de leer el resto (hallazgos que cambian el diseño)

1. **La «pestaña Compañías» no existe todavía.** Hoy hay dos cosas:
   - el bloque `Companias.tsx`, montado dentro de la sección **Datos** de `CorreduriaClient.tsx` (línea ~583);
   - la página `/correduria/companias` (`companias/page.tsx`), que es solo un directorio de contactos.

   `SECCIONES` (`secciones.ts`) son `hoy · actividad · clientes · cartera · comisiones · datos · ingesta ·
   redes`. Hay que crear la pestaña, no rellenarla.
2. **Ya existe `seguros.comision_pactada`, con 7 filas, y no tiene NINGÚN consumidor en el repo.** Ni SQL,
   ni modelo Prisma, ni código. Son las de Allianz, acuerdo directo, RC PYME por modalidad, al 17,5-22,5 %,
   vigentes desde el 28/10/2026, con fuente «captura del 28/09/2026». La creó alguien fuera del repo.
   `crm_seguros` (el CRM de Manuel) tiene DML sobre ella. **No se altera ni se borra** hasta saber quién
   la escribe: sus filas se copian al modelo nuevo como acuerdo `directo`.
3. **Cada póliza de CIMA trae la CLAVE con la que se produjo:** `polizas.datos_especificos->'mediador'->>'codigoInterno'`,
   y casi todos los recibos también la llevan en `datos_extra->'mediador'`. Medido sobre la cartera en vigor:

   | Compañía | Códigos que manda CIMA |
   |---|---|
   | Mapfre | `5239640` |
   | Allianz | `209-A/0018638/0000`, `209-C/…`, `209-E/…` (3 pólizas sin código) |
   | Occident | `M00171` y `8-92361` |
   | Generali | `65792` (en la póliza; sus 23 recibos de 2026 no traen el código) |
   | Reale | `38605` |

   **Esta es la pieza que hace posible medir la productividad POR ACUERDO.** Un acuerdo de APROMES
   paga por lo que se produce con la clave de APROMES, no por lo que ya tenía con su clave directa.
   Por eso el modelo gira alrededor de la clave, no solo de la compañía.
4. **CIMA ya trae la comisión APLICADA en cada recibo** (`poliza_recibos.comision_bruta` y `prima_neta`,
   en TEXT). Las tasas reales son limpias y estables. Medido sobre los recibos cobrados desde el 01/10/2025:

   | Compañía | Tasas reales |
   |---|---|
   | Mapfre | auto 10,0 % · hogar entre 15 y 20 % · RC 18,5 % |
   | Generali | auto 12 % · hogar 25 % · decesos 5 % |
   | Allianz | auto NP 12-14 % · auto cartera 10-13 % |
   | Occident | hogar 22-25 % · RC 11-15 % |
   | Reale | auto NP 12,5 % |

   Esto permite conciliar **recibo a recibo** lo pactado contra lo aplicado. Es más útil que el cuadre
   agregado, porque dice qué ramo está mal pagado.
5. **Allianz: 14 de sus 16 pólizas en vigor tienen `prima_anual`/`prima_bruta` a 0 o NULL**, pero sus
   recibos sí traen `prima_neta`. **La producción se mide sobre RECIBOS, no sobre la prima de la póliza.**
6. **`companias_dgs` es un catálogo GLOBAL (sin `correduria_id`) y aun así guarda `clave_mediador`,** que
   es un dato del tenant. Además, la clave de **Pelayo es `28823484E`, que tiene forma de NIF**, cuando el
   encargo dice que con Pelayo no hay clave. No se migra como clave: se marca para que Alberto lo revise.
7. **El libro de comisiones vive en `public` de plataforma** (`comisiones_devengo` y `comisiones_cobertura`,
   con `cuenta_id`). Lo alimenta el cron `cima-liq` desde el puerto `/api/operador/comisiones`. Tiene
   tres ejes: devengado según CIMA, liquidado y banco. **Lo nuevo añade un eje ANTES: lo pactado.** No
   sustituye a ninguno.
8. Cifras de la cartera en vigor medidas hoy (`sqlCarteraEnVigor`): **107 pólizas en 5 compañías**.

   | Compañía | Pólizas | Clientes | Prima | NP 2026 |
   |---|---|---|---|---|
   | Occident | 47 | 34 | 18.308,03€ | 4 |
   | Mapfre | 29 | 27 | 17.429,47€ | 2 |
   | Allianz | 16 | 13 | 742,68€ (14 sin prima) | 6 |
   | Generali | 13 | 13 | 10.920,54€ | 0 |
   | Reale | 2 | 2 | 494,20€ | 1 |

   El volumen es pequeño: la pantalla tiene que ser útil con 13 nuevas producciones al año, no con miles.

---

## 1. Lo que ya existe y se reutiliza

| Pieza | Dónde | Uso en este diseño |
|---|---|---|
| Catálogo de compañías | `seguros.companias_dgs` (15 filas; PK `codigo_dgs`) · modelo `CompaniaDgs` en `apps/asegura/prisma/asegura.prisma:635` | FK de todo lo nuevo. Se queda como catálogo global |
| Contactos por compañía | `seguros.compania_contactos` (35) · `GET /api/operador/companias` · `lib/companias-asegura.ts` · `useCompanias.ts` · `ContactoAcciones.tsx` · `TarjetaContacto` de `companias/page.tsx` | Contactos de la ficha. Se añade solo la columna `fuente` (ver §2) |
| Comisión pactada suelta | `seguros.comision_pactada` (7, sin consumidor) | Se copia al modelo nuevo; no se toca la tabla |
| Recibos con comisión aplicada | `seguros.poliza_recibos` (464): `clase_recibo` NP/CA/SU, `situacion`, `prima_neta`, `comision_bruta`, `fecha_efecto_actual`, `datos_extra.mediador` | Base de la producción y de la conciliación |
| Clave por póliza | `polizas.datos_especificos.mediador.codigoInterno` | Atribuye la producción a una clave y, por tanto, a un acuerdo |
| Lectura de importes EIAC | `importeEiac` / `sumarImportesEiac` de `@central/module-seguros` | Para leer importes. Un importe ilegible se cuenta aparte, nunca como 0 |
| Cartera viva y en vigor | `sqlCarteraViva` / `sqlCarteraEnVigor` en `packages/module-seguros/src/cartera-viva.ts` | Ver §3.1 para cuál se usa en cada cifra |
| Ramos | enum `seguros.tipo_seguro` + `RAMOS`/`etiquetaRamo` de `filtro-cartera.ts` | Ramo canónico de cada línea del acuerdo |
| Libro de comisiones | `public.comisiones_devengo` y `public.comisiones_cobertura` · `CuadreComisiones.tsx` · `lib/correduria/cuadre.ts` · `/api/correduria/comisiones` | La ficha de compañía enlaza a su fila del libro. No se duplica el cuadre devengado → liquidado → banco |
| Correduría única | `correduriaUnica()` en `apps/asegura/lib/cartera.ts:434` | `correduriaId` de cada lectura y escritura del puerto |
| Clasificador de errores del puerto | `apps/asegura/lib/error-cartera.ts` | Todo `error` lleva su causa |
| Rastro de cambios no ligados a un cliente | `seguros.operational_events` (`event_name`, `payload`, `correduria_id`) | Rastro de la edición de acuerdos. `historial_interno` exige `cliente_id NOT NULL` y aquí no sirve |
| Armazón de la pantalla | `secciones.ts` / `Secciones.tsx` / `Bloque.tsx` / `onContador` / `eur()` | La pestaña nueva |
| Autorización del corredor | `exigirCorreduria()` de plataforma · `operadorAutorizado()` de asegura | Sin cambios |

---

## 2. Modelo de datos

### 2.1 Principios

- Todo en el schema **`seguros`**. Escribe **solo `apps/asegura`** (`prisma_seguros`). Plataforma lee y
  escribe por el puerto, como el resto de la correduría.
- **Todas las tablas nuevas llevan `correduria_id NOT NULL`**, aunque hoy haya una sola correduría. Con
  BYPASSRLS el aislamiento lo da el código: cada consulta filtra por `correduriaUnica().id`.
- **Grants:** DML para `prisma_seguros`; `SELECT` para `backup_seguros`.
  - **Nada para `crm_seguros`**: el CRM de Manuel no tiene por qué ver los acuerdos comerciales de
    Alberto. Dárselo sería ampliar la superficie sin consumidor.
  - **Nada para `prisma_asegura_portal`.**
  - RLS activado y sin políticas, como `comision_pactada`: corta PostgREST y no afecta a `prisma_seguros`.
- **Un porcentaje NULL significa «el acuerdo no lo dice o no se extrajo».** Nunca 0 %. Un 0 explícito es
  un dato: «este ramo no comisiona».

### 2.2 Tablas

```
seguros.claves_mediador                       ← la clave es del TENANT, no de la compañía
  id uuid PK
  correduria_id uuid NOT NULL
  compania_codigo_dgs varchar(16) NOT NULL → companias_dgs
  estado text NOT NULL  CHECK in ('activa','solicitada','sin_clave','baja')
  canal  text NOT NULL  CHECK in ('directo','asociacion','colaboracion')
  asociacion text NULL                        -- 'APROMES' cuando canal = asociacion
  codigos_cima text[] NOT NULL DEFAULT '{}'   -- tal como los manda CIMA: '209-C/0018638/0000', 'M00171'…
  etiqueta text NULL                          -- '18638', 'M00171' (lo que Alberto reconoce)
  fecha_alta date NULL, fecha_baja date NULL  -- NULL = no consta (≠ «hoy»)
  notas text NULL
  created_at, updated_at
  UNIQUE (correduria_id, compania_codigo_dgs, etiqueta)
  -- Un mismo código CIMA no puede estar en dos claves del mismo tenant. Se
  -- garantiza en código, porque un EXCLUDE sobre text[] cuesta más que lo que aporta.

seguros.acuerdos_compania                     ← cabecera: una por compañía × fuente × vigencia
  id uuid PK
  correduria_id uuid NOT NULL
  compania_codigo_dgs varchar(16) NOT NULL
  fuente text NOT NULL CHECK in ('apromes','directo','otra_asociacion')
  fuente_nombre text NULL                     -- nombre de la otra asociación
  clave_id uuid NULL → claves_mediador        -- por qué clave paga. NULL = clave aún no abierta / sin decidir
  vigencia_desde date NOT NULL
  vigencia_hasta date NULL                    -- NULL = el documento no da fin (se pinta «sin fecha de fin»)
  requisitos_apertura text NULL
  letra_pequena text NULL
  documento_fuente text NOT NULL              -- 'Condiciones_2026_Aseguradoras_mayo.pdf, p. 14'
  revisado_at timestamptz NULL                -- NULL = extracto sin cotejar con el PDF (§5)
  created_at, updated_at
  UNIQUE (correduria_id, compania_codigo_dgs, fuente, vigencia_desde)

seguros.acuerdo_comisiones                    ← líneas: ramo × % NP × % cartera
  id uuid PK
  acuerdo_id uuid NOT NULL → acuerdos_compania ON DELETE CASCADE
  ramo seguros.tipo_seguro NULL               -- NULL = no se ha podido mapear: se pinta, no se usa para calcular
  ramo_texto text NOT NULL                    -- literal del acuerdo: 'Hogar Plus', 'Auto 1ª cat.'
  producto text NULL, modalidad text NULL     -- afinan cuando hay varias líneas del mismo ramo (RC PYME)
  pct_np numeric(5,2) NULL
  pct_cartera numeric(5,2) NULL
  notas text NULL

seguros.acuerdo_objetivos                     ← rappel, mantener la clave y requisito de apertura, una sola forma
  id uuid PK
  acuerdo_id uuid NOT NULL → acuerdos_compania ON DELETE CASCADE
  tipo text NOT NULL CHECK in ('rappel','mantener_clave','apertura')
  ambito text NOT NULL CHECK in ('individual','colectivo')  -- colectivo = cuenta toda APROMES
  base text NOT NULL CHECK in ('primas_np','primas_cartera','primas_total',
                               'polizas_np','crecimiento_pct','otra')
  criterio_cobro text NULL CHECK in ('cobradas','emitidas')  -- NULL = el doc no lo dice
  ramos seguros.tipo_seguro[] NULL            -- NULL = todos
  periodo_desde date NOT NULL, periodo_hasta date NOT NULL
  tramos jsonb NOT NULL                       -- [{desde, hasta|null, pct|null, importe|null}]
  siniestralidad_max_pct numeric(5,2) NULL
  condiciones text NULL                       -- lo que no cabe en lo estructurado
```

Además:

- **`seguros.compania_contactos`**: añadir `fuente text NULL` (`'apromes'`, `'correo'`…). Es una columna
  nullable: no rompe a ningún lector y conserva los 35 contactos que ya hay.
- **Colaboradas** (fase 6, tabla aparte): `seguros.produccion_colaborada`.
  - Columnas: `correduria_id`, `compania_codigo_dgs`, `correduria_colaboradora`, `cliente_id NULL`,
    `numero_poliza`, `ramo`, `fecha_efecto`, `prima_neta`, `pct_cesion`, `cuenta_para_objetivos boolean NULL`,
    `clave_id NULL`, `notas`.
  - **No se meten en `polizas`, y es a propósito.** Una fila manual en `polizas` nace con
    `import_ref IS NULL`, y `esCarteraViva()` la contaría como cliente de CIMA. Es la trampa más cara del
    diseño.
  - `cuenta_para_objetivos NULL` significa que no cuenta y que se dice así.

### 2.3 Por qué tramos en jsonb y no en tabla hija

Son 1-5 tramos por objetivo, nunca se consultan por separado y siempre se leen con su objetivo.
Lo que asegura la forma es un validador puro, `leerTramos()` en `@central/module-seguros`, con test:

- un tramo mal formado hace el objetivo **no calculable**; no se ignora;
- un `pct` NULL es «no consta»;
- los tramos tienen que estar ordenados y no solaparse.

### 2.4 Dónde vive cada cosa

| Capa | Pieza |
|---|---|
| BD | Migración `apps/asegura/prisma/sql/2026-10-XX_acuerdos_companias.sql` (tablas, checks, índices `(correduria_id, compania_codigo_dgs)`, grants, RLS) + modelos en `apps/asegura/prisma/asegura.prisma` |
| Reglas puras | `packages/module-seguros/src/acuerdos.ts` (+ `.test.ts`): tipos, `leerTramos`, `atribuirClave`, `lineaAplicable`, `esperadoRecibo`, `medirObjetivo`, `semaforoObjetivo`, `proyectar` |
| Lectura y cálculo | `apps/asegura/lib/acuerdos.ts`: lee los acuerdos y los recibos y llama al módulo. **El cálculo se hace en asegura**, que es quien tiene los recibos; los recibos no cruzan el puerto en bruto |
| Puerto | `GET /api/operador/companias/acuerdos` (acuerdos, líneas, objetivos y claves) · `GET /api/operador/companias/productividad?compania=&desde=&hasta=` (cifras y semáforos ya calculados, más la lista de discrepancias paginada) · `POST/PATCH/DELETE /api/operador/companias/acuerdo` (fase 5) |
| Plataforma | `lib/acuerdos-asegura.ts` (interpretar + red, mismo patrón que `companias-asegura.ts`) · proxy `app/api/correduria/companias/acuerdos/route.ts` y `…/productividad/route.ts` · sección nueva · ficha `app/(usuario)/correduria/companias/[codigo]/page.tsx` |

**El puerto conserva los tres estados en cada respuesta:** `sin_configurar` / `error` con su `causa` / `ok`.
Dentro de `ok`, cada cifra trae su propio estado (§3.4).

---

## 3. Cálculo de la productividad

### 3.1 Universo de recibos y por qué no es `esCarteraEnVigor`

- **La producción de un periodo** se mide sobre **recibos** cuya póliza es **cartera viva por origen**
  (`sqlCarteraViva`), no sobre la cartera en vigor.
  - El motivo es que la producción pregunta **qué se produjo**. Una póliza nueva de marzo que se canceló
    en septiembre produjo en marzo, y la compañía la cuenta (con su extorno). Filtrar por «en vigor hoy»
    reescribiría el pasado.
  - Es el mismo criterio que ya usan gemelas y siniestros: lo que pregunta por el origen va por
    `esCarteraViva()`.
- **La cartera de hoy** (pólizas en vigor por compañía y su prima anual, y la base de la proyección de
  renovaciones) sí usa `sqlCarteraEnVigor`, que es quien decide quién es cliente hoy.
- Se excluyen los recibos de pólizas del volcado: ya los saca `sqlCarteraViva`.

### 3.2 Atribución recibo → clave → acuerdo (`atribuirClave`, `lineaAplicable`)

1. Se toma el código del recibo, `datos_extra.mediador.codigoInterno`. Si no lo trae, el de la póliza,
   `datos_especificos.mediador.codigoInterno`. Si tampoco, el recibo queda **`sin_clave`**.
2. El código se busca en `claves_mediador.codigos_cima` del tenant. Si no aparece, queda en
   **`codigo_sin_asignar`** (calidad del dato, ver §4.4).
3. Se buscan los acuerdos de esa clave vigentes en `fecha_efecto_actual` del recibo:
   `vigencia_desde ≤ efecto` y (`vigencia_hasta` NULL o `≥ efecto`).
4. La línea aplicable cumple `ramo = polizas.tipo`, y además producto o modalidad si las líneas lo
   distinguen.
   - Ninguna línea: **`sin_acuerdo`**.
   - Más de una y no se pueden desempatar: **`ambiguo`**. Nunca se escoge la primera. Es el caso de las
     7 de RC PYME de Allianz, que dependen de la modalidad.
5. El porcentaje sale de la clase del recibo:
   - `clase_recibo = 'NP'` → `pct_np`;
   - `'CA'` → `pct_cartera`;
   - `'SU'` (suplementos) → fuera de la conciliación en v1, contados aparte como «suplementos, sin
     regla».
   - Si el porcentaje es NULL → **`pct_no_consta`**.

### 3.3 Fórmulas

Todas las sumas son `Σ importeEiac(...)`. Un importe ilegible se cuenta en `ilegibles`, nunca suma 0.

| Cifra | Fórmula | Periodo por |
|---|---|---|
| Producción NP | Σ `prima_neta` de recibos `NP`, situación `cobrado` | `fecha_efecto_actual` dentro del periodo del objetivo |
| Producción NP pendiente | Igual con situación `pendiente` (se pinta aparte, «en cobro») | idem |
| Producción cartera | Σ `prima_neta` de recibos `CA` cobrados | idem |
| Pólizas NP | nº de pólizas distintas con recibo `NP` cobrado | idem |
| Extornos | Σ `prima_neta` de recibos anulados tras cobro, si CIMA los distingue. Si no, se declara «extornos no medidos» | idem |
| Comisión pactada (esperada) | Σ `prima_neta × pct / 100` de los recibos cobrados con línea aplicable | idem |
| Comisión aplicada (CIMA) | Σ `comision_bruta` de esos MISMOS recibos | idem |
| Δ pactado − aplicado | Por recibo: `cuadra` si \|Δ\| ≤ 0,02€; si no, `paga_menos` o `paga_mas` | — |
| Rappel estimado | Tramo alcanzado por la base medida × (`pct` × base, o `importe`) | `periodo_desde..periodo_hasta` del objetivo |
| Falta para el tramo siguiente | `tramo_siguiente.desde − base_medida`, y el rappel extra que daría | idem |
| Proyección a fin de periodo | NP: lineal, `base × días_periodo / días_transcurridos`, rotulada «a este ritmo». Cartera: cobrado + recibos `CA` pendientes + prima anual de las pólizas en vigor cuyo vencimiento cae en lo que queda de periodo | idem |
| Lo que debería entrar | Comisión pactada (o la aplicada si no hay acuerdo, rotulada así) + rappel estimado si se alcanza tramo, rotulado «se liquida al cierre» | — |

Sobre las fechas y los criterios:

- **La fecha de corte de la producción es el EFECTO**, no la de cobro que usa el libro (`fecha_situacion`
  en `comisiones_cartera`). Son preguntas distintas: el libro pregunta cuándo nace la obligación de
  liquidar; el rappel, qué se produjo en el periodo.
- Si `criterio_cobro = 'emitidas'`, la base suma también las pendientes.
- Si `criterio_cobro` es NULL, se mide `cobradas` (lo conservador) y la pantalla lo dice: «el acuerdo no
  aclara si cuenta emitidas o cobradas; contamos solo cobradas».

### 3.4 Qué se pinta cuando falta el dato

Cada cifra viaja como `{ estado: 'ok', valor, parcial: {excluidos, porMotivo} } | { estado: 'pendiente', motivo }`.
**Nunca `0` por ausencia.**

| Situación | Se pinta |
|---|---|
| Acuerdo con `clave_id` NULL (AXA, Pelayo o clave por decidir) | «Sin clave asignada: no hay producción que medir». Semáforo ⚪ |
| `base = 'otra'`, tramos ilegibles o `siniestralidad_max_pct` informada | ⚪ «No calculable automáticamente», con el texto de `condiciones`. **CIMA no manda el importe de los siniestros**: la siniestralidad nunca se puede afirmar |
| `ambito = 'colectivo'` | «Tu aportación: X €». Semáforo ⚪ «depende de la producción de toda APROMES». Nunca 🟢 |
| Recibos `sin_clave`, `codigo_sin_asignar`, `ambiguo` o `pct_no_consta` | La cifra sale con «parcial: N de M recibos» y el desglose por motivo. El semáforo no puede ser 🟢 si los excluidos podrían cambiar el tramo |
| `crecimiento_pct` sin recibos del periodo anterior | ⚪ «CIMA trae recibos de esta compañía desde dd/mm/aaaa». Sale de `comisiones_cobertura.desde_recibos` o del primer recibo |
| `revisado_at` NULL | Todo el acuerdo lleva la etiqueta «según extracto sin cotejar con el PDF». El semáforo se calcula, pero el 🟢 se pinta como 🟡 hasta que se coteja |
| Puerto caído o error | «No se ha podido comprobar. No significa que no haya acuerdo», con su causa |
| Compañía sin ningún acuerdo cargado | «Sin acuerdo cargado». La comisión aplicada de CIMA se enseña tal cual, sin Δ |

### 3.5 Semáforos (`semaforoObjetivo`, puro)

| Color | Cuándo |
|---|---|
| 🟢 Alcanzado | Base medida ≥ umbral del tramo objetivo, cálculo completo y acuerdo revisado |
| 🟡 En camino | La proyección llega al umbral, o está alcanzado pero sin revisar o con datos parciales que no lo tumban |
| 🟠 Por debajo del ritmo | La proyección no llega y quedan más de 90 días |
| 🔴 No llega | La proyección no llega y quedan 90 días o menos. En `mantener_clave` se rotula **«riesgo de perder la clave»** |
| ⚪ Pendiente | Cualquier fila de §3.4 que impida calcular |

El objetivo de rappel es el **primer tramo con pago**; los siguientes se enseñan como «siguiente
escalón». El umbral de 90 días es configurable en el módulo y queda testeado.

---

## 4. UI

### 4.1 Sección nueva «Compañías» en `/correduria`

- Va entre **Comisiones** y **Datos**. El bloque `Companias.tsx` (directorio) **se muda aquí desde
  Datos**: es referencia de compañía, no calidad del dato.
- **Contador:** nº de objetivos 🔴, porque una clave en riesgo es trabajo. Si la productividad no se
  puede leer, el contador es `null` y se pinta `!`, con el mismo patrón `onContador` y `useRef`. Lo ⚪ no
  cuenta: es «no se sabe», no trabajo.
- Arriba, un selector de periodo: por defecto, el año vigente del acuerdo.
- **Grupo 1, «Con clave»**, una tarjeta por compañía, con los 🔴 primero y luego por producción:
  - nombre y chips de las claves (`Directo 18638` · `APROMES`), con su estado;
  - tres cifras: **producción NP** · **cartera** · **comisión pactada frente a aplicada**. El Δ va en
    color solo si hay discrepancia; todas las cifras con `eur()`;
  - dos semáforos: rappel y clave. Cada uno es un chip con su texto corto («faltan 1.240,00€ para el
    tramo 2», «sin clave asignada»).
- **Grupo 2, «Con acuerdo, sin clave»** (AXA, Pelayo): comisiones ofertadas por ramo (las 3 primeras +
  «ver todas»), requisito de apertura en una línea y el contacto. Es una oportunidad y no lleva
  semáforo de producción.
- **Bloque «Códigos de mediador que CIMA manda y no están asignados a ninguna clave»:** solo aparece si
  hay alguno. Es calidad del dato y se arregla en un clic en la ficha (fase 5).
- Rendimiento: con 15 compañías no hace falta paginar. La lista de recibos discrepantes de la ficha sí
  va a 50 filas + «Ver más», con montaje perezoso.

### 4.2 Ficha `/correduria/companias/[codigo]`

La ruta índice `/correduria/companias` existente sigue como directorio de contactos y enlaza a cada
ficha. Bloques en este orden, cada uno en `<Bloque>`:

1. **Cabecera.** Nombre, claves (etiqueta, códigos CIMA, canal, estado, fecha de alta), enlace al
   libro de comisiones filtrado por la compañía y aviso «extracto sin cotejar» si aplica.
2. **Objetivos.** Por objetivo:
   - barra de progreso: medido, proyectado y marcas de tramo;
   - texto «X de Y € · faltan Z € para el tramo n (+W € de rappel)»;
   - periodo, base, criterio, ámbito y condiciones.
3. **Comisiones por ramo.** Ramo, % NP y % cartera pactados, y la tasa real media de CIMA en el periodo
   al lado, con nº de recibos. Columnas por acuerdo si hay varias fuentes (APROMES frente a directo):
   así se ve qué conviene.
4. **Conciliación.** Totales pactado / aplicado / Δ, desglose por motivo (`sin_acuerdo`, `ambiguo`…) y
   la lista de recibos con Δ ≠ 0, cada uno enlazado a su póliza.
5. **Requisitos y letra pequeña.** Texto tal cual, con `documento_fuente`.
6. **Contactos.** Reutiliza `TarjetaContacto`; los de APROMES se marcan.

### 4.3 Móvil (≥320 px)

- Tarjetas apiladas, sin tablas en la lista.
- En la ficha, la tabla de comisiones por ramo pasa a una tarjeta por ramo (`NP 14 % · Cartera 12 % ·
  real 13,0 %`).
- Las barras de progreso a ancho completo y los chips de semáforo con texto: el color nunca va solo.
- Botones de 44 px como mínimo.
- Contenedores grid con `gridTemplateColumns: 'minmax(0, 1fr)'`.
- **Se mide sobre el scroller `LayoutShell`, no sobre `body`**, a 320, 360 y 1024 px con Playwright.

### 4.4 Lo que la pantalla NO hace

- No dice «esta compañía paga mal» con datos parciales.
- No proyecta la nueva producción con estacionalidad: es lineal y se rotula así.
- No calcula la siniestralidad.
- No reclama a nadie: nada sale a la compañía ni a APROMES.

---

## 5. Carga de los acuerdos — recomendación: seed revisable + formulario

**Propuesta:** las dos cosas, en este orden.

1. **Seed** desde el Google Doc a un JSON versionado en el repo:
   `apps/asegura/prisma/seed/acuerdos-2026-apromes.json` + `acuerdos-2026-directo.json`, que incluye
   las 7 filas de `comision_pactada`.
   - Se carga con un script idempotente: `apps/asegura/scripts/cargar-acuerdos.ts`, por el puerto o
     con `prisma_seguros`.
   - La clave del upsert es `(correduria, compañía, fuente, vigencia_desde)`.
   - **Si el acuerdo ya tiene `revisado_at`, el seed no lo pisa.** Lo cotejado a mano manda.
   - Todo lo que entra por seed nace con `revisado_at = NULL`.
2. **Formulario en la ficha** (fase 5) para:
   - **cotejar**: un botón por acuerdo, «Coincide con el PDF», que sella `revisado_at`;
   - corregir líneas;
   - dar de alta acuerdos directos y renovaciones anuales;
   - gestionar claves: alta, estado, códigos CIMA.

   Cada cambio deja una fila en `operational_events` (`acuerdo.creado`, `acuerdo.editado`,
   `acuerdo.revisado`, `clave.editada`, con el diff en `payload`).

**Por qué así:**

- **Solo formulario:** son decenas de líneas (compañía × ramo × 2 %, más tramos) teclearlas a mano.
  Es lento y propenso a erratas.
- **Solo seed:**
  - los acuerdos son anuales;
  - llegan acuerdos directos por correo, como la carta de Allianz;
  - un extracto hecho por un agente desde un PDF puede leerse mal. Es la lección ORCL de la raíz: «una
    cifra mal leída es peor que una ausente».

  Por eso el seed nace **sin cotejar**, la pantalla lo dice y el 🟢 queda capado (§3.4).
- El JSON en el repo deja rastro de qué se cargó y desde qué fuente, y se revisa en el PR.

---

## 6. Plan por fases (PRs pequeños)

> Toda migración se aplica primero en preview y luego en prod, con OK de Alberto.
> Typecheck de asegura con sus DOS schemas: `prisma generate && prisma generate --schema prisma/asegura.prisma`.

### F1 — Modelo + reglas puras + seed (solo asegura y el módulo; sin UI)

- **Archivos:**
  - `apps/asegura/prisma/sql/2026-10-XX_acuerdos_companias.sql`: las 4 tablas de §2.2 y
    `compania_contactos.fuente`;
  - `apps/asegura/prisma/asegura.prisma` (modelos);
  - `packages/module-seguros/src/acuerdos.ts` + `acuerdos.test.ts` + export en `index.ts`;
  - `apps/asegura/lib/acuerdos.ts` (solo lectura);
  - `apps/asegura/app/api/operador/companias/acuerdos/route.ts`;
  - `apps/asegura/prisma/seed/*.json` + `apps/asegura/scripts/cargar-acuerdos.ts`;
  - las claves iniciales en el seed, desde los códigos medidos en §0.3, sin la de Pelayo.
- **Tests del módulo:**
  - `leerTramos` (orden, solape, `pct` NULL ≠ 0);
  - `atribuirClave` (recibo → póliza → sin clave);
  - `lineaAplicable`: `sin_acuerdo`, `ambiguo` con las 7 RC PYME de Allianz, vigencia en los bordes,
    `pct_no_consta`.
- **Cepo de la ruta:** lee el fuente y comprueba que filtra por `correduriaId` y que el `error` lleva causa.
- **Riesgos:**
  - **R1.** Que el seed meta un % mal extraído. Lo mitiga `revisado_at` NULL y el cap del 🟢.
  - **R2.** Que alguien «limpie» `comision_pactada` y rompa el CRM de Manuel. Lo mitiga no tocarla y
    dejarlo escrito en el SQL.
  - **R3.** Que dos claves reclamen el mismo código CIMA. Lo mitiga el validador en código con test.
- **Qué se rompe si me equivoco:** nada visible; no hay UI.
- **Verificación:** `SELECT` de recuentos tras aplicar y el puerto en `curl` con Bearer.

### F2 — Pestaña «Compañías» y ficha, con los acuerdos pintados (objetivo 1 de Alberto)

- **Archivos:**
  - `apps/plataforma/lib/acuerdos-asegura.ts` + `.test.ts` (interpretar: tres estados, `null` ≠ `[]`);
  - `app/api/correduria/companias/acuerdos/route.ts`;
  - `secciones.ts` (`'companias'`) + `secciones.test.ts`;
  - `Secciones.tsx`;
  - `CorreduriaClient.tsx`: panel nuevo y mudanza de `<Companias />` desde Datos;
  - `CompaniasAcuerdos.tsx` (lista);
  - `companias/[codigo]/page.tsx` (ficha: cabecera, comisiones por ramo, requisitos, contactos);
  - enlace desde `companias/page.tsx`.
- **Cepos (rompiéndolos antes, regla raíz):**
  - un `pct` NULL no se pinta `0 %` (lee el fuente);
  - `sin_configurar`/`error` no se pinta «sin acuerdos»;
  - el grupo «sin clave» existe.
- **Responsive** medido con Playwright sobre `LayoutShell`.
- **Riesgo:** desplazar el bloque de Datos rompe algún test de `secciones.test.ts`. Se corre `pnpm test`.
- **Preview:** `[preview]` en el último commit, que solo toque plataforma, nunca en un merge.

### F3 — Productividad y semáforos

- **Archivos:**
  - `module-seguros/acuerdos.ts`: `medirObjetivo`, `proyectar`, `semaforoObjetivo` + tests (todos los
    estados de §3.4 y los bordes de los 90 días);
  - `apps/asegura/lib/acuerdos.ts`: consulta de recibos con `sqlCarteraViva`, `importeEiac` y techo de
    filas con `truncado` como en `comisiones.ts`;
  - `GET /api/operador/companias/productividad`;
  - el proxy de plataforma;
  - el bloque «Objetivos» de la ficha;
  - los semáforos y el contador `onContador` en la lista.
- **Cepos:**
  - el SQL usa `sqlCarteraViva` y no lo reimplementa (lee el fuente con `readFileSync`, porque `tsc` no
    mira dentro de `Prisma.sql`);
  - un importe ilegible no suma 0;
  - ⚪ nunca se pinta 🟢.
- **Verificación contra la BD real:** la producción NP 2026 por compañía tiene que cuadrar con un
  `SELECT` a mano. Hoy, para el contraste: 13 pólizas NP con recibo en 2026.
- **Riesgos:**
  - la proyección lineal engaña en los primeros meses. Se rotula «a este ritmo», con menos de 30 días
    transcurridos no se proyecta, y el periodo arranca en ⚪;
  - si las claves de APROMES no están decididas (D1), todo sale ⚪, que es lo correcto.

### F4 — Conciliación recibo a recibo (pactado frente a CIMA)

- **Archivos:**
  - `esperadoRecibo` + test, con un caso real fijado. Es la lección ORCL: valida contra datos reales,
    no solo fixtures. Por ejemplo, Mapfre auto CA a 10,00 %, 26 recibos;
  - el bloque «Conciliación» de la ficha, con paginación de 50;
  - el Δ en la lista.
- **Riesgo:** que se compare la cartera directa contra tasas de APROMES. Lo impide la atribución por
  clave: un recibo de la clave directa solo se compara con acuerdos de esa clave.
- **Qué se rompe si me equivoco:** Alberto reclamaría a una compañía por una diferencia falsa. Por eso
  `ambiguo` y `sin_acuerdo` no entran en el Δ.

### F5 — Edición desde la ficha

- **Archivos:**
  - `POST/PATCH/DELETE /api/operador/companias/acuerdo` y `…/clave`, con validación pura y
    `operational_events`;
  - formularios en la ficha (cotejar, línea, objetivo, clave, asignar código CIMA);
  - `PATCH` en el proxy de plataforma.
- **Cepo:** toda ruta de escritura lleva `correduriaId` y emite el evento (lee el fuente).
- **Riesgo:** que una edición pise un seed posterior. Lo cubre `revisado_at`.

### F6 — Colaboradas

- **Archivos:** tabla `produccion_colaborada`, alta manual en la ficha, cuenta en los objetivos solo si
  `cuenta_para_objetivos = true`, y bloque propio.
- **Cepo:** ninguna escritura de colaboradas toca `seguros.polizas`. Se busca en el fuente.
- **Depende de D3.**

### Fuera de alcance, anotado

- El cron `cima-liq` elige la cuenta con `SELECT id FROM cuentas LIMIT 1`, que es arbitrario si hay más
  de una cuenta.
- `companias_dgs.clave_mediador` es dato del tenant en un catálogo global. Tras F5 se puede retirar a
  favor de `claves_mediador`.

Ni lo uno ni lo otro se toca en estos PRs.

---

## 7. Decisiones de Alberto (3)

1. **¿Con qué clave produces lo de APROMES, compañía por compañía?** Hay tres posibilidades:
   - (a) una clave nueva bajo APROMES;
   - (b) tu clave actual pasa a APROMES: CIMA lo marcaría `cambio_clave` y, desde esa fecha, toda tu
     cartera de esa compañía cuenta para APROMES;
   - (c) sigues en directo y APROMES no aplica.

   **Hasta que lo digas, los acuerdos se pintan pero su productividad sale «pendiente»**: comparar tu
   cartera directa con tasas de APROMES daría diferencias falsas.
2. **¿Aceptas que lo extraído del PDF entre «sin cotejar»?** Se calcula igual, pero ningún semáforo se
   pone verde hasta que pulses «coincide con el PDF» en cada acuerdo. ¿O te fías del extracto y se da
   por bueno al cargarlo?
3. **Pólizas colaboradas con otras corredurías:**
   - ¿se registran ya, a mano?
   - ¿cuentan para tus objetivos?

   Depende de con qué clave se emiten. Por defecto propongo que **no cuenten** salvo que lo marques póliza
   a póliza.

Aparte, un dato a revisar (no es una decisión de diseño): la «clave» de Pelayo en `companias_dgs` es
`28823484E`, que parece un NIF.
