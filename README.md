# Waves

A playful browser instrument for shaping a tone and watching it move. Explore four wave shapes, a cyan 3D wireframe, and an oscilloscope drawn from the actual audio output.

[Try Waves](https://waves-beige-nine.vercel.app/) · [Ask a question](https://github.com/ezam0000/waves/discussions/categories/q-a) · [Report a bug](https://github.com/ezam0000/waves/issues)

![Waves with its cyan wireframe, frequency and volume controls, waveform choices, and four sound presets.](docs/images/waves-demo.jpg)

## Explore

On phones and short landscape screens, the compact graph and Play/Stop stay visible while you scroll the controls and presets. Touch targets are at least 44 CSS pixels, with larger labels and safe-area spacing.

- Start with **440 Hz, sine, 10% volume**. Audio stays stopped until you press **Play tone**.
- Enter a frequency between **20 and 20,000 Hz**, or use the logarithmic slider. The maximum also respects your audio device's sample rate.
- Try sine, triangle, square, or sawtooth. The four presets preserve your volume and playback state.
- Switch between **3D wireframe**, a stylized interpretation, and **Waveform**, the actual output measured by Web Audio.
- Press **Stop** or **Esc** to stop. Hiding the tab also stops audio; returning never restarts it automatically.
- **Reset** stops playback and restores defaults. **Copy link** shares frequency, wave shape, and view, without sharing volume or autoplay.

Start with your system volume low. If you cannot hear a tone, check the tab, your output device, and the app's volume control. Browser interruptions show a message and require another Play action.

The wireframe pauses when stopped, hidden, or reduced motion is enabled. Browsers without WebGL fall back to the 2D waveform. All audio is generated locally; no account, backend, microphone access, or environment variables are required.

## Run locally

Use **Node.js 24 LTS**; the exact tested runtime is pinned in `.nvmrc`.

```sh
git clone https://github.com/ezam0000/waves.git
cd waves
nvm install
nvm use
npm ci
npm run dev
```

If you do not use nvm, install Node.js 24 directly before running `npm ci`. Open [localhost:3000](http://localhost:3000).

For a production build:

```sh
npm run build
npm start
```

## Checks

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browser
```

`check` runs lint, 40 unit tests, and the production build. Browser checks cover Chromium, Firefox, and WebKit, including measured pitch and gain, silence, presets, sharing, keyboard controls, mobile sizing, reduced motion, context loss, and graphics cleanup. The browser suite owns port **4317** and refuses to reuse another app's server. Linux GitHub Actions runs the complete suite for pull requests and main.

Some macOS installations currently prevent Playwright's Firefox from opening its profile ([upstream issue](https://github.com/microsoft/playwright/issues/42768)). Chromium and WebKit can still be checked locally:

```sh
npm run test:browser -- --project=chromium --project=webkit
```

Audio tests inspect native browser signal data and offline renders. They do not certify physical speakers, headphones, or phones; verify those separately at low volume. `npm audit --omit=dev` checks production dependency advisories. Next's development lint dependency currently has an upstream, unpatched `braces` advisory; do not use `npm audit fix --force`, which proposes downgrading the framework.

Other commands: `npm run test:watch` for unit tests during development and `npm run format` for source formatting.

## How it works

| Module                                                      | Responsibility                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/pages/index.js`                                        | Accessible single-page interface and shared playground state.                                        |
| `src/lib/audio.js`                                          | One reusable audio context and oscillator, smooth gain changes, pause/resume, sampling, and cleanup. |
| `src/lib/settings.js` / `src/lib/playground.js`             | Validation, logarithmic frequency mapping, presets, and share-link parsing.                          |
| `src/components/WaveVisualizer.js` / `src/lib/animation.js` | Container-sized visuals, one frame loop, resource disposal, reduced motion, and fallback.            |

Built with pinned Next.js 16, React 19, Three.js, simplex-noise, and CSS Modules. The Pages Router produces a static home page; graphics load in a separate client bundle. Vercel creates previews from feature branches and production deployments from main. Previous deployments remain available through Vercel's deployment history for rollback.

## Questions and contributions

Use [Q&A Discussions](https://github.com/ezam0000/waves/discussions/categories/q-a) for questions and ideas. For bugs, [open an issue](https://github.com/ezam0000/waves/issues) with your browser, reproduction steps, and expected behavior. Focused pull requests with passing checks are welcome.
