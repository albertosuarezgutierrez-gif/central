# Keystore de firma ia.rest

**IMPORTANTE**: El keystore `iarest-release.keystore` NO debe subirse al repositorio.
Guárdalo en un lugar seguro (por ejemplo, descárgalo de aquí: Alberto lo tiene en local).

## Datos del keystore
- Alias: `iarest`
- Storepass: `iarest2026`  
- Keypass: `iarest2026`
- Validez: 10.000 días (hasta 2053)
- Algoritmo: RSA 2048 / SHA256

## Para firmar la APK manualmente
```bash
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore iarest-release.keystore \
  -storepass iarest2026 -keypass iarest2026 \
  -signedjar iarest-signed.apk iarest-unsigned.apk iarest
```
