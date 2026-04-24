package com.iptv.tauri

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.widget.AppCompatSeekBar
import com.google.android.material.button.MaterialButton
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.ui.PlayerView

data class EpgInfo(
    val title: String,
    val start: String,
    val end: String,
    val startMin: Int = 0,
    val endMin: Int = 0,
    val nextTitle: String = "",
    val nextStart: String = "",
    val nextEnd: String = ""
)

class NativePlayerActivity : AppCompatActivity() {
    companion object {
        // Weak reference to prevent memory leaks and lifecycle issues
        private var _currentInstance: java.lang.ref.WeakReference<NativePlayerActivity>? = null
        var currentInstance: NativePlayerActivity?
            get() = _currentInstance?.get()
            set(value) {
                _currentInstance = if (value != null) java.lang.ref.WeakReference(value) else null
            }
    }

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var channelNameTextView: TextView? = null
    private var liveLabelTextView: TextView? = null
    private var epgTextView: TextView? = null
    private var currentTimeTextView: TextView? = null
    private var durationTimeTextView: TextView? = null
    private var statusIndicator: View? = null
    private var progressBar: ProgressBar? = null
    private var seekBar: AppCompatSeekBar? = null
    private var isSeeking = false // Flag to prevent circular updates
    private var playPauseButton: MaterialButton? = null
    private var seekForwardButton: MaterialButton? = null
    private var seekBackwardButton: MaterialButton? = null
    private var headerContainer: View? = null
    private var controlsContainer: View? = null
    private var showControls = true
    private val hideHandler = Handler(Looper.getMainLooper())
    private val hideRunnable = Runnable { hideControls() }
    private val HIDE_DELAY_MS = 5000L // Hide controls after 5 seconds of inactivity

    // Retry logic
    private var retryCount = 0
    private val MAX_RETRIES = 5
    
    // Exponential backoff delays: 1s, 2s, 5s, 10s
    private val RETRY_DELAYS_MS = longArrayOf(1000, 2000, 5000, 10000)
    
    // Track if playback was playing before stop (to respect user pause)
    private var wasPlayingBeforeStop = false

    // VOD flag - EPG should not be shown for movies/series
    private var isVod = false

    // Resume playback for VOD
    private lateinit var sharedPreferences: SharedPreferences
    private val PREFS_NAME = "VOD_RESUME"
    private val RESUME_SAVE_INTERVAL_MS = 5000L // Save position every 5 seconds
    private var resumeLoaded = false // Flag to prevent loading resume position multiple times

    // EPG data (native, no React hooks)
    @Volatile
    private var currentEpg: EpgInfo? = null

    // EPG refresh handler
    private val epgHandler = Handler(Looper.getMainLooper())
    private val epgRunnable = object : Runnable {
        override fun run() {
            refreshEpgFromNative()
            updateEpgProgress() // Update progress every refresh
            epgHandler.postDelayed(this, 60_000) // Refresh every 60 seconds
        }
    }

    // Progress update handler (runs every second)
    private val progressHandler = Handler(Looper.getMainLooper())
    private val progressRunnable = object : Runnable {
        override fun run() {
            updateEpgProgress()
            saveVodPosition() // Save position periodically
            progressHandler.postDelayed(this, 1000) // Update every second
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        currentInstance = null
        hideHandler.removeCallbacks(hideRunnable)
        epgHandler.removeCallbacks(epgRunnable)
        progressHandler.removeCallbacks(progressRunnable)
        
        // Save position when destroying activity
        saveVodPosition()
        
        // Detach player from view first to prevent surface issues
        playerView?.player = null
        
        player?.run {
            stop()
            clearMediaItems()
            release()
        }
        player = null
        playerView = null
    }

    override fun onStop() {
        super.onStop()
        wasPlayingBeforeStop = player?.isPlaying == true
        player?.pause()
    }

    override fun onStart() {
        super.onStart()
        if (wasPlayingBeforeStop) {
            player?.play()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        android.util.Log.e("NativePlayerActivity", "=== onCreate START ===")
        super.onCreate(savedInstanceState)
        currentInstance = this

        // Keep screen awake - TV must-have
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Handle back button with modern API
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                player?.stop()
                finish()
            }
        })

        setContentView(R.layout.activity_native_player)

