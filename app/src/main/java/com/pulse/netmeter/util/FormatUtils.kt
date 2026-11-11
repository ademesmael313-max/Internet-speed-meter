package com.pulse.netmeter.util

import com.pulse.netmeter.model.SpeedUnit
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow

object FormatUtils {

    fun bytesToMbps(bytes: Long, seconds: Double): Double {
        if (seconds <= 0.0 || bytes <= 0L) return 0.0
        return (bytes.toDouble() * 8.0) / (seconds * 1_000_000.0)
    }

    fun convertFromMbps(mbps: Double, unit: SpeedUnit): Double {
        return when (unit) {
            SpeedUnit.MBPS -> mbps
            SpeedUnit.MB_PER_SEC -> mbps / 8.0
        }
    }

    fun formatSpeedValue(mbps: Double, unit: SpeedUnit = SpeedUnit.MBPS): String {
        val v = convertFromMbps(mbps, unit)
        if (!v.isFinite() || v < 0.0) return "0.00"
        return when {
            v >= 100.0 -> String.format(Locale.US, "%.1f", v)
            else -> String.format(Locale.US, "%.2f", v)
        }
    }

    /**
     * Formats byte-per-second throughput into a compact (value, unit) pair
     * ideal for status-bar icons and compact notification badges.
     */
    fun formatRateCompact(bytesPerSec: Long): Pair<String, String> {
        val safe = bytesPerSec.coerceAtLeast(0L)
        return when {
            safe < 1024L -> "$safe" to "B/s"
            safe < 1024L * 1000L -> {
                val kb = safe / 1024.0
                val num = if (kb >= 100.0) {
                    String.format(Locale.US, "%.0f", kb)
                } else if (kb >= 10.0) {
                    String.format(Locale.US, "%.1f", kb)
                } else {
                    String.format(Locale.US, "%.1f", kb)
                }
                num to "KB/s"
            }
            else -> {
                val mb = safe / (1024.0 * 1024.0)
                val num = if (mb >= 100.0) {
                    String.format(Locale.US, "%.0f", mb)
                } else {
                    String.format(Locale.US, "%.1f", mb)
                }
                num to "MB/s"
            }
        }
    }

    fun formatBytes(bytes: Long): String {
        val safe = bytes.coerceAtLeast(0L)
        if (safe < 1024L) return "$safe B"
        val units = arrayOf("KB", "MB", "GB", "TB")
        var value = safe / 1024.0
        var idx = 0
        while (value >= 1024.0 && idx < units.lastIndex) {
            value /= 1024.0
            idx++
        }
        return String.format(Locale.US, "%.2f %s", value, units[idx])
    }

    fun computeJitter(samplesMs: List<Double>): Double {
        if (samplesMs.size < 2) return 0.0
        var sum = 0.0
        for (i in 1 until samplesMs.size) {
            sum += abs(samplesMs[i] - samplesMs[i - 1])
        }
        return sum / (samplesMs.size - 1)
    }

    fun bufferbloatGrade(idlePingMs: Double, loadedPingMs: Double): String {
        val delta = loadedPingMs - idlePingMs
        return when {
            delta < 5.0 -> "A"
            delta < 15.0 -> "B"
            delta < 30.0 -> "C"
            delta < 60.0 -> "D"
            else -> "F"
        }
    }

    fun gaugeScaleMax(mbps: Double): Double {
        if (mbps <= 10.0) return 50.0
        val pow = 10.0.pow(floor(log10(mbps)))
        val norm = mbps / pow
        val step = when {
            norm <= 1.0 -> 1.0
            norm <= 2.0 -> 2.0
            norm <= 5.0 -> 5.0
            else -> 10.0
        }
        return (step * pow).coerceAtLeast(50.0)
    }

    fun formatTimestamp(epochMs: Long): String {
        val sdf = SimpleDateFormat("MMM d, HH:mm:ss", Locale.getDefault())
        return sdf.format(Date(epochMs))
    }

    fun readinessSummary(dlMbps: Double, pingMs: Double, grade: String): String {
        return when {
            dlMbps >= 50.0 && pingMs <= 40.0 && (grade == "A" || grade == "B") ->
                "Optimal for 4K HDR streaming, competitive gaming & HD calls"
            dlMbps >= 25.0 ->
                "Great for 1080p/4K streaming, video calls & fast downloads"
            dlMbps >= 8.0 ->
                "Good for HD video, browsing & standard voice/video calls"
            dlMbps > 0.0 ->
                "Basic connectivity — best for messaging & light browsing"
            else ->
                "Run a speed test to evaluate link suitability"
        }
    }
}
