# Keystore de firma ia.rest

**IMPORTANTE**: El keystore `iarest-release.keystore` NO debe subirse al repositorio.
El archivo `.enc` es la versión cifrada con OpenSSL + AES-256 + PBKDF2.

## Datos del keystore
- Alias: `iarest`
- Storepass: `iarest2026`
- Keypass: `iarest2026`
- Validez: 10.000 días (hasta 2053)
- Algoritmo: RSA 2048 / SHA384
- CN: ia.rest, OU=TPV, O=Alberto Suarez Gutierrez, L=Sevilla

## Para descifrar y usar
```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in iarest-release.keystore.enc \
  -out iarest-release.keystore \
  -pass pass:iarest2026Alberto28823484E
```

## Para compilar la APK release
```bash
export ANDROID_HOME=/opt/android-sdk
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

## Historial de versiones
| versionCode | versionName | Fecha | Notas |
|---|---|---|---|
| 11 | 2.0 | 2026-05-18 | Primera release firmada — PTT auditado, build desbloqueado |
| 10 | 1.9 | — | Debug signing (no distribuible) |