        val url = intent.getStringExtra("url") ?: ""
        val channelName = intent.getStringExtra("channelName") ?: "Unknown Channel"
        isVod = intent.getBooleanExtra("isVod", false)

        // Initialize SharedPreferences for VOD resume
        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        playerView = findViewById(R.id.player_view)
        channelNameTextView = findViewById(R.id.channel_name)
        liveLabelTextView = findViewById(R.id.live_label)
        statusIndicator = findViewById(R.id.status_indicator)
        epgTextView = findViewById(R.id.epg_text)
        currentTimeTextView = findViewById(R.id.current_time)
        durationTimeTextView = findViewById(R.id.duration_time)
        progressBar = findViewById(R.id.loading_spinner)
        seekBar = findViewById(R.id.seek_bar)
        playPauseButton = findViewById(R.id.play_pause_button)
        seekForwardButton = findViewById(R.id.seek_forward_button)
        seekBackwardButton = findViewById(R.id.seek_backward_button)
        headerContainer = findViewById(R.id.header_container)
        controlsContainer = findViewById(R.id.controls_container)

        playerView?.isFocusable = false
        playerView?.isFocusableInTouchMode = false
        playerView?.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS

        playPauseButton?.isFocusable = true
        seekForwardButton?.isFocusable = true
        seekBackwardButton?.isFocusable = true

        playPauseButton?.nextFocusRightId = R.id.seek_forward_button
        playPauseButton?.nextFocusLeftId = R.id.seek_backward_button
        seekBackwardButton?.nextFocusRightId = R.id.play_pause_button
        seekForwardButton?.nextFocusLeftId = R.id.play_pause_button

        channelNameTextView?.text = channelName

