import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { createToneController } from "../lib/audio";
import { initialPlayground, playgroundReducer } from "../lib/playground";
import {
  PRESETS,
  WAVEFORMS,
  createShareUrl,
  formatFrequency,
  frequencyToSlider,
  sliderToFrequency,
} from "../lib/settings";
import styles from "../styles/Playground.module.css";

const WaveVisualizer = dynamic(() => import("../components/WaveVisualizer"), {
  ssr: false,
  loading: () => <div className={styles.loading}>Preparing the canvas…</div>,
});

export default function Home() {
  const [state, dispatch] = useReducer(
    playgroundReducer,
    undefined,
    initialPlayground,
  );
  const controllerRef = useRef(null);
  const stageRef = useRef(null);
  useEffect(() => {
    const stage = stageRef.current;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--waves-stage-height",
        `${Math.ceil(stage.getBoundingClientRect().height)}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--waves-stage-height");
    };
  }, []);
  const {
    settings,
    draft,
    frequencyError,
    maxFrequency,
    status,
    message,
    notice,
    copyStatus,
  } = state;
  const active = status === "playing" || status === "starting";
  useEffect(() => {
    const controller = createToneController({
      onStatus: (status, message) =>
        dispatch({ type: "status", status, message }),
      onFrequencyLimit: (max) => dispatch({ type: "limit", max }),
    });
    controllerRef.current = controller;
    dispatch({ type: "hydrate", search: window.location.search });
    return () => {
      controllerRef.current = null;
      void controller.dispose();
    };
  }, []);
  useEffect(() => {
    controllerRef.current?.update(settings);
  }, [settings]);
  useEffect(() => {
    const stopOnHidden = () => {
      if (document.hidden) {
        controllerRef.current?.stop();
        if (active) {
          dispatch({
            type: "notice",
            message: "Paused while this tab was hidden. Press Play to resume.",
          });
        }
      }
    };
    const stopOnEscape = (event) => {
      if (event.key === "Escape") controllerRef.current?.stop();
    };
    document.addEventListener("visibilitychange", stopOnHidden);
    document.addEventListener("keydown", stopOnEscape);
    return () => {
      document.removeEventListener("visibilitychange", stopOnHidden);
      document.removeEventListener("keydown", stopOnEscape);
    };
  }, [active]);
  const fallback = useCallback(() => dispatch({ type: "fallback" }), []);
  function togglePlayback() {
    if (active) controllerRef.current?.stop();
    else if (!frequencyError) {
      controllerRef.current?.update(settings);
      dispatch({ type: "status", status: "starting" });
      void controllerRef.current?.start();
    }
  }
  function reset() {
    controllerRef.current?.stop();
    dispatch({ type: "reset" });
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        createShareUrl(window.location.origin, settings),
      );
      dispatch({ type: "copy", status: "copied" });
    } catch {
      dispatch({ type: "copy", status: "manual" });
    }
  }
  return (
    <>
      <Head>
        <title>Waves — sound in motion</title>
        <meta
          name="description"
          content="A playful tone generator with a cyan 3D wave surface and a live audio waveform. Shape a sound, find a preset, and share your experiment."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#081416" />
        <meta property="og:title" content="Waves — sound in motion" />
        <meta
          property="og:description"
          content="A little sound. A lot of motion. Explore a playful audio playground."
        />
        <meta
          property="og:image"
          content="https://waves-beige-nine.vercel.app/waves-preview.jpg"
        />
        <meta property="og:type" content="website" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <div className={styles.page}>
        <header className={styles.header}>
          <Link
            className={styles.brand}
            href="/"
            aria-label="Waves home"
            onClick={reset}
          >
            waves<span className={styles.brandDot}>.</span>
          </Link>
          <div className={styles.headerRight}>
            <span>Sound in motion</span>
            <a href="https://github.com/ezam0000/waves">GitHub</a>
          </div>
        </header>
        <main>
          <section className={styles.intro} aria-labelledby="page-title">
            <p className={styles.eyebrow}>A SMALL EXPERIMENT IN SOUND</p>
            <h1 id="page-title">
              A little sound.
              <br />
              <span>A lot of motion.</span>
            </h1>
            <p className={styles.description}>
              Shape a tone. Watch it move.
              <br className={styles.mobileBreak} /> Follow your curiosity.
            </p>
          </section>
          <div className={styles.instrument}>
            <section
              ref={stageRef}
              className={styles.stage}
              aria-label="Sound visualization"
            >
              <div className={styles.stageHeader}>
                <div>
                  <span className={styles.stageEyebrow}>LIVE CANVAS</span>
                  <h2>The shape of sound</h2>
                </div>
                <div className={styles.stageTransport}>
                  <span
                    className={`${styles.status} ${status === "playing" ? styles.statusActive : ""}`}
                    role="status"
                  >
                    <span />
                    {status === "playing"
                      ? "Playing"
                      : status === "starting"
                        ? "Starting"
                        : status === "error"
                          ? "Audio unavailable"
                          : "Stopped"}
                  </span>
                  <button
                    className={styles.play}
                    type="button"
                    onClick={togglePlayback}
                    disabled={!active && Boolean(frequencyError)}
                  >
                    {active ? "Stop" : "Play tone"}
                  </button>
                </div>
              </div>
              <WaveVisualizer
                settings={settings}
                playing={status === "playing"}
                controllerRef={controllerRef}
                onFallback={fallback}
              />
              <div className={styles.stageFooter}>
                <div
                  className={styles.viewTabs}
                  role="group"
                  aria-label="Visualization view"
                >
                  {["wireframe", "waveform"].map((view) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={settings.view === view}
                      onClick={() =>
                        dispatch({ type: "settings", settings: { view } })
                      }
                    >
                      {view === "wireframe" ? "3D wireframe" : "Waveform"}
                    </button>
                  ))}
                </div>
                <p>
                  {settings.view === "wireframe"
                    ? "A stylized interpretation"
                    : status === "playing"
                      ? "Your actual audio output"
                      : "Press Play to see the waveform"}
                </p>
              </div>
            </section>
            <section
              className={styles.controls}
              aria-labelledby="controls-title"
            >
              <div className={styles.controlsHeading}>
                <h2 id="controls-title">Make it your own</h2>
                <span>01 / TONE</span>
              </div>
              <label className={styles.label} htmlFor="frequency">
                Frequency
              </label>
              <div className={styles.frequencyField}>
                <input
                  id="frequency"
                  type="number"
                  inputMode="decimal"
                  min="20"
                  max={maxFrequency}
                  step="0.01"
                  value={draft}
                  aria-invalid={Boolean(frequencyError)}
                  aria-describedby={
                    frequencyError ? "frequency-error" : "frequency-range"
                  }
                  onChange={(event) =>
                    dispatch({ type: "frequency", value: event.target.value })
                  }
                />
                <span>Hz</span>
              </div>
              <input
                className={styles.slider}
                type="range"
                min="0"
                max="1000"
                step="1"
                aria-label="Frequency slider"
                aria-valuetext={`${formatFrequency(settings.frequency)} hertz`}
                value={frequencyToSlider(settings.frequency, maxFrequency)}
                onChange={(event) =>
                  dispatch({
                    type: "frequency",
                    value: sliderToFrequency(event.target.value, maxFrequency),
                  })
                }
              />
              <div className={styles.rangeLabels} id="frequency-range">
                <span>20 Hz</span>
                <span>{formatFrequency(maxFrequency)} Hz</span>
              </div>
              {frequencyError && (
                <p className={styles.error} id="frequency-error" role="alert">
                  {frequencyError}
                </p>
              )}
              <fieldset className={styles.waveforms}>
                <legend className={styles.label}>Wave shape</legend>
                <div>
                  {WAVEFORMS.map((waveform) => (
                    <button
                      type="button"
                      key={waveform}
                      aria-pressed={settings.waveform === waveform}
                      onClick={() =>
                        dispatch({ type: "settings", settings: { waveform } })
                      }
                    >
                      {waveform[0].toUpperCase() + waveform.slice(1)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className={styles.volumeLabel}>
                <label className={styles.label} htmlFor="volume">
                  Volume
                </label>
                <output htmlFor="volume">
                  {Math.round(settings.volume * 100)}%
                </output>
              </div>
              <input
                id="volume"
                className={styles.slider}
                type="range"
                min="0"
                max="100"
                value={Math.round(settings.volume * 100)}
                onChange={(event) =>
                  dispatch({
                    type: "settings",
                    settings: { volume: Number(event.target.value) / 100 },
                  })
                }
              />
              <p className={styles.playHint}>
                Start quietly. Press Esc to stop.
              </p>
              <div className={styles.actions}>
                <button type="button" onClick={reset}>
                  Reset
                </button>
                <button type="button" onClick={copyLink}>
                  {copyStatus === "copied" ? "Link copied" : "Copy link"}
                </button>
              </div>
              <span className={styles.srOnly} role="status">
                {copyStatus === "copied" ? "Link copied to clipboard." : ""}
              </span>
              {copyStatus === "manual" && (
                <div className={styles.manualCopy}>
                  <label htmlFor="share-link">Copy this link</label>
                  <input
                    id="share-link"
                    readOnly
                    value={createShareUrl(window.location.origin, settings)}
                    onFocus={(event) => event.target.select()}
                  />
                </div>
              )}
              {message && (
                <p className={styles.error} role="alert">
                  {message}
                </p>
              )}
            </section>
          </div>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          <section className={styles.presets} aria-labelledby="presets-title">
            <div className={styles.presetHeading}>
              <h2 id="presets-title">Find a starting point</h2>
              <p>Four sounds. Plenty of possibilities.</p>
            </div>
            <div className={styles.presetGrid}>
              {PRESETS.map((preset, index) => (
                <button
                  type="button"
                  key={preset.name}
                  aria-pressed={
                    settings.frequency === preset.frequency &&
                    settings.waveform === preset.waveform
                  }
                  onClick={() => dispatch({ type: "preset", preset })}
                >
                  <span className={styles.presetNumber}>0{index + 1}</span>
                  <span className={styles.presetName}>{preset.name}</span>
                  <span className={styles.presetDescription}>
                    {preset.description}
                  </span>
                  <span className={styles.presetMeta}>
                    {preset.frequency} Hz <span>·</span> {preset.waveform}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </main>
        <footer className={styles.footer}>
          <p>Made for a moment of curiosity.</p>
          <a href="https://github.com/ezam0000/waves/discussions/categories/q-a">
            Questions & ideas
          </a>
          <span>All sound stays in your browser.</span>
        </footer>
      </div>
    </>
  );
}
