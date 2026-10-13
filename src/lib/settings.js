export const MIN_FREQUENCY = 20;
export const MAX_FREQUENCY = 20000;
export const WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];
export const DEFAULT_SETTINGS = Object.freeze({
  frequency: 440,
  waveform: "sine",
  volume: 0.1,
  view: "wireframe",
});
export const PRESETS = Object.freeze([
  {
    name: "Low hum",
    frequency: 110,
    waveform: "sine",
    description: "Slow down. Settle in.",
  },
  {
    name: "Middle C",
    frequency: 262,
    waveform: "triangle",
    description: "A softer starting note.",
  },
  {
    name: "Concert A",
    frequency: 440,
    waveform: "sine",
    description: "Pure, clear, familiar.",
  },
  {
    name: "Bright buzz",
    frequency: 220,
    waveform: "sawtooth",
    description: "A little more texture.",
  },
]);

export function validateFrequency(value, max = MAX_FREQUENCY) {
  const frequency =
    typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (
    !Number.isFinite(frequency) ||
    frequency < MIN_FREQUENCY ||
    frequency > max
  ) {
    return {
      error: `Enter a frequency between 20 and ${max.toLocaleString("en-US")} Hz.`,
    };
  }
  return { frequency: Math.round(frequency) };
}

export function frequencyToSlider(frequency, max = MAX_FREQUENCY) {
  return (
    (Math.log(frequency / MIN_FREQUENCY) / Math.log(max / MIN_FREQUENCY)) * 1000
  );
}

export function sliderToFrequency(value, max = MAX_FREQUENCY) {
  return Math.round(
    MIN_FREQUENCY * (max / MIN_FREQUENCY) ** (Number(value) / 1000),
  );
}

export function parseShareSettings(search) {
  const params = new URLSearchParams(search);
  const settings = { ...DEFAULT_SETTINGS };
  const parsed = validateFrequency(params.get("frequency"));
  if (params.has("frequency") && !parsed.error)
    settings.frequency = parsed.frequency;
  if (WAVEFORMS.includes(params.get("waveform")))
    settings.waveform = params.get("waveform");
  if (["wireframe", "waveform"].includes(params.get("view")))
    settings.view = params.get("view");
  return settings;
}

export function createShareUrl(origin, settings) {
  const url = new URL("/", origin);
  url.searchParams.set("frequency", String(Math.round(settings.frequency)));
  url.searchParams.set("waveform", settings.waveform);
  url.searchParams.set("view", settings.view);
  return url.toString();
}

export function formatFrequency(value) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