        // Setup SeekBar listener for VOD seeking
        seekBar?.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    val duration = player?.duration ?: 0
                    if (duration > 0 && duration != C.TIME_UNSET) {
                        val position = (duration * progress / 1000).toLong()
                        val currentTime = formatTime(position)
                        val totalTime = formatTime(duration)
                        currentTimeTextView?.text = currentTime
                        durationTimeTextView?.text = totalTime
                    }
                }
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {
                isSeeking = true
            }

            override fun onStopTrackingTouch(seekBar: SeekBar?) {
                isSeeking = false
                val duration = player?.duration ?: 0
                if (duration > 0 && duration != C.TIME_UNSET) {
                    val position = (duration * (seekBar?.progress ?: 0) / 1000).toLong()
                    player?.seekTo(position)
                }
            }
        })

        // Start EPG refresh handler only for live TV (not VOD)
        if (!isVod) {
            epgHandler.post(epgRunnable)
        }

        // Start progress update handler
        progressHandler.post(progressRunnable)

        // Custom LoadControl for IPTV to reduce lag
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                3000,  // minBufferMs
                10000, // maxBufferMs
                1500,  // bufferForPlaybackMs
                2000   // bufferForPlaybackAfterRebufferMs
            )
            .build()

        player = ExoPlayer.Builder(this)
            .setLoadControl(loadControl)
            .setSeekBackIncrementMs(10000)
            .setSeekForwardIncrementMs(10000)
            .build().also {
            playerView?.player = it
            it.setMediaItem(MediaItem.fromUri(url))
            it.prepare()
            it.play()
        }

        player?.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                progressBar?.visibility = if (playing) View.GONE else View.VISIBLE
                updatePlayPauseButton(playing)
                updateStatusIndicator(playing)
            }

            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_IDLE, Player.STATE_BUFFERING -> {
                        progressBar?.visibility = View.VISIBLE
                        updateStateLabel("Loading...")
                    }
                    Player.STATE_READY -> {
                        progressBar?.visibility = View.GONE
                        if (player?.isCurrentMediaItemLive == true) {
                            updateStateLabel("Live")
                        } else {
                            updateStateLabel("Playing")
                        }
                        retryCount = 0 // Reset retry count on successful playback
                        
                        // Load saved position for VOD (only once)
                        if (isVod && !resumeLoaded) {
                            loadVodPosition(url)
                            resumeLoaded = true
                        }
                    }
                    Player.STATE_ENDED -> {
                        progressBar?.visibility = View.GONE
                        // Clear saved position when video ends
                        if (isVod) {
                            clearVodPosition(url)
                        }
                    }
                }
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                android.util.Log.e("NativePlayerActivity", "Player error: ${error.errorCode}, retry: $retryCount/$MAX_RETRIES", error)
                
                if (retryCount < MAX_RETRIES) {
                    retryCount++
                    val delayMs = RETRY_DELAYS_MS.getOrElse(retryCount - 1) { 10000L } // Default to 10s if out of bounds
                    
                    updateStateLabel("Reconnecting in ${delayMs / 1000}s...")
                    progressBar?.visibility = View.VISIBLE
                    
                    // Retry with exponential backoff
                    hideHandler.postDelayed({
                        android.util.Log.d("NativePlayerActivity", "Retrying playback (attempt $retryCount)")
                        player?.prepare()
                        player?.play()
                    }, delayMs)
                } else {
                    updateStateLabel("No signal")
                    progressBar?.visibility = View.GONE
                    android.util.Log.e("NativePlayerActivity", "Max retries reached, giving up")
                }
            }
        })

        playPauseButton?.setOnClickListener {
            player?.let {
                android.util.Log.d("NativePlayerActivity", "PlayPause clicked: isPlaying=${it.isPlaying}")
                if (it.isPlaying) {
                    it.pause()
                    wasPlayingBeforeStop = false // User manually paused
                    android.util.Log.d("NativePlayerActivity", "Paused playback")
                } else {
                    it.play()
                    wasPlayingBeforeStop = true // User manually resumed
                    android.util.Log.d("NativePlayerActivity", "Resumed playback")
                }
            }
            resetHideTimer()
        }

        // 🔥 FOCUS VISUAL — professional TV focus feedback
        val buttons = listOf(
            playPauseButton,
            seekBackwardButton,
            seekForwardButton
        )

        buttons.forEach { btn ->
            btn?.setOnFocusChangeListener { v, hasFocus ->
                android.util.Log.d("NativePlayerActivity", "Focus change: ${v.id} hasFocus=$hasFocus")
                // Reset all buttons to unfocused state first
                buttons.forEach { b ->
                    b?.scaleX = 1f
                    b?.scaleY = 1f
                    b?.alpha = 0.8f
                }
                // Set focused state for current button
                if (hasFocus) {
                    v.scaleX = 1.1f
                    v.scaleY = 1.1f
                    v.alpha = 1f
                }
            }
        }

        seekForwardButton?.setOnClickListener {
            if (player?.isCurrentMediaItemSeekable == true) {
                player?.seekTo(player?.currentPosition?.plus(10000) ?: 0L)
            }
            resetHideTimer()
        }

        seekBackwardButton?.setOnClickListener {
            if (player?.isCurrentMediaItemSeekable == true) {
                player?.seekTo(player?.currentPosition?.minus(10000) ?: 0L)
            }
            resetHideTimer()
        }

        playerView?.setOnClickListener {
            if (showControls) {
                hideControls()
            } else {
                showControls()
            }
        }

        // Start auto-hide timer
        resetHideTimer()
    }

    private fun resetHideTimer() {
        hideHandler.removeCallbacks(hideRunnable)
        hideHandler.postDelayed(hideRunnable, HIDE_DELAY_MS)
    }

    private fun hideControls() {
        showControls = false
        headerContainer?.visibility = View.GONE
        controlsContainer?.visibility = View.GONE
    }

    private fun showControls() {
        showControls = true
        headerContainer?.visibility = View.VISIBLE
        controlsContainer?.visibility = View.VISIBLE
        resetHideTimer()
    }

    private fun updatePlayPauseButton(isPlaying: Boolean) {
        playPauseButton?.text = if (isPlaying) "⏸" else "▶"
    }

    private fun updateStatusIndicator(isPlaying: Boolean) {
        statusIndicator?.setBackgroundColor(
            if (isPlaying) android.graphics.Color.GREEN
            else android.graphics.Color.GRAY
        )
    }

    private fun updateStateLabel(state: String) {
        liveLabelTextView?.text = state
    }

    fun changeChannel(url: String, channelName: String, isVod: Boolean = false) {
        android.util.Log.d("NativePlayerActivity", "Changing channel to: $channelName, isVod=$isVod")
        channelNameTextView?.text = channelName
        this.isVod = isVod

        // Reset EPG on channel change
        currentEpg = null
        runOnUiThread {
            epgTextView?.text = "Loading program..."
        }

        // Reset resume flag for new content
        resumeLoaded = false

        retryCount = 0 // Reset retry count for new channel
        
        player?.run {
            stop() // Stop before changing for faster zap switching
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            play()
        }
    }

    // NATYWNA aktualizacja EPG (SAFE UI THREAD)
    fun updateEPG(title: String, start: String, end: String, nextTitle: String = "", nextStart: String = "", nextEnd: String = "") {
        val startMin = parseTimeToMinutes(start)
        val endMin = parseTimeToMinutes(end)
        currentEpg = EpgInfo(title, start, end, startMin, endMin, nextTitle, nextStart, nextEnd)

        updateEpgProgress()
    }

    // Parse time string "HH:MM" to minutes since midnight
    private fun parseTimeToMinutes(time: String): Int {
        return try {
            val parts = time.split(":")
            if (parts.size == 2) {
                val hours = parts[0].toInt()
                val minutes = parts[1].toInt()
                hours * 60 + minutes
            } else {
                0
            }
        } catch (e: Exception) {
            0
        }
    }

    // Update EPG progress bar with NOW + NEXT format
    private fun updateEpgProgress() {
        val epg = currentEpg
        val duration = player?.duration ?: 0L
        val currentPosition = player?.currentPosition ?: 0L

        // Always show playback progress for VOD (duration > 0 and not live)
        if (duration > 0 && duration != C.TIME_UNSET && player?.isCurrentMediaItemLive == false) {
            val progress = ((currentPosition.toFloat() / duration) * 100).coerceIn(0f, 100f)
            val currentTime = formatTime(currentPosition)
            val totalTime = formatTime(duration)

            // Update SeekBar (if not being dragged by user)
            if (!isSeeking) {
                runOnUiThread {
                    seekBar?.max = 1000
                    seekBar?.progress = (progress * 10).toInt()
                    seekBar?.visibility = View.VISIBLE
                    currentTimeTextView?.text = currentTime
                    durationTimeTextView?.text = totalTime
                    currentTimeTextView?.visibility = View.VISIBLE
                    durationTimeTextView?.visibility = View.VISIBLE
                }
            }

            // Show text progress in EPG text view
            val display = "${String.format("%.0f%%", progress)}"

            runOnUiThread {
                epgTextView?.text = display
                epgTextView?.visibility = View.VISIBLE
            }
            return
        }

        // Hide SeekBar and time labels for live TV
        runOnUiThread {
            seekBar?.visibility = View.GONE
            currentTimeTextView?.visibility = View.GONE
            durationTimeTextView?.visibility = View.GONE
        }

        // Show EPG progress for live TV
        if (epg != null) {
            val now = (System.currentTimeMillis() / 60000).toInt()
            val startMin = epg.startMin
            val endMin = epg.endMin

            if (startMin == 0 || endMin == 0) {
                // Fallback format without progress if times are invalid
                val display = if (epg.nextTitle.isNotEmpty()) {
                    "${epg.start} ${epg.title}\n${epg.nextStart} ${epg.nextTitle}"
                } else {
                    "${epg.start} - ${epg.end}  ${epg.title}"
                }
                runOnUiThread {
                    epgTextView?.text = display
                    epgTextView?.visibility = View.VISIBLE
                }
                return
            }

            // Handle programs that span past midnight
            val adjustedEndMin = if (endMin < startMin) endMin + 24 * 60 else endMin
            val adjustedNow = if (now < startMin && endMin < startMin) now + 24 * 60 else now

            val progress = if (adjustedNow >= startMin && adjustedNow <= adjustedEndMin) {
                ((adjustedNow - startMin).toFloat() / (adjustedEndMin - startMin)) * 100
            } else if (adjustedNow > adjustedEndMin) {
                100f
            } else {
                0f
            }.coerceIn(0f, 100f)

            val progressBar = "█".repeat((progress / 5).toInt()) + "░".repeat(20 - (progress / 5).toInt())
            val progressText = String.format("%.0f%%", progress)

            // MAG box format: NOW + NEXT
            val display = if (epg.nextTitle.isNotEmpty()) {
                "${epg.start} ${epg.title} $progressBar $progressText\n${epg.nextStart} ${epg.nextTitle}"
            } else {
                "${epg.start} ${epg.title}  $progressBar $progressText"
            }

            runOnUiThread {
                epgTextView?.text = display
                epgTextView?.visibility = View.VISIBLE
            }
        } else {
            runOnUiThread {
                epgTextView?.visibility = View.GONE
            }
        }
    }

    // Format time in milliseconds to HH:MM:SS
    private fun formatTime(ms: Long): String {
        val seconds = (ms / 1000) % 60
        val minutes = (ms / (1000 * 60)) % 60
        val hours = (ms / (1000 * 60 * 60))
        return if (hours > 0) {
            String.format("%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format("%02d:%02d", minutes, seconds)
        }
    }

    // LOGIKA EPG (MOŻE BYĆ API ALBO CACHE)
    private fun refreshEpgFromNative() {
        // Skip EPG refresh for VOD content (movies/series)
        if (isVod) return

        val channel = channelNameTextView?.text?.toString() ?: return

        Thread {
            try {
                // TODO: Twoje API IPTV / Stalker / Xtream
                val epg = fetchEpgForChannel(channel)

                runOnUiThread {
                    updateEPG(epg.title, epg.start, epg.end, epg.nextTitle, epg.nextStart, epg.nextEnd)
                }

            } catch (e: Exception) {
                android.util.Log.e("EPG", "Failed", e)
            }
        }.start()
    }

    // FAKE API (do testów)
    private fun fetchEpgForChannel(channel: String): EpgInfo {
        // Return current time-based program for testing progress
        val now = System.currentTimeMillis()
        val startMin = ((now / 60000) - 30).toInt() // 30 minutes ago
        val endMin = ((now / 60000) + 30).toInt() // 30 minutes from now
        val nextStartMin = endMin
        val nextEndMin = nextStartMin + 45 // Next program 45 minutes
        
        val startHour = (startMin / 60) % 24
        val startMinute = startMin % 60
        val endHour = (endMin / 60) % 24
        val endMinute = endMin % 60
        val nextStartHour = (nextStartMin / 60) % 24
        val nextStartMinute = nextStartMin % 60
        val nextEndHour = (nextEndMin / 60) % 24
        val nextEndMinute = nextEndMin % 60
        
        val startStr = String.format("%02d:%02d", startHour, startMinute)
        val endStr = String.format("%02d:%02d", endHour, endMinute)
        val nextStartStr = String.format("%02d:%02d", nextStartHour, nextStartMinute)
        val nextEndStr = String.format("%02d:%02d", nextEndHour, nextEndMinute)
        
        return EpgInfo(
            title = "Wiadomości",
            start = startStr,
            end = endStr,
            startMin = startMin,
            endMin = endMin,
            nextTitle = "Sport",
            nextStart = nextStartStr,
            nextEnd = nextEndStr
        )
    }

    // 🔥 TV BEST PRACTICE — dispatchKeyEvent zamiast onKeyDown
    // ExoPlayer i PlayerView też nasłuchują key events
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        android.util.Log.d("NativePlayerActivity", "dispatchKeyEvent: keyCode=${event.keyCode}, action=${event.action}, showControls=$showControls")

        if (event.action != KeyEvent.ACTION_DOWN) {
            return super.dispatchKeyEvent(event)
        }

        // Reset hide timer on any key press (navigation, OK, etc.)
        if (showControls) {
            resetHideTimer()
        }

        when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                if (!showControls) {
                    showControls()
                    return true
                }
                // 🔥 TV SEEKBAR NAVIGATION - gdy SeekBar ma focus, przesuwamy pozycję
                if (seekBar?.hasFocus() == true && isVod) {
                    val duration = player?.duration ?: 0
                    if (duration > 0 && duration != C.TIME_UNSET) {
                        val seekStep = (duration / 100).toLong() // ~1% of duration
                        val currentPosition = player?.currentPosition ?: 0L
                        val newPosition = when (event.keyCode) {
                            KeyEvent.KEYCODE_DPAD_LEFT -> (currentPosition - seekStep).coerceAtLeast(0L)
                            KeyEvent.KEYCODE_DPAD_RIGHT -> (currentPosition + seekStep).coerceAtMost(duration)
                            else -> currentPosition
                        }
                        player?.seekTo(newPosition)
                        // Aktualizuj SeekBar UI
                        val progress = ((newPosition.toFloat() / duration) * 1000).toInt()
                        seekBar?.progress = progress
                        android.util.Log.d("NativePlayerActivity", "TV Seek: position=${formatTime(newPosition)}, progress=$progress")
                        return true
                    }
                }
                // pozwól Androidowi obsłużyć focus navigation
                return super.dispatchKeyEvent(event)
            }
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (!showControls) {
                    showControls()
                    return true
                }
                // pozwól Androidowi obsłużyć focus navigation
                return super.dispatchKeyEvent(event)
            }
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> {
                if (!showControls) {
                    showControls()
                    return true
                }
                // NIE performClick ręcznie - pozwól Androidowi obsłużyć
                return super.dispatchKeyEvent(event)
            }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                player?.let {
                    if (it.isPlaying) {
                        it.pause()
                    } else {
                        it.play()
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_CHANNEL_UP -> {
                // Emit to React for channel switching
                MainActivity.currentInstance?.emitChannelUp()
                return true
            }
            KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                // Emit to React for channel switching
                MainActivity.currentInstance?.emitChannelDown()
                return true
            }
            KeyEvent.KEYCODE_MEDIA_NEXT -> {
                if (player?.isCurrentMediaItemSeekable == true) {
                    player?.seekTo(player?.currentPosition?.plus(10000) ?: 0L)
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
                if (player?.isCurrentMediaItemSeekable == true) {
                    player?.seekTo(player?.currentPosition?.minus(10000) ?: 0L)
                }
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    // Save VOD playback position to SharedPreferences
    private fun saveVodPosition() {
        if (!isVod) return
        
        val url = intent.getStringExtra("url") ?: return
        val position = player?.currentPosition ?: 0L
        val duration = player?.duration ?: 0L
        
        // Only save if position is valid and not at the very beginning
        if (position > 1000 && duration > 0 && position < duration - 1000) {
            val key = url.hashCode().toString() // Use URL hash as key
            sharedPreferences.edit()
                .putLong(key, position)
                .putLong("${key}_duration", duration)
                .putLong("${key}_timestamp", System.currentTimeMillis())
                .apply()
        }
    }

    // Load VOD playback position from SharedPreferences
    private fun loadVodPosition(url: String) {
        if (!isVod) return
        
        val key = url.hashCode().toString()
        val savedPosition = sharedPreferences.getLong(key, -1L)
        val savedDuration = sharedPreferences.getLong("${key}_duration", -1L)
        val savedTimestamp = sharedPreferences.getLong("${key}_timestamp", 0L)
        
        // Only resume if saved position exists and is recent (within 30 days)
        val thirtyDaysMs = 30L * 24 * 60 * 60 * 1000
        if (savedPosition > 1000 && savedDuration > 0 && 
            (System.currentTimeMillis() - savedTimestamp) < thirtyDaysMs) {
            
            val duration = player?.duration ?: 0L
            // Log dla debugowania
            android.util.Log.d("NativePlayerActivity", "Resume check: savedPosition=$savedPosition, savedDuration=$savedDuration, currentDuration=$duration")
            
            // Resume if we have valid position - duration check is optional (may not be available yet)
            // Sprawdź czy pozycja nie jest za długa (film mógł być krótszy niż zapamiętana pozycja)
            val shouldResume = if (duration > 0 && duration != C.TIME_UNSET) {
                savedPosition < duration - 1000 // Nie wznawiaj jeśli pozycja jest na końcu filmu
            } else {
                true // Jeśli długość nieznana, spróbuj wznowić
            }
            
            if (shouldResume) {
                android.util.Log.d("NativePlayerActivity", "Resuming VOD from position: ${formatTime(savedPosition)}")
                player?.seekTo(savedPosition)
                
                // Show resume notification
                runOnUiThread {
                    epgTextView?.text = "Resuming from ${formatTime(savedPosition)}"
                    epgTextView?.visibility = View.VISIBLE
                    
                    // Hide notification after 3 seconds
                    Handler(Looper.getMainLooper()).postDelayed({
                        epgTextView?.visibility = View.GONE
                    }, 3000)
                }
            } else {
                android.util.Log.d("NativePlayerActivity", "Not resuming - position at end of video")
            }
        } else {
            android.util.Log.d("NativePlayerActivity", "No valid resume position found")
        }
    }

    // Clear VOD playback position from SharedPreferences
    private fun clearVodPosition(url: String) {
        val key = url.hashCode().toString()
        sharedPreferences.edit()
            .remove(key)
            .remove("${key}_duration")
            .remove("${key}_timestamp")
            .apply()
    }
}
