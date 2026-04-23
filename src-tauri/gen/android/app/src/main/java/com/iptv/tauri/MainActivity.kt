package com.iptv.tauri

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.LinearLayout
import android.widget.Button
import androidx.activity.enableEdgeToEdge
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.common.Player
import androidx.media3.common.MediaItem
import androidx.media3.common.C

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

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var webView: WebView? = null
    private var isPlayerActive: Boolean = false
    private var playerHeader: TextView? = null
    private var playerControls: LinearLayout? = null
    private var isNativeUiVisible: Boolean = false

    init {
        Log.d("MainActivity", "MainActivity constructor called - MainActivity class loaded")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        currentInstance = this
        Log.d("MainActivity", "onCreate called - MainActivity initialized")

        // Initialize native UI elements (commented out until layout is updated)
        // playerHeader = findViewById(R.id.player_header)
        // playerControls = findViewById(R.id.player_controls)

        // Set up button click handlers (commented out until layout is updated)
        // findViewById<Button>(R.id.button_play_pause)?.setOnClickListener { togglePlayPause() }
        // findViewById<Button>(R.id.button_stop)?.setOnClickListener { stopPlayer() }
        // findViewById<Button>(R.id.button_volume_up)?.setOnClickListener { volumeUp() }
        // findViewById<Button>(R.id.button_volume_down)?.setOnClickListener { volumeDown() }
        // findViewById<Button>(R.id.button_close)?.setOnClickListener { closePlayer() }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        Log.d("MainActivity", "onKeyDown: keyCode=$keyCode, action=${event.action}, isPlayerActive=$isPlayerActive, NativePlayerActivity.currentInstance=${NativePlayerActivity.currentInstance != null}")

        // If NativePlayerActivity is active, let it handle all D-pad keys
        if (NativePlayerActivity.currentInstance != null) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    Log.d("MainActivity", "NativePlayerActivity is active, passing D-pad key to it")
                    return false // Let NativePlayerActivity handle it
                }
            }
        }
        
        // Handle keys when player is active (overlay mode)
        if (isPlayerActive) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    // OK button - toggle native UI
                    Log.d("MainActivity", "Player active: OK button pressed, toggling native UI")
                    if (isNativeUiVisible) {
                        hideNativeUI()
                    } else {
                        showNativeUI()
                    }
                    return true
                }
                KeyEvent.KEYCODE_BACK -> {
                    // Back button - close player
                    Log.d("MainActivity", "Player active: Back button pressed, closing player")
                    webView?.evaluateJavascript(
                        """
                        (function() {
                            const event = new KeyboardEvent('exoplayer:keydown', {
                                key: 'Back',
                                code: 'Back',
                                bubbles: true,
                                cancelable: true
                            });
                            document.dispatchEvent(event);
                            console.log('[MainActivity] Dispatched exoplayer:keydown Back');
                        })();
                        """.trimIndent(),
                        null
                    )
                    return true
                }
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    // Arrow keys - dispatch to WebView for React navigation
                    val jsKeyCode = when (keyCode) {
                        KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
                        KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
                        KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
                        KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
                        else -> return super.onKeyDown(keyCode, event)
                    }
                    webView?.evaluateJavascript(
                        """
                        (function() {
                            const event = new KeyboardEvent('exoplayer:keydown', {
                                key: '$jsKeyCode',
                                code: '$jsKeyCode',
                                bubbles: true,
                                cancelable: true
                            });
                            document.dispatchEvent(event);
                            console.log('[MainActivity] Dispatched exoplayer:keydown $jsKeyCode');
                        })();
                        """.trimIndent(),
                        null
                    )
                    return true
                }
            }
        }
        
        // Normal TV navigation when player is not active
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP ||
            keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
            keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
            keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            keyCode == KeyEvent.KEYCODE_ENTER) {
            Log.d("MainActivity", "Forwarding key to WebView: keyCode=$keyCode")
            val jsKeyCode = when (keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
                KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
                KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
                KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> "Enter"
                else -> return super.onKeyDown(keyCode, event)
            }
            webView?.evaluateJavascript(
                """
                (function() {
                    const event = new KeyboardEvent('keydown', {
                        key: '$jsKeyCode',
                        code: '$jsKeyCode',
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(event);
                    console.log('[MainActivity] Dispatched key: $jsKeyCode');
                })();
                """.trimIndent(),
                null
            )
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        this.webView = webView
        Log.d("MainActivity", "onWebViewCreate called - adding ExoPlayer JavascriptInterface")

        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun attach(x: Int, y: Int, width: Int, height: Int) {
                Log.d("MainActivity", "attach called with x=$x, y=$y, width=$width, height=$height")
                runOnUiThread {
                    try {
                        if (player == null) {
                            val context = applicationContext
                            player = ExoPlayer.Builder(context).build()

                            playerView = findViewById(R.id.player_view)
                            playerView!!.player = player
                            playerView!!.useController = false
                            playerView!!.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL

                            playerView!!.visibility = android.view.View.VISIBLE
                            val params = FrameLayout.LayoutParams(width, height).apply {
                                leftMargin = x
                                topMargin = y
                            }
                            playerView!!.layoutParams = params

                            val contentLayout = findViewById<FrameLayout>(android.R.id.content)
                            contentLayout.addView(playerView, 0, params)

                            playerHeader?.bringToFront()
                            playerControls?.bringToFront()
                            webView?.bringToFront()

                            player!!.setPlaybackSpeed(1.0f)
                            isPlayerActive = true
                            Log.d("MainActivity", "Player attached, isPlayerActive=true")

                            showNativeUI()
                        }
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in attach: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun load(url: String) {
                Log.d("MainActivity", "load called with url: $url")
                runOnUiThread {
                    try {
                        player?.apply {
                            setMediaItem(MediaItem.fromUri(url))
                            prepare()
                        }
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in load: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun play() {
                Log.d("MainActivity", "play called")
                runOnUiThread {
                    try {
                        player?.play()
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in play: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun pause() {
                Log.d("MainActivity", "pause called")
                runOnUiThread {
                    try {
                        player?.pause()
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in pause: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun stop() {
                Log.d("MainActivity", "stop called")
                runOnUiThread {
                    try {
                        player?.stop()
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in stop: ${e.message}", e)
                    }
                }
            }

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
                    Log.e("MainActivity", "NativePlayerActivity intent started - waiting for onCreate logs")
                }
            }

            @JavascriptInterface
            fun seek(position: Long) {
                Log.d("MainActivity", "seek called with position: $position")
                runOnUiThread {
                    try {
                        player?.seekTo(position)
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in seek: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun set_volume(volume: Float) {
                Log.d("MainActivity", "set_volume called with volume: $volume")
                runOnUiThread {
                    try {
                        player?.volume = volume
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in setVolume: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun resize() {
                Log.d("MainActivity", "resize called")
                runOnUiThread {
                    try {
                        playerView?.requestLayout()
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in resize: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun is_playing(): Boolean {
                Log.d("MainActivity", "is_playing called")
                val latch = java.util.concurrent.CountDownLatch(1)
                var result = false
                runOnUiThread {
                    try {
                        result = player?.isPlaying ?: false
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in is_playing: ${e.message}", e)
                        result = false
                    } finally {
                        latch.countDown()
                    }
                }
                latch.await()
                return result
            }

            @JavascriptInterface
            fun detach() {
                Log.d("MainActivity", "detach called")
                runOnUiThread {
                    try {
                        player?.release()
                        player = null
                        findViewById<FrameLayout>(android.R.id.content).removeView(playerView)
                        playerView = null
                        isPlayerActive = false
                        Log.d("MainActivity", "Player detached, isPlayerActive=false")
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in detach: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun release() {
                Log.d("MainActivity", "release called")
                runOnUiThread {
                    try {
                        player?.release()
                        player = null
                        findViewById<FrameLayout>(android.R.id.content).removeView(playerView)
                        playerView = null
                        isPlayerActive = false
                        Log.d("MainActivity", "Player released, isPlayerActive=false")
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in release: ${e.message}", e)
                    }
                }
            }

            @JavascriptInterface
            fun get_position(): Long {
                Log.d("MainActivity", "get_position called")
                val latch = java.util.concurrent.CountDownLatch(1)
                var result = 0L
                runOnUiThread {
                    try {
                        result = player?.currentPosition ?: 0
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in get_position: ${e.message}", e)
                        result = 0
                    } finally {
                        latch.countDown()
                    }
                }
                latch.await()
                return result
            }

            @JavascriptInterface
            fun get_duration(): Long {
                Log.d("MainActivity", "get_duration called")
                val latch = java.util.concurrent.CountDownLatch(1)
                var result = 0L
                runOnUiThread {
                    try {
                        val duration = player?.duration ?: 0
                        result = if (duration == C.TIME_UNSET) 0 else duration
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Error in get_duration: ${e.message}", e)
                        result = 0
                    } finally {
                        latch.countDown()
                    }
                }
                latch.await()
                return result
            }

            @JavascriptInterface
            fun set_header_text(text: String) {
                Log.d("MainActivity", "set_header_text called with: $text")
                runOnUiThread {
                    updateHeader(text)
                }
            }

            @JavascriptInterface
            fun show_ui() {
                Log.d("MainActivity", "show_ui called")
                runOnUiThread {
                    showNativeUI()
                }
            }

            @JavascriptInterface
            fun hide_ui() {
                Log.d("MainActivity", "hide_ui called")
                runOnUiThread {
                    hideNativeUI()
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
                        instance.changeChannel(url, channelName)
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

    // Native UI methods
    private fun togglePlayPause() {
        Log.d("MainActivity", "togglePlayPause called")
        runOnUiThread {
            try {
                if (player?.isPlaying == true) {
                    player?.pause()
                } else {
                    player?.play()
                }
            } catch (e: Exception) {
                Log.e("MainActivity", "Error in togglePlayPause: ${e.message}", e)
            }
        }
    }

    private fun stopPlayer() {
        Log.d("MainActivity", "stopPlayer called")
        runOnUiThread {
            try {
                player?.stop()
            } catch (e: Exception) {
                Log.e("MainActivity", "Error in stopPlayer: ${e.message}", e)
            }
        }
    }

    private fun volumeUp() {
        Log.d("MainActivity", "volumeUp called")
        runOnUiThread {
            try {
                val currentVolume = player?.volume ?: 0f
                player?.volume = (currentVolume + 0.1f).coerceAtMost(1f)
            } catch (e: Exception) {
                Log.e("MainActivity", "Error in volumeUp: ${e.message}", e)
            }
        }
    }

    private fun volumeDown() {
        Log.d("MainActivity", "volumeDown called")
        runOnUiThread {
            try {
                val currentVolume = player?.volume ?: 0f
                player?.volume = (currentVolume - 0.1f).coerceAtLeast(0f)
            } catch (e: Exception) {
                Log.e("MainActivity", "Error in volumeDown: ${e.message}", e)
            }
        }
    }

    private fun closePlayer() {
        Log.d("MainActivity", "closePlayer called")
        runOnUiThread {
            try {
                player?.release()
                player = null
                playerView?.visibility = View.GONE
                playerHeader?.visibility = View.GONE
                playerControls?.visibility = View.GONE
                isPlayerActive = false
                isNativeUiVisible = false
                Log.d("MainActivity", "Player closed")
            } catch (e: Exception) {
                Log.e("MainActivity", "Error in closePlayer: ${e.message}", e)
            }
        }
    }

    private fun showNativeUI() {
        Log.d("MainActivity", "showNativeUI called")
        runOnUiThread {
            playerHeader?.visibility = View.VISIBLE
            playerControls?.visibility = View.VISIBLE
            isNativeUiVisible = true
        }
    }

    private fun hideNativeUI() {
        Log.d("MainActivity", "hideNativeUI called")
        runOnUiThread {
            playerHeader?.visibility = View.GONE
            playerControls?.visibility = View.GONE
            isNativeUiVisible = false
        }
    }

    private fun updateHeader(text: String) {
        Log.d("MainActivity", "updateHeader called with: $text")
        runOnUiThread {
            playerHeader?.text = text
        }
    }
}
