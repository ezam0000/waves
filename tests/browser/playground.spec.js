import { test, expect } from "@playwright/test";
import { createToneVoice } from "../../src/lib/audio";

async function instrument(page) {
  await page.addInitScript(() => {
    window.__wavesAudio = [];
    const NativeContext = window.AudioContext || window.webkitAudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args);
        this.testOscillators = [];
        window.__wavesAudio.push(this);
      }
      createOscillator() {
        const node = super.createOscillator();
        this.testOscillators.push(node);
        return node;
      }
      createAnalyser() {
        const node = super.createAnalyser();
        this.testAnalyser = node;
        return node;
      }
    };
    window.__wavesFrames = { drawn: 0, pending: new Set() };
    const request = window.requestAnimationFrame.bind(window),
      cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => {
        window.__wavesFrames.pending.delete(id);
        window.__wavesFrames.drawn++;
        callback(time);
      });
      window.__wavesFrames.pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      window.__wavesFrames.pending.delete(id);
      cancel(id);
    };
    window.__wavesGL = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const gl = original.call(this, type, ...args);
      if (gl && type.startsWith("webgl") && !gl.testBuffers) {
        gl.testBuffers = new Set();
        window.__wavesGL.push(gl);
        const create = gl.createBuffer.bind(gl),
          remove = gl.deleteBuffer.bind(gl);
        gl.createBuffer = () => {
          const buffer = create();
          gl.testBuffers.add(buffer);
          return buffer;
        };
        gl.deleteBuffer = (buffer) => {
          gl.testBuffers.delete(buffer);
          return remove(buffer);
        };
      }
      return gl;
    };
  });
}
async function setRange(locator, value) {
  await locator.evaluate((input, next) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}
async function signal(page) {
  return page.evaluate(() => {
    const context = window.__wavesAudio.at(-1);
    if (!context?.testAnalyser) return { rms: 0, frequency: 0, state: "none" };
    const samples = new Float32Array(2048);
    context.testAnalyser.getFloatTimeDomainData(samples);
    let squares = 0;
    const crossings = [];
    for (let i = 0; i < samples.length; i++) {
      squares += samples[i] ** 2;
      if (i > 0 && samples[i - 1] <= 0 && samples[i] > 0) crossings.push(i);
    }
    return {
      rms: Math.sqrt(squares / samples.length),
      frequency:
        crossings.length > 1
          ? (context.sampleRate * (crossings.length - 1)) /
            (crossings.at(-1) - crossings[0])
          : 0,
      state: context.state,
    };
  });
}

test("defaults, validation, presets, and reset are accessible", async ({
  page,
}) => {
  await instrument(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("Waves — sound in motion");
  await expect(page.getByLabel("Frequency", { exact: true })).toHaveValue(
    "440",
  );
  await expect(page.getByLabel("Volume", { exact: true })).toHaveValue("10");
  await expect(
    page.getByRole("button", { name: "Play tone", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.__wavesAudio.length)).toBe(0);
  await page.getByLabel("Frequency", { exact: true }).fill("");
  await expect(page.locator("#frequency-error")).toContainText(
    "between 20 and 20,000",
  );
  await expect(
    page.getByRole("button", { name: "Play tone", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Frequency", { exact: true }).fill("20001");
  await expect(page.getByLabel("Frequency", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await setRange(page.getByLabel("Volume", { exact: true }), 25);
  await page.getByRole("button", { name: /Middle C/ }).click();
  await expect(page.getByLabel("Frequency", { exact: true })).toHaveValue(
    "261.63",
  );
  await expect(
    page.getByRole("button", { name: "Triangle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Volume", { exact: true })).toHaveValue("25");
  await expect(page.locator("#frequency-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Frequency", { exact: true })).toHaveValue(
    "440",
  );
  await expect(page.getByLabel("Volume", { exact: true })).toHaveValue("10");
  expect(errors).toEqual([]);
});

test("share links restore sound and view without autoplay or volume", async ({
  page,
}) => {
  await instrument(page);
  await page.goto(
    "/?frequency=261.63&waveform=triangle&view=waveform&volume=1&playing=true",
  );
  await expect(page.getByLabel("Frequency", { exact: true })).toHaveValue(
    "261.63",
  );
  await expect(
    page.getByRole("button", { name: "Triangle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Waveform", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Volume", { exact: true })).toHaveValue("10");
  expect(await page.evaluate(() => window.__wavesAudio.length)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copied = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const copied = new URL(await page.evaluate(() => window.__copied));
  expect([...copied.searchParams.keys()]).toEqual([
    "frequency",
    "waveform",
    "view",
  ]);
  await page.goto("/?frequency=-20&waveform=unknown&view=unknown");
  await expect(page.getByLabel("Frequency", { exact: true })).toHaveValue(
    "440",
  );
});

test("actual audio follows frequency, volume, presets, and Stop", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/?view=waveform");
  await page.getByLabel("Frequency", { exact: true }).fill("880");
  await page.getByRole("button", { name: "Play tone", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await signal(page)).rms).toBeGreaterThan(0.04);
  await expect
    .poll(async () => Math.abs((await signal(page)).frequency - 880))
    .toBeLessThan(8);
  await setRange(page.getByLabel("Volume", { exact: true }), 25);
  await expect.poll(async () => (await signal(page)).rms).toBeGreaterThan(0.14);
  await page.getByRole("button", { name: /Middle C/ }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Math.abs((await signal(page)).frequency - 261.63))
    .toBeLessThan(5);
  await expect(page.getByLabel("Volume", { exact: true })).toHaveValue("25");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Play tone", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await signal(page)).state).toBe("suspended");
  await page.getByRole("button", { name: "Play tone", exact: true }).click();
  await expect.poll(async () => (await signal(page)).rms).toBeGreaterThan(0.05);
  await setRange(page.getByLabel("Volume", { exact: true }), 0);
  await expect.poll(async () => (await signal(page)).rms).toBeLessThan(0.00001);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect(
    await page.evaluate(() => ({
      contexts: window.__wavesAudio.length,
      oscillators: window.__wavesAudio[0].testOscillators.length,
    })),
  ).toEqual({ contexts: 1, oscillators: 1 });
});

test("repeated controls keep one canvas and renderer; switching releases GPU buffers", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  for (let i = 0; i < 20; i++)
    await page
      .getByLabel("Frequency", { exact: true })
      .fill(String(100 + i * 70));
  await expect(page.locator("canvas")).toHaveCount(1);
  const before = await page.evaluate(() => window.__wavesGL.length);
  expect(before).toBeLessThanOrEqual(2); // StrictMode may mount twice in a dev server; production mounts once.
  await page.getByRole("button", { name: "Waveform", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "Oscilloscope showing the actual audio output",
    }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(
    await page.evaluate(() =>
      window.__wavesGL.reduce((sum, gl) => sum + gl.testBuffers.size, 0),
    ),
  ).toBe(0);
  await expect
    .poll(async () => page.evaluate(() => window.__wavesFrames.pending.size))
    .toBe(0);
});

test("reduced motion and hidden tabs stop continuous processing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await instrument(page);
  await page.goto("/?view=waveform");
  await page.getByRole("button", { name: "Play tone", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.__wavesFrames.pending.size))
    .toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "Play tone", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await signal(page)).state).toBe("suspended");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "Play tone", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Paused while this tab was hidden. Press Play to resume."),
  ).toBeVisible();
});

test("missing WebGL falls back to a waveform and audio remains usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith("webgl") ? null : get.call(this, type, ...args);
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Waveform", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText(
      "3D is unavailable. You can still explore the audio waveform.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play tone", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

test("losing the WebGL context releases the old surface and falls back", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  if (
    (await page
      .getByRole("button", { name: "Waveform", exact: true })
      .getAttribute("aria-pressed")) === "true"
  )
    return;
  await page
    .locator("canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(
    page.getByRole("button", { name: "Waveform", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("mobile layout fits the screen and all controls remain reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A little sound/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Bright buzz/ }).click();
  await expect(page.getByLabel("Frequency", { exact: true })).toHaveValue(
    "220",
  );
  await page.getByRole("button", { name: "Play tone", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Play tone", exact: true }),
  ).toBeVisible();
});

test("clipboard failure provides a selectable share link", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByLabel("Copy this link")).toHaveValue(
    /frequency=440&waveform=sine&view=/,
  );
});

for (const waveform of ["sine", "triangle", "square", "sawtooth"]) {
  test(`offline ${waveform} signal has the selected pitch, gain, and silence after Stop`, async ({
    page,
  }) => {
    await page.goto("/?view=waveform");
    const result = await page.evaluate(
      async ({ source, waveform }) => {
        const makeVoice = new Function(`return (${source})`)();
        const context = new OfflineAudioContext(1, 24000, 48000);
        const voice = makeVoice(context, context.destination, {
          frequency: 440,
          waveform,
        });
        voice.gain.gain.linearRampToValueAtTime(0.2, 0.025);
        voice.gain.gain.setValueAtTime(0.2, 0.25);
        voice.gain.gain.linearRampToValueAtTime(0, 0.275);
        voice.oscillator.stop(0.3);
        const buffer = await context.startRendering(),
          samples = buffer.getChannelData(0);
        const crossings = [];
        let sum = 0,
          silence = 0;
        for (let i = 2400; i < 9600; i++) {
          sum += samples[i] ** 2;
          if (samples[i - 1] <= 0 && samples[i] > 0) crossings.push(i);
        }
        for (let i = 16800; i < samples.length; i++)
          silence = Math.max(silence, Math.abs(samples[i]));
        return {
          frequency:
            (context.sampleRate * (crossings.length - 1)) /
            (crossings.at(-1) - crossings[0]),
          rms: Math.sqrt(sum / 7200),
          silence,
        };
      },
      { source: createToneVoice.toString(), waveform },
    );
    expect(result.frequency).toBeCloseTo(440, 0);
    expect(result.rms).toBeGreaterThan(0.08);
    expect(result.rms).toBeLessThanOrEqual(0.201);
    expect(result.silence).toBe(0);
  });
}
