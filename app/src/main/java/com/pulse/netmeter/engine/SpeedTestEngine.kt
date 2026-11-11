package com.pulse.netmeter.engine

import android.os.SystemClock
import com.pulse.netmeter.model.SeriesSample
import com.pulse.netmeter.util.FormatUtils
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

class SpeedTestEngine {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .dispatcher(
            Dispatcher().apply {
                maxRequests = 32
                maxRequestsPerHost = 16
            }
        )
        .connectionPool(ConnectionPool(16, 2, TimeUnit.MINUTES))
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    // Pre-allocated 32 KB high-entropy incompressible random chunk
    private val randomChunk = ByteArray(32 * 1024).also { SecureRandom().nextBytes(it) }

    data class PingStats(
        val samplesMs: List<Double>,
        val avgMs: Double,
        val minMs: Double,
        val jitterMs: Double,
        val lossPct: Double
    )

    data class ThroughputStats(
        val sustainedMbps: Double,
        val peakMbps: Double,
        val totalBytes: Long,
        val loadedPingMs: Double,
        val series: List<SeriesSample>
    )

    private fun resolveEndpoints(customBaseUrl: String): Triple<String, String, String> {
        val trimmed = customBaseUrl.trim().trimEnd('/')
        return if (trimmed.isNotEmpty()) {
            Triple(
                "$trimmed/api/speedtest/ping",
                "$trimmed/api/speedtest/download",
                "$trimmed/api/speedtest/upload"
            )
        } else {
            Triple(
                "https://speed.cloudflare.com/__down?bytes=0",
                "https://speed.cloudflare.com/__down",
                "https://speed.cloudflare.com/__up"
            )
        }
    }

    fun serverDisplayName(customBaseUrl: String): String {
        val trimmed = customBaseUrl.trim()
        return if (trimmed.isNotEmpty()) trimmed else "Cloudflare Global Edge"
    }

