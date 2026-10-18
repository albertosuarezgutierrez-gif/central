# Generali (portal del corredor) — mapa de capturas

Fuente: Drive > «BOT compañías» (id 1PW1sQDBQ7-e6SqV-5-uMeLlWoMjPFK-9) > «Generali» (id 1Puzbyp7bVW9_eYSHlgv9SLDYybV8YxKQ).
Leído el 18/10/2026. La carpeta tenía 4 archivos (subida en curso: Alberto sigue añadiendo; releer). Sin datos personales:
usuario, código de mediador y nombre del corredor sustituidos por [dato].
Lectura hecha por el texto/OCR que devuelve Drive (no se pudo ver la imagen píxel a píxel): posiciones, estados y tipos de
campo marcados «?» son inferencia.

## Archivos (orden por número del nombre)

| # | Nombre literal | Tipo |
|---|---|---|
| 1 | `1.pdf` | PDF (captura de página) |
| 2 | `2 (seleccionar mediador.pdf` | PDF |
| 3 | `3. negocio-emision-contratacion-automoviles-turismo.jpg` | JPG |
| 4 | `4. darle a vehículo.jpg` | JPG |

## Pantallas

### 1. Login — `https://access.generali.es` («generali-spain - Iniciar sesión»)
- Campos: «Nombre de usuario» (texto, [dato]), «Contraseña» (password), «Recordarme» (check).
- Botones/enlaces: «Iniciar sesión», «¿Olvidó la contraseña?», «Ayuda» (`/help/login`).
- Instrucción del nombre: ninguna (solo el número). Aquí aparece el SMS cada 30 días (ver CONOCIMIENTO-PORTALES.md).

### 2. Seleccionar mediador — `https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po` («PORTAL DEL CORREDOR»)
- Título «SELECCIONAR MEDIADOR». Cascada de desplegables: Territorial («08 - SUROESTE/CANARIAS»), Sucursal («475 - OPERACIONES
  SUROESTE CANARIAS»), Centro («380 - OV OPERACIONES SUROESTE/CANA»), Comercial («50B - SG DIGITAL C.»), Mediador («Seleccionar...»,
  vacío en la captura: HAY QUE ELEGIRLO).
- Botón: «ACEPTAR». Enlace oculto a `.../com_commercialAppsWeb/mvc/mediatorCardIDD?mediatorCode=##`.
- Instrucción del nombre: «seleccionar mediador» → elegir el Mediador [dato] en el último desplegable y pulsar ACEPTAR.
  Tras ello la URL pasa a `.../CorredorPortal.po?mediatorCode=[dato]`.

### 3. Portal del corredor, menú — `.../arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=[dato]`
- Cabecera: GENERALI; «Portal del Corredor [dato]»; pestañas NEGOCIO / COMPAÑÍA / FORMACIÓN; lateral NORMAS, NOTICIAS, PRODUCTOS,
  SERVICIOS, HISTÓRICO.
- Menú superior: EMISIÓN · EMISIÓN (NUEVO) · RED COMERCIAL · SINIESTROS · CONTABILIDAD · COLECTIVOS · HERRAMIENTAS COMERCIALES ·
  ESTADÍSTICAS.
- Ruta del nombre: NEGOCIO > EMISIÓN > CONTRATACIÓN > AUTOMÓVILES > TURISMOS (RAMO UV).
- Opciones vistas: CONTRATACIÓN con ALTA DE PÓLIZA, ALTA POR REEMPLAZO; AUTOMÓVILES con CÁLCULO RÁPIDO DE PRIMAS, PROYECTO DE SEGURO,
  SUPLEMENTO, CONSULTAS, IMPRESIÓN DE PÓLIZA, GESTIÓN DE RECIBOS, RENOVACIÓN DE CARTERA.
- Submenú de ramo: TURISMOS (RAMO UV) · VEHÍCULOS COMERCIALES Y RESTO (RAMO UY) · MOTOS Y CICLOMOTORES (RAMO UF).
- Instrucción del nombre: pulsar «Turismos (Ramo UV)» (el nombre de archivo es la ruta del menú).
- Códigos de ramo útiles: coche UV, furgonetas/resto UY, moto UF.

### 4. Formulario de turismos — «Home > Negocio > Emisión > Contratación > Automóviles > Turismos (Ramo UV)»
- Pestañas/pasos: «Valoración Riesgo», «Datos de Valoración», «Garantías y Resultados».
- Sección «General»: Mediador (texto, precargado 00000 en captura ?), Flota (?), «F.Efectos» (fecha dd/mm/aaaa, precargada a hoy),
  «Fecha Presupuesto» (fecha, hoy), «Canal entrada» y «Subcanal entrada» (desplegables).
- Sección «Vehículo» / «Características del vehículo»: «Seleccionar vehículo» y botón/campo «Vehículo» (abre buscador; también
  «Mis favoritos»).
- Instrucción del nombre: «darle a vehículo» → pulsar el botón «Vehículo» para abrir la selección de vehículo (pantalla siguiente,
  aún sin captura).

## Comparación con el repo

- `src/adapters/` solo trae allianz, mapfre y occident. **No existe adaptador de Generali** (ni `src/adapters/generali`); en
  `docs/tarificador/CONOCIMIENTO-PORTALES.md` §«Generali (mediadores) — sin bot aún» solo constan: SMS cada 30 días (código por
  Telegram a Alberto, equipo recordado en `boveda-sesion.ts`) y los secretos `CRED_GENERALI_MEDIADORES_USER/_PASS`.
- Hoy Generali se tarifica por Avant2/Codeoscopic (CONTEXTO-SESIONES), no por RPA. Su "bloqueo" es no tener ningún mapa del portal:
  login → mediador → menú → formulario eran desconocidos.
- Estas 4 capturas resuelven: URL y campos de login, selección de mediador (cascada + ACEPTAR), ruta de menú hasta turismos y
  estructura del formulario hasta el botón «Vehículo». Siguen ciegas: selector de vehículo (matrícula/versión), tomador (NIF), datos
  del conductor, coberturas, pantalla de precio, otros ramos (hogar, vida, moto UF solo menú).

## Preguntas pendientes a Alberto

1. ¿Más capturas por llegar (la carpeta sigue creciendo)? Faltan: selector de vehículo, tomador/conductor, garantías y precio.
2. ¿Cuál es el mediador a elegir en el desplegable (si hay varios) y se recuerda la selección?
3. ¿Qué valor de «Canal entrada»/«Subcanal entrada» y «Flota» se usa siempre?
4. ¿Alcance: solo turismos (UV) o también moto (UF) y vehículos comerciales (UY)? ¿Y hogar/vida?
5. ¿«Emisión (nuevo)» es una vía distinta a «Emisión» y prefiere usarla? ¿Hay «Cálculo rápido de primas» como atajo al precio?
6. Confirmar que el SMS de 30 días sale tras el login (captura del paso).
