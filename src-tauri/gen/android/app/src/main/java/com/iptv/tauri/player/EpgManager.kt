package com.iptv.tauri.player

import android.view.View
import android.widget.TextView
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.C
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

class EpgManager(
    private val lifecycleOwner: LifecycleOwner,
    private val epgTextView: TextView?,
    private val getPlayerPosition: () -> Long,
    private val getPlayerDuration: () -> Long,
    private val isLive: () -> Boolean,
    private val formatTime: (Long) -> String
) {
    companion object {
        private const val EPG_REFRESH_INTERVAL_MS = 60_000L
        private const val PROGRESS_UPDATE_INTERVAL_MS = 1000L
    }

    @Volatile
    var currentEpg: EpgInfo? = null
        private set

    private var epgJob: Job? = null
    private var progressJob: Job? = null

    fun start(isVod: Boolean) {
        stop() // Cancel any existing jobs

        progressJob = lifecycleOwner.lifecycleScope.launch {
            while (isActive) {
                updateProgress()
                delay(PROGRESS_UPDATE_INTERVAL_MS)
            }
        }

        if (!isVod) {
            epgJob = lifecycleOwner.lifecycleScope.launch {
                while (isActive) {
                    refreshEpg()
                    delay(EPG_REFRESH_INTERVAL_MS)
                }
            }
        }
    }

    fun stop() {
        epgJob?.cancel()
        epgJob = null
    }

    fun updateEpg(title: String, start: String, end: String, nextTitle: String = "", nextStart: String = "", nextEnd: String = "") {
        val startMin = parseTimeToMinutes(start)
        val endMin = parseTimeToMinutes(end)
        currentEpg = EpgInfo(title, start, end, startMin, endMin, nextTitle, nextStart, nextEnd)
        updateProgress()
    }

    fun resetEpg() {
        currentEpg = null
        epgTextView?.text = "Loading program..."
    }

    private fun parseTimeToMinutes(time: String): Int {
        return try {
            val parts = time.split(":")
            if (parts.size == 2) {
                val hours = parts[0].toInt()
                val minutes = parts[1].toInt()
                hours * 60 + minutes
            } else 0
        } catch (e: Exception) {
            0
        }
    }

    fun updateProgress() {
        val epg = currentEpg
        val duration = getPlayerDuration()
        val position = getPlayerPosition()

        // VOD progress
        if (duration > 0 && duration != C.TIME_UNSET && !isLive()) {
            val progress = ((position.toFloat() / duration) * 100).coerceIn(0f, 100f)
            val display = "${String.format("%.0f%%", progress)}"

            epgTextView?.post {
                epgTextView.text = display
                epgTextView.visibility = View.VISIBLE
            }
            return
        }

        // Live TV EPG
        epg?.let { info ->
            val now = (System.currentTimeMillis() / 60000).toInt()
            val startMin = info.startMin
            val endMin = info.endMin

            if (startMin == 0 || endMin == 0) {
                val display = if (info.nextTitle.isNotEmpty()) {
                    "${info.start} ${info.title}\n${info.nextStart} ${info.nextTitle}"
                } else {
                    "${info.start} - ${info.end}  ${info.title}"
                }
                epgTextView?.post {
                    epgTextView.text = display
                    epgTextView.visibility = View.VISIBLE
                }
                return
            }

            val adjustedEndMin = if (endMin < startMin) endMin + 24 * 60 else endMin
            val adjustedNow = if (now < startMin && endMin < startMin) now + 24 * 60 else now

            val progress = when {
                adjustedNow >= startMin && adjustedNow <= adjustedEndMin ->
                    ((adjustedNow - startMin).toFloat() / (adjustedEndMin - startMin)) * 100
                adjustedNow > adjustedEndMin -> 100f
                else -> 0f
            }.coerceIn(0f, 100f)

            val progressBar = "█".repeat((progress / 5).toInt()) + "░".repeat(20 - (progress / 5).toInt())
            val progressText = String.format("%.0f%%", progress)

            val display = if (info.nextTitle.isNotEmpty()) {
                "${info.start} ${info.title} $progressBar $progressText\n${info.nextStart} ${info.nextTitle}"
            } else {
                "${info.start} ${info.title}  $progressBar $progressText"
            }

            epgTextView?.post {
                epgTextView.text = display
                epgTextView.visibility = View.VISIBLE
            }
        }
    }

    private suspend fun refreshEpg() {
        // EPG refresh with IO dispatcher for network operations
        try {
            val channel = epgTextView?.tag as? String ?: return

            val epg = withContext(Dispatchers.IO) {
                // TODO: Actual API call here
                fetchEpgForChannel(channel)
            }

            withContext(Dispatchers.Main) {
                updateEpg(epg.title, epg.start, epg.end, epg.nextTitle, epg.nextStart, epg.nextEnd)
            }
        } catch (e: Exception) {
            android.util.Log.e("EpgManager", "Failed to refresh EPG", e)
        }
    }

    private fun fetchEpgForChannel(channel: String): EpgInfo {
        // TODO: Replace with actual API implementation
        // This is a placeholder that returns mock data
        val now = System.currentTimeMillis()
        val startMin = ((now / 60000) - 30).toInt()
        val endMin = ((now / 60000) + 30).toInt()

        return EpgInfo(
            title = "Current Program",
            start = String.format("%02d:%02d", (startMin / 60) % 24, startMin % 60),
            end = String.format("%02d:%02d", (endMin / 60) % 24, endMin % 60),
            startMin = startMin,
            endMin = endMin
        )
    }

    fun release() {
        epgJob?.cancel()
        progressJob?.cancel()
        epgJob = null
        progressJob = null
    }
}
