package com.pulse.netmeter.engine

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.pulse.netmeter.model.RadioDiagnostics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class NetworkInspector(context: Context) {

    private val appContext = context.applicationContext
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    fun readLocalRadioState(): RadioDiagnostics {
        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val active = cm.activeNetwork ?: return RadioDiagnostics(connected = false)
        val caps = cm.getNetworkCapabilities(active) ?: return RadioDiagnostics(connected = false)
        val link = cm.getLinkProperties(active)

        val transport = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile Cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            else -> "Active Network"
        }

        val vpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        val metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)

        val addresses = link?.linkAddresses
            ?.mapNotNull { it.address?.hostAddress }
            ?.filterNot { it.startsWith("fe80") }
            ?.take(2)
            ?.joinToString(", ")
            ?.ifEmpty { "—" } ?: "—"

        val dns = link?.dnsServers
            ?.mapNotNull { it.hostAddress }
            ?.take(2)
            ?.joinToString(", ")
            ?.ifEmpty { "—" } ?: "—"

        return RadioDiagnostics(
            connected = true,
            transportLabel = if (vpn) "$transport + VPN" else transport,
            interfaceName = link?.interfaceName ?: "—",
            localAddresses = addresses,
            dnsServers = dns,
            linkDownKbps = caps.linkDownstreamBandwidthKbps,
            linkUpKbps = caps.linkUpstreamBandwidthKbps,
            isMetered = metered,
            isVpnActive = vpn
        )
    }

    suspend fun inspectFullDiagnostics(): RadioDiagnostics = withContext(Dispatchers.IO) {
        val base = readLocalRadioState()
        if (!base.connected) return@withContext base

        runCatching {
            val req = Request.Builder()
                .url("https://speed.cloudflare.com/meta")
                .header("Cache-Control", "no-store")
                .get()
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use base
                val json = JSONObject(resp.body?.string() ?: "{}")
                base.copy(
                    publicIp = json.optString("clientIp", "Detected"),
                    ispOrg = json.optString("asOrganization", "Standard ISP"),
                    edgeColocation = listOf(
                        json.optString("city", ""),
                        json.optString("colo", "")
                    ).filter { it.isNotBlank() }.joinToString(" · ").ifEmpty { "Global Edge" }
                )
            }
        }.getOrElse { base.copy(publicIp = "Offline / Restricted") }
    }
}
