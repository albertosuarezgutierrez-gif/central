# EIAC V07.1 — Claves de Multirriesgo (hogar, comunidades, comercios...: inmueble, uso, zona, comunidad, obra, bien)

> Fuente: `209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05` (TIREA, 03/06/2026), apartado **10.2 Claves**. Transcripción literal: código -> descripción, sin interpretar. El § es el que figura en la columna «Clave» del PDF (numeración interna `13.x`).
> Cada tabla es el tipo `claves_*` del XSD con el mismo nombre. Buscar: `grep -n 'claves_formapago' docs/cima/eiac-claves*.md`. Índice de todas las tablas en `README.md`.

## claves_claseinmueble  (§13.3.8)

| Código | Descripción |
|---|---|
| CA | Caravana |
| CP | Casa de pueblo |
| GA | Garaje particular |
| LC | Local o actividad comercial |
| LT | Local trastero |
| MO | Módulo |
| PK | Parking |
| PB | Piso bajo tejado |
| PI | Piso intermedio |
| PL | Planta baja |
| PP | Piso |
| PR | Prefabricado |
| UD | Unifamiliar adosada |
| UI | Unifamiliar aislada |
| UP | Unifamiliar pareada |
| UU | Vivienda unifamiliar |

## claves_comunidad  (§13.3.18)

| Código | Descripción |
|---|---|
| CO | Comunidad no disponible |
| EG | Edificio garajes |
| EO | Edificio oficinas |
| EV | Edificio viviendas |
| EW | Edificio viviendas y garajes |
| NI | Ninguno de los anteriores |

## claves_usoinmueble  (§13.3.37)

| Código | Descripción |
|---|---|
| AL | Alquiler o cesión 3º |
| HA | Habitual |
| SE | Secundaria |
| NI | Ninguno de los anteriores |

## claves_zona  (§13.3.39)

| Código | Descripción |
|---|---|
| DE | Zona despoblada |
| PO | Zona poblada |
| UR | Zona urbanizada |
| NI | Ninguno de los anteriores |

## claves_obra  (§13.3.43)

| Código | Descripción |
|---|---|
| EO | Edificio Oficinas |
| EV | Edificio Viviendas |
| GA | Garajes (aparcamientos) |
| LC | Locales Comerciales |
| VU | Viviendas Unifamiliares |
| NI | Ninguna de las anteriores |

## claves_bien  (§13.3.72)

| Código | Descripción |
|---|---|
| CONTENIDO | Contenido |
| CONTINENTE | Continente |
| CA | Capital Alquiler: capital asegurado en caso de impago de alquiler en un bien alquilado. |
| RC | Responsabilidad civil |
| RCC | RC Contaminación: Responsabilidad civil para cubrir riesgos de impacto medioambiental. |
| MERCADERIAS | Mercaderías |
| OVJ | Objetos de valor y joyas: capital asegurado para objetos de valor, efectivo y joyas: no incluido en continente. |
| OTROS | Otros, diferente de los anteriores. Especificar en Descripción. |

