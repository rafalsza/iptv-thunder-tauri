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
    val nextEnd: String = "",
    val category: String = "",
    val nextCategory: String = "",
    val desc: String = ""
)

data class EpgProgram(
    val title: String,
    val start: String,
    val end: String,
    val category: String = "",
    val desc: String = ""
)

class EpgManager(
    private val lifecycleOwner: LifecycleOwner,
    private val epgCard: androidx.cardview.widget.CardView?,
    private val epgCurrentTime: TextView?,
    private val epgCurrentTitle: TextView?,
    private val epgCurrentCategory: TextView?,
    private val epgCurrentProgressText: TextView?,
    private val epgProgressBar: android.widget.ProgressBar?,
    private val epgNextContainer: android.view.View?,
    private val epgNextTime: TextView?,
    private val epgNextTitle: TextView?,
    private val epgCurrentDesc: TextView?,
    private val epgNextCategory: TextView?,
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

    // Full program list for auto-refresh
    private var programList: List<EpgProgram> = emptyList()

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

    fun updateEpg(title: String, start: String, end: String, nextTitle: String = "", nextStart: String = "", nextEnd: String = "", category: String = "", nextCategory: String = "", desc: String = "") {
        // Format raw Unix timestamps to HH:mm strings
        val startStr = formatTimestamp(start)
        val endStr = formatTimestamp(end)
        val nextStartStr = formatTimestamp(nextStart)
        val nextEndStr = formatTimestamp(nextEnd)
        val startMin = parseTimeToMinutes(startStr)
        val endMin = parseTimeToMinutes(endStr)
        // Preserve desc from current EPG if new desc is empty
        val effectiveDesc = if (desc.isNotEmpty()) desc else (currentEpg?.desc ?: "")
        currentEpg = EpgInfo(title, startStr, endStr, startMin, endMin, nextTitle, nextStartStr, nextEndStr, category, nextCategory, effectiveDesc)
        updateProgress()
    }

    private fun formatTimestamp(raw: String): String {
        if (raw.isEmpty()) return raw
        val sec = raw.toLongOrNull() ?: return raw
        return if (sec > 1000000000L) formatUnixTime(sec) else raw
    }

    fun updateEpgList(programsJson: String) {
        try {
            val programs = parseProgramsJson(programsJson)
            programList = programs
            android.util.Log.d("EpgManager", "EPG list updated: ${programs.size} programs")
            selectCurrentProgram()
        } catch (e: Exception) {
            android.util.Log.e("EpgManager", "Failed to parse EPG list JSON", e)
        }
    }

    private fun parseProgramsJson(json: String): List<EpgProgram> {
        val result = mutableListOf<EpgProgram>()
        try {
            val array = org.json.JSONArray(json)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val title = obj.optString("title", "")
                val start = obj.optString("start", "")
                val end = obj.optString("end", "")
                val category = obj.optString("category", "")
                val desc = obj.optString("desc", "")
                if (title.isNotEmpty() && start.isNotEmpty() && end.isNotEmpty()) {
                    result.add(EpgProgram(title, start, end, category, desc))
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("EpgManager", "JSON parse error", e)
        }
        return result
    }

    private fun selectCurrentProgram() {
        if (programList.isEmpty()) return

        val now = System.currentTimeMillis() / 1000

        // Find current program (start <= now < end)
        val current = programList.find { prog ->
            val startSec = prog.start.toLongOrNull() ?: 0L
            val endSec = prog.end.toLongOrNull() ?: 0L
            startSec <= now && now < endSec
        }

        // Find next program (start > now)
        val next = programList.filter { prog ->
            val startSec = prog.start.toLongOrNull() ?: 0L
            startSec > now
        }.minByOrNull { prog ->
            prog.start.toLongOrNull() ?: Long.MAX_VALUE
        }

        if (current != null) {
            val startStr = formatUnixTime(current.start.toLongOrNull() ?: 0L)
            val endStr = formatUnixTime(current.end.toLongOrNull() ?: 0L)
            val nextStartStr = if (next != null) formatUnixTime(next.start.toLongOrNull() ?: 0L) else ""
            val nextEndStr = if (next != null) formatUnixTime(next.end.toLongOrNull() ?: 0L) else ""
            updateEpg(current.title, startStr, endStr,
                next?.title ?: "", nextStartStr, nextEndStr,
                current.category, next?.category ?: "", current.desc)
            android.util.Log.d("EpgManager", "Auto-selected current: ${current.title}, next: ${next?.title ?: "none"}")
        } else if (next != null) {
            // No current program, show next as upcoming
            val nextStartStr = formatUnixTime(next.start.toLongOrNull() ?: 0L)
            val nextEndStr = formatUnixTime(next.end.toLongOrNull() ?: 0L)
            updateEpg("", "", "", next.title, nextStartStr, nextEndStr, "", next.category)
        }
    }

    fun formatUnixTime(unixSecs: Long): String {
        val sdf = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
        sdf.timeZone = java.util.TimeZone.getDefault()
        return sdf.format(java.util.Date(unixSecs * 1000))
    }

    fun resetEpg() {
        currentEpg = null
        epgCard?.visibility = android.view.View.GONE
    }

    fun getProgramList(): List<EpgProgram> = programList

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

            epgCard?.post {
                epgCard.visibility = View.VISIBLE
                epgCurrentTime?.text = formatTime(position)
                epgCurrentTitle?.text = "Video Playback"
                epgCurrentCategory?.visibility = View.GONE
                epgCurrentProgressText?.text = "${String.format("%.0f%%", progress)}"
                epgProgressBar?.progress = progress.toInt()
                epgNextContainer?.visibility = View.GONE
            }
            return
        }

        // Live TV EPG
        epg?.let { info ->
            // Get current time in minutes since midnight (not since epoch)
            val calendar = java.util.Calendar.getInstance()
            val now = calendar.get(java.util.Calendar.HOUR_OF_DAY) * 60 + calendar.get(java.util.Calendar.MINUTE)
            val startMin = info.startMin
            val endMin = info.endMin

            val progress = if (startMin == 0 || endMin == 0) {
                0f
            } else {
                val adjustedEndMin = if (endMin < startMin) endMin + 24 * 60 else endMin
                val adjustedNow = if (now < startMin && endMin < startMin) now + 24 * 60 else now

                when {
                    adjustedNow >= startMin && adjustedNow <= adjustedEndMin ->
                        ((adjustedNow - startMin).toFloat() / (adjustedEndMin - startMin)) * 100
                    adjustedNow > adjustedEndMin -> 100f
                    else -> 0f
                }.coerceIn(0f, 100f)
            }

            epgCard?.post {
                epgCard.visibility = View.VISIBLE

                // Current program
                epgCurrentTime?.text = info.start
                epgCurrentTitle?.text = info.title

                if (info.category.isNotEmpty()) {
                    epgCurrentCategory?.text = info.category
                    epgCurrentCategory?.visibility = View.VISIBLE
                } else {
                    epgCurrentCategory?.visibility = View.GONE
                }

                if (info.desc.isNotEmpty()) {
                    epgCurrentDesc?.text = info.desc
                    epgCurrentDesc?.visibility = View.VISIBLE
                } else {
                    epgCurrentDesc?.visibility = View.GONE
                }

                epgCurrentProgressText?.text = "${String.format("%.0f%%", progress)}"
                epgProgressBar?.progress = progress.toInt()

                // Next program
                if (info.nextTitle.isNotEmpty()) {
                    epgNextContainer?.visibility = View.VISIBLE
                    epgNextTime?.text = info.nextStart
                    epgNextTitle?.text = info.nextTitle

                    if (info.nextCategory.isNotEmpty()) {
                        epgNextCategory?.text = info.nextCategory
                        epgNextCategory?.visibility = View.VISIBLE
                    } else {
                        epgNextCategory?.visibility = View.GONE
                    }
                } else {
                    epgNextContainer?.visibility = View.GONE
                }
            }
        }
    }

    private suspend fun refreshEpg() {
        // Auto-select current/next program from the stored program list
        if (programList.isNotEmpty()) {
            selectCurrentProgram()
            android.util.Log.d("EpgManager", "EPG auto-refreshed from program list (${programList.size} programs)")
        }
    }

    fun release() {
        epgJob?.cancel()
        progressJob?.cancel()
        epgJob = null
        progressJob = null
    }
}
