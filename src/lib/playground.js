import {
  DEFAULT_SETTINGS,
  MAX_FREQUENCY,
  parseShareSettings,
  validateFrequency,
} from "./settings";
export function initialPlayground() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    draft: "440",
    frequencyError: "",
    maxFrequency: MAX_FREQUENCY,
    status: "stopped",
    message: "",
    notice: "",
    copyStatus: "",
  };
}
export function playgroundReducer(state, action) {
  switch (action.type) {
    case "hydrate": {
      const settings = parseShareSettings(action.search);
      return { ...state, settings, draft: String(settings.frequency) };
    }
    case "frequency": {
      const result = validateFrequency(action.value, state.maxFrequency);
      return {
        ...state,
        draft: String(action.value),
        frequencyError: result.error || "",
        copyStatus: "",
        settings: result.error
          ? state.settings
          : { ...state.settings, frequency: result.frequency },
      };
    }
    case "preset": {
      const frequency = Math.min(action.preset.frequency, state.maxFrequency);
      return {
        ...state,
        settings: {
          ...state.settings,
          frequency,
          waveform: action.preset.waveform,
        },
        draft: String(frequency),
        frequencyError: "",
        copyStatus: "",
      };
    }
    case "settings":
      return {
        ...state,
        settings: { ...state.settings, ...action.settings },
        copyStatus: "",
      };
    case "status":
      return {
        ...state,
        status: action.status,
        message: action.message || "",
        notice: "",
      };
    case "limit": {
      const frequency = Math.min(state.settings.frequency, action.max);
      const draft =
        frequency === state.settings.frequency
          ? state.draft
          : String(frequency);
      return {
        ...state,
        maxFrequency: action.max,
        settings: { ...state.settings, frequency },
        draft,
        frequencyError: validateFrequency(draft, action.max).error || "",
      };
    }
    case "fallback":
      return {
        ...state,
        settings: { ...state.settings, view: "waveform" },
        notice: "3D is unavailable. You can still explore the audio waveform.",
      };
    case "notice":
      return { ...state, notice: action.message };
    case "copy":
      return { ...state, copyStatus: action.status };
    case "reset": {
      const frequency = Math.min(
        DEFAULT_SETTINGS.frequency,
        state.maxFrequency,
      );
      return {
        ...initialPlayground(),
        maxFrequency: state.maxFrequency,
        settings: { ...DEFAULT_SETTINGS, frequency },
        draft: String(frequency),
      };
    }
    default:
      return state;
  }
}
