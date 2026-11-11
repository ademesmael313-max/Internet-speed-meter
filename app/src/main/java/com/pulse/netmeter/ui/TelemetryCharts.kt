package com.pulse.netmeter.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulse.netmeter.model.SpeedUnit
import com.pulse.netmeter.model.TestPhase
import com.pulse.netmeter.util.FormatUtils
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun SpeedGauge(
    mbps: Double,
    phase: TestPhase,
    unit: SpeedUnit,
    statusLabel: String,
    modifier: Modifier = Modifier
) {
    val maxScale = FormatUtils.gaugeScaleMax(mbps)
    val targetFraction = (mbps / maxScale).toFloat().coerceIn(0f, 1f)
    val animatedFraction by animateFloatAsState(
        targetValue = targetFraction,
        animationSpec = tween(durationMillis = 160),
        label = "gaugeFraction"
    )

    val activeColor = when (phase) {
        TestPhase.UPLOAD -> VioletAccent
        TestPhase.ERROR -> CrimsonBad
        else -> CyanAccent
    }

    Box(
        modifier = modifier.size(260.dp),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(260.dp)) {
            val strokePx = 14.dp.toPx()
            val radius = (size.minDimension - strokePx * 2f) / 2f
            val topLeft = Offset(size.width / 2f - radius, size.height / 2f - radius)
            val arcSize = Size(radius * 2f, radius * 2f)
            val startAngle = 150f
            val sweepTotal = 240f

            // Track arc
            drawArc(
                color = SlateBorder,
                startAngle = startAngle,
                sweepAngle = sweepTotal,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokePx, cap = StrokeCap.Round)
            )

            // Active value arc
            if (animatedFraction > 0.005f) {
                drawArc(
                    brush = Brush.sweepGradient(
                        listOf(CyanAccent, VioletAccent, CyanAccent)
                    ),
                    startAngle = startAngle,
                    sweepAngle = sweepTotal * animatedFraction,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = strokePx, cap = StrokeCap.Round)
                )
            }

            // Tick marks
            val center = Offset(size.width / 2f, size.height / 2f)
            for (i in 0..24) {
                val deg = startAngle + (i / 24f) * sweepTotal
                val rad = Math.toRadians(deg.toDouble())
                val major = i % 6 == 0
                val rOuter = radius - strokePx * 0.9f
                val rInner = rOuter - if (major) 10.dp.toPx() else 5.dp.toPx()
                val p1 = Offset(
                    center.x + (rInner * cos(rad)).toFloat(),
                    center.y + (rInner * sin(rad)).toFloat()
                )
                val p2 = Offset(
                    center.x + (rOuter * cos(rad)).toFloat(),
                    center.y + (rOuter * sin(rad)).toFloat()
                )
                drawLine(
                    color = if (major) TextSecondary else SlateBorder,
                    start = p1,
                    end = p2,
                    strokeWidth = if (major) 2.dp.toPx() else 1.dp.toPx()
                )
            }

            // Needle
            val needleDeg = startAngle + animatedFraction * sweepTotal
            val needleRad = Math.toRadians(needleDeg.toDouble())
            val needleEnd = Offset(
                center.x + ((radius - 22.dp.toPx()) * cos(needleRad)).toFloat(),
                center.y + ((radius - 22.dp.toPx()) * sin(needleRad)).toFloat()
            )
            drawLine(
                color = TextPrimary,
                start = center,
                end = needleEnd,
                strokeWidth = 3.dp.toPx(),
                cap = StrokeCap.Round
            )
            drawCircle(color = CharcoalCard, radius = 9.dp.toPx(), center = center)
            drawCircle(color = activeColor, radius = 4.5.dp.toPx(), center = center)
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(top = 48.dp)
        ) {
            Text(
                text = FormatUtils.formatSpeedValue(mbps, unit),
                color = TextPrimary,
                fontSize = 38.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
            Text(
                text = unit.label,
                color = TextSecondary,
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = statusLabel,
                color = activeColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
fun DualLineChart(
    primaryValues: List<Double>,
    secondaryValues: List<Double> = emptyList(),
    primaryColor: Color = CyanAccent,
    secondaryColor: Color = VioletAccent,
    chartHeight: Dp = 150.dp,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(chartHeight)
    ) {
        val w = size.width
        val h = size.height
        val padV = 10.dp.toPx()
        val plotH = (h - padV * 2f).coerceAtLeast(1f)

        // Horizontal gridlines
        for (i in 0..3) {
            val y = padV + (plotH * i) / 3f
            drawLine(
                color = SlateBorder,
                start = Offset(0f, y),
                end = Offset(w, y),
                strokeWidth = 1.dp.toPx()
            )
        }

        val allValues = primaryValues + secondaryValues
        if (primaryValues.size < 2) return@Canvas
        val maxVal = (allValues.maxOrNull() ?: 1.0).coerceAtLeast(1.0) * 1.15

        fun drawTrace(values: List<Double>, color: Color) {
            if (values.size < 2) return
            val linePath = Path()
            val fillPath = Path()
            values.forEachIndexed { index, v ->
                val x = (index.toFloat() / (values.size - 1).coerceAtLeast(1)) * w
                val y = padV + plotH - ((v / maxVal).toFloat().coerceIn(0f, 1f) * plotH)
                if (index == 0) {
                    linePath.moveTo(x, y)
                    fillPath.moveTo(x, padV + plotH)
                    fillPath.lineTo(x, y)
                } else {
                    linePath.lineTo(x, y)
                    fillPath.lineTo(x, y)
                }
            }
            fillPath.lineTo(w, padV + plotH)
            fillPath.close()

            drawPath(
                path = fillPath,
                brush = Brush.verticalGradient(
                    colors = listOf(color.copy(alpha = 0.28f), Color.Transparent),
                    startY = padV,
                    endY = padV + plotH
                )
            )
            drawPath(
                path = linePath,
                color = color,
                style = Stroke(width = 2.4.dp.toPx(), cap = StrokeCap.Round)
            )
        }

        drawTrace(primaryValues, primaryColor)
        if (secondaryValues.size >= 2) {
            drawTrace(secondaryValues, secondaryColor)
        }
    }
}
