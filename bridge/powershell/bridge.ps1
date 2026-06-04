<#
.SYNOPSIS
    ForzaTuningAdvisor bridge (PowerShell). Forza UDP telemetry -> browser WebSocket.

.DESCRIPTION
    Browsers cannot read UDP. This script does the part the browser can't:
      1. Listens for Forza "Data Out" UDP packets on 127.0.0.1:<UdpPort> (default 5300).
      2. Parses each 324-byte FH6 packet into a normalized JSON object.
      3. Serves a local WebSocket on ws://127.0.0.1:<WsPort> (default 5301) and broadcasts
         each parsed frame to every connected browser (the GitHub Pages UI).

    Nothing leaves your machine - it only binds two local ports. The whole script is
    readable; it uses a TcpListener (no admin / no URL reservation needed).

    Field offsets are the verified FH6 layout - see Docs/forza-data-format.md.

.PARAMETER UdpPort   Forza Data Out port. Default 5300.
.PARAMETER WsPort    Local WebSocket port the browser connects to. Default 5301.
.PARAMETER Verbose   Print a status line periodically.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File bridge.ps1
#>
[CmdletBinding()]
param(
    [int]$UdpPort = 5300,
    [int]$WsPort  = 5301
)

$ErrorActionPreference = 'Stop'
$WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

# ---- binary readers (little-endian) ------------------------------------------
function RF { param($b,$o) [BitConverter]::ToSingle($b,$o) }       # float32
function RInt { param($b,$o) [BitConverter]::ToInt32($b,$o) }        # int32
function RU16 { param($b,$o) [BitConverter]::ToUInt16($b,$o) }     # uint16
function RS8 { param($b,$o) $v=$b[$o]; if ($v -gt 127) { $v-256 } else { $v } }

# ---- one tire corner -> ordered hashtable -----------------------------------
function Corner {
    param([byte[]]$b,$tempOff,$slipRatioOff,$slipAngleOff,$combinedOff,$suspNormOff,$suspMOff,$wheelOff,$rumbleOff,$puddleOff,$surfOff)
    [ordered]@{
        temp         = [Math]::Round((RF $b $tempOff), 1)
        slipRatio    = [Math]::Round((RF $b $slipRatioOff), 3)
        slipAngle    = [Math]::Round((RF $b $slipAngleOff), 3)
        combinedSlip = [Math]::Round((RF $b $combinedOff), 3)
        suspNorm     = [Math]::Round((RF $b $suspNormOff), 3)
        suspM        = [Math]::Round((RF $b $suspMOff), 4)
        wheelSpeed   = [Math]::Round((RF $b $wheelOff), 2)
        onRumble     = [Math]::Round((RF $b $rumbleOff), 2)
        inPuddle     = [Math]::Round((RF $b $puddleOff), 2)
        surfaceRumble= [Math]::Round((RF $b $surfOff), 2)
    }
}

