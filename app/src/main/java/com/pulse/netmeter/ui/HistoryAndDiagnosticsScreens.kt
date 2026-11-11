package com.pulse.netmeter.ui

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulse.netmeter.model.RadioDiagnostics
import com.pulse.netmeter.model.SpeedTestRecord
import com.pulse.netmeter.model.SpeedUnit
import com.pulse.netmeter.util.FormatUtils
import java.util.Locale

@Composable
fun HistoryScreen(
    records: List<SpeedTestRecord>,
    unit: SpeedUnit,
    onDelete: (String) -> Unit,
    onClearAll: () -> Unit
) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "SAVED SPEED TESTS (${records.size})",
                color = TextSecondary,
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace
            )
            if (records.isNotEmpty()) {
                TextButton(onClick = onClearAll) {
                    Text("Clear All", color = CrimsonBad, fontSize = 12.sp)
                }
            }
        }

        if (records.isNotEmpty()) {
            val avgDl = records.map { it.downloadMbps }.average()
            val avgUl = records.map { it.uploadMbps }.average()
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                MetricTile(
                    title = "AVG DOWNLOAD",
                    value = FormatUtils.formatSpeedValue(avgDl, unit),
                    unitLabel = unit.label,
                    subLabel = "${records.size} runs",
                    accent = CyanAccent,
                    modifier = Modifier.weight(1f)
                )
                MetricTile(
                    title = "AVG UPLOAD",
                    value = FormatUtils.formatSpeedValue(avgUl, unit),
                    unitLabel = unit.label,
                    subLabel = "Avg Ping ${String.format(Locale.US, "%.1f", records.map { it.pingMs }.average())} ms",
                    accent = VioletAccent,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        if (records.isEmpty()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = CharcoalCard),
                border = BorderStroke(1.dp, SlateBorder),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp)
                ) {
                    Text(
                        text = "No test history yet",
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Completed speed tests on the Speed Test tab are saved here.",
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                }
            }
        } else {
            records.forEach { rec ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = CharcoalCard),
                    border = BorderStroke(1.dp, SlateBorder),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column {
                                Text(
                                    text = FormatUtils.formatTimestamp(rec.timestampEpochMs),
                                    color = TextPrimary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    fontFamily = FontFamily.Monospace
                                )
                                Text(
                                    text = "${rec.networkType} · ${rec.serverName} (${rec.streams}x)",
                                    color = TextMuted,
                                    fontSize = 11.sp
                                )
                            }
                            Row {
                                IconButton(
                                    onClick = {
                                        val report = buildString {
                                            appendLine("PULSE // NET-METER Android Speed Report")
                                            appendLine("Date: ${FormatUtils.formatTimestamp(rec.timestampEpochMs)}")
                                            appendLine("Network: ${rec.networkType} (${rec.serverName})")
                                            appendLine("Download: ${FormatUtils.formatSpeedValue(rec.downloadMbps)} Mbps")
                                            appendLine("Upload: ${FormatUtils.formatSpeedValue(rec.uploadMbps)} Mbps")
                                            appendLine("Ping: ${String.format(Locale.US, "%.1f", rec.pingMs)} ms | Jitter: ${String.format(Locale.US, "%.1f", rec.jitterMs)} ms")
                                            append("Bufferbloat Grade: ${rec.bufferbloatGrade}")
                                        }
                                        val share = Intent(Intent.ACTION_SEND).apply {
                                            type = "text/plain"
                                            putExtra(Intent.EXTRA_TEXT, report)
                                        }
                                        context.startActivity(Intent.createChooser(share, "Share Speed Report"))
                                    },
                                    modifier = Modifier.size(34.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Share,
                                        contentDescription = "Share",
                                        tint = TextSecondary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                IconButton(
                                    onClick = { onDelete(rec.id) },
                                    modifier = Modifier.size(34.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Delete",
                                        tint = CrimsonBad.copy(alpha = 0.8f),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "↓ ${FormatUtils.formatSpeedValue(rec.downloadMbps, unit)} ${unit.label}",
                                color = CyanAccent,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp
                            )
                            Text(
                                text = "↑ ${FormatUtils.formatSpeedValue(rec.uploadMbps, unit)} ${unit.label}",
                                color = VioletAccent,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp
                            )
                            Text(
                                text = "${String.format(Locale.US, "%.1f", rec.pingMs)} ms",
                                color = TextPrimary,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp
                            )
                            Text(
                                text = "Grade ${rec.bufferbloatGrade}",
                                color = gradeComposeColor(rec.bufferbloatGrade),
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun DiagnosticsScreen(
    diag: RadioDiagnostics,
    sweepSamples: List<Double?>,
    isSweeping: Boolean,
    onRefresh: () -> Unit,
    onRunSweep: () -> Unit
) {
    val valid = sweepSamples.filterNotNull()
    val minMs = valid.minOrNull() ?: 0.0
    val maxMs = (valid.maxOrNull() ?: 1.0).coerceAtLeast(1.0)
    val avgMs = if (valid.isNotEmpty()) valid.average() else 0.0
    val jitterMs = FormatUtils.computeJitter(valid)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = CharcoalCard),
            border = BorderStroke(1.dp, SlateBorder),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "ANDROID RADIO & INTERFACE TELEMETRY",
                        color = TextSecondary,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    IconButton(onClick = onRefresh, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = CyanAccent)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                DiagRow("Active Transport", diag.transportLabel)
                DiagRow("Public IP", diag.publicIp)
                DiagRow("ISP / Organization", diag.ispOrg)
                DiagRow("Edge Colocation", diag.edgeColocation)
                DiagRow("OS Interface", diag.interfaceName)
                DiagRow("Local IP", diag.localAddresses)
                DiagRow("DNS Resolvers", diag.dnsServers)
                DiagRow(
                    "OS Link Capacity",
                    "↓ ${diag.linkDownKbps / 1000} Mbps  /  ↑ ${diag.linkUpKbps / 1000} Mbps"
                )
                DiagRow("Metered Link", if (diag.isMetered) "Yes (Metered)" else "No (Unmetered)")
            }
        }

        // 20-Packet Latency Sweep Card
        Card(
            colors = CardDefaults.cardColors(containerColor = CharcoalCard),
            border = BorderStroke(1.dp, SlateBorder),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "20-Packet Latency Sweep",
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "Min, average, jitter & packet delivery bars",
                            color = TextSecondary,
                            fontSize = 12.sp
                        )
                    }
                    Button(
                        onClick = onRunSweep,
                        enabled = !isSweeping,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = CyanAccent,
                            contentColor = Color(0xFF041311)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = if (isSweeping) "${sweepSamples.size}/20…" else "RUN 20x",
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.sp
                        )
                    }
                }

                if (sweepSamples.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            "Min ${String.format(Locale.US, "%.1f", minMs)} ms",
                            color = EmeraldGood,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            "Avg ${String.format(Locale.US, "%.1f", avgMs)} ms",
                            color = CyanAccent,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            "Jitter ${String.format(Locale.US, "%.1f", jitterMs)} ms",
                            color = VioletAccent,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.Bottom,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(90.dp)
                    ) {
                        for (i in 0 until 20) {
                            val sample = sweepSamples.getOrNull(i)
                            val frac = when {
                                sample == null && i < sweepSamples.size -> 1f
                                sample != null -> (sample / maxMs).toFloat().coerceIn(0.12f, 1f)
                                else -> 0.08f
                            }
                            val barColor = when {
                                sample == null && i < sweepSamples.size -> CrimsonBad
                                sample != null -> CyanAccent
                                else -> SlateBorder
                            }
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight(frac)
                                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                    .background(barColor)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagRow(label: String, value: String) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
    ) {
        Text(text = label, color = TextMuted, fontSize = 12.sp)
        Text(
            text = value,
            color = TextPrimary,
            fontSize = 12.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Medium
        )
    }
}
