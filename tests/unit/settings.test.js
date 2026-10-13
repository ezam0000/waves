import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  createShareUrl,
  frequencyToSlider,
  formatFrequency,
  parseShareSettings,
  sliderToFrequency,
  validateFrequency,
} from "../../src/lib/settings";
import { initialPlayground, playgroundReducer } from "../../src/lib/playground";

describe("frequency and sharing", () => {
  it("shows whole hertz when moving the slider or formatting frequency", () => {
    expect(Number.isInteger(sliderToFrequency(673))).toBe(true);
    expect(formatFrequency(2089.44)).toBe("2,089");
  });
  it.each(["", " ", "nope", "Infinity", NaN, Infinity, -1, 0, 19.99, 20000.01])(
    "rejects invalid frequency %s",
    (value) => {
      expect(validateFrequency(value).error).toBeTruthy();
    },
  );
  it.each([20, 261.63, 440, 20000])("accepts %s Hz", (value) =>
    expect(validateFrequency(String(value))).toEqual({
      frequency: Math.round(value),
    }),
  );
  it("respects the audio device limit", () =>
    expect(validateFrequency(12000, 11024).error).toBeTruthy());
  it.each([20, 110, 440, 20000])("round trips logarithmic slider %s", (value) =>
    expect(sliderToFrequency(frequencyToSlider(value))).toBeCloseTo(value, 2),
  );
  it("falls back independently for invalid share parameters and ignores volume/playback", () => {
    expect(
      parseShareSettings(
        "?frequency=NaN&waveform=triangle&view=unknown&volume=1&playing=true",
      ),
    ).toEqual({ ...DEFAULT_SETTINGS, waveform: "triangle" });
  });
  it("round trips shared sound and view with default volume", () => {
    const url = new URL(
      createShareUrl("https://example.com/path?secret=ignored", {
        frequency: 261.63,
        waveform: "triangle",
        volume: 0.8,
        view: "waveform",
      }),
    );
    expect([...url.searchParams.keys()]).toEqual([
      "frequency",
      "waveform",
      "view",
    ]);
    expect(url.pathname).toBe("/");
    expect(parseShareSettings(url.search)).toEqual({
      frequency: 262,
      waveform: "triangle",
      volume: 0.1,
      view: "waveform",
    });
  });
});

describe("playground state", () => {
  it("rounds pasted decimal frequency and its visible draft together", () => {
    const state = playgroundReducer(initialPlayground(), {
      type: "frequency",
      value: "2089.44",
    });
    expect(state.settings.frequency).toBe(2089);
    expect(state.draft).toBe("2089");
    expect(state.frequencyError).toBe("");
  });
  it("preserves the valid sound when the draft is empty or invalid", () => {
    const state = playgroundReducer(initialPlayground(), {
      type: "frequency",
      value: "",
    });
    expect(state.draft).toBe("");
    expect(state.frequencyError).toBeTruthy();
    expect(state.settings.frequency).toBe(440);
  });
  it.each(PRESETS)("preset $name preserves volume and playback", (preset) => {
    const before = {
      ...initialPlayground(),
      status: "playing",
      settings: { ...DEFAULT_SETTINGS, volume: 0.25 },
      frequencyError: "invalid",
    };
    const after = playgroundReducer(before, { type: "preset", preset });
    expect(after.settings).toMatchObject({
      frequency: preset.frequency,
      waveform: preset.waveform,
      volume: 0.25,
    });
    expect(after.status).toBe("playing");
    expect(after.frequencyError).toBe("");
  });
  it("reset stops playback and restores defaults", () => {
    expect(
      playgroundReducer(
        { ...initialPlayground(), status: "playing", draft: "" },
        { type: "reset" },
      ),
    ).toEqual(initialPlayground());
  });
  it("clamps a shared frequency to a device limit and synchronizes the draft", () => {
    const shared = playgroundReducer(initialPlayground(), {
      type: "hydrate",
      search: "?frequency=20000",
    });
    const result = playgroundReducer(shared, { type: "limit", max: 11024 });
    expect(result.settings.frequency).toBe(11024);
    expect(result.draft).toBe("11024");
  });
});
