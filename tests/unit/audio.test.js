import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToneController } from "../../src/lib/audio";

function audioFixture({ sampleRate = 48000 } = {}) {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(function (value) {
      this.value = value;
    }),
    cancelAndHoldAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(function (value) {
      this.value = value;
    }),
  });
  const oscillator = {
    frequency: param(),
    type: "sine",
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
  const analyser = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((buffer) => buffer.fill(0.1)),
  };
  const context = {
    sampleRate,
    state: "suspended",
    currentTime: 1,
    destination: {},
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    createAnalyser: vi.fn(() => analyser),
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    suspend: vi.fn(async () => {
      context.state = "suspended";
    }),
    close: vi.fn(async () => {
      context.state = "closed";
    }),
  };
  const onStatus = vi.fn(),
    onFrequencyLimit = vi.fn(),
    createContext = vi.fn(() => context);
  const controller = createToneController({
    createContext,
    onStatus,
    onFrequencyLimit,
  });
  return {
    controller,
    context,
    oscillator,
    gain,
    analyser,
    createContext,
    onStatus,
    onFrequencyLimit,
  };
}

describe("audio lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("reuses one context and oscillator across rapid starts and repeated stops", async () => {
    const f = audioFixture();
    await Promise.all([
      f.controller.start(),
      f.controller.start(),
      f.controller.start(),
    ]);
    for (let i = 0; i < 20; i++) {
      f.controller.stop();
      await f.controller.start();
    }
    expect(f.createContext).toHaveBeenCalledTimes(1);
    expect(f.oscillator.start).toHaveBeenCalledTimes(1);
    expect(f.context.createOscillator).toHaveBeenCalledTimes(1);
    expect(f.onStatus).toHaveBeenLastCalledWith("playing", "");
    await f.controller.dispose();
  });
  it("applies frequency and waveform selected before the first play", async () => {
    const f = audioFixture();
    f.controller.update({
      frequency: 261.63,
      waveform: "triangle",
      volume: 0.2,
    });
    await f.controller.start();
    expect(f.oscillator.frequency.value).toBe(261.63);
    expect(f.oscillator.type).toBe("triangle");
    expect(f.gain.gain.value).toBe(0.2);
  });
  it("ramps to silence and suspends hardware after stopping", async () => {
    const f = audioFixture();
    await f.controller.start();
    f.controller.stop();
    expect(f.gain.gain.value).toBe(0);
    expect(f.context.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(f.context.suspend).toHaveBeenCalledTimes(1);
    const buffer = new Float32Array(8).fill(1);
    f.controller.readSamples(buffer);
    expect([...buffer]).toEqual(Array(8).fill(0));
  });
  it("does not restart after Stop while resume is pending", async () => {
    const f = audioFixture();
    let resolve;
    f.context.resume.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = () => {
            f.context.state = "running";
            done();
          };
        }),
    );
    const pending = f.controller.start();
    f.controller.stop();
    await vi.advanceTimersByTimeAsync(50);
    resolve();
    await pending;
    expect(f.gain.gain.value).toBe(0);
    expect(f.context.state).toBe("suspended");
    expect(f.onStatus).not.toHaveBeenCalledWith("playing", "");
  });
  it("mutes briefly when changing shape and cancels the transition on Stop", async () => {
    const f = audioFixture();
    await f.controller.start();
    f.controller.update({ waveform: "square", volume: 0.3 });
    expect(f.gain.gain.value).toBe(0);
    expect(f.oscillator.type).toBe("sine");
    await vi.advanceTimersByTimeAsync(35);
    expect(f.oscillator.type).toBe("square");
    expect(f.gain.gain.value).toBe(0.3);
    f.controller.update({ waveform: "triangle" });
    f.controller.stop();
    await vi.advanceTimersByTimeAsync(40);
    expect(f.gain.gain.value).toBe(0);
  });
  it("reports interruptions and requires an explicit restart", async () => {
    const f = audioFixture();
    await f.controller.start();
    f.context.state = "suspended";
    f.context.onstatechange();
    expect(f.onStatus).toHaveBeenLastCalledWith(
      "stopped",
      "Playback paused. Press Play to resume.",
    );
    await f.controller.start();
    expect(f.context.state).toBe("running");
  });
  it("caps frequency below Nyquist and keeps settings valid", async () => {
    const f = audioFixture({ sampleRate: 22050 });
    f.controller.update({ frequency: 20000 });
    await f.controller.start();
    expect(f.onFrequencyLimit).toHaveBeenCalledWith(11024);
    expect(f.oscillator.frequency.value).toBe(11024);
    f.controller.update({
      frequency: Infinity,
      volume: NaN,
      waveform: "invalid",
    });
    expect(f.oscillator.frequency.value).toBe(11024);
    expect(f.oscillator.type).toBe("sine");
  });
  it("handles resume errors without leaving sound or scheduled transitions", async () => {
    const f = audioFixture();
    f.context.resume.mockRejectedValue(new Error("Audio denied"));
    await f.controller.start();
    expect(f.onStatus).toHaveBeenLastCalledWith("error", "Audio denied");
    expect(f.gain.gain.value).toBe(0);
  });
  it("handles unavailable Web Audio", async () => {
    const onStatus = vi.fn();
    const controller = createToneController({
      createContext: () => {
        throw new Error("Unsupported");
      },
      onStatus,
    });
    await controller.start();
    expect(onStatus).toHaveBeenLastCalledWith("error", "Unsupported");
    await controller.dispose();
  });
  it("disconnects and closes everything exactly once on unmount", async () => {
    const f = audioFixture();
    await f.controller.start();
    f.controller.update({ waveform: "square" });
    await f.controller.dispose();
    await f.controller.dispose();
    await vi.advanceTimersByTimeAsync(100);
    await f.controller.start();
    expect(f.context.close).toHaveBeenCalledTimes(1);
    expect(f.oscillator.stop).toHaveBeenCalledTimes(1);
    expect(f.oscillator.disconnect).toHaveBeenCalledTimes(1);
    expect(f.gain.disconnect).toHaveBeenCalledTimes(1);
    expect(f.analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(f.context.onstatechange).toBeNull();
    expect(f.context.suspend).not.toHaveBeenCalled();
  });
});
