// BuildaMic default analyzer (L2 template, docs/decisions/0012 §4.2/§4.3) — distributed with addons/builda;
// once installed it belongs to the project: sdk install upgrades do not overwrite addons/builda/mic/, and modifying this file does not affect the SDK
// version or distribution chain (to restore defaults: delete the addons/builda/mic directory and rerun builda sdk install).
//
// Contract (to change the algorithm/add features edit only this file; builda_mic.gd needs no changes):
//   in:  { samples: Float32Array, sampleRate: number }   ← PCM slice transferred by the page pump
//   out: postMessage({ volume, pitch, ... })             ← flat object; fields appear as-is in
//                                                          BuildaMic.features on the GDScript side
//
// Default features:
//   volume — RMS of the latest analysis window (0..1 scale; BGM crosstalk is always present in the PCM, so tune thresholds with BGM on)
//   pitch  — YIN fundamental frequency (Hz, 70–1000; 0 when silent/unpitched)
// Heavy DSP belongs here: this Worker runs truly in parallel with the single-threaded Godot engine; 10ms late is imperceptible (0012 §4.3).

var WINDOW = 2048; // analysis window (about 43ms at 48kHz, the natural window for pitch detection)
var PITCH_MIN_HZ = 70;
var PITCH_MAX_HZ = 1000;
var YIN_THRESHOLD = 0.15;

var pending = new Float32Array(0);

onmessage = function (e) {
  var data = e.data || {};
  var samples = data.samples;
  var rate = data.sampleRate || 48000;
  if (!samples || !samples.length) return;
  var merged = new Float32Array(pending.length + samples.length);
  merged.set(pending);
  merged.set(samples, pending.length);
  // Keep only the newest data to prevent pull backlog (real-time control needs the latest window, not a continuous stream)
  if (merged.length > WINDOW * 4) merged = merged.slice(merged.length - WINDOW * 4);
  pending = merged;
  if (pending.length < WINDOW) return;
  var win = pending.slice(pending.length - WINDOW);
  pending = new Float32Array(0);
  postMessage({ volume: rms(win), pitch: yinPitch(win, rate) });
};

function rms(s) {
  var sum = 0;
  for (var i = 0; i < s.length; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / s.length);
}

// Simplified YIN: difference function → cumulative mean normalization → absolute threshold picks the first dip → parabolic interpolation refinement
function yinPitch(s, rate) {
  var minTau = Math.max(2, Math.floor(rate / PITCH_MAX_HZ));
  var maxTau = Math.min(s.length - 1, Math.floor(rate / PITCH_MIN_HZ));
  if (maxTau <= minTau) return 0;
  var d = new Float32Array(maxTau + 1);
  for (var tau = 1; tau <= maxTau; tau++) {
    var sum = 0;
    for (var i = 0; i + tau < s.length; i++) {
      var diff = s[i] - s[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  var cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  var running = 0;
  for (tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? d[tau] * tau / running : 1;
  }
  var best = -1;
  for (tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) return 0;
  var x0 = best > 1 ? cmnd[best - 1] : cmnd[best];
  var x1 = cmnd[best];
  var x2 = best < maxTau ? cmnd[best + 1] : cmnd[best];
  var denom = x0 + x2 - 2 * x1;
  var shift = denom !== 0 ? 0.5 * (x0 - x2) / denom : 0;
  return rate / (best + shift);
}
