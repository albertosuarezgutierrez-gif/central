# Vigía OSS — estado entre ejecuciones de `github-vigia`

> Lo mantiene la skill `github-vigia` (rutina mensual, día 15). Es su memoria: lista
> curada de repos vigilados con la última versión vista, y bitácora de hallazgos.
> Si añades un repo a mano, di POR QUÉ nos importa — sin eso la skill no puede juzgar relevancia.

## Repos vigilados

| Repo | Por qué nos importa | Vertical / pendiente | Última versión vista | Revisado |
|---|---|---|---|---|
| `VROOM-Project/vroom` | Motor de optimización de rutas (VRP): es el candidato para el «planificador automático» pendiente | transporte | v1.15.0 | 2026-07-02 |
| `Project-OSRM/osrm-backend` | Rutas por carretera sobre OSM: ETA real (hoy `etaMin` es línea recta), map-matching para km reales, geometría para el mapa Leaflet | transporte / module-geo | — (primera pasada la rellena) | — |
| `GIScience/openrouteservice` | API hosteada gratis (rutas + optimización VROOM + geocoding) — opción sin infra para validar ETA real y geocoding de paradas | transporte | — (primera pasada la rellena) | — |
| `Leaflet/Leaflet` | El mapa de `/(usuario)/mapa` (transporte) y el consolidado de plataforma cargan Leaflet por CDN | transporte / plataforma | — (primera pasada la rellena) | — |
| `traccar/traccar` | Nuestro endpoint de ingesta habla su protocolo (`osmand`/`traccar`); cambios de protocolo nos afectan | transporte / module-geo | — (primera pasada la rellena) | — |
| `web-push-libs/web-push` | Única dependencia npm propia de un core (`core-push`); CVEs o cambios VAPID nos tocan directo | core-push (ia-rest, ialimp) | — (primera pasada la rellena) | — |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-07-02** — (sesión manual, previa a la skill) Identificados VROOM / OSRM /
  openrouteservice como candidatos para el planificador automático y el ETA real de
  transporte. Recomendación vigente: empezar por openrouteservice u OSRM demo para
  ETA + geocoding (poco esfuerzo, mejora visible); VROOM autohospedado cuando el
  planificador sea producto con volumen.
