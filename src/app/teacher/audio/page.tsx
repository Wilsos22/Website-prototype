"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SiteNav from "@/components/SiteNav";
import {
  getClassroomAudio,
  musicAudioKey,
  removeClassroomAudio,
  saveClassroomAudio,
  TIMER_CUE_KEYS,
  type TimerCueKey,
} from "@/lib/classroomAudio";
import { DEFAULT_STATES, type ClassState } from "@/lib/classStates";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.webm";
const AUDIO_EXTENSION = /\.(aac|m4a|mp3|oga|ogg|opus|wav|webm)$/i;

const CORE_STATE_IDS = [
  "warmup",
  "review",
  "launch",
  "concrete",
  "representational",
  "abstract",
  "learning-check",
  "discussion",
  "independent",
  "exit",
  "closeout",
] as const;

const CORE_STATE_ID_SET = new Set<string>(CORE_STATE_IDS);
const CORE_STATES = CORE_STATE_IDS
  .map((stateId) => DEFAULT_STATES.find((state) => state.id === stateId))
  .filter((state): state is ClassState => Boolean(state));
const OTHER_STATES = DEFAULT_STATES.filter((state) => !CORE_STATE_ID_SET.has(state.id));
const ALL_AUDIO_KEYS = [
  ...TIMER_CUE_KEYS,
  ...DEFAULT_STATES.map((state) => musicAudioKey(state.id)),
];

const CUE_DETAILS: Record<TimerCueKey, { label: string; description: string }> = {
  warn30: { label: "30-second warning", description: "Give the class a short heads-up." },
  tick: { label: "Countdown tick", description: "Play each second from 10 to 1." },
  end: { label: "Time's up", description: "Signal the end of the timer." },
};

interface StoredAudio {
  blob: Blob;
  url: string;
}

interface RowNotice {
  kind: "working" | "saved" | "error";
  message: string;
}