# ---- parse a 324-byte FH6 packet into an ordered hashtable -------------------
function Parse-Packet {
    param([byte[]]$b)
    [ordered]@{
        t      = RInt $b 4
        raceOn = RInt $b 0
        rpm    = [ordered]@{ cur=[Math]::Round((RF $b 16),0); idle=[Math]::Round((RF $b 12),0); max=[Math]::Round((RF $b 8),0) }
        gear   = [int]$b[319]
        speed  = [Math]::Round((RF $b 256),2)          # m/s
        power  = [Math]::Round((RF $b 260),0)
        torque = [Math]::Round((RF $b 264),0)
        throttle = [Math]::Round($b[315]/255,3)
        brake    = [Math]::Round($b[316]/255,3)
        clutch   = [Math]::Round($b[317]/255,3)
        handbrake= [Math]::Round($b[318]/255,3)
        steer    = [Math]::Round((RS8 $b 320)/127,3)
        boost  = [Math]::Round((RF $b 284),2)
        fuel   = [Math]::Round((RF $b 288),3)
        distance = [Math]::Round((RF $b 292),1)
        accel  = [ordered]@{ x=[Math]::Round((RF $b 20),3); y=[Math]::Round((RF $b 24),3); z=[Math]::Round((RF $b 28),3) }
        vel    = [ordered]@{ x=[Math]::Round((RF $b 32),3); y=[Math]::Round((RF $b 36),3); z=[Math]::Round((RF $b 40),3) }
        angVel = [ordered]@{ x=[Math]::Round((RF $b 44),3); y=[Math]::Round((RF $b 48),3); z=[Math]::Round((RF $b 52),3) }
        yaw    = [Math]::Round((RF $b 56),3)
        pitch  = [Math]::Round((RF $b 60),3)
        roll   = [Math]::Round((RF $b 64),3)
        pos    = [ordered]@{ x=[Math]::Round((RF $b 244),1); y=[Math]::Round((RF $b 248),1); z=[Math]::Round((RF $b 252),1) }
        tires  = [ordered]@{
            fl = Corner $b 268 84 164 180 68 196 100 116 132 148
            fr = Corner $b 272 88 168 184 72 200 104 120 136 152
            rl = Corner $b 276 92 172 188 76 204 108 124 140 156
            rr = Corner $b 280 96 176 192 80 208 112 128 144 160
        }
        lap    = [ordered]@{
            best=[Math]::Round((RF $b 296),3); last=[Math]::Round((RF $b 300),3)
            cur=[Math]::Round((RF $b 304),3); raceTime=[Math]::Round((RF $b 308),3)
            num=[int](RU16 $b 312); pos=[int]$b[314]
        }
        car    = [ordered]@{
            ordinal=RInt $b 212; class=RInt $b 216; pi=RInt $b 220
            drivetrain=RInt $b 224; cylinders=RInt $b 228
        }
    }
}

# ---- WebSocket helpers -------------------------------------------------------
function New-WsFrame {
    param([byte[]]$payload)
    $len = $payload.Length
    $ms = New-Object System.IO.MemoryStream
    $ms.WriteByte(0x81)   # FIN + text frame
    if ($len -lt 126) {
        $ms.WriteByte($len)
    } elseif ($len -lt 65536) {
        $ms.WriteByte(126)
        $ms.WriteByte(([byte](($len -shr 8) -band 0xFF)))
        $ms.WriteByte(([byte]($len -band 0xFF)))
    } else {
        $ms.WriteByte(127)
        for ($i = 7; $i -ge 0; $i--) { $ms.WriteByte(([byte](($len -shr ($i*8)) -band 0xFF))) }
    }
    $ms.Write($payload, 0, $len)
    return $ms.ToArray()
}

function Complete-Handshake {
    param($stream)
    # Read the HTTP upgrade request (browser sends it immediately).
    $buf = New-Object byte[] 4096
    $stream.ReadTimeout = 3000
    $sb = New-Object System.Text.StringBuilder
    do {
        $read = $stream.Read($buf, 0, $buf.Length)
        if ($read -le 0) { return $false }
        [void]$sb.Append([System.Text.Encoding]::ASCII.GetString($buf, 0, $read))
    } until ($sb.ToString().Contains("`r`n`r`n"))

    $req = $sb.ToString()
    $m = [regex]::Match($req, '(?im)^Sec-WebSocket-Key:\s*(.+)$')
    if (-not $m.Success) { return $false }
    $key = $m.Groups[1].Value.Trim()
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    $accept = [Convert]::ToBase64String($sha1.ComputeHash([Text.Encoding]::ASCII.GetBytes($key + $WS_GUID)))
    $resp = "HTTP/1.1 101 Switching Protocols`r`nUpgrade: websocket`r`nConnection: Upgrade`r`nSec-WebSocket-Accept: $accept`r`n`r`n"
    $respBytes = [Text.Encoding]::ASCII.GetBytes($resp)
    $stream.Write($respBytes, 0, $respBytes.Length)
    $stream.ReadTimeout = [System.Threading.Timeout]::Infinite
    return $true
}

