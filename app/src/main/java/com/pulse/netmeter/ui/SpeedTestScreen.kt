package com.pulse.netmeter.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulse.netmeter.SpeedTestUiState
import com.pulse.netmeter.model.TestPhase
import com.pulse.netmeter.util.FormatUtils
import java.util.Locale

@Composable
fun SpeedTestScreen(
    state: SpeedTestUiState,
    onStartOrStop: () -> Unit,
    onSelectStreams: (Int) -> Unit,
    onSelectDuration: (Int) -> Unit,
    onCustomServerChanged: (String) -> Unit
) {
    val isRunning = state.phase == TestPhase.PING ||
        state.phase == TestPhase.DOWNLOAD ||
        state.phase == TestPhase.UPLOAD

    val statusLabel = when (state.phase) {
        TestPhase.IDLE -> "READY TO PROBE"
        TestPhase.PING -> "PROBING PING & JITTER"
        TestPhase.DOWNLOAD -> "DOWNLOADING (${state.streams}x)"
        TestPhase.UPLOAD -> "UPLOADING (${state.streams}x)"
        TestPhase.DONE -> "COMPLETE — SUSTAINED DL"
        TestPhase.ERROR -> "CONNECTION ERROR"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Gauge + Action Card
        Card(
            colors = CardDefaults.cardColors(containerColor = CharcoalCard),
            border = BorderStroke(1.dp, SlateBorder),
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp)
            ) {
                SpeedGauge(
                    mbps = state.gaugeMbps,
                    phase = state.phase,
                    unit = state.unit,
                    statusLabel = statusLabel
                )

                LinearProgressIndicator(
                    progress = { state.progress },
                    color = if (state.phase == TestPhase.UPLOAD) VioletAccent else CyanAccent,
                    trackColor = SlateBorder,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                )

                if (state.errorMessage != null) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = state.errorMessage,
                        color = CrimsonBad,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = onStartOrStop,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isRunning) CrimsonBad.copy(alpha = 0.22f) else CyanAccent,
                        contentColor = if (isRunning) CrimsonBad else Color(0xFF041311)
                    ),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                ) {
                    Icon(
                        imageVector = if (isRunning) Icons.Default.Stop else Icons.Default.PlayArrow,
                        contentDescription = null
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = when {
                            isRunning -> "ABORT SPEED TEST"
                            state.phase == TestPhase.DONE -> "RUN SPEED TEST AGAIN"
                            else -> "START FULL SPEED TEST"
                        },
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // Primary Readout Grid
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            MetricTile(
                title = "DOWNLOAD",
                value = if (state.downloadMbps > 0.0)
                    FormatUtils.formatSpeedValue(state.downloadMbps, state.unit)
                else "—",
                unitLabel = state.unit.label,
                subLabel = if (state.downloadPeakMbps > 0.0)
                    "Peak ${FormatUtils.formatSpeedValue(state.downloadPeakMbps, state.unit)}"
                else FormatUtils.formatBytes(state.downloadBytes),
                accent = CyanAccent,
                modifier = Modifier.weight(1f)
            )
            MetricTile(
                title = "UPLOAD",
                value = if (state.uploadMbps > 0.0)
                    FormatUtils.formatSpeedValue(state.uploadMbps, state.unit)
                else "—",
                unitLabel = state.unit.label,
                subLabel = if (state.uploadPeakMbps > 0.0)
                    "Peak ${FormatUtils.formatSpeedValue(state.uploadPeakMbps, state.unit)}"
                else FormatUtils.formatBytes(state.uploadBytes),
                accent = VioletAccent,
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            MetricTile(
                title = "IDLE PING & JITTER",
                value = if (state.pingMs > 0.0) String.format(Locale.US, "%.1f", state.pingMs) else "—",
                unitLabel = "ms",
                subLabel = "Jitter ${String.format(Locale.US, "%.1f", state.jitterMs)} ms · Loss ${String.format(Locale.US, "%.0f", state.packetLossPct)}%",
                accent = EmeraldGood,
                modifier = Modifier.weight(1f)
            )
            MetricTile(
                title = "BUFFERBLOAT",
                value = if (state.bufferbloatGrade != "—") "Grade ${state.bufferbloatGrade}" else "—",
                unitLabel = "",
                subLabel = if (state.loadedPingMs > 0.0)
                    "Loaded ${String.format(Locale.US, "%.1f", state.loadedPingMs)} ms"
                else "Latency under load",
                accent = gradeComposeColor(state.bufferbloatGrade),
                modifier = Modifier.weight(1f)
            )
        }

        // Throughput Curves & Suitability
        if (state.downloadSeries.isNotEmpty() || state.uploadSeries.isNotEmpty()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = CharcoalCard),
                border = BorderStroke(1.dp, SlateBorder),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "THROUGHPUT CURVES (DL CYAN / UL VIOLET)",
                        color = TextSecondary,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    DualLineChart(
                        primaryValues = state.downloadSeries.map { it.mbps },
                        secondaryValues = state.uploadSeries.map { it.mbps },
                        chartHeight = 140.dp
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = FormatUtils.readinessSummary(
                            state.downloadMbps,
                            state.pingMs,
                            state.bufferbloatGrade
                        ),
                        color = TextPrimary,
                        fontSize = 13.sp
                    )
                }
            }
        }

        // Test Configuration Card
        Card(
            colors = CardDefaults.cardColors(containerColor = CharcoalCard),
            border = BorderStroke(1.dp, SlateBorder),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "PROBE CONFIGURATION",
                    color = TextSecondary,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Streams:", color = TextSecondary, fontSize = 12.sp)
                    listOf(1, 2, 4, 8).forEach { count ->
                        FilterChip(
                            selected = state.streams == count,
                            enabled = !isRunning,
                            onClick = { onSelectStreams(count) },
                            label = { Text("${count}x", fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = VioletAccent.copy(alpha = 0.25f),
                                selectedLabelColor = TextPrimary
                            )
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Duration:", color = TextSecondary, fontSize = 12.sp)
                    listOf(4, 6, 10, 15).forEach { sec ->
                        FilterChip(
                            selected = state.durationSec == sec,
                            enabled = !isRunning,
                            onClick = { onSelectDuration(sec) },
                            label = { Text("${sec}s", fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = CyanAccent.copy(alpha = 0.22f),
                                selectedLabelColor = CyanAccent
                            )
                        )
                    }
                }

                OutlinedTextField(
                    value = state.customServerUrl,
                    onValueChange = onCustomServerChanged,
                    enabled = !isRunning,
                    singleLine = true,
                    label = {
                        Text(
                            "Custom Pulse Server URL (blank = Cloudflare Edge)",
                            fontSize = 12.sp
                        )
                    },
                    placeholder = { Text("https://your-server.example.com", fontSize = 12.sp) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = CyanAccent,
                        unfocusedBorderColor = SlateBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
