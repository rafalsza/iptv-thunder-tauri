package com.iptv.tauri

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.ProgressBar
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.ui.PlayerView
import com.iptv.tauri.player.*

class NativePlayerActivity : AppCompatActivity() {
    companion object {
        private var _currentInstance: java.lang.ref.WeakReference<NativePlayerActivity>? = null
        var currentInstance: NativePlayerActivity?
            get() = _currentInstance?.get()
            set(value) {
                _currentInstance = if (value != null) java.lang.ref.WeakReference(value) else null
            }
    }

    // Controllers
    private lateinit var playerController: PlayerController
    private lateinit var epgManager: EpgManager
    private lateinit var resumeManager: ResumeManager
    private lateinit var uiController: UiController
    private lateinit var remoteController: RemoteController
    private var mediaSessionManager: MediaSessionManager? = null

    // Views
    private var playerView: PlayerView? = null
    private var progressBar: ProgressBar? = null

    // State
    private var isVod = false
    private var currentUrl = ""
    private var portalIdentifier = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        android.util.Log.d("NativePlayerActivity", "=== onCreate START ===")
        super.onCreate(savedInstanceState)
        currentInstance = this

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_native_player)

        currentUrl = intent.getStringExtra("url") ?: ""
        val channelName = intent.getStringExtra("channelName") ?: "Unknown Channel"
        isVod = intent.getBooleanExtra("isVod", false)
        portalIdentifier = intent.getStringExtra("mac") ?: ""

        initializeViews()
        initializeControllers(channelName)
        setupBackButton()
    }

    private fun initializeViews() {
        playerView = findViewById(R.id.player_view)
        progressBar = findViewById(R.id.loading_spinner)
    }

    private fun initializeControllers(channelName: String) {
        // Resume Manager
        resumeManager = ResumeManager(this@NativePlayerActivity, this, portalIdentifier)

        // EPG Manager
        epgManager = EpgManager(
            lifecycleOwner = this,
            epgTextView = findViewById(R.id.epg_text),
            getPlayerPosition = { playerController.player?.currentPosition ?: 0L },
            getPlayerDuration = { playerController.player?.duration ?: 0L },
            isLive = { playerController.player?.isCurrentMediaItemLive == true },
            formatTime = ::formatTime
        )

        // Player Controller
        playerController = PlayerController(
            context = this,
            lifecycleOwner = this,
            progressBar = progressBar,
            onStateChange = ::handlePlayerStateChange,
            onError = { _, retryCount, maxRetries ->
                android.util.Log.e("NativePlayerActivity", "Player error, retry $retryCount/$maxRetries")
            },
            onRetry = { playerController.retry() },
            onUiStateChange = ::renderUiState,
            initialChannelName = channelName
        )

        // UI Controller
        uiController = UiController(
            lifecycleOwner = this,
            playerView = playerView,
            headerContainer = findViewById(R.id.header_container),
            controlsContainer = findViewById(R.id.controls_container),
            channelNameTextView = findViewById(R.id.channel_name),
            liveLabelTextView = findViewById(R.id.live_label),
            qualityLabelTextView = findViewById(R.id.quality_label),
            currentTimeTextView = findViewById(R.id.current_time),
            durationTimeTextView = findViewById(R.id.duration_time),
            seekBar = findViewById(R.id.seek_bar),
            playPauseButton = findViewById(R.id.play_pause_button),
            seekForwardButton = findViewById(R.id.seek_forward_button),
            seekBackwardButton = findViewById(R.id.seek_backward_button),
            trackSelectButton = findViewById(R.id.track_select_button),
            statusIndicator = findViewById(R.id.status_indicator),
            getDuration = { playerController.player?.duration ?: 0L },
            onSeek = { position ->
                playerController.seekTo(position)
                updateSeekBarFromPlayer()
            },
            onPlayPause = { playerController.togglePlayPause() },
            onSeekForward = { playerController.seekRelative(10000) },
            onSeekBackward = { playerController.seekRelative(-10000) },
            formatTime = ::formatTime,
            getTrackInfo = { playerController.currentUiState },
            onSelectAudioTrack = { trackId -> playerController.selectAudioTrack(trackId) },
            onSelectSubtitleTrack = { trackId -> playerController.selectSubtitleTrack(trackId) }
        )
        uiController.setChannelName(channelName)

        // Remote Controller
        remoteController = RemoteController(
            isVod = { isVod },
            showControls = { uiController.showControls },
            setShowControls = { show ->
                if (show) uiController.showControls() else uiController.hideControls()
            },
            resetHideTimer = { uiController.resetHideTimer() },
            onTogglePlayPause = { playerController.togglePlayPause() },
            onSeekForward = { playerController.seekRelative(10000) },
            onSeekBackward = { playerController.seekRelative(-10000) },
            onChannelUp = { remoteController.emitChannelUp() },
            onChannelDown = { remoteController.emitChannelDown() },
            getSeekBar = { findViewById(R.id.seek_bar) },
            getDuration = { playerController.player?.duration ?: 0L },
            getCurrentPosition = { playerController.player?.currentPosition ?: 0L },
            onSeekTo = { position ->
                playerController.seekTo(position)
                updateSeekBarFromPlayer()
            },
            focusSeekBar = { uiController.focusSeekBar() },
            focusPlayPause = { uiController.focusPlayPauseButton() }
        )

        // Initialize player
        playerController.initialize(currentUrl, isVod)
        playerView?.player = playerController.player

        // Initialize MediaSession for Android TV integration
        playerController.player?.let { player ->
            mediaSessionManager = MediaSessionManager(this, player).apply {
                initialize()
            }
        }

        // Start EPG
        epgManager.start(isVod)

        // Start auto-hide timer for controls
        uiController.resetHideTimer()
    }

    private fun setupBackButton() {
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                playerController.player?.stop()
                finish()
            }
        })
    }

    private fun handlePlayerStateChange(state: PlayerController.PlayerState) {
        // State changes are now handled through renderUiState
        // This callback is kept for backward compatibility with resume logic
        when (state) {
            is PlayerController.PlayerState.Playing,
            is PlayerController.PlayerState.Live -> {
                // Load resume position for VOD
                if (isVod && !resumeManager.resumeLoaded) {
                    loadResumePosition()
                }
            }
            is PlayerController.PlayerState.Ended -> {
                if (isVod) resumeManager.clearPosition(currentUrl)
            }
            else -> {
                // Other states are handled through renderUiState
            }
        }
    }

    private fun renderUiState(state: PlayerController.PlayerUiState) {
        // Single source of truth for all UI updates
        uiController.setChannelName(state.channelName)
        uiController.updatePlayPauseButton(state.isPlaying)
        uiController.updateStatusIndicator(state.isPlaying)
        uiController.updateStateLabel(state.stateLabel)
        uiController.updateQualityLabel(state.videoQuality)
        uiController.updateSeekBar(state.currentProgress, state.duration, state.currentPosition, state.isVod)
        uiController.updateTrackInfo(state)
    }

    private fun loadResumePosition() {
        android.util.Log.d("NativePlayerActivity", "loadResumePosition: url=$currentUrl, isVod=$isVod")
        val info = resumeManager.loadPosition(currentUrl)
        if (info == null) {
            android.util.Log.d("NativePlayerActivity", "No resume info found")
            return
        }
        val duration = playerController.player?.duration ?: 0L

        if (resumeManager.shouldResume(currentUrl, duration)) {
            android.util.Log.d("NativePlayerActivity", "Resuming from ${formatTime(info.position)}")
            playerController.seekTo(info.position)
            resumeManager.showResumeNotification(info.position, findViewById(R.id.epg_text), ::formatTime)
        } else {
            android.util.Log.d("NativePlayerActivity", "Should not resume")
        }
        resumeManager.markResumeLoaded()
    }

    private fun updateSeekBarFromPlayer() {
        // This is now handled by renderUiState called from PlayerController
        // Kept for backward compatibility if needed
    }

    private fun formatTime(ms: Long): String {
        val seconds = (ms / 1000) % 60
        val minutes = (ms / (1000 * 60)) % 60
        val hours = (ms / (1000 * 60 * 60))
        return if (hours > 0) String.format("%02d:%02d:%02d", hours, minutes, seconds)
        else String.format("%02d:%02d", minutes, seconds)
    }

    fun changeChannel(url: String, channelName: String, isVod: Boolean = false) {
        android.util.Log.d("NativePlayerActivity", "Changing channel to: $channelName, isVod=$isVod")

        currentUrl = url
        this.isVod = isVod
        resumeManager.resetResumeLoaded()

        epgManager.resetEpg()

        playerController.changeChannel(url, channelName, isVod)

        if (isVod) epgManager.stop() else epgManager.start(false)
    }

    fun updateEPG(title: String, start: String, end: String, nextTitle: String = "", nextStart: String = "", nextEnd: String = "") {
        epgManager.updateEpg(title, start, end, nextTitle, nextStart, nextEnd)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        android.util.Log.d("NativePlayerActivity", "dispatchKeyEvent: keyCode=${event.keyCode}")
        return remoteController.handleKeyEvent(event) || super.dispatchKeyEvent(event)
    }

    override fun onStop() {
        super.onStop()
        playerController.pause()
    }

    override fun onStart() {
        super.onStart()
        playerController.resume()
    }

    override fun onDestroy() {
        super.onDestroy()
        currentInstance = null

        // Save position
        playerController.player?.let { player ->
            resumeManager.savePosition(currentUrl, player.currentPosition, player.duration)
        }

        // Release all controllers
        playerController.release()
        epgManager.release()
        resumeManager.release()
        uiController.release()
        mediaSessionManager?.release()

        playerView?.player = null
    }
}