# ---- start listeners --------------------------------------------------------
Write-Host "ForzaTuningAdvisor bridge" -ForegroundColor Cyan
Write-Host ("  UDP  in : 127.0.0.1:{0}  (set Forza Data Out to this)" -f $UdpPort)
Write-Host ("  WS  out : ws://127.0.0.1:{0}" -f $WsPort)
Write-Host "  Press Ctrl+C to stop.`n"

try {
    $udp = New-Object System.Net.Sockets.UdpClient
    $udp.Client.SetSocketOption([Net.Sockets.SocketOptionLevel]::Socket, [Net.Sockets.SocketOptionName]::ReuseAddress, $true)
    $udp.Client.Bind((New-Object Net.IPEndPoint([Net.IPAddress]::Loopback, $UdpPort)))
    $udp.Client.ReceiveTimeout = 250
} catch {
    Write-Host "Could not bind UDP $UdpPort. Already in use?" -ForegroundColor Red; return
}
try {
    $tcp = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $WsPort)
    $tcp.Start()
} catch {
    Write-Host "Could not listen on TCP $WsPort. Already in use?" -ForegroundColor Red; $udp.Close(); return
}

$clients = New-Object System.Collections.ArrayList
$endpoint = New-Object Net.IPEndPoint([Net.IPAddress]::Loopback, $UdpPort)
$frames = 0; $lastReport = [Environment]::TickCount; $clientCount = 0

try {
    while ($true) {
        # 1) accept any pending browser connections
        while ($tcp.Pending()) {
            $c = $tcp.AcceptTcpClient()
            $c.NoDelay = $true
            $s = $c.GetStream()
            try {
                if (Complete-Handshake $s) {
                    [void]$clients.Add(@{ Client=$c; Stream=$s })
                    $clientCount++
                    Write-Host ("Browser connected ({0} total)." -f $clients.Count) -ForegroundColor Green
                } else { Write-Host "Handshake returned false." -ForegroundColor Yellow; $c.Close() }
            } catch { Write-Host ("Handshake error: " + $_.Exception.Message) -ForegroundColor Red; $c.Close() }
        }

        # 2) receive one UDP packet (or time out and loop)
        $bytes = $null
        try { $ref=$endpoint; $bytes = $udp.Receive([ref]$ref) }
        catch [System.Net.Sockets.SocketException] { continue }  # timeout: loop to keep accepting clients

        if ($bytes.Length -lt 324) { continue }

        # 3) parse -> JSON -> frame (skip a malformed packet rather than crash)
        try {
            $obj = Parse-Packet $bytes
            $json = $obj | ConvertTo-Json -Compress -Depth 5
        } catch {
            Write-Host ("Skipped a malformed packet: " + $_.Exception.Message) -ForegroundColor Yellow
            continue
        }
        $frame = New-WsFrame ([Text.Encoding]::UTF8.GetBytes($json))

        # 4) broadcast, dropping dead clients
        if ($clients.Count -gt 0) {
            $dead = @()
            foreach ($cl in $clients) {
                try { $cl.Stream.Write($frame, 0, $frame.Length) }
                catch { $dead += $cl }
            }
            foreach ($d in $dead) {
                try { $d.Client.Close() } catch {}
                $clients.Remove($d)
                Write-Host ("Browser disconnected ({0} left)." -f $clients.Count) -ForegroundColor Yellow
            }
        }

        # 5) occasional status
        $frames++
        $now = [Environment]::TickCount
        if (($now - $lastReport) -ge 2000) {
            $state = if ($obj.raceOn -eq 1) { "DRIVING" } else { "idle (in menu/paused)" }
            Write-Host ("  {0} | {1} pkt/s feed | {2} browser(s)" -f $state, [Math]::Round($frames/(($now-$lastReport)/1000)), $clients.Count)
            $frames = 0; $lastReport = $now
        }
    }
}
finally {
    foreach ($cl in $clients) { try { $cl.Client.Close() } catch {} }
    $tcp.Stop(); $udp.Close()
    Write-Host "`nBridge stopped." -ForegroundColor Cyan
}
