package com.iptv.tauri

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.ProgressBar
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.toColorInt
import androidx.lifecycle.lifecycleScope
import androidx.media3.ui.PlayerView
import com.iptv.tauri.player.*
import kotlinx.coroutines.launch

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
    private var seekToBeginningButton: com.google.android.material.button.MaterialButton? = null
    private var categoryCarouselButton: com.google.android.material.button.MaterialButton? = null
    private var recentCarouselButton: com.google.android.material.button.MaterialButton? = null
    private var categoryCarouselContainer: android.widget.HorizontalScrollView? = null
    private var recentCarouselContainer: android.widget.HorizontalScrollView? = null
    private var categoryCarousel: android.widget.LinearLayout? = null
    private var recentCarousel: android.widget.LinearLayout? = null

    // State
    private var isVod = false
    private var currentUrl = ""
    private var portalIdentifier = ""
    private var currentChannelName = ""
    private var currentChannelLogo = ""
    private var currentChannelCmd = ""
    private var currentChannelGenreId = ""
    private var addedToRecent = false
    private var pendingChannelName = ""  // Set when waiting for JS to resolve URL

    // Episode data for auto-play
    private var episodes: List<EpisodeInfo> = emptyList()
    private var currentEpisodeIndex = 0
    private var autoPlayEpisodes = true

    // EPG data
    private var epgTitle = ""
    private var epgStart = ""
    private var epgEnd = ""
    private var epgCategory = ""
    private var epgDesc = ""
    private var epgNextTitle = ""
    private var epgNextStart = ""
    private var epgNextEnd = ""
    private var epgNextCategory = ""
    private var epgProgramsJson = ""
    private var initialVolume = 0.8f

    // Channel data for carousel - separate lists for category and recent
    private var categoryChannels: List<ChannelInfo> = emptyList()
    private var recentChannels: List<ChannelInfo> = emptyList()
    private var currentChannelId: String = ""
    private var isCategoryCarouselVisible = false
    private var isRecentCarouselVisible = false

    // Scroll position preservation
    private var categoryScrollPosition = 0
    private var recentScrollPosition = 0
    private var categoryCarouselOpenedOnce = false
    private var recentCarouselOpenedOnce = false

    data class EpisodeInfo(
        val id: String,
        val url: String,
        val name: String,
        val season: String?,
        val episode: String?,
        val cmd: String?
    )

    data class ChannelInfo(
        val id: String,
        val name: String,
        val logo: String?,
        val stream_url: String?,
        val cmd: String?,
        val tv_genre_id: String? = null
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        android.util.Log.d("NativePlayerActivity", "=== onCreate START ===")
        super.onCreate(savedInstanceState)
        currentInstance = this

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_native_player)

        currentUrl = intent.getStringExtra("url") ?: ""
        val channelName = intent.getStringExtra("channelName") ?: "Unknown Channel"
        currentChannelId = intent.getStringExtra("channelId") ?: ""
        currentChannelName = channelName
        currentChannelLogo = ""
        currentChannelCmd = ""
        currentChannelGenreId = ""
        isVod = intent.getBooleanExtra("isVod", false)
        portalIdentifier = intent.getStringExtra("mac") ?: ""

        // Parse episode data for auto-play
        currentEpisodeIndex = intent.getIntExtra("currentEpisodeIndex", 0)
        autoPlayEpisodes = intent.getBooleanExtra("autoPlayEpisodes", true)
        val episodesJson = intent.getStringExtra("episodesJson") ?: "[]"
        episodes = parseEpisodesJson(episodesJson)
        android.util.Log.d("NativePlayerActivity", "Episodes loaded: ${episodes.size}, currentIndex: $currentEpisodeIndex, autoPlay: $autoPlayEpisodes")

        // Parse category channels for carousel
        val channelsJson = intent.getStringExtra("channelsJson") ?: "[]"
        android.util.Log.d("NativePlayerActivity", "channelsJson length: ${channelsJson.length}, content: ${channelsJson.take(200)}")
        categoryChannels = parseChannelsJson(channelsJson)
        android.util.Log.d("NativePlayerActivity", "Category channels loaded: ${categoryChannels.size}, isVod: $isVod")
        android.util.Log.d("NativePlayerActivity", "Channel carousel button will be visible: ${!isVod && categoryChannels.isNotEmpty()}")

        // Parse EPG data
        epgTitle = intent.getStringExtra("epgTitle") ?: ""
        epgStart = intent.getStringExtra("epgStart") ?: ""
        epgEnd = intent.getStringExtra("epgEnd") ?: ""
        epgCategory = intent.getStringExtra("epgCategory") ?: ""
        epgDesc = intent.getStringExtra("epgDesc") ?: ""
        epgNextTitle = intent.getStringExtra("epgNextTitle") ?: ""
        epgNextStart = intent.getStringExtra("epgNextStart") ?: ""
        epgNextEnd = intent.getStringExtra("epgNextEnd") ?: ""
        epgNextCategory = intent.getStringExtra("epgNextCategory") ?: ""
        android.util.Log.d("NativePlayerActivity", "EPG data: title=$epgTitle, start=$epgStart, end=$epgEnd, category=$epgCategory")

        // Parse full EPG program list for auto-refresh
        epgProgramsJson = intent.getStringExtra("epgProgramsJson") ?: ""
        if (epgProgramsJson.isNotEmpty()) {
            android.util.Log.d("NativePlayerActivity", "EPG programs list received, length=${epgProgramsJson.length}")
        }

        // Get volume from settings (0-100, default 80)
        initialVolume = intent.getIntExtra("volume", 80) / 100f
        android.util.Log.d("NativePlayerActivity", "Initial volume: $initialVolume")

        initializeViews()
        initializeControllers(channelName)
        setupBackButton()
    }

    private fun initializeViews() {
        playerView = findViewById(R.id.player_view)
        progressBar = findViewById(R.id.loading_spinner)
        seekToBeginningButton = findViewById(R.id.seek_to_beginning_button)
        
        // Category carousel (green - like in MPV)
        categoryCarouselButton = findViewById(R.id.category_carousel_button)
        categoryCarouselContainer = findViewById(R.id.category_carousel_container)
        categoryCarousel = findViewById(R.id.category_carousel)
        
        // Recent carousel (blue - like in MPV)
        recentCarouselButton = findViewById(R.id.recent_carousel_button)
        recentCarouselContainer = findViewById(R.id.recent_carousel_container)
        recentCarousel = findViewById(R.id.recent_carousel)

        android.util.Log.d("NativePlayerActivity", "initializeViews: categoryCarouselButton is null: ${categoryCarouselButton == null}, recentCarouselButton is null: ${recentCarouselButton == null}")

        // Setup category carousel
        categoryCarousel?.descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS
        categoryCarousel?.isFocusable = false
        categoryCarousel?.isFocusableInTouchMode = false
        categoryCarouselContainer?.isFocusable = false
        categoryCarouselContainer?.isFocusableInTouchMode = false
        categoryCarouselContainer?.isSmoothScrollingEnabled = true

        // Setup recent carousel
        recentCarousel?.descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS
        recentCarousel?.isFocusable = false
        recentCarousel?.isFocusableInTouchMode = false
        recentCarouselContainer?.isFocusable = false
        recentCarouselContainer?.isFocusableInTouchMode = false
        recentCarouselContainer?.isSmoothScrollingEnabled = true

        android.util.Log.d("NativePlayerActivity", "initializeViews: isVod=$isVod, categoryChannels=${categoryChannels.size}, recentChannels=${recentChannels.size}")

        // Hide carousel buttons initially, they will be shown when channels are received
        categoryCarouselButton?.visibility = android.view.View.GONE
        recentCarouselButton?.visibility = android.view.View.GONE
        
        // Set up click listeners
        categoryCarouselButton?.setOnClickListener {
            android.util.Log.d("NativePlayerActivity", "Category carousel button clicked")
            toggleCategoryCarousel()
        }
        
        recentCarouselButton?.setOnClickListener {
            android.util.Log.d("NativePlayerActivity", "Recent carousel button clicked")
            toggleRecentCarousel()
        }
    }

    private fun initializeControllers(channelName: String) {
        // Resume Manager
        resumeManager = ResumeManager(this@NativePlayerActivity, this, portalIdentifier)

        // EPG Manager
        epgManager = EpgManager(
            lifecycleOwner = this,
            epgCard = findViewById(R.id.epg_card),
            epgCurrentTime = findViewById(R.id.epg_current_time),
            epgCurrentTitle = findViewById(R.id.epg_current_title),
            epgCurrentCategory = findViewById(R.id.epg_current_category),
            epgCurrentProgressText = findViewById(R.id.epg_current_progress_text),
            epgProgressBar = findViewById(R.id.epg_progress_bar),
            epgNextContainer = findViewById(R.id.epg_next_container),
            epgNextTime = findViewById(R.id.epg_next_time),
            epgNextTitle = findViewById(R.id.epg_next_title),
            epgCurrentDesc = findViewById(R.id.epg_current_desc),
            epgNextCategory = findViewById(R.id.epg_next_category),
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
            initialChannelName = channelName,
            onPlayerReady = ::onPlayerReady
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
            seekToBeginningButton = seekToBeginningButton,
            trackSelectButton = findViewById(R.id.track_select_button),
            epgButton = findViewById(R.id.epg_button),
            statusIndicator = findViewById(R.id.status_indicator),
            getDuration = { playerController.player?.duration ?: 0L },
            onSeek = { position ->
                playerController.seekTo(position)
                updateSeekBarFromPlayer()
            },
            onPlayPause = { playerController.togglePlayPause() },
            onSeekForward = { playerController.seekRelative(10000) },
            onSeekBackward = { playerController.seekRelative(-10000) },
            onSeekToBeginning = { playerController.seekTo(0) },
            formatTime = ::formatTime,
            getTrackInfo = { playerController.currentUiState },
            onSelectAudioTrack = { trackId -> playerController.selectAudioTrack(trackId) },
            onSelectSubtitleTrack = { trackId -> playerController.selectSubtitleTrack(trackId) },
            onShowEpg = { showEpgDialog() }
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
            focusPlayPause = { uiController.focusPlayPauseButton() },
            onShowEpg = { showEpgDialog() }
        )

        // Initialize player (prepare is now async in PlayerController)
        playerController.initialize(currentUrl, isVod)
        playerController.setVolume(initialVolume)
        playerView?.player = playerController.player

        // Initialize MediaSession for Android TV integration (async to avoid blocking)
        playerController.player?.let { player ->
            android.util.Log.d("NativePlayerActivity", "Initializing MediaSession in background")
            lifecycleScope.launch {
                mediaSessionManager = MediaSessionManager(this@NativePlayerActivity, player).apply {
                    initialize()
                }
            }
        }

        // Start EPG with initial data if available
        if (epgTitle.isNotEmpty() && epgStart.isNotEmpty() && epgEnd.isNotEmpty()) {
            epgManager.updateEpg(epgTitle, epgStart, epgEnd, epgNextTitle, epgNextStart, epgNextEnd, epgCategory, epgNextCategory, epgDesc)
        }

        // Apply full EPG program list for auto-refresh
        if (epgProgramsJson.isNotEmpty()) {
            epgManager.updateEpgList(epgProgramsJson)
        }

        // Apply buffered EPG from MainActivity (in case update_epg arrived before this activity was created)
        MainActivity.currentInstance?.bufferedEpg?.let { buf ->
            if (buf.isNotEmpty()) {
                android.util.Log.d("NativePlayerActivity", "Applying buffered EPG: title=${buf[0]}")
                epgManager.updateEpg(buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6], buf[7], if (buf.size > 8) buf[8] else "")
                MainActivity.currentInstance?.bufferedEpg = null
            }
        }

        // Apply buffered EPG list from MainActivity
        MainActivity.currentInstance?.bufferedEpgList?.let { json ->
            if (json.isNotEmpty()) {
                android.util.Log.d("NativePlayerActivity", "Applying buffered EPG list")
                epgManager.updateEpgList(json)
                MainActivity.currentInstance?.bufferedEpgList = null
            }
        }

        epgManager.start(isVod)

        // Start auto-hide timer for controls
        uiController.resetHideTimer()
    }

    private fun setupBackButton() {
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isCategoryCarouselVisible) {
                    toggleCategoryCarousel()
                } else if (isRecentCarouselVisible) {
                    toggleRecentCarousel()
                } else {
                    playerController.player?.stop()
                    notifyPlayerClosed()
                    finish()
                }
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
                if (isVod) {
                    // Mark as watched by saving position (ResumeManager sets status to "watched" at 90%+)
                    playerController.player?.let { player ->
                        val duration = player.duration
                        val position = player.currentPosition
                        if (duration > 0) {
                            resumeManager.savePosition(currentUrl, position, duration)
                        }
                    }
                    resumeManager.clearPosition(currentUrl)
                }
                // Auto-play next episode if enabled
                if (autoPlayEpisodes && episodes.isNotEmpty() && currentEpisodeIndex < episodes.size - 1) {
                    playNextEpisode()
                }
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
        uiController.updateSeekToBeginningButtonVisibility(state.isVod)
        uiController.updatePlayPauseButtonVisibility(state.isVod)
        uiController.updateSeekButtonsVisibility(state.isVod)
        uiController.updateEpgButtonVisibility(state.isVod)
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

    private fun showEpgDialog() {
        val epg = epgManager.currentEpg
        val programs = epgManager.getProgramList()

        if (epg == null && programs.isEmpty()) {
            android.util.Log.d("NativePlayerActivity", "showEpgDialog: no EPG data available")
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_epg, null)
        val channelText = dialogView.findViewById<android.widget.TextView>(R.id.epg_dialog_channel)
        val listContainer = dialogView.findViewById<android.widget.LinearLayout>(R.id.epg_dialog_list)

        channelText.text = "EPG - $currentChannelName"

        val now = System.currentTimeMillis() / 1000
        val dayFormat = java.text.SimpleDateFormat("EEE, dd MMM", java.util.Locale.getDefault())
        dayFormat.timeZone = java.util.TimeZone.getDefault()
        val cal = java.util.Calendar.getInstance(java.util.TimeZone.getDefault())

        var currentProgramView: android.view.View? = null
        var lastDayKey = ""

        for (prog in programs) {
            val startSec = prog.start.toLongOrNull() ?: 0L
            val endSec = prog.end.toLongOrNull() ?: 0L

            // Day header
            cal.timeInMillis = startSec * 1000
            val dayKey = dayFormat.format(cal.time)
            if (dayKey != lastDayKey) {
                lastDayKey = dayKey
                val dayHeader = layoutInflater.inflate(R.layout.dialog_epg_day_header, null) as android.widget.TextView
                dayHeader.text = dayKey
                listContainer.addView(dayHeader)
            }

            val itemView = layoutInflater.inflate(R.layout.dialog_epg_item, null)
            val timeText = itemView.findViewById<android.widget.TextView>(R.id.epg_item_time)
            val titleText = itemView.findViewById<android.widget.TextView>(R.id.epg_item_title)
            val descText = itemView.findViewById<android.widget.TextView>(R.id.epg_item_desc)

            val isCurrent = startSec <= now && now < endSec

            timeText.text = "${epgManager.formatUnixTime(startSec)} - ${epgManager.formatUnixTime(endSec)}"
            titleText.text = prog.title

            if (prog.desc.isNotEmpty()) {
                descText.text = prog.desc
                descText.visibility = android.view.View.VISIBLE
            }

            if (isCurrent) {
                itemView.setBackgroundColor(0xFF3B82F6.toInt())
                titleText.setTextColor(0xFFFFFFFF.toInt())
                timeText.setTextColor(0xFFCCCCCC.toInt())
                itemView.isFocusable = true
                itemView.isFocusableInTouchMode = true
                currentProgramView = itemView
            }

            listContainer.addView(itemView)
        }

        if (listContainer.childCount == 0 && epg != null) {
            val itemView = layoutInflater.inflate(R.layout.dialog_epg_item, null)
            val timeText = itemView.findViewById<android.widget.TextView>(R.id.epg_item_time)
            val titleText = itemView.findViewById<android.widget.TextView>(R.id.epg_item_title)
            val descText = itemView.findViewById<android.widget.TextView>(R.id.epg_item_desc)

            timeText.text = "${epg.start} - ${epg.end}"
            titleText.text = epg.title
            if (epg.desc.isNotEmpty()) {
                descText.text = epg.desc
                descText.visibility = android.view.View.VISIBLE
            }
            itemView.setBackgroundColor(0xFF3B82F6.toInt())
            listContainer.addView(itemView)

            if (epg.nextTitle.isNotEmpty()) {
                val nextView = layoutInflater.inflate(R.layout.dialog_epg_item, null)
                val nextTime = nextView.findViewById<android.widget.TextView>(R.id.epg_item_time)
                val nextTitle = nextView.findViewById<android.widget.TextView>(R.id.epg_item_title)
                nextTime.text = "${epg.nextStart} - ${epg.nextEnd}"
                nextTitle.text = epg.nextTitle
                listContainer.addView(nextView)
            }
        }

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .setPositiveButton("OK") { d, _ -> d.dismiss() }
            .create()

        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.setOnDismissListener { uiController.resetHideTimer() }
        dialog.show()

        // Focus and scroll to current program
        currentProgramView?.let { cv ->
            cv.post {
                cv.requestFocus()
                cv.scrollTo(0, 0)
                val scrollView = dialogView.findViewById<android.widget.ScrollView>(R.id.epg_dialog_scroll)
                scrollView?.scrollTo(0, cv.top)
            }
        }

        // Set dialog window size to 80% width, 70% height for TV
        dialog.window?.let { win ->
            val metrics = android.util.DisplayMetrics()
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getMetrics(metrics)
            val params = win.attributes
            params.width = (metrics.widthPixels * 0.8).toInt()
            params.height = (metrics.heightPixels * 0.7).toInt()
            params.gravity = android.view.Gravity.CENTER
            win.attributes = params
        }
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
        currentChannelName = channelName
        addedToRecent = false
        resumeManager.resetResumeLoaded()

        epgManager.resetEpg()

        playerController.changeChannel(url, channelName, isVod)

        if (isVod) epgManager.stop() else epgManager.start(false)
    }

    fun updateEPG(title: String, start: String, end: String, nextTitle: String = "", nextStart: String = "", nextEnd: String = "", category: String = "", nextCategory: String = "", desc: String = "") {
        epgManager.updateEpg(title, start, end, nextTitle, nextStart, nextEnd, category, nextCategory, desc)
    }

    fun updateEpgList(programsJson: String) {
        android.util.Log.d("NativePlayerActivity", "updateEpgList: length=${programsJson.length}")
        epgManager.updateEpgList(programsJson)
    }

    // Called when JS resolves the stream URL after onChannelChange callback
    fun onResolvedUrl(resolvedUrl: String) {
        android.util.Log.d("NativePlayerActivity", "onResolvedUrl: $resolvedUrl, pendingChannelName=$pendingChannelName")
        if (resolvedUrl.isNotEmpty() && pendingChannelName.isNotEmpty()) {
            changeChannel(resolvedUrl, pendingChannelName, isVod = false)
            pendingChannelName = ""
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        android.util.Log.d("NativePlayerActivity", "dispatchKeyEvent: keyCode=${event.keyCode}, action=${event.action}, isCategoryCarouselVisible=$isCategoryCarouselVisible, isRecentCarouselVisible=$isRecentCarouselVisible")

        if (isCategoryCarouselVisible || isRecentCarouselVisible) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                uiController.showControls()
                uiController.resetHideTimer()
            }
            return super.dispatchKeyEvent(event)
        }

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

    private fun notifyPlayerClosed() {
        MainActivity.currentInstance?.pendingPlayerClosed = true
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

    private fun parseEpisodesJson(json: String): List<EpisodeInfo> {
        return try {
            val jsonArray = org.json.JSONArray(json)
            val list = mutableListOf<EpisodeInfo>()
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                list.add(EpisodeInfo(
                    id = obj.optString("id", ""),
                    url = obj.optString("url", ""),
                    name = obj.optString("name", ""),
                    season = obj.optString("season", ""),
                    episode = obj.optString("episode", ""),
                    cmd = obj.optString("cmd", "")
                ))
            }
            list
        } catch (e: Exception) {
            android.util.Log.e("NativePlayerActivity", "Failed to parse episodes JSON: ${e.message}")
            emptyList()
        }
    }

    fun parseChannelsJson(json: String): List<ChannelInfo> {
        return try {
            val jsonArray = org.json.JSONArray(json)
            val list = mutableListOf<ChannelInfo>()
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                list.add(ChannelInfo(
                    id = obj.optString("id", ""),
                    name = obj.optString("name", ""),
                    logo = obj.optString("logo", ""),
                    stream_url = obj.optString("stream_url", ""),
                    cmd = obj.optString("cmd", ""),
                    tv_genre_id = obj.optString("tv_genre_id", "")
                ))
            }
            list
        } catch (e: Exception) {
            android.util.Log.e("NativePlayerActivity", "Failed to parse channels JSON: ${e.message}")
            emptyList()
        }
    }

    private fun toggleCategoryCarousel() {
        isCategoryCarouselVisible = !isCategoryCarouselVisible
        android.util.Log.d("NativePlayerActivity", "toggleCategoryCarousel: visible=$isCategoryCarouselVisible, channels=${categoryChannels.size}")

        // Hide recent carousel when showing category
        if (isCategoryCarouselVisible) {
            isRecentCarouselVisible = false
            recentCarouselContainer?.visibility = android.view.View.GONE
            recentCarouselButton?.backgroundTintList = android.content.res.ColorStateList.valueOf("#40FFFFFF".toColorInt())
        } else {
            // Save scroll position when closing
            categoryCarouselContainer?.let {
                categoryScrollPosition = it.scrollX
            }
        }

        if (isCategoryCarouselVisible) {
            uiController.showControls()
            uiController.pauseAutoHide()

            categoryCarouselContainer?.visibility = android.view.View.VISIBLE

            if (categoryChannels.isEmpty()) {
                android.util.Log.w("NativePlayerActivity", "Category carousel is EMPTY!")
            }

            populateCategoryCarousel()

            categoryCarouselButton?.backgroundTintList =
                android.content.res.ColorStateList.valueOf(
                    "#4CAF50".toColorInt()
                )
        } else {
            categoryCarouselContainer?.visibility = android.view.View.GONE

            uiController.resumeAutoHide()

            categoryCarouselButton?.backgroundTintList =
                android.content.res.ColorStateList.valueOf(
                    "#40FFFFFF".toColorInt()
                )
        }
    }

    private fun toggleRecentCarousel() {
        isRecentCarouselVisible = !isRecentCarouselVisible
        android.util.Log.d("NativePlayerActivity", "toggleRecentCarousel: visible=$isRecentCarouselVisible, channels=${recentChannels.size}")

        // Hide category carousel when showing recent
        if (isRecentCarouselVisible) {
            isCategoryCarouselVisible = false
            categoryCarouselContainer?.visibility = android.view.View.GONE
            categoryCarouselButton?.backgroundTintList = android.content.res.ColorStateList.valueOf("#40FFFFFF".toColorInt())
        } else {
            // Save scroll position when closing
            recentCarouselContainer?.let {
                recentScrollPosition = it.scrollX
            }
        }

        if (isRecentCarouselVisible) {
            uiController.showControls()
            uiController.pauseAutoHide()

            recentCarouselContainer?.visibility = android.view.View.VISIBLE

            if (recentChannels.isEmpty()) {
                android.util.Log.w("NativePlayerActivity", "Recent carousel is EMPTY!")
            }

            populateRecentCarousel()

            recentCarouselButton?.backgroundTintList =
                android.content.res.ColorStateList.valueOf(
                    "#2196F3".toColorInt()
                )
        } else {
            recentCarouselContainer?.visibility = android.view.View.GONE

            uiController.resumeAutoHide()

            recentCarouselButton?.backgroundTintList =
                android.content.res.ColorStateList.valueOf(
                    "#40FFFFFF".toColorInt()
                )
        }
    }

    private fun populateCategoryCarousel() {
        categoryCarousel?.removeAllViews()

        var currentChannelView: android.view.View? = null

        for (channel in categoryChannels) {
            val channelView = createChannelItem(channel)

            if (channel.id == currentChannelId) {
                currentChannelView = channelView
            }

            categoryCarousel?.addView(channelView)
        }

        categoryCarousel?.post {
            // Always focus on current channel
            currentChannelView?.let { view ->
                view.requestFocus()
            }

            // Restore scroll position if carousel was opened before, otherwise scroll to current channel
            if (categoryCarouselOpenedOnce && categoryScrollPosition > 0) {
                categoryCarouselContainer?.scrollTo(categoryScrollPosition, 0)
            } else {
                currentChannelView?.let { view ->
                    val scrollView = categoryCarouselContainer ?: return@post

                    val targetScroll =
                        view.left - (scrollView.width / 2) + (view.width / 2)

                    scrollView.scrollTo(
                        targetScroll.coerceAtLeast(0),
                        0
                    )
                }
                categoryCarouselOpenedOnce = true
            }
        }
    }

    private fun populateRecentCarousel() {
        recentCarousel?.removeAllViews()

        var currentChannelView: android.view.View? = null

        for (channel in recentChannels) {
            val channelView = createChannelItem(channel)

            if (channel.id == currentChannelId) {
                currentChannelView = channelView
            }

            recentCarousel?.addView(channelView)
        }

        recentCarousel?.post {
            // Always focus on current channel
            currentChannelView?.let { view ->
                view.requestFocus()
            }

            // Restore scroll position if carousel was opened before, otherwise scroll to current channel
            if (recentCarouselOpenedOnce && recentScrollPosition > 0) {
                recentCarouselContainer?.scrollTo(recentScrollPosition, 0)
            } else {
                currentChannelView?.let { view ->
                    val scrollView = recentCarouselContainer ?: return@post

                    val targetScroll =
                        view.left - (scrollView.width / 2) + (view.width / 2)

                    scrollView.scrollTo(
                        targetScroll.coerceAtLeast(0),
                        0
                    )
                }
                recentCarouselOpenedOnce = true
            }
        }
    }

    private fun createChannelItem(channel: ChannelInfo): android.view.View {
        val density = resources.displayMetrics.density
        val screenWidth = resources.displayMetrics.widthPixels

        val cardWidth = (screenWidth * 0.14f).toInt()
        val cardHeight = (cardWidth * 1.1f).toInt()

        val container = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL

            setPadding(
                (16 * density).toInt(),
                (16 * density).toInt(),
                (16 * density).toInt(),
                (16 * density).toInt()
            )

            layoutParams = android.widget.LinearLayout.LayoutParams(
                cardWidth,
                cardHeight
            ).apply {
                setMargins(
                    (10 * density).toInt(),
                    (10 * density).toInt(),
                    (10 * density).toInt(),
                    (10 * density).toInt()
                )
            }

            gravity = android.view.Gravity.CENTER

            background = getRoundedDrawable(
                if (channel.id == currentChannelId)
                    "#1F3D2A".toColorInt()
                else
                    "#1E1E1E".toColorInt(),

                if (channel.id == currentChannelId)
                    "#4CAF50".toColorInt()
                else
                    "#2E2E2E".toColorInt(),

                22f
            )

            elevation = 4f

            id = android.view.View.generateViewId()

            isClickable = true
            isFocusable = true
            isFocusableInTouchMode = true

            descendantFocusability = android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS
        }

        val logoSize = (72 * density).toInt()

        val logoContainer = android.widget.FrameLayout(this).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )

            foregroundGravity = android.view.Gravity.CENTER
        }

        val logoView = android.widget.ImageView(this).apply {
            layoutParams = android.widget.FrameLayout.LayoutParams(
                logoSize,
                logoSize,
                android.view.Gravity.CENTER
            )

            scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
            adjustViewBounds = true
            isFocusable = false
        }

        if (!channel.logo.isNullOrEmpty()) {
            com.bumptech.glide.Glide.with(this@NativePlayerActivity)
                .load(channel.logo)
                .placeholder(android.R.drawable.ic_menu_gallery)
                .error(android.R.drawable.ic_menu_gallery)
                .into(logoView)
        } else {
            logoView.setImageResource(android.R.drawable.ic_menu_gallery)
            logoView.setColorFilter(android.graphics.Color.WHITE)
        }

        logoContainer.addView(logoView)

        val nameView = android.widget.TextView(this).apply {
            text = channel.name

            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD

            setTextColor(
                if (channel.id == currentChannelId)
                    "#7CFF8A".toColorInt()
                else
                    android.graphics.Color.WHITE
            )

            gravity = android.view.Gravity.CENTER

            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END

            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = (12 * density).toInt()
            }
        }

        container.addView(logoContainer)
        container.addView(nameView)

        container.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                container.animate()
                    .scaleX(1.08f)
                    .scaleY(1.08f)
                    .setDuration(140)
                    .start()

                container.elevation = 18f

                container.background = getRoundedDrawable(
                    "#2A4735".toColorInt(),
                    "#7CFF8A".toColorInt(),
                    22f
                )

                nameView.setTextColor(
                    "#FFFFFF".toColorInt()
                )
            } else {
                container.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(140)
                    .start()

                container.elevation = 4f

                container.background = getRoundedDrawable(
                    if (channel.id == currentChannelId)
                        "#1F3D2A".toColorInt()
                    else
                        "#1E1E1E".toColorInt(),

                    if (channel.id == currentChannelId)
                        "#4CAF50".toColorInt()
                    else
                        "#2E2E2E".toColorInt(),

                    22f
                )

                nameView.setTextColor(
                    if (channel.id == currentChannelId)
                        "#7CFF8A".toColorInt()
                    else
                        android.graphics.Color.WHITE
                )
            }
        }

        container.setOnClickListener {
            if (channel.id != currentChannelId) {
                handleChannelSelect(channel)
            }
        }

        return container
    }

    private fun handleChannelSelect(channel: ChannelInfo) {
        android.util.Log.d("NativePlayerActivity", "Channel selected: ${channel.name} (id: ${channel.id})")
        android.util.Log.d("NativePlayerActivity", "  cmd: ${channel.cmd}")

        currentChannelId = channel.id
        currentChannelName = channel.name
        currentChannelLogo = channel.logo ?: ""
        currentChannelCmd = channel.cmd ?: ""
        currentChannelGenreId = channel.tv_genre_id ?: ""
        pendingChannelName = channel.name

        // Close whichever carousel is open
        if (isCategoryCarouselVisible) {
            toggleCategoryCarousel()
        } else if (isRecentCarouselVisible) {
            toggleRecentCarousel()
        }

        val cmd = channel.cmd ?: ""
        val id = channel.id
        val name = channel.name
        val genreId = channel.tv_genre_id ?: ""

        // Call JS onChannelChange bridge to resolve URL via create_link
        // JS will call ExoPlayer.set_resolved_url(url) when done
        val js = "if (window.onChannelChange) { window.onChannelChange($id, '$cmd', '$name', '$genreId').then(function(url) { if (window.ExoPlayer && window.ExoPlayer.set_resolved_url) { window.ExoPlayer.set_resolved_url(url); } }); }"
        MainActivity.currentInstance?.webView?.let { webview ->
            runOnUiThread {
                webview.evaluateJavascript(js, null)
            }
        }
    }

    private fun onPlayerReady() {
        android.util.Log.d("NativePlayerActivity", "Player ready, adding to recent viewed")
        
        // Only add to recent if we have full channel info (from carousel selection)
        // Don't add for initial channel opened from UI (missing logo/cmd/genre_id)
        if (!addedToRecent && !isVod && currentChannelId.isNotEmpty() && currentChannelCmd.isNotEmpty()) {
            addRecentViewedViaBridge("live", currentChannelId, currentChannelName, currentChannelLogo, currentChannelCmd, currentChannelGenreId)
            addedToRecent = true
        }

        // Request EPG from JS for the current channel.
        // evaluateJavascript works even when WebView is paused.
        if (!isVod && currentChannelName.isNotEmpty()) {
            val escapedName = currentChannelName.replace("\\", "\\\\").replace("'", "\\'")
            val channelIdNum = currentChannelId.toIntOrNull() ?: 0
            val js = "if (window.onEpgRequest) { window.onEpgRequest($channelIdNum, '$escapedName'); }"
            android.util.Log.d("NativePlayerActivity", "Requesting EPG via JS for channel: $currentChannelName")
            MainActivity.currentInstance?.webView?.let { webview ->
                runOnUiThread {
                    webview.evaluateJavascript(js, null)
                }
            }
        }
    }

    private fun addRecentViewedViaBridge(type: String, itemId: String, name: String, poster: String, cmd: String, genreId: String) {
        android.util.Log.d("NativePlayerActivity", "addRecentViewedViaBridge: type=$type, itemId=$itemId, name=$name")
        
        val mainActivity = MainActivity.currentInstance
        if (mainActivity == null) {
            android.util.Log.e("NativePlayerActivity", "MainActivity instance is null, cannot add recent viewed")
            return
        }
        
        // Escape quotes for JavaScript
        val escapedName = name.replace("\\", "\\\\").replace("'", "\\'")
        val escapedPoster = poster.replace("\\", "\\\\").replace("'", "\\'")
        val escapedCmd = cmd.replace("\\", "\\\\").replace("'", "\\'")
        val escapedGenreId = genreId.replace("\\", "\\\\").replace("'", "\\'")
        
        mainActivity.webView?.evaluateJavascript(
            "window.addRecentViewed('$type', '$itemId', '$escapedName', '$escapedPoster', '$escapedCmd', '$escapedGenreId')",
            null
        )
    }

    private fun getRoundedDrawable(
        backgroundColor: Int,
        borderColor: Int,
        cornerRadius: Float
    ): android.graphics.drawable.Drawable {

        return android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.RECTANGLE

            setColor(backgroundColor)

            setStroke(3, borderColor)

            this.cornerRadius = cornerRadius
        }
    }

    private fun playNextEpisode() {
        val nextIndex = currentEpisodeIndex + 1
        if (nextIndex >= episodes.size) {
            android.util.Log.d("NativePlayerActivity", "No more episodes to play")
            return
        }

        val nextEpisode = episodes[nextIndex]
        currentEpisodeIndex = nextIndex

        android.util.Log.d("NativePlayerActivity", "Auto-playing next episode: ${nextEpisode.name} (index: $currentEpisodeIndex)")

        // Update channel name for UI
        uiController.setChannelName(nextEpisode.name)

        // For episodes with cmd, we need to fetch the stream URL from the server
        // Since ExoPlayer expects a direct URL, we need to close the activity and let JS handle it
        android.util.Log.w("NativePlayerActivity", "Episode requires URL fetching - closing activity to let JS handle it")
        finish()
    }

    fun updateChannelsFromJs(newCategoryChannels: List<ChannelInfo>, newRecentChannels: List<ChannelInfo>) {
        android.util.Log.d("NativePlayerActivity", "updateChannelsFromJs: categoryChannels=${newCategoryChannels.size}, recentChannels=${newRecentChannels.size}")

        // Only update category channels if not empty (don't overwrite with empty array)
        if (newCategoryChannels.isNotEmpty()) {
            categoryChannels = newCategoryChannels
        }

        // Only update recent channels if not empty (don't overwrite with empty array)
        if (newRecentChannels.isNotEmpty()) {
            recentChannels = newRecentChannels
        }

        // Show category button if we have category channels
        if (categoryChannels.isNotEmpty()) {
            categoryCarouselButton?.visibility = android.view.View.VISIBLE
            android.util.Log.d("NativePlayerActivity", "Category carousel button now visible with ${categoryChannels.size} channels")
        }

        // Show recent button if we have recent channels
        if (recentChannels.isNotEmpty()) {
            recentCarouselButton?.visibility = android.view.View.VISIBLE
            android.util.Log.d("NativePlayerActivity", "Recent carousel button now visible with ${recentChannels.size} channels")
        }

        // If category carousel is currently visible, refresh it
        if (isCategoryCarouselVisible) {
            populateCategoryCarousel()
        }

        // If recent carousel is currently visible, refresh it
        if (isRecentCarouselVisible) {
            populateRecentCarousel()
        }
    }
}
