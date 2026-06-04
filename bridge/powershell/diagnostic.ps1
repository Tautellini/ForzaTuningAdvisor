<#
.SYNOPSIS
    ForzaTuningAdvisor - UDP telemetry format diagnostic.

.DESCRIPTION
    Listens for Forza "Data Out" UDP packets on 127.0.0.1:<Port> and prints, for the
    first few packets:
      * the raw packet LENGTH (this alone identifies which known Forza format it is), and
      * parsed values from the UNIVERSAL Sled+Dash core (byte offsets 0-310 are identical
        across FM7 / FH4 / FH5 / FM2023), so you can sanity-check the parse against what
        you see on screen (RPM, gear, speed), and
      * a hex dump of the TAIL bytes (311+) which differ per game - this is what we need
        to map FH6's extra fields (tire wear, track ordinal, etc.).

    No data leaves your machine. Read every line - it only opens a UDP socket and prints.

.PARAMETER Port
    UDP port Forza is sending to. Default 5300 (set in-game under HUD/Gameplay > Data Out).

.PARAMETER Count
    How many packets to capture before stopping. Default 5.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File diagnostic.ps1
    (start it, then drive in Forza so it sends data)
#>
[CmdletBinding()]
param(
    [int]$Port = 5300,
    [int]$Count = 5,
    [switch]$WaitForDrive,   # skip idle (IsRaceOn=0) packets until the car is actually being driven
    [switch]$FullHex,        # also dump the entire packet as hex (for precise offset mapping)
    [switch]$ByteWatch       # capture N driving packets, report min..max of each tail byte (312..323)
)

$ErrorActionPreference = 'Stop'

# ---- Field readers over the universal Sled+Dash core (little-endian) ----------
function Read-F32 { param($b, $o) [BitConverter]::ToSingle($b, $o) }
function Read-S32 { param($b, $o) [BitConverter]::ToInt32($b, $o) }
function Read-U16 { param($b, $o) [BitConverter]::ToUInt16($b, $o) }
function Read-S8  { param($b, $o) $v = $b[$o]; if ($v -gt 127) { $v - 256 } else { $v } }

function Show-Hex {
    param([byte[]]$Bytes, [int]$Start, [int]$End)
    if ($Start -ge $Bytes.Length) { Write-Host "  (no bytes in this range)"; return }
    if ($End -ge $Bytes.Length) { $End = $Bytes.Length - 1 }
    for ($i = $Start; $i -le $End; $i += 16) {
        $lineEnd = [Math]::Min($i + 15, $End)
        $hex = ($Bytes[$i..$lineEnd] | ForEach-Object { $_.ToString('X2') }) -join ' '
        Write-Host ("  [{0,4}] {1}" -f $i, $hex)
    }
}

function Guess-Format {
    param([int]$Len)
    switch ($Len) {
        232     { 'Sled (V1) - no dash data' }
        311     { 'FM7 "Dash"' }
        324     { 'FH4 / FH5 "Dash"' }
        331     { 'FM2023 / Forza Motorsport (2023)' }
        default { "UNKNOWN length - new/unmapped format (FH6?)" }
    }
}

Write-Host "ForzaTuningAdvisor diagnostic - listening on UDP 127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "In Forza, set Data Out ON, IP 127.0.0.1, port $Port. Then drive." -ForegroundColor Cyan
Write-Host "Capturing $Count packet(s). Press Ctrl+C to stop early.`n"

$endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, $Port)
$udp = New-Object System.Net.Sockets.UdpClient
try {
    # Allow rebinding in case a previous run is lingering.
    $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket,
                                [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
    $udp.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, $Port)))
} catch {
    Write-Host "Could not bind UDP $Port. Is another listener (or a previous run) using it?" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    return
}

# ---- ByteWatch mode: range of each tail byte across many driving packets ------
if ($ByteWatch) {
    $lo = 312; $hi = 323
    $min = @{}; $max = @{}; $last = @{}
    $speedMin = [double]::PositiveInfinity; $speedMax = 0
    $rpmMax = 0
    $n = 0
    Write-Host "ByteWatch: drive and give inputs (full throttle, full brake, hard left+right, run up the gears). Capturing $Count driving packets...`n" -ForegroundColor Cyan
    while ($n -lt $Count) {
        $ref = $endpoint
        $bytes = $udp.Receive([ref]$ref)
        if ($bytes.Length -lt 324 -or (Read-S32 $bytes 0) -eq 0) { continue }
        $n++
        for ($o = $lo; $o -le $hi; $o++) {
            $v = $bytes[$o]
            if (-not $min.ContainsKey($o) -or $v -lt $min[$o]) { $min[$o] = $v }
            if (-not $max.ContainsKey($o) -or $v -gt $max[$o]) { $max[$o] = $v }
            $last[$o] = $v
        }
        $sp = Read-F32 $bytes 256
        if ($sp -lt $speedMin) { $speedMin = $sp }; if ($sp -gt $speedMax) { $speedMax = $sp }
        $rpm = Read-F32 $bytes 16; if ($rpm -gt $rpmMax) { $rpmMax = $rpm }
    }
    Write-Host ("Captured {0} driving packets. Speed {1:N1}..{2:N1} m/s, peak RPM {3:N0}`n" -f $n, $speedMin, $speedMax, $rpmMax)
    Write-Host "Offset  min  max  last   interpretation hint"
    $hints = @{
        315='Accel (0..255 full throttle)'; 316='Brake (0..255 full brake)';
        317='Clutch'; 318='HandBrake'; 319='Gear (gear number)';
        320='Steer (signed -127..127)'; 321='NormalizedDrivingLine'; 322='NormalizedAIBrakeDifference' }
    for ($o = $lo; $o -le $hi; $o++) {
        $hint = if ($hints.ContainsKey($o)) { $hints[$o] } else { '' }
        $sMin = Read-S8 @($min[$o]) 0
        $sMax = Read-S8 @($max[$o]) 0
        Write-Host ("[{0,3}]  {1,3}  {2,3}  {3,3}   {4}   (signed: {5}..{6})" -f $o, $min[$o], $max[$o], $last[$o], $hint, $sMin, $sMax)
    }
    $udp.Close()
    return
}

