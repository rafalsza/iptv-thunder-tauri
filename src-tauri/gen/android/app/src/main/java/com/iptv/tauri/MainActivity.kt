package com.iptv.tauri

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.KeyEvent
import androidx.activity.enableEdgeToEdge

data class PlayerParams(
    val channelId: String,
    val portalUrl: String,
    val mac: String,
    val token: String,
    val isVod: Boolean,
    val episodesJson: String,
    val currentEpisodeIndex: Int,
    val autoPlayEpisodes: Boolean,
    val channelsJson: String,
    val epgTitle: String,
    val epgStart: String,
    val epgEnd: String,
    val epgNextTitle: String,
    val epgNextStart: String,
    val epgNextEnd: String
)

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
    private var keyDownTime = 0L
    private val LONG_PRESS_DELAY = 500L // 500ms for long press
    private val handler = Handler(Looper.getMainLooper())
    private var longPressTriggered = false
    private var longPressEventSent = false

    // Single long press handler that's reused
    private val longPressRunnable = Runnable {
        if (!longPressEventSent) {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('tvlongpress', { bubbles: true, cancelable: true }))",
                null
            )
            longPressTriggered = true
            longPressEventSent = true
        }
    }

    init {
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        currentInstance = this

        // Set up key listener after view is created
        window.decorView.postDelayed({
            window.decorView.isFocusable = true
            window.decorView.isFocusableInTouchMode = true
            window.decorView.requestFocus()
            window.decorView.setOnKeyListener { _, keyCode, event ->
                if (event.action == KeyEvent.ACTION_DOWN) {
                    when (keyCode) {
                        KeyEvent.KEYCODE_DPAD_UP,
                        KeyEvent.KEYCODE_DPAD_DOWN,
                        KeyEvent.KEYCODE_DPAD_LEFT,
                        KeyEvent.KEYCODE_DPAD_RIGHT,
                        KeyEvent.KEYCODE_DPAD_CENTER,
                        KeyEvent.KEYCODE_ENTER -> true
                        else -> false
                    }
                } else false
            }
        }, 1000)
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
                    return false
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Handle BACK key - send to WebView for tv-navigation system
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_BACK) {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Back', code: 'Back', cancelable: true }))",
                null
            )
            return true
        }

        // Handle D-pad keys - send to WebView for TV navigation
        if (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || event.keyCode == KeyEvent.KEYCODE_ENTER) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                // Start long press detection (only on initial keydown, not repeat)
                if (event.repeatCount == 0) {
                    longPressTriggered = false
                    longPressEventSent = false
                    keyDownTime = System.currentTimeMillis()
                    // Cancel any existing handler before posting new one
                    handler.removeCallbacks(longPressRunnable)
                    handler.postDelayed(longPressRunnable, LONG_PRESS_DELAY)
                }

                // Send regular keydown event
                webView?.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', cancelable: true }))",
                    null
                )
                return true
            } else if (event.action == KeyEvent.ACTION_UP) {
                // Cancel long press if key is released before delay
                handler.removeCallbacks(longPressRunnable)

                // Only send keyup event if long press was NOT triggered
                if (!longPressTriggered) {
                    webView?.evaluateJavascript(
                        "window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', cancelable: true }))",
                        null
                    )
                } else {
                    // Reset native flags after a short delay
                    handler.postDelayed({
                        longPressTriggered = false
                        longPressEventSent = false
                    }, 500)
                }
                return true
            }
        }

        // Handle other D-pad keys
        if (event.action == KeyEvent.ACTION_DOWN) {
            val keyName = when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
                KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
                KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
                KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
                else -> null
            }
            if (keyName != null) {
                webView?.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown', { key: '$keyName', code: '$keyName', cancelable: true }))",
                    null
                )
                return true
            }
        }

        return super.dispatchKeyEvent(event)
    }

    override fun onResume() {
        super.onResume()
        // Restore focus to WebView when returning from NativePlayerActivity
        webView?.requestFocus()
        window.decorView.requestFocus()
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        this.webView = webView

        // Request focus for WebView to receive key events
        webView.requestFocus()

        // Configure WebView for 4K TV density scaling
        val metrics = resources.displayMetrics
        val density = metrics.density
        val densityDpi = metrics.densityDpi

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
                }
                densityDpi >= 320 -> { // 2K/XHDPI
                    textZoom = 90
                }
                else -> {
                    textZoom = 100
                }
            }
        }

        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun open_compose_player(
                url: String?,
                channelName: String?,
                channelId: String?,
                portalUrl: String?,
                mac: String?,
                token: String?,
                isVod: Boolean?,
                episodesJson: String?,
                currentEpisodeIndex: Int?,
                autoPlayEpisodes: Boolean?,
                channelsJson: String?,
                epgTitle: String?,
                epgStart: String?,
                epgEnd: String?,
                epgNextTitle: String?,
                epgNextStart: String?,
                epgNextEnd: String?
            ) {
                android.util.Log.d("MainActivity", "open_compose_player called with channel: $channelName, channelsJson length: ${channelsJson?.length ?: 0}")
                runOnUiThread {
                    try {
                        val intent = android.content.Intent(this@MainActivity, NativePlayerActivity::class.java)
                        intent.putExtra("url", url)
                        intent.putExtra("channelName", channelName)
                        intent.putExtra("channelId", channelId)
                        intent.putExtra("portalUrl", portalUrl)
                        intent.putExtra("mac", mac)
                        intent.putExtra("token", token)
                        intent.putExtra("isVod", isVod)
                        intent.putExtra("episodesJson", episodesJson)
                        intent.putExtra("currentEpisodeIndex", currentEpisodeIndex)
                        intent.putExtra("autoPlayEpisodes", autoPlayEpisodes)
                        intent.putExtra("channelsJson", channelsJson)
                        intent.putExtra("epgTitle", epgTitle)
                        intent.putExtra("epgStart", epgStart)
                        intent.putExtra("epgEnd", epgEnd)
                        intent.putExtra("epgNextTitle", epgNextTitle)
                        intent.putExtra("epgNextStart", epgNextStart)
                        intent.putExtra("epgNextEnd", epgNextEnd)
                        android.util.Log.d("MainActivity", "Starting NativePlayerActivity")
                        startActivity(intent)
                    } catch (e: Exception) {
                        android.util.Log.e("MainActivity", "Failed to start NativePlayerActivity", e)
                    }
                }
            }

            @JavascriptInterface
            fun change_channel(url: String, channelName: String) {
                val instance = NativePlayerActivity.currentInstance
                if (instance == null) {
                    runOnUiThread {
                        val intent = android.content.Intent(this@MainActivity, NativePlayerActivity::class.java)
                        intent.putExtra("url", url)
                        intent.putExtra("channelName", channelName)
                        startActivity(intent)
                    }
                } else {
                    runOnUiThread {
                        instance.changeChannel(url, channelName, isVod = false) // Channels are never VOD
                    }
                }
            }
        }, "ExoPlayer")
    }

    // Public methods for channel up/down events (called from NativePlayerActivity)
    fun emitChannelUp() {
        runOnUiThread {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('channelUp'))",
                null
            )
        }
    }

    fun emitChannelDown() {
        runOnUiThread {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('channelDown'))",
                null
            )
        }
    }
}
