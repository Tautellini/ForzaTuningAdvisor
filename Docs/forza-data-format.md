# Forza Horizon 6 "Data Out" packet format (verified)

**Packet length: 324 bytes. Little-endian.** Verified empirically on 2026-06-04 against a live
FH6 feed (physics cross-checks + controlled-input capture). FH6 uses the FH "Dash" layout, but the
**dash section is shifted +12 bytes vs FH5** — there is a 12-byte block at offset 232–243 (3 ints,
purpose unmapped; observed `26,0,0`) inserted before the dash floats. The "sled" section (0–231) is
the standard Forza layout.

When `IsRaceOn == 0` (menus / paused) the entire packet is zeroed — ignore those frames.

## Sled (offsets 0–231) — standard layout

| Off | Type | Field |
|----:|------|-------|
| 0 | s32 | IsRaceOn |
| 4 | u32 | TimestampMS |
| 8 | f32 | EngineMaxRpm |
| 12 | f32 | EngineIdleRpm |
| 16 | f32 | CurrentEngineRpm |
| 20 | f32 | AccelerationX |
| 24 | f32 | AccelerationY |
| 28 | f32 | AccelerationZ |
| 32 | f32 | VelocityX |
| 36 | f32 | VelocityY |
| 40 | f32 | VelocityZ |
| 44 | f32 | AngularVelocityX |
| 48 | f32 | AngularVelocityY |
| 52 | f32 | AngularVelocityZ |
| 56 | f32 | Yaw |
| 60 | f32 | Pitch |
| 64 | f32 | Roll |
| 68 | f32 | NormalizedSuspensionTravel FL |
| 72 | f32 | NormalizedSuspensionTravel FR |
| 76 | f32 | NormalizedSuspensionTravel RL |
| 80 | f32 | NormalizedSuspensionTravel RR |
| 84 | f32 | TireSlipRatio FL |
| 88 | f32 | TireSlipRatio FR |
| 92 | f32 | TireSlipRatio RL |
| 96 | f32 | TireSlipRatio RR |
| 100 | f32 | WheelRotationSpeed FL |
| 104 | f32 | WheelRotationSpeed FR |
| 108 | f32 | WheelRotationSpeed RL |
| 112 | f32 | WheelRotationSpeed RR |
| 116 | f32 | WheelOnRumbleStrip FL/FR/RL/RR (116/120/124/128) |
| 132 | f32 | WheelInPuddleDepth FL/FR/RL/RR (132/136/140/144) |
| 148 | f32 | SurfaceRumble FL/FR/RL/RR (148/152/156/160) |
| 164 | f32 | TireSlipAngle FL/FR/RL/RR (164/168/172/176) |
| 180 | f32 | TireCombinedSlip FL/FR/RL/RR (180/184/188/192) |
| 196 | f32 | SuspensionTravelMeters FL/FR/RL/RR (196/200/204/208) |
| 212 | s32 | CarOrdinal |
| 216 | s32 | CarClass |
| 220 | s32 | CarPerformanceIndex |
| 224 | s32 | DrivetrainType (0=FWD, 1=RWD, 2=AWD) |
| 228 | s32 | NumCylinders |

## Dash (offsets 232–323) — FH6, shifted +12 vs FH5

| Off | Type | Field | Notes / verified value |
|----:|------|-------|------|
| 232 | 3×s32 | **(reserved, unmapped)** | observed `26,0,0` — new in FH6 |
| 244 | f32 | PositionX | world coords (m) |
| 248 | f32 | PositionY | |
| 252 | f32 | PositionZ | |
| 256 | f32 | Speed | m/s — verified = √(velocity²) |
| 260 | f32 | Power | W |
| 264 | f32 | Torque | Nm |
| 268 | f32 | TireTemp FL | °F — verified (fronts hotter, L≈R) |
| 272 | f32 | TireTemp FR | |
| 276 | f32 | TireTemp RL | |
| 280 | f32 | TireTemp RR | |
| 284 | f32 | Boost | psi — verified (−11 = NA vacuum) |
| 288 | f32 | Fuel | 0..1 — verified (1.0 = full) |
| 292 | f32 | DistanceTraveled | m |
| 296 | f32 | BestLap | s |
| 300 | f32 | LastLap | s |
| 304 | f32 | CurrentLap | s |
| 308 | f32 | CurrentRaceTime | s |
| 312 | u16 | LapNumber | |
| 314 | u8 | RacePosition | |
| 315 | u8 | Accel (throttle) | 0..255 — verified |
| 316 | u8 | Brake | 0..255 — verified |
| 317 | u8 | Clutch | 0..255 |
| 318 | u8 | HandBrake | 0..255 |
| 319 | u8 | Gear | verified (held 8 at speed) |
| 320 | s8 | Steer | −127..127 — verified |
| 321 | s8 | NormalizedDrivingLine | |
| 322 | s8 | NormalizedAIBrakeDifference | |
| 323 | — | (padding) | always 0; brings total to 324 |

## Notably ABSENT from this format
- **Per-tire wear** — only in Forza Motorsport's 331-byte format. No wear-based advice.
- **Per-section (inner/middle/outer) tire temps** — Forza never streams these over UDP; only one
  temp per tire. ⇒ **camber/toe advice is not supportable from this feed.**