    suspend fun pingOnce(customBaseUrl: String = ""): Double? = withContext(Dispatchers.IO) {
        val (pingBase, _, _) = resolveEndpoints(customBaseUrl)
        val sep = if (pingBase.contains("?")) "&" else "?"
        val url = "$pingBase${sep}nocache=${System.nanoTime()}"
        val req = Request.Builder()
            .url(url)
            .header("Cache-Control", "no-store")
            .get()
            .build()

        runCatching {
            val t0 = SystemClock.elapsedRealtimeNanos()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@runCatching null
                resp.body?.bytes()
            }
            (SystemClock.elapsedRealtimeNanos() - t0) / 1_000_000.0
        }.getOrNull()
    }

    suspend fun measurePing(
        count: Int = 10,
        customBaseUrl: String = "",
        onSample: (ms: Double?, index: Int, total: Int) -> Unit = { _, _, _ -> }
    ): PingStats = withContext(Dispatchers.IO) {
        // Warm up TCP + TLS connection first so handshake doesn't skew latency
        pingOnce(customBaseUrl)

        val samples = mutableListOf<Double>()
        var failures = 0
        for (i in 1..count) {
            val ms = pingOnce(customBaseUrl)
            if (ms != null) {
                samples.add(ms)
            } else {
                failures++
            }
            onSample(ms, i, count)
            delay(50L)
        }
        val attempts = samples.size + failures
        PingStats(
            samplesMs = samples,
            avgMs = if (samples.isNotEmpty()) samples.average() else 0.0,
            minMs = samples.minOrNull() ?: 0.0,
            jitterMs = FormatUtils.computeJitter(samples),
            lossPct = if (attempts > 0) (failures.toDouble() / attempts.toDouble()) * 100.0 else 100.0
        )
    }

    suspend fun measureDownload(
        streams: Int,
        durationSec: Int,
        customBaseUrl: String = "",
        onProgress: (mbps: Double, totalBytes: Long, fraction: Float) -> Unit
    ): ThroughputStats = coroutineScope {
        val (_, dlBase, _) = resolveEndpoints(customBaseUrl)
        val totalBytes = AtomicLong(0L)
        val startMs = SystemClock.elapsedRealtime()
        val endMs = startMs + durationSec * 1000L
        val series = mutableListOf<SeriesSample>()
        val loadedPings = mutableListOf<Double>()
        var peakMbps = 0.0

        val activeCalls = java.util.Collections.synchronizedList(mutableListOf<okhttp3.Call>())

        val workers = (0 until streams).map { streamIdx ->
            async(Dispatchers.IO) {
                val buf = ByteArray(32 * 1024)
                var reqCount = 0
                while (isActive && SystemClock.elapsedRealtime() < endMs) {
                    val chunkBytes = if (reqCount == 0) 8 * 1024 * 1024 else 25 * 1024 * 1024
                    reqCount++
                    val sep = if (dlBase.contains("?")) "&" else "?"
                    val url = "$dlBase${sep}bytes=$chunkBytes&s=$streamIdx&n=${System.nanoTime()}"
                    val req = Request.Builder()
                        .url(url)
                        .header("Cache-Control", "no-store")
                        .header("Accept-Encoding", "identity")
                        .get()
                        .build()
                    val call = client.newCall(req)
                    activeCalls.add(call)
                    try {
                        call.execute().use { resp ->
                            val stream = resp.body?.byteStream() ?: return@use
                            while (isActive && SystemClock.elapsedRealtime() < endMs) {
                                val read = stream.read(buf)
                                if (read == -1) break
                                totalBytes.addAndGet(read.toLong())
                            }
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // Stream cancelled at deadline or transient reset
                    } finally {
                        activeCalls.remove(call)
                    }
                }
            }
        }

        val pingJob = launch(Dispatchers.IO) {
            while (isActive && SystemClock.elapsedRealtime() < endMs) {
                delay(500L)
                pingOnce(customBaseUrl)?.let { synchronized(loadedPings) { loadedPings.add(it) } }
            }
        }

        val snapshots = ArrayDeque<Pair<Long, Long>>()
        snapshots.addLast(startMs to 0L)

        while (isActive && SystemClock.elapsedRealtime() < endMs) {
            delay(140L)
            val now = SystemClock.elapsedRealtime()
            val bytes = totalBytes.get()
            snapshots.addLast(now to bytes)
            while (snapshots.size > 2 && now - snapshots.first().first > 900L) {
                snapshots.removeFirst()
            }
            val dtSec = ((now - snapshots.first().first) / 1000.0).coerceAtLeast(0.08)
            val dBytes = (bytes - snapshots.first().second).coerceAtLeast(0L)
            val instantMbps = FormatUtils.bytesToMbps(dBytes, dtSec)
            peakMbps = maxOf(peakMbps, instantMbps)
            val relSec = (now - startMs) / 1000f
            series.add(SeriesSample(relSec, instantMbps))
            val frac = ((now - startMs).toFloat() / (durationSec * 1000f)).coerceIn(0f, 1f)
            onProgress(instantMbps, bytes, frac)
        }

        synchronized(activeCalls) {
            activeCalls.forEach { runCatching { it.cancel() } }
        }
        pingJob.cancel()
        workers.awaitAll()

        val totalSec = ((SystemClock.elapsedRealtime() - startMs) / 1000.0).coerceAtLeast(0.1)
        val finalBytes = totalBytes.get()
        val overallMbps = FormatUtils.bytesToMbps(finalBytes, totalSec)
        val steady = series.drop((series.size * 0.2).toInt()).map { it.mbps }
        val sustained = if (steady.size >= 3) steady.average() else overallMbps
        val loadedAvg = synchronized(loadedPings) {
            if (loadedPings.isNotEmpty()) loadedPings.average() else 0.0
        }

        ThroughputStats(
            sustainedMbps = sustained,
            peakMbps = maxOf(peakMbps, sustained),
            totalBytes = finalBytes,
            loadedPingMs = loadedAvg,
            series = series
        )
    }

    suspend fun measureUpload(
        streams: Int,
        durationSec: Int,
        customBaseUrl: String = "",
        onProgress: (mbps: Double, totalBytes: Long, fraction: Float) -> Unit
    ): ThroughputStats = coroutineScope {
        val (_, _, ulBase) = resolveEndpoints(customBaseUrl)
        val totalBytes = AtomicLong(0L)
        val startMs = SystemClock.elapsedRealtime()
        val endMs = startMs + durationSec * 1000L
        val series = mutableListOf<SeriesSample>()
        val loadedPings = mutableListOf<Double>()
        var peakMbps = 0.0

        val activeCalls = java.util.Collections.synchronizedList(mutableListOf<okhttp3.Call>())
        val mediaType = "application/octet-stream".toMediaType()

        val workers = (0 until streams).map {
            async(Dispatchers.IO) {
                var burstBytes = 512 * 1024L // Start 512 KB, scale up to 2 MB
                while (isActive && SystemClock.elapsedRealtime() < endMs) {
                    val currentBurst = burstBytes
                    val body = object : RequestBody() {
                        override fun contentType(): MediaType = mediaType
                        override fun contentLength(): Long = currentBurst
                        override fun writeTo(sink: BufferedSink) {
                            var remaining = currentBurst
                            while (remaining > 0L && SystemClock.elapsedRealtime() < endMs + 400L) {
                                val toWrite = minOf(remaining, randomChunk.size.toLong()).toInt()
                                sink.write(randomChunk, 0, toWrite)
                                sink.flush()
                                totalBytes.addAndGet(toWrite.toLong())
                                remaining -= toWrite.toLong()
                            }
                        }
                    }
                    val sep = if (ulBase.contains("?")) "&" else "?"
                    val req = Request.Builder()
                        .url("$ulBase${sep}n=${System.nanoTime()}")
                        .header("Cache-Control", "no-store")
                        .post(body)
                        .build()

                    val call = client.newCall(req)
                    activeCalls.add(call)
                    val t0 = SystemClock.elapsedRealtime()
                    try {
                        call.execute().use { resp -> resp.body?.close() }
                        if (SystemClock.elapsedRealtime() - t0 < 300L && burstBytes < 2 * 1024 * 1024L) {
                            burstBytes *= 2L
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        // Cancelled at deadline
                    } finally {
                        activeCalls.remove(call)
                    }
                }
            }
        }

        val pingJob = launch(Dispatchers.IO) {
            while (isActive && SystemClock.elapsedRealtime() < endMs) {
                delay(500L)
                pingOnce(customBaseUrl)?.let { synchronized(loadedPings) { loadedPings.add(it) } }
            }
        }

        val snapshots = ArrayDeque<Pair<Long, Long>>()
        snapshots.addLast(startMs to 0L)

        while (isActive && SystemClock.elapsedRealtime() < endMs) {
            delay(140L)
            val now = SystemClock.elapsedRealtime()
            val bytes = totalBytes.get()
            snapshots.addLast(now to bytes)
            while (snapshots.size > 2 && now - snapshots.first().first > 900L) {
                snapshots.removeFirst()
            }
            val dtSec = ((now - snapshots.first().first) / 1000.0).coerceAtLeast(0.08)
            val dBytes = (bytes - snapshots.first().second).coerceAtLeast(0L)
            val instantMbps = FormatUtils.bytesToMbps(dBytes, dtSec)
            peakMbps = maxOf(peakMbps, instantMbps)
            val relSec = (now - startMs) / 1000f
            series.add(SeriesSample(relSec, instantMbps))
            val frac = ((now - startMs).toFloat() / (durationSec * 1000f)).coerceIn(0f, 1f)
            onProgress(instantMbps, bytes, frac)
        }

        synchronized(activeCalls) {
            activeCalls.forEach { runCatching { it.cancel() } }
        }
        pingJob.cancel()
        workers.awaitAll()

        val totalSec = ((SystemClock.elapsedRealtime() - startMs) / 1000.0).coerceAtLeast(0.1)
        val finalBytes = totalBytes.get()
        val overallMbps = FormatUtils.bytesToMbps(finalBytes, totalSec)
        val steady = series.drop((series.size * 0.2).toInt()).map { it.mbps }
        val sustained = if (steady.size >= 3) steady.average() else overallMbps
        val loadedAvg = synchronized(loadedPings) {
            if (loadedPings.isNotEmpty()) loadedPings.average() else 0.0
        }

        ThroughputStats(
            sustainedMbps = sustained,
            peakMbps = maxOf(peakMbps, sustained),
            totalBytes = finalBytes,
            loadedPingMs = loadedAvg,
            series = series
        )
    }
}
