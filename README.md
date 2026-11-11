# PULSE // NET-METER

A full-stack **Internet Speed Meter, Live Bandwidth Monitor, and Bufferbloat Telemetry Suite** built with React, TypeScript, Tailwind CSS, and an Express high-entropy binary streaming backend.

## Features

- **Multi-Stream Full-Duplex Speed Test**
  - Configurable parallel streams (`1x`, `2x`, `4x`, `8x`), test duration (`4s`–`15s`), server node profiles, and optional rate-cap shaping (`10`–`250 Mbps` or `Unthrottled`).
  - Uses incompressible random binary payloads (`application/octet-stream` with `Cache-Control: no-store, no-transform`) so transparent proxy compression never inflates bandwidth readings.
  - Real socket-level upload progress tracking (`XMLHttpRequest.upload.onprogress`) and streaming `ReadableStream` download workers.
- **Bufferbloat & Loaded Latency Grading (`A`–`F`)**
  - Measures idle latency, RFC-3550 jitter, packet loss, and concurrent loaded latency during both download and upload saturation.
- **Continuous Live Speed & Latency Meter**
  - Real-time scrolling dual-trace graph with two operating modes:
    - **DL + UL + Ping**: periodic active bandwidth & latency micro-bursts with session data counter.
    - **Zero-Data Ping**: ultra-lightweight latency heartbeat monitor for spotting micro-dropouts and lag spikes.
- **Connection Readiness & Transfer Time Estimator**
  - Evaluates readiness for 4K HDR streaming, competitive online gaming, HD video calls, and cloud backups, alongside real-world download/upload time estimates (`250 MB` to `80 GB`).
- **Persistent History & Exports**
  - Saves test runs to server storage (`data/speedtest-history.json`) and browser `localStorage`, with expandable throughput curves, **CSV export**, **JSON export**, and one-click shareable text reports.
- **Network Diagnostics & 20-Packet Ping Sweep**
  - Displays endpoint IP, HTTP/TLS transport details, browser radio hints, node specs, and an interactive 20-packet tail-latency (`min` / `median` / `avg` / `p95` / `jitter`) histogram.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (Express API + Vite frontend on 0.0.0.0:3000)
npm run dev

# Run unit & API integration tests
npm test

# Production build & start
npm run build
npm start
```

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/speedtest/ping` | Sub-millisecond latency & jitter probe |
| `GET` | `/api/speedtest/download?bytes=...&throttleMbps=...` | High-entropy incompressible binary download stream |
| `POST` | `/api/speedtest/upload` | Non-buffering upload sink returning `bytesReceived` & `durationMs` |
| `GET` | `/api/network-info` | Client IP, protocol, headers, and measurement node metadata |
| `GET/POST/DELETE` | `/api/history` | Persistent speed test history CRUD |
