package com.pulse.netmeter.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ObsidianBg = Color(0xFF090D16)
val CharcoalCard = Color(0xFF111827)
val SlateBorder = Color(0xFF1E293B)
val CyanAccent = Color(0xFF00F5D4)
val VioletAccent = Color(0xFF8B5CF6)
val EmeraldGood = Color(0xFF10B981)
val AmberWarn = Color(0xFFF59E0B)
val CrimsonBad = Color(0xFFEF4444)
val TextPrimary = Color(0xFFF8FAFC)
val TextSecondary = Color(0xFF94A3B8)
val TextMuted = Color(0xFF64748B)

private val PulseDarkColors = darkColorScheme(
    primary = CyanAccent,
    onPrimary = Color(0xFF041311),
    secondary = VioletAccent,
    onSecondary = TextPrimary,
    background = ObsidianBg,
    onBackground = TextPrimary,
    surface = CharcoalCard,
    onSurface = TextPrimary,
    surfaceVariant = Color(0xFF162033),
    onSurfaceVariant = TextSecondary,
    error = CrimsonBad
)

fun gradeComposeColor(grade: String): Color = when (grade) {
    "A" -> EmeraldGood
    "B" -> Color(0xFF84CC16)
    "C" -> AmberWarn
    "D" -> Color(0xFFF97316)
    "F" -> CrimsonBad
    else -> TextSecondary
}

@Composable
fun PulseNetMeterTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = PulseDarkColors,
        content = content
    )
}
