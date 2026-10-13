import {
  DEFAULT_SETTINGS,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  WAVEFORMS,
} from "./settings";

const RAMP_SECONDS = 0.025;

function ramp(param, target, time) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
  param.linearRampToValueAtTime(target, time + RAMP_SECONDS);
}

// Shared by the realtime controller and offline signal verification.
export function createToneVoice(context, output, settings) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = settings.waveform;
  oscillator.frequency.setValueAtTime(settings.frequency, context.currentTime);
  gain.gain.setValueAtTime(0, context.currentTime);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start();
  return { oscillator, gain };
}

export function createToneController({
  createContext = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context)
      throw new Error(
        "This browser does not support Web Audio. Try a current browser.",
      );
    return new Context();
  },
  onStatus = () => {},
  onFrequencyLimit = () => {},
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let context;
  let analyser;
  let voice;
  let settings = { ...DEFAULT_SETTINGS };
  let wanted = false;
  let disposed = false;
  let starting;
  let suspendTimer;
  let waveformTimer;
  let maxFrequency = MAX_FREQUENCY;

  function clearTimers() {
    cancel(suspendTimer);
    cancel(waveformTimer);
    suspendTimer = waveformTimer = undefined;
  }

  function initialize() {
    if (context) return;
    context = createContext();
    maxFrequency = Math.max(
      MIN_FREQUENCY,
      Math.min(MAX_FREQUENCY, Math.floor(context.sampleRate / 2 - 1)),
    );
    settings.frequency = Math.min(settings.frequency, maxFrequency);
    onFrequencyLimit(maxFrequency);
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.connect(context.destination);
    voice = createToneVoice(context, analyser, settings);
    context.onstatechange = () => {
      if (wanted && context.state !== "running" && !starting) {
        stop();
        onStatus("stopped", "Playback paused. Press Play to resume.");
      }
    };
  }

  function update(next) {
    settings = {
      ...settings,
      ...next,
      frequency: Math.min(
        maxFrequency,
        Math.max(
          MIN_FREQUENCY,
          Number.isFinite(next.frequency) ? next.frequency : settings.frequency,
        ),
      ),
      volume: Math.min(
        1,
        Math.max(
          0,
          Number.isFinite(next.volume) ? next.volume : settings.volume,
        ),
      ),
      waveform: WAVEFORMS.includes(next.waveform)
        ? next.waveform
        : settings.waveform,
    };
    if (!voice || disposed) return;
    ramp(voice.oscillator.frequency, settings.frequency, context.currentTime);
    if (
      voice.oscillator.type !== settings.waveform &&
      wanted &&
      context.state === "running"
    ) {
      cancel(waveformTimer);
      ramp(voice.gain.gain, 0, context.currentTime);
      waveformTimer = schedule(
        () => {
          waveformTimer = undefined;
          if (disposed || !wanted) return;
          voice.oscillator.type = settings.waveform;
          ramp(voice.gain.gain, settings.volume, context.currentTime);
        },
        RAMP_SECONDS * 1000 + 5,
      );
    } else {
      if (!wanted) voice.oscillator.type = settings.waveform;
      if (!waveformTimer)
        ramp(
          voice.gain.gain,
          wanted ? settings.volume : 0,
          context.currentTime,
        );
    }
  }

  async function start() {
    if (disposed) return;
    wanted = true;
    cancel(suspendTimer);
    suspendTimer = undefined;
    if (starting) return starting;
    try {
      // Create/resume synchronously inside the user's gesture, including on Safari.
      initialize();
      const resume =
        context.state !== "running" ? context.resume() : Promise.resolve();
      starting = Promise.resolve(resume)
        .then(async () => {
          if (disposed) return;
          if (!wanted) {
            if (context.state === "running") await context.suspend();
            return;
          }
          if (context.state !== "running")
            throw new Error("Audio could not start. Press Play to try again.");
          voice.oscillator.type = settings.waveform;
          ramp(voice.gain.gain, settings.volume, context.currentTime);
          onStatus("playing", "");
        })
        .catch((error) => {
          if (!disposed && wanted) {
            stop();
            onStatus(
              "error",
              error.message ||
                "Audio could not start. Press Play to try again.",
            );
          }
        })
        .finally(() => {
          starting = undefined;
        });
    } catch (error) {
      stop();
      onStatus(
        "error",
        error.message || "Audio could not start. Press Play to try again.",
      );
    }
    return starting;
  }

  function stop() {
    wanted = false;
    clearTimers();
    if (!disposed) onStatus("stopped", "");
    if (!voice || disposed) return;
    ramp(voice.gain.gain, 0, context.currentTime);
    // Keep one silent oscillator; suspend hardware processing after the release ramp.
    suspendTimer = schedule(
      () => {
        suspendTimer = undefined;
        if (!disposed && !wanted && context.state === "running") {
          context.suspend().catch(() => {});
        }
      },
      RAMP_SECONDS * 1000 + 10,
    );
  }

  function readSamples(buffer) {
    if (analyser && wanted && context.state === "running")
      analyser.getFloatTimeDomainData(buffer);
    else buffer.fill(0);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    wanted = false;
    clearTimers();
    if (context) context.onstatechange = null;
    if (voice) {
      voice.oscillator.stop();
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    analyser?.disconnect();
    if (context && context.state !== "closed")
      await context.close().catch(() => {});
  }

  return { start, stop, update, readSamples, dispose };
}
