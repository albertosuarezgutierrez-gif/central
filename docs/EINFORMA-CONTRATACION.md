# eInforma / Informa D&B — oferta comercial y decisión de contratación

> **Origen:** correo «Informa» de **Borja Piña** (Delegado Comercial Andalucía, Informa D&B, Sevilla),
> reenviado por **Pablo** (`pablo.j.p.c@hotmail.com`) a Alberto el **30/07/2026**.
> Es la primera oferta con precios reales del proveedor que la fase 2 del proyecto **Empresas en dificultad**
> lleva pendiente desde el 17/07/2026 (ver `docs/superpowers/specs/2026-07-17-empresas-problemas-financieros-design.md`).
> Este documento es el **estado de la contratación**; el diseño del sistema NO cambia.

## 1. Qué ofrece, en dos contratos independientes

| | Servicio | Cómo se consume | Precio |
|---|---|---|---|
| **1** | **Informes financieros de empresa** (uno a uno) | (a) por la web de eInforma, o (b) **API «API Empresas»** contra nuestro sistema — informe en tiempo real por nombre/CIF de empresa o de administrador, con los campos que selecciones («informe a medida») | Bonos anuales, ver §2 |
| **2** | **Ficheros de marketing** (lote) | Excel a medida filtrado por **CNAE + zona geográfica** (y por cualquier campo del informe financiero: razón social, socios, administradores, cualquier partida de balance, datos bancarios…) | **1–3€ por empresa**, según volumen |

Extras mencionados, no cotizados: **SABI** (Bureau van Dijk) desde **15.000€/año**; **FAqtum**
(valoración de una sociedad en 7 días); **Leanus** (vuelca N empresas en una herramienta de análisis
financiero/estadístico y comparativas).

## 2. Precios del bono de informes (mismo precio para web y para API)

| Bono | Precio | **Coste unitario** |
|---|---|---|
| 50 informes/año | 1.500€/año | **30,00€/informe** |
| 100 informes/año | 2.400€/año | **24,00€/informe** |
| 200 informes/año | 4.000€/año | **20,00€/informe** |
| 500 informes/año | 7.500€/año | **15,00€/informe** |

Los bonos pueden ser nacionales o internacionales. El comercial propone **empezar por los informes y
ampliar después**.

## 3. Lectura para nuestro embudo (lo que cambia de verdad)

**a) El precio unitario real es 15–30€, no los 12€ que asume el código.** El default
`EMPRESAS_ENRIQUECER_COSTE_EUR=12` de `lib/empresas-enriquecer.ts` se puso a ojo. Al contratar, poner el
env al unitario del bono elegido (30 / 24 / 20 / 15) para que el tope mensual
`EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR` cuente bien. Con el default de 50€/mes y un bono de 200, el tope
son ~2 informes al mes: **subir el tope o bajarlo a conciencia, pero decidirlo, no heredarlo**.

**b) Ojo al modelo de gasto: el bono es PREPAGO anual, no metered.** Nuestro ledger
`empresas_enriquecimiento_coste` está pensado como «€ gastados este mes». Con un bono lo que hay que
vigilar es **informes consumidos / informes del bono**, que es un contador anual. El ledger sirve igual
(coste unitario × consumos), pero el tope mensual debe fijarse como *bono ÷ 12* si no queremos
fundirlo en enero.

**c) El fichero de marketing (1–3€/empresa) es el eslabón que le faltaba al embudo.** El diseño
(§9) dejaba abierto el riesgo «el cribado gratis con BORME da *eventos*, pero no fondos propios
negativos sin evento» y ponía **SABI (15.000€/año) como única salida en fase 3**. Ese salto ya no hace
falta: por **1–3€/empresa** se puede pedir un Excel con **partidas de balance** de *todas* las empresas de
un CNAE + provincia. Es exactamente el cribado masivo de la etapa 1, a **1/5 – 1/20 del coste por empresa**
del informe unitario, y sin comprometer 15.000€.