$captured = 0
try {
    while ($captured -lt $Count) {
        $ref = $endpoint
        $bytes = $udp.Receive([ref]$ref)
        $len = $bytes.Length

        # In -WaitForDrive mode, ignore idle packets (Forza zeroes IsRaceOn in menus/pause).
        if ($WaitForDrive -and $len -ge 4 -and (Read-S32 $bytes 0) -eq 0) { continue }

        $captured++

        Write-Host ("================ Packet #{0} ================" -f $captured) -ForegroundColor Yellow
        Write-Host ("Length: {0} bytes  ->  {1}" -f $len, (Guess-Format $len)) -ForegroundColor Green

        if ($len -lt 311) {
            Write-Host "Packet shorter than the 311-byte core; can only hex-dump it:" -ForegroundColor Yellow
            Show-Hex -Bytes $bytes -Start 0 -End ($len - 1)
            continue
        }

        # Universal core fields (offsets identical across all dash variants).
        $isRaceOn = Read-S32 $bytes 0
        $maxRpm   = Read-F32 $bytes 8
        $curRpm   = Read-F32 $bytes 16
        $accelX   = Read-F32 $bytes 20
        $velX     = Read-F32 $bytes 32
        $velY     = Read-F32 $bytes 36
        $velZ     = Read-F32 $bytes 40
        $speedDerived = [Math]::Sqrt($velX*$velX + $velY*$velY + $velZ*$velZ)

        $susFL = Read-F32 $bytes 68
        $susFR = Read-F32 $bytes 72
        $susRL = Read-F32 $bytes 76
        $susRR = Read-F32 $bytes 80
        $slipAngleFL = Read-F32 $bytes 164
        $slipAngleFR = Read-F32 $bytes 168
        $slipAngleRL = Read-F32 $bytes 172
        $slipAngleRR = Read-F32 $bytes 176

        $speed  = Read-F32 $bytes 244   # m/s
        $power  = Read-F32 $bytes 248
        $tempFL = Read-F32 $bytes 256
        $tempFR = Read-F32 $bytes 260
        $tempRL = Read-F32 $bytes 264
        $tempRR = Read-F32 $bytes 268
        $gear   = $bytes[307]
        $accelPed = $bytes[303]
        $brakePed = $bytes[304]
        $steer  = Read-S8 $bytes 308

        Write-Host "-- Universal core (verify these against your screen) --"
        Write-Host ("  IsRaceOn        : {0}" -f $isRaceOn)
        Write-Host ("  Engine RPM      : {0:N0} / max {1:N0}" -f $curRpm, $maxRpm)
        Write-Host ("  Gear            : {0}" -f $gear)
        Write-Host ("  Speed (off 244) : {0:N1} m/s  ({1:N0} km/h, {2:N0} mph)" -f $speed, ($speed*3.6), ($speed*2.23694))
        Write-Host ("  Speed (|vel|)   : {0:N1} m/s  (cross-check)" -f $speedDerived)
        Write-Host ("  Throttle/Brake  : {0} / {1}   Steer: {2}" -f $accelPed, $brakePed, $steer)
        Write-Host ("  Power (off 248) : {0:N0} W" -f $power)
        Write-Host ("  Tire temp F/R   : FL {0:N0}  FR {1:N0}  RL {2:N0}  RR {3:N0}" -f $tempFL,$tempFR,$tempRL,$tempRR)
        Write-Host ("  Susp travel norm: FL {0:N2} FR {1:N2} RL {2:N2} RR {3:N2}" -f $susFL,$susFR,$susRL,$susRR)
        Write-Host ("  Slip angle      : FL {0:N2} FR {1:N2} RL {2:N2} RR {3:N2}" -f $slipAngleFL,$slipAngleFR,$slipAngleRL,$slipAngleRR)

        Write-Host "-- TAIL bytes (offset 311+) - the part that differs per game --"
        Show-Hex -Bytes $bytes -Start 311 -End ($len - 1)

        if ($FullHex) {
            Write-Host "-- FULL packet hex --"
            Show-Hex -Bytes $bytes -Start 0 -End ($len - 1)
        }
        Write-Host ""
    }
}
finally {
    $udp.Close()
    Write-Host "Done. Captured $captured packet(s)." -ForegroundColor Cyan
}
