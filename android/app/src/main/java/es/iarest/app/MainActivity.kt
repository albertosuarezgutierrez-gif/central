package es.iarest.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.content.Intent

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var mediaSession: MediaSessionCompat

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Pantalla completa, sin barra de título
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // WebView como vista principal
        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // Conceder permisos de micro y cámara automáticamente al WebView
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
        }

        // Cargar ia.rest
        webView.loadUrl("https://www.iarest.es")

        // Pedir permiso de micrófono al sistema Android
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }

        // Configurar MediaSession para capturar el botón del auricular
        setupMediaSession()
    }

    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "IaRest")

        // Estado de reproducción activo — esto hace que Android nos dé el botón del auricular
        val stateBuilder = PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE)
            .setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f)
        mediaSession.setPlaybackState(stateBuilder.build())

        // Callback: intercepta el botón del auricular antes que Bixby/Google
        mediaSession.setCallback(object : MediaSessionCompat.Callback() {
            override fun onMediaButtonEvent(mediaButtonEvent: Intent): Boolean {
                val keyEvent = mediaButtonEvent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT)
                    ?: return false

                val isHeadsetBtn = keyEvent.keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
                                   keyEvent.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE

                if (isHeadsetBtn) {
                    when (keyEvent.action) {
                        KeyEvent.ACTION_DOWN -> {
                            webView.post {
                                webView.evaluateJavascript(
                                    "window.startPTT && window.startPTT()", null)
                            }
                        }
                        KeyEvent.ACTION_UP -> {
                            webView.post {
                                webView.evaluateJavascript(
                                    "window.stopPTT && window.stopPTT()", null)
                            }
                        }
                    }
                    return true // consumido — Bixby/Google no lo verán
                }
                return super.onMediaButtonEvent(mediaButtonEvent)
            }
        })

        // Activar sesión — clave para recibir los botones del auricular
        mediaSession.isActive = true

        // Solicitar foco de audio para "poseer" el botón del auricular
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(null,
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN)
    }

    override fun onDestroy() {
        super.onDestroy()
        mediaSession.isActive = false
        mediaSession.release()
    }

    // Evitar que el botón físico atrás cierre la app (kiosco)
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        // else: no hacemos nada — la app no se cierra
    }
}
// build trigger Mon May 11 11:47:07 UTC 2026
