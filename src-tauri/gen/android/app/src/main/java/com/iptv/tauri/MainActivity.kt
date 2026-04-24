package com.iptv.tauri

import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.KeyEvent
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
    companion object {
        // Weak reference to allow access from other activities
        private var _currentInstance: java.lang.ref.WeakReference<MainActivity>? = null
        var currentInstance: MainActivity?
            get() = _currentInstance?.get()
            set(value) {
                _currentInstance = if (value != null) java.lang.ref.WeakReference(value) else null
            }
    }

    private var webView: WebView? = null

    init {
        Log.d("MainActivity", "MainActivity constructor called - MainActivity class loaded")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        currentInstance = this
        Log.d("MainActivity", "onCreate called - MainActivity initialized")
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        // If NativePlayerActivity is active, let it handle all D-pad keys
        if (NativePlayerActivity.currentInstance != null) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    return false // Let NativePlayerActivity handle it
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Handle BACK key only - send to WebView for tv-navigation system
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_BACK) {
            webView?.evaluateJavascript(
                """
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Back', code: 'Back' }));
                """.trimIndent(),
                null
            )
            return true // Don't close app
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        this.webView = webView

        // Configure WebView for 4K TV density scaling
        val metrics = resources.displayMetrics
        val density = metrics.density
        val densityDpi = metrics.densityDpi
        Log.d("MainActivity", "Display density: $density, densityDpi: $densityDpi")

        // Adjust text zoom based on screen density for 4K TVs
        webView.settings.apply {
            // Enable proper density scaling
            setSupportZoom(true)
            builtInZoomControls = false
            displayZoomControls = false

            // Adjust text scale for high-density displays (4K TVs often report 2x-3x density)
            // Use smaller zoom for 4K to prevent oversized elements
            when {
                densityDpi >= 480 -> { // 4K/XXHDPI
                    textZoom = 80
                    Log.d("MainActivity", "Setting textZoom to 80 for 4K display")
                }
                densityDpi >= 320 -> { // 2K/XHDPI
                    textZoom = 90
                    Log.d("MainActivity", "Setting textZoom to 90 for 2K display")
                }
                else -> {
                    textZoom = 100
                    Log.d("MainActivity", "Setting textZoom to 100 for standard display")
                }
            }
        }

        Log.d("MainActivity", "onWebViewCreate called - adding ExoPlayer JavascriptInterface")

        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun open_compose_player(url: String, channelName: String, channelId: String, portalUrl: String, mac: String, token: String, isVod: Boolean) {
                Log.e("MainActivity", "=== open_compose_player ENTRY POINT ===")
                Log.d("MainActivity", "open_compose_player called with: channelId=$channelId, portalUrl=$portalUrl, mac=$mac, token=${if(token.isNotEmpty()) "SET" else "EMPTY"}, isVod=$isVod")
                runOnUiThread {
                    Log.d("MainActivity", "Starting NativePlayerActivity intent")
                    val intent = android.content.Intent(this@MainActivity, NativePlayerActivity::class.java)
                    intent.putExtra("url", url)
                    intent.putExtra("channelName", channelName)
                    intent.putExtra("channelId", channelId)
                    intent.putExtra("portalUrl", portalUrl)
                    intent.putExtra("mac", mac)
                    intent.putExtra("token", token)
                    intent.putExtra("isVod", isVod)
                    startActivity(intent)
                    Log.e("MainActivity", "NativePlayerActivity intent started")
                }
            }

            @JavascriptInterface
            fun change_channel(url: String, channelName: String) {
                Log.d("MainActivity", "change_channel called with url=$url, channelName=$channelName")
                val instance = NativePlayerActivity.currentInstance
                if (instance == null) {
                    Log.d("MainActivity", "No active NativePlayerActivity instance, opening new one")
                    runOnUiThread {
                        val intent = android.content.Intent(this@MainActivity, NativePlayerActivity::class.java)
                        intent.putExtra("url", url)
                        intent.putExtra("channelName", channelName)
                        startActivity(intent)
                    }
                } else {
                    Log.d("MainActivity", "Changing channel in existing instance")
                    runOnUiThread {
                        instance.changeChannel(url, channelName, isVod = false) // Channels are never VOD
                    }
                }
            }
        }, "ExoPlayer")
    }

    // Public methods for channel up/down events (called from NativePlayerActivity)
    fun emitChannelUp() {
        Log.d("MainActivity", "emitChannelUp called")
        runOnUiThread {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('channelUp'))",
                null
            )
        }
    }

    fun emitChannelDown() {
        Log.d("MainActivity", "emitChannelDown called")
        runOnUiThread {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('channelDown'))",
                null
            )
        }
    }
}
