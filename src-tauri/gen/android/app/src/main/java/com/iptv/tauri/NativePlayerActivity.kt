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
    private var channelCarouselButton: com.google.android.material.button.MaterialButton? = null
    private var channelCarouselContainer: android.widget.HorizontalScrollView? = null
    private var channelCarousel: android.widget.LinearLayout? = null

    // State
    private var isVod = false
    private var currentUrl = ""
    private var portalIdentifier = ""

    // Episode data for auto-play
    private var episodes: List<EpisodeInfo> = emptyList()
    private var currentEpisodeIndex = 0
    private var autoPlayEpisodes = true

    // EPG data
    private var epgTitle = ""
    private var epgStart = ""
    private var epgEnd = ""
    private var epgNextTitle = ""
    private var epgNextStart = ""
    private var epgNextEnd = ""

    // Channel data for carousel
    private var categoryChannels: List<ChannelInfo> = emptyList()
    private var currentChannelId: String = ""
    private var isCarouselVisible = false

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
        val cmd: String?
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
        android.util.Log.d("NativePlayerActivity", "channelsJson length: ${channelsJson.length}")
        categoryChannels = parseChannelsJson(channelsJson)
        android.util.Log.d("NativePlayerActivity", "Category channels loaded: ${categoryChannels.size}, isVod: $isVod")

        // Parse EPG data
        epgTitle = intent.getStringExtra("epgTitle") ?: ""
        epgStart = intent.getStringExtra("epgStart") ?: ""
        epgEnd = intent.getStringExtra("epgEnd") ?: ""
        epgNextTitle = intent.getStringExtra("epgNextTitle") ?: ""
        epgNextStart = intent.getStringExtra("epgNextStart") ?: ""
        epgNextEnd = intent.getStringExtra("epgNextEnd") ?: ""
        android.util.Log.d("NativePlayerActivity", "EPG data: title=$epgTitle, start=$epgStart, end=$epgEnd")

        initializeViews()
        initializeControllers(channelName)
        setupBackButton()
    }

    private fun initializeViews() {
        playerView = findViewById(R.id.player_view)
        progressBar = findViewById(R.id.loading_spinner)
        channelCarouselButton = findViewById(R.id.channel_carousel_button)
        channelCarouselContainer = findViewById(R.id.channel_carousel_container)
        channelCarousel = findViewById(R.id.channel_carousel)

        channelCarousel?.descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS
        channelCarousel?.isFocusable = false
        channelCarousel?.isFocusableInTouchMode = false
        channelCarouselContainer?.isFocusable = false
        channelCarouselContainer?.isFocusableInTouchMode = false
        channelCarouselContainer?.isSmoothScrollingEnabled = true

        android.util.Log.d("NativePlayerActivity", "initializeViews: isVod=$isVod, channelsCount=${categoryChannels.size}")

        // Show channel carousel button for live TV with available channels
        if (!isVod && categoryChannels.isNotEmpty()) {
            android.util.Log.d("NativePlayerActivity", "Showing channel carousel button")
            channelCarouselButton?.visibility = android.view.View.VISIBLE
            channelCarouselButton?.setOnClickListener {
                toggleChannelCarousel()
            }
        } else {
            android.util.Log.d("NativePlayerActivity", "NOT showing channel carousel button - isVod=$isVod, channelsCount=${categoryChannels.size}")
        }
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

        // Start EPG with initial data if available
        if (epgTitle.isNotEmpty() && epgStart.isNotEmpty() && epgEnd.isNotEmpty()) {
            epgManager.updateEpg(epgTitle, epgStart, epgEnd, epgNextTitle, epgNextStart, epgNextEnd)
        }
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
        android.util.Log.d("NativePlayerActivity", "dispatchKeyEvent: keyCode=${event.keyCode}, action=${event.action}, isCarouselVisible=$isCarouselVisible")

        if (isCarouselVisible) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                uiController.showControls()
                uiController.resetHideTimer()

                when (event.keyCode) {
                    KeyEvent.KEYCODE_BACK -> {
                        toggleChannelCarousel()
                        return true
                    }
                }
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

    private fun parseChannelsJson(json: String): List<ChannelInfo> {
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
                    cmd = obj.optString("cmd", "")
                ))
            }
            list
        } catch (e: Exception) {
            android.util.Log.e("NativePlayerActivity", "Failed to parse channels JSON: ${e.message}")
            emptyList()
        }
    }

    private fun toggleChannelCarousel() {
        isCarouselVisible = !isCarouselVisible

        if (isCarouselVisible) {
            uiController.showControls()
            uiController.pauseAutoHide()

            channelCarouselContainer?.visibility = android.view.View.VISIBLE
            populateChannelCarousel()

            channelCarouselButton?.setBackgroundTintList(
                android.content.res.ColorStateList.valueOf(
                    android.graphics.Color.parseColor("#4CAF50")
                )
            )
        } else {
            channelCarouselContainer?.visibility = android.view.View.GONE

            uiController.resumeAutoHide()

            channelCarouselButton?.setBackgroundTintList(
                android.content.res.ColorStateList.valueOf(
                    android.graphics.Color.parseColor("#40FFFFFF")
                )
            )
        }
    }

    private fun populateChannelCarousel() {
        channelCarousel?.removeAllViews()

        var currentChannelView: android.view.View? = null

        for (channel in categoryChannels) {
            val channelView = createChannelItem(channel)

            if (channel.id == currentChannelId) {
                currentChannelView = channelView
            }

            channelCarousel?.addView(channelView)
        }

        channelCarousel?.post {
            currentChannelView?.let { view ->
                view.requestFocus()

                val scrollView = channelCarouselContainer ?: return@post

                val targetScroll =
                    view.left - (scrollView.width / 2) + (view.width / 2)

                scrollView.scrollTo(
                    targetScroll.coerceAtLeast(0),
                    0
                )
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
                    android.graphics.Color.parseColor("#1F3D2A")
                else
                    android.graphics.Color.parseColor("#1E1E1E"),

                if (channel.id == currentChannelId)
                    android.graphics.Color.parseColor("#4CAF50")
                else
                    android.graphics.Color.parseColor("#2E2E2E"),

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
                    android.graphics.Color.parseColor("#7CFF8A")
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
                    android.graphics.Color.parseColor("#2A4735"),
                    android.graphics.Color.parseColor("#7CFF8A"),
                    22f
                )

                nameView.setTextColor(
                    android.graphics.Color.parseColor("#FFFFFF")
                )

                container.post {
                    val scrollView = channelCarouselContainer ?: return@post

                    val targetScroll =
                        container.left - (scrollView.width / 2) + (container.width / 2)

                    scrollView.smoothScrollTo(
                        targetScroll.coerceAtLeast(0),
                        0
                    )
                }
            } else {
                container.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(140)
                    .start()

                container.elevation = 4f

                container.background = getRoundedDrawable(
                    if (channel.id == currentChannelId)
                        android.graphics.Color.parseColor("#1F3D2A")
                    else
                        android.graphics.Color.parseColor("#1E1E1E"),

                    if (channel.id == currentChannelId)
                        android.graphics.Color.parseColor("#4CAF50")
                    else
                        android.graphics.Color.parseColor("#2E2E2E"),

                    22f
                )

                nameView.setTextColor(
                    if (channel.id == currentChannelId)
                        android.graphics.Color.parseColor("#7CFF8A")
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
        android.util.Log.d("NativePlayerActivity", "  stream_url: ${channel.stream_url}")

        // Since URLs are resolved in React, use stream_url directly
        val url = channel.stream_url

        android.util.Log.d("NativePlayerActivity", "  Using URL: $url")

        if (url != null && url.isNotEmpty()) {
            android.util.Log.d("NativePlayerActivity", "  Calling changeChannel with URL")
            currentChannelId = channel.id
            changeChannel(url, channel.name, isVod = false)
            toggleChannelCarousel()
        } else {
            android.util.Log.w("NativePlayerActivity", "Channel has no stream URL - cannot change channel")
        }
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
}