Contraste crudo, para el mismo dinero:
- **4.000€** = 200 informes API (200 empresas, profundidad máxima), o
- **4.000€** = ~1.300–4.000 empresas en fichero (amplitud, con balance para filtrar).

El embudo del diseño quiere **primero amplitud barata, luego profundidad cara**. Luego el orden natural
es: **fichero primero** (define la lista corta con datos reales, no con eventos BORME) y **bono de
informes pequeño después**, solo para las supervivientes y para el refresco en vivo desde la app.

**d) El precio del fichero no se puede cerrar todavía y eso es gratis de averiguar.** Borja dice
explícitamente que su departamento de marketing tiene que hacer el estudio para saber **cuántas empresas
salen**. Pedir ese recuento con nuestros filtros no cuesta nada y convierte «1–3€/empresa» en una cifra
concreta antes de firmar.

**e) La restricción de redistribución sigue en pie.** Confirma el §1 y §8 del diseño: uso **interno**,
nada de reexponer estos datos a terceros como SaaS.

## 4. Recomendación

1. **Pedir a Borja el recuento (gratis) del fichero** con el filtro del diseño: provincia(s) objetivo
   + 2–3 CNAE del radar de sectores + facturación 0,5–2 M€ + forma jurídica SL. Con el nº de empresas
   sale el precio cerrado del fichero.
2. **Pedir la doc técnica de la API en formato usable** (ver §5) y el **acceso de sandbox**, que es lo que
   desbloquea el adapter ya construido.
3. **NO contratar el bono grande de entrada.** Si hay que firmar algo ya, el bono de **50 (1.500€)**
   basta para validar la tubería en vivo; el salto a 200/500 se decide cuando el embudo demuestre que
   genera candidatas que merezcan informe.
4. **SABI: descartado por ahora** (15.000€/año). El fichero a medida cubre el mismo hueco de cribado.

## 5. ⏳ Pendiente para poder cerrar el adapter

El correo trae los adjuntos que faltaban, pero **el contenedor de las sesiones de Claude no puede
descargar adjuntos de Gmail** (el conector solo lee texto y metadatos, y no hay salida de red hacia
Google). Para que se puedan usar, hay que **guardarlos en Google Drive** (ahí sí llega el conector) o
pegar su contenido:

| Adjunto | Para qué lo necesitamos |
|---|---|
| `API CONFIGURABLE v2.zip` | **Rutas reales** de OAuth2 y del informe → `RUTAS` de `lib/empresas-einforma.ts` (hoy `/api/v1/oauth/token` y `/api/v1/companies/{cif}/report` son una **suposición**) |
| `DICCIONARIODATOS_API_INFORME_EVOLUTION.xlsx` | **Nombres exactos de campo** → `mapearFinanciero()` (hoy adivina `balance.patrimonioNeto`, `balance.ebitda`, `ratios.deudaEbitda`…) |
| `EJEMPLO JSON INFORME_EVOLUTION A80192727.json` | **Fixture real** para el test del mapeo puro (`empresas-einforma.test.ts` hoy usa un JSON inventado) |
| `Informa Financiero - SEVILLA CONTROL SAU.pdf` + `Cuentas anuales Sevilla Control.xlsx` | Ver qué trae de verdad un informe: confirma si cubre **RAI/ASNEF** o hace falta producto de morosidad aparte (duda abierta del diseño §5-A) |
| `cnae2009 - CÓDIGOS PARA BASES DE DATOS NACIONAL.pdf` | Lista CNAE para los filtros del fichero y del radar de sectores |
| `Presentación SABI.pdf` | Descartado por precio (§4) |

Con esos tres primeros ficheros, activar eInforma pasa a ser **una edición de dos sitios**
(`RUTAS` + `mapearFinanciero`) tal y como se dejó preparado, más las envs
`EINFORMA_CLIENT_ID` / `EINFORMA_CLIENT_SECRET`.

## 6. Contacto

**Borja Piña Sánchez** — Delegado Comercial Andalucía, Informa D&B.
Avda. de la Constitución 24, 5ºA, 41004 Sevilla · 95 451 16 69 / 600 589 108 · <https://www.informa.es/>