interface AudioRowProps {
  storageKey: string;
  label: string;
  description?: string;
  emptyLabel: string;
  asset?: StoredAudio;
  notice?: RowNotice;
  isPlaying: boolean;
  onFile: (file: File | undefined) => void;
  onPreview: () => void;
  onRemove: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function storedAudioLabel(asset: StoredAudio): string {
  const name = typeof File !== "undefined" && asset.blob instanceof File ? asset.blob.name : "Audio saved";
  return `${name} - ${formatBytes(asset.blob.size)}`;
}

function validateAudio(file: File): string | null {
  if (file.size === 0) return "Choose a file that contains audio.";
  if (file.size > MAX_AUDIO_BYTES) return "Choose an audio file smaller than 50 MB.";
  if (!file.type.toLowerCase().startsWith("audio/") && !AUDIO_EXTENSION.test(file.name)) {
    return "Choose an MP3, WAV, M4A, AAC, OGG, Opus, or WebM audio file.";
  }
  return null;
}

function AudioRow({
  storageKey,
  label,
  description,
  emptyLabel,
  asset,
  notice,
  isPlaying,
  onFile,
  onPreview,
  onRemove,
}: AudioRowProps) {
  const isWorking = notice?.kind === "working";

  return (
    <div className="al-row">
      <div className="al-row-copy">
        <h3>{label}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="al-file">
        <span className={asset ? "al-file-set" : ""}>{asset ? storedAudioLabel(asset) : emptyLabel}</span>
        {notice && (
          <span className={`al-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.message}
          </span>
        )}
      </div>
      <div className="al-actions">
        <button type="button" className="al-button" onClick={onPreview} disabled={!asset || isWorking}>
          {isPlaying ? "Stop" : "Preview"}
        </button>
        <label className={`al-button al-upload${isWorking ? " disabled" : ""}`}>
          {isWorking ? "Saving" : asset ? "Replace" : "Upload"}
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            aria-label={`${asset ? "Replace" : "Upload"} audio for ${label}`}
            disabled={isWorking}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              onFile(file);
            }}
          />
        </label>
        {asset && (
          <button type="button" className="al-button al-remove" onClick={onRemove} disabled={isWorking}>
            Remove
          </button>
        )}
      </div>
      <span className="al-key" aria-hidden="true">{storageKey}</span>
    </div>
  );
}

export default function TeacherAudioLibrary() {
  const [assets, setAssets] = useState<Record<string, StoredAudio>>({});
  const [notices, setNotices] = useState<Record<string, RowNotice>>({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const assetsRef = useRef<Record<string, StoredAudio>>({});
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const next: Record<string, StoredAudio> = {};

        for (const storageKey of ALL_AUDIO_KEYS) {
          const blob = await getClassroomAudio(storageKey);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.add(url);
          next[storageKey] = { blob, url };
        }

        if (cancelled) {
          Object.values(next).forEach((asset) => URL.revokeObjectURL(asset.url));
          return;
        }

        assetsRef.current = next;
        setAssets(next);
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Audio storage could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current = null;
      }
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  function setRowNotice(storageKey: string, notice: RowNotice) {
    setNotices((current) => ({ ...current, [storageKey]: notice }));
  }

  function replaceAsset(storageKey: string, blob: Blob) {
    const previous = assetsRef.current[storageKey];
    if (previous) {
      URL.revokeObjectURL(previous.url);
      objectUrlsRef.current.delete(previous.url);
    }

    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    const next = { ...assetsRef.current, [storageKey]: { blob, url } };
    assetsRef.current = next;
    setAssets(next);
  }

  function forgetAsset(storageKey: string) {
    const previous = assetsRef.current[storageKey];
    if (previous) {
      URL.revokeObjectURL(previous.url);
      objectUrlsRef.current.delete(previous.url);
    }

    const next = { ...assetsRef.current };
    delete next[storageKey];
    assetsRef.current = next;
    setAssets(next);
  }

  function stopPreview() {
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current.currentTime = 0;
      previewRef.current = null;
    }
    setPlayingKey(null);
  }

  async function preview(storageKey: string) {
    if (playingKey === storageKey) {
      stopPreview();
      return;
    }

    const asset = assetsRef.current[storageKey];
    if (!asset) return;
    stopPreview();

    const audio = new Audio(asset.url);
    audio.preload = "metadata";
    audio.volume = 0.8;
    audio.onended = () => {
      if (previewRef.current === audio) {
        previewRef.current = null;
        setPlayingKey(null);
      }
    };
    audio.onerror = () => {
      if (previewRef.current === audio) {
        previewRef.current = null;
        setPlayingKey(null);
      }
      setRowNotice(storageKey, { kind: "error", message: "This file could not be played." });
    };
    previewRef.current = audio;
    setPlayingKey(storageKey);

    try {
      await audio.play();
    } catch {
      if (previewRef.current === audio) previewRef.current = null;
      setPlayingKey(null);
      setRowNotice(storageKey, { kind: "error", message: "Press Preview again or choose a different file." });
    }
  }

  async function saveFile(storageKey: string, file: File | undefined) {
    if (!file) return;
    const validationMessage = validateAudio(file);
    if (validationMessage) {
      setRowNotice(storageKey, { kind: "error", message: validationMessage });
      return;
    }

    if (playingKey === storageKey) stopPreview();
    setRowNotice(storageKey, { kind: "working", message: "Saving on this laptop." });

    try {
      await saveClassroomAudio(storageKey, file);
      replaceAsset(storageKey, file);
      setRowNotice(storageKey, { kind: "saved", message: "Saved. Refresh the host if it is already open." });
    } catch (error) {
      setRowNotice(storageKey, {
        kind: "error",
        message: error instanceof Error ? error.message : "The audio file could not be saved.",
      });
    }
  }

  async function removeFile(storageKey: string, label: string, restoresBuiltInTone: boolean) {
    const confirmation = restoresBuiltInTone
      ? `Remove the custom ${label.toLowerCase()} sound and restore the built-in tone?`
      : `Remove the music for ${label}?`;
    if (!window.confirm(confirmation)) return;

    if (playingKey === storageKey) stopPreview();
    setRowNotice(storageKey, { kind: "working", message: "Removing audio." });

    try {
      await removeClassroomAudio(storageKey);
      forgetAsset(storageKey);
      setRowNotice(storageKey, {
        kind: "saved",
        message: restoresBuiltInTone ? "Removed. The built-in tone will play." : "Music removed.",
      });
    } catch (error) {
      setRowNotice(storageKey, {
        kind: "error",
        message: error instanceof Error ? error.message : "The audio file could not be removed.",
      });
    }
  }

  function renderCueRow(cueKey: TimerCueKey) {
    const detail = CUE_DETAILS[cueKey];
    return (
      <AudioRow
        key={cueKey}
        storageKey={cueKey}
        label={detail.label}
        description={detail.description}
        emptyLabel="Built-in tone"
        asset={assets[cueKey]}
        notice={notices[cueKey]}
        isPlaying={playingKey === cueKey}
        onFile={(file) => void saveFile(cueKey, file)}
        onPreview={() => void preview(cueKey)}
        onRemove={() => void removeFile(cueKey, detail.label, true)}
      />
    );
  }

  function renderMusicRow(state: ClassState) {
    const storageKey = musicAudioKey(state.id);
    return (
      <AudioRow
        key={state.id}
        storageKey={storageKey}
        label={state.label}
        emptyLabel="No music"
        asset={assets[storageKey]}
        notice={notices[storageKey]}
        isPlaying={playingKey === storageKey}
        onFile={(file) => void saveFile(storageKey, file)}
        onPreview={() => void preview(storageKey)}
        onRemove={() => void removeFile(storageKey, state.label, false)}
      />
    );
  }

  return (
    <div className="al-page">
      <style>{`
        .al-page { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .al-shell { width:min(1080px,calc(100% - 32px)); margin:0 auto; padding:30px 0 64px; }
        .al-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px; }
        .al-head h1 { margin:0; font-size:clamp(2rem,4vw,3.1rem); line-height:1; letter-spacing:-0.045em; }
        .al-head p { max-width:650px; margin:10px 0 0; color:var(--bdb-ink-soft); font-size:1rem; line-height:1.55; }
        .al-host-link { flex:none; display:inline-flex; align-items:center; justify-content:center; padding:10px 16px; border-radius:var(--bdb-r-pill); background:var(--bdb-ink); color:#fff; text-decoration:none; font-size:0.88rem; font-weight:750; }
        .al-local { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; margin-bottom:24px; padding:16px 18px; border:1px solid color-mix(in srgb,var(--bdb-teal) 34%,var(--bdb-line)); border-left:5px solid var(--bdb-teal); border-radius:var(--bdb-r); background:var(--bdb-card); box-shadow:var(--bdb-shadow-sm); }
        .al-local strong { display:block; margin-bottom:3px; font-size:0.96rem; }
        .al-local p { margin:0; color:var(--bdb-ink-soft); font-size:0.84rem; line-height:1.45; }
        .al-limit { color:var(--bdb-ink-faint); font-size:0.76rem; font-weight:750; white-space:nowrap; }
        .al-error { margin:0 0 18px; padding:12px 14px; border:1px solid color-mix(in srgb,var(--bdb-coral) 45%,var(--bdb-line)); border-radius:var(--bdb-r-sm); background:color-mix(in srgb,var(--bdb-coral) 8%,var(--bdb-card)); color:#9e301e; font-weight:650; }
        .al-panel { margin-top:18px; overflow:hidden; border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); background:var(--bdb-card); box-shadow:var(--bdb-shadow-sm); }
        .al-panel-head { padding:18px 20px 15px; border-bottom:1px solid var(--bdb-line); }
        .al-panel-head h2 { margin:0; font-size:1.18rem; letter-spacing:-0.02em; }
        .al-panel-head p { margin:5px 0 0; color:var(--bdb-ink-soft); font-size:0.86rem; line-height:1.45; }
        .al-row { position:relative; display:grid; grid-template-columns:minmax(170px,1.1fr) minmax(210px,1fr) auto; align-items:center; gap:18px; min-height:78px; padding:13px 20px; border-bottom:1px solid var(--bdb-line); }
        .al-row:last-child { border-bottom:0; }
        .al-row-copy h3 { margin:0; font-size:0.96rem; line-height:1.25; }
        .al-row-copy p { margin:3px 0 0; color:var(--bdb-ink-soft); font-size:0.78rem; line-height:1.35; }
        .al-file { display:grid; gap:3px; min-width:0; color:var(--bdb-ink-faint); font-size:0.78rem; }
        .al-file > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .al-file-set { color:var(--bdb-ink-soft); font-weight:650; }
        .al-notice { font-size:0.72rem; font-weight:700; }
        .al-notice.working { color:var(--bdb-teal); }
        .al-notice.saved { color:var(--bdb-green); }
        .al-notice.error { color:var(--bdb-coral); white-space:normal; }
        .al-actions { display:flex; align-items:center; justify-content:flex-end; gap:7px; }
        .al-button { appearance:none; display:inline-flex; align-items:center; justify-content:center; min-height:36px; padding:7px 12px; border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); background:var(--bdb-ground-2); color:var(--bdb-ink); font:inherit; font-size:0.78rem; font-weight:750; line-height:1; cursor:pointer; white-space:nowrap; }
        .al-button:hover:not(:disabled) { border-color:color-mix(in srgb,var(--bdb-teal) 56%,var(--bdb-line)); }
        .al-button:focus-visible { outline:3px solid color-mix(in srgb,var(--bdb-teal) 40%,transparent); outline-offset:2px; }
        .al-button:disabled,.al-button.disabled { opacity:0.48; cursor:not-allowed; }
        .al-upload { background:var(--bdb-ink); border-color:var(--bdb-ink); color:#fff; }
        .al-upload input { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .al-remove { color:#a83a28; background:transparent; }
        .al-key { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
        .al-loading { margin:0; padding:22px 20px; color:var(--bdb-ink-soft); font-size:0.9rem; }
        .al-more { margin-top:12px; overflow:hidden; border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:var(--bdb-card); }
        .al-more summary { padding:15px 18px; cursor:pointer; font-size:0.9rem; font-weight:750; color:var(--bdb-ink-soft); }
        .al-more summary:hover { color:var(--bdb-ink); }
        .al-more[open] summary { border-bottom:1px solid var(--bdb-line); }
        @media (max-width:820px) {
          .al-head { align-items:flex-start; flex-direction:column; }
          .al-local { grid-template-columns:1fr; }
          .al-limit { white-space:normal; }
          .al-row { grid-template-columns:minmax(0,1fr) auto; gap:10px 14px; }
          .al-file { grid-column:1; }
          .al-actions { grid-column:2; grid-row:1 / span 2; flex-wrap:wrap; max-width:210px; }
        }
        @media (max-width:560px) {
          .al-shell { width:min(100% - 24px,1080px); padding-top:22px; }
          .al-row { grid-template-columns:1fr; padding:15px 16px; }
          .al-file,.al-actions { grid-column:1; grid-row:auto; }
          .al-actions { justify-content:flex-start; max-width:none; }
          .al-head h1 { font-size:2.15rem; }
        }
      `}</style>

      <SiteNav variant="teacher" />

      <main className="al-shell">
        <header className="al-head">
          <div>
            <h1>Classroom audio</h1>
            <p>Choose the music and timer sounds the Live class host will play.</p>
          </div>
          <Link className="al-host-link" href="/control">Open Live class host</Link>
        </header>

        <section className="al-local" aria-label="Audio storage location">
          <div>
            <strong>Stored on this classroom laptop</strong>
            <p>These files stay in this browser. If the Live class host is already open, refresh it after a change.</p>
          </div>
          <span className="al-limit">Audio only, up to 50 MB per file</span>
        </section>

        {pageError && <p className="al-error" role="alert">{pageError}</p>}

        <section className="al-panel" aria-labelledby="timer-audio-title">
          <div className="al-panel-head">
            <h2 id="timer-audio-title">Timer sounds</h2>
            <p>Upload your own sound or keep the built-in tone.</p>
          </div>
          {loading ? <p className="al-loading" role="status">Checking this laptop.</p> : TIMER_CUE_KEYS.map(renderCueRow)}
        </section>

        <section className="al-panel" aria-labelledby="state-music-title">
          <div className="al-panel-head">
            <h2 id="state-music-title">Music by lesson state</h2>
            <p>Music loops during the state and stops when the timer reaches zero.</p>
          </div>
          {loading ? <p className="al-loading" role="status">Checking this laptop.</p> : CORE_STATES.map(renderMusicRow)}
        </section>

        {!loading && (
          <details className="al-more">
            <summary>Other class states ({OTHER_STATES.length})</summary>
            <div>{OTHER_STATES.map(renderMusicRow)}</div>
          </details>
        )}
      </main>
    </div>
  );
}
