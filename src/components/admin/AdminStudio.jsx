import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import StudioJob from "./StudioJob";
import { ADMIN_VIDEO_CATEGORIES } from "../../data/mockData";
import { MODULE_TEMPLATES, TOPIC_INDEX, SUGGESTED_CHAPTERS } from "../../data/studioLibrary";
import { estimateSeconds, framesFromMoves, validateFen, validateSpec } from "../../lib/chessNarration";
import { ACTIVE_STATUSES, createJob, formatDuration, isStale, listChapters, listJobs } from "../../lib/studio";

/*
  AdminStudio.jsx — make a lesson video without opening a video editor.

  Three ways in, one thing out. A module template, a pasted game, or a topic
  from the library all compile down to the same spec: a title, some segments,
  and a line of narration for every picture. That spec is the job. The academy
  PC renders it and hands back an mp4 to preview and file into a course.

  The narration is editable before anything renders, and what is on screen is
  literally what the voice will say — the worker speaks the strings in the
  spec and never writes its own. That is the point of this screen. A preview
  you cannot trust is worse than no preview.
*/

const MODES = [
  { key: "module", label: "Course module",
    hint: "Pick a chapter and get a full narrated lesson, ready to edit." },
  { key: "topic",  label: "Topic",
    hint: "An opening, a tactic, a checkmate pattern, or how one piece moves." },
  { key: "moves",  label: "Paste moves",
    hint: "Paste a game or a line and it becomes a narrated video." },
];

// edge-tts voices, all free and all reachable from the worker with no API key.
// Indian English first: these students hear this accent every day, and it
// reads chess notation more clearly to them than the American voices do.
const VOICES = [
  { id: "en-IN-PrabhatNeural", label: "Prabhat — Indian English, male" },
  { id: "en-IN-NeerjaNeural",  label: "Neerja — Indian English, female" },
  { id: "en-US-GuyNeural",     label: "Guy — American English, male" },
  { id: "en-US-AriaNeural",    label: "Aria — American English, female" },
  { id: "en-GB-RyanNeural",    label: "Ryan — British English, male" },
  { id: "en-GB-SoniaNeural",   label: "Sonia — British English, female" },
];

const SPEEDS = [
  { id: "-15%", label: "Slower — for beginners" },
  { id: "-8%",  label: "A little slower" },
  { id: "+0%",  label: "Normal" },
  { id: "+10%", label: "A little faster" },
];

const EMPTY = {
  title: "", tagline: "", introSpeech: "", outroSpeech: "", outroStamp: "", segments: [],
};

/**
 * A module template, opened up into an editable draft.
 *
 * The deep copy matters: `MODULE_TEMPLATES` is a module import shared by
 * every render this session, and the admin is about to type into these
 * strings. Without it, editing one lesson quietly rewrites the template for
 * the next one.
 */
function draftFromTemplate(template) {
  if (!template) return EMPTY;
  return {
    title: template.title,
    tagline: template.tagline || "",
    introSpeech: template.introSpeech || "",
    outroSpeech: template.outroSpeech || "",
    outroStamp: template.outroStamp || "",
    segments: JSON.parse(JSON.stringify(template.segments)),
  };
}

export default function AdminStudio() {
  const [mode, setMode] = useState("module");
  const [category, setCategory] = useState(ADMIN_VIDEO_CATEGORIES[0]);
  const [chapter, setChapter] = useState(MODULE_TEMPLATES[0].chapter || "");
  const [draft, setDraft] = useState(() => draftFromTemplate(MODULE_TEMPLATES[0]));
  const [options, setOptions] = useState({
    voice: VOICES[0].id, rate: "+0%", vertical: false, silent: false, fps: 30,
  });

  const [templateId, setTemplateId] = useState(MODULE_TEMPLATES[0].id);
  const [topicQuery, setTopicQuery] = useState("");
  const [topicId, setTopicId] = useState("");
  const [movesText, setMovesText] = useState("");
  const [startFen, setStartFen] = useState("");

  const [chapters, setChapters] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showScript, setShowScript] = useState(true);

  /* ---------------------------------------------------------------- data */

  const refresh = useCallback(async () => {
    try {
      setJobs(await listJobs(20));
    } catch (err) {
      setError(err.message || "Couldn't load the studio queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Guarded because the category can change again before this resolves,
    // and the slower of two requests must not overwrite the newer answer.
    let cancelled = false;
    listChapters(category)
      .then((rows) => { if (!cancelled) setChapters(rows); })
      .catch(() => { if (!cancelled) setChapters([]); });
    return () => { cancelled = true; };
  }, [category]);

  // Poll fast while something is actually rendering, slowly the rest of the
  // time. There is no realtime subscription here on purpose: the worker
  // writes a row every couple of seconds at most, and a 3s poll on an admin
  // screen is cheaper to reason about than a socket that can silently die.
  const busy = jobs.some((j) => ACTIVE_STATUSES.includes(j.status) && !isStale(j));
  useEffect(() => {
    // Load once, then keep polling. `refresh` only ever setStates from inside
    // an awaited promise, which is the "subscribe to an external system" case
    // the rule is meant to allow; it cannot see that through the useCallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const id = setInterval(refresh, busy ? 3000 : 15000);
    return () => clearInterval(id);
  }, [busy, refresh]);

  /* ------------------------------------------------------------ builders */

  function loadTemplate(id) {
    const template = MODULE_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    setTemplateId(id);
    setDraft(draftFromTemplate(template));
    setChapter(template.chapter || "");
  }

  function changeMode(next) {
    setMode(next);
    setError("");
    setNotice("");
    if (next === "module") loadTemplate(templateId);
    else setDraft(EMPTY);
  }

  function loadTopic(id) {
    const topic = TOPIC_INDEX.find((t) => t.id === id);
    if (!topic) return;
    setTopicId(id);

    let segments;
    if (topic.moves) {
      const parsed = framesFromMoves(topic.moves);
      segments = [{
        heading: "", headingSpeech: "", startFen: null, frames: parsed.frames,
      }];
    } else {
      segments = [{
        heading: topic.name,
        headingSpeech: `${topic.name}.`,
        startFen: topic.startFen || null,
        frames: JSON.parse(JSON.stringify(topic.frames || [])),
      }];
    }

    setDraft({
      title: topic.name,
      tagline: topic.tagline || "",
      introSpeech: `In this lesson we will learn ${lowerFirst(topic.name)}.`,
      outroSpeech: topic.idea || "",
      outroStamp: "",
      segments,
    });
  }

  function loadMoves() {
    setError("");
    const fenCheck = validateFen(startFen.trim() || null);
    if (!fenCheck.ok) { setError(fenCheck.error); return; }

    const parsed = framesFromMoves(movesText, startFen.trim() || null);
    if (parsed.error) { setError(parsed.error); return; }
    if (parsed.frames.length === 0) { setError("Paste some moves first."); return; }

    setDraft((d) => ({
      ...d,
      title: d.title || "New lesson",
      tagline: d.tagline || `${Math.ceil(parsed.frames.length / 2)} moves`,
      introSpeech: d.introSpeech || `In this lesson we will look at ${d.title || "this line"}.`,
      outroStamp: parsed.isCheckmate ? "CHECKMATE" : d.outroStamp,
      segments: [{
        heading: "", headingSpeech: "",
        startFen: startFen.trim() || null,
        frames: parsed.frames,
      }],
    }));
    setNotice(`${parsed.frames.length} moves read${parsed.isCheckmate ? ", ending in checkmate" : ""}. Edit the words below, then queue it.`);
  }

  /* --------------------------------------------------------------- queue */

  const spec = useMemo(() => ({ version: 1, ...draft }), [draft]);
  const problems = useMemo(() => (draft.segments.length ? validateSpec(spec) : []), [spec, draft.segments.length]);
  const estimate = useMemo(() => estimateSeconds(spec), [spec]);

  async function queue() {
    setError("");
    setNotice("");
    if (!draft.title.trim()) { setError("Give the video a title."); return; }
    if (!draft.segments.length) { setError("Pick a module, a topic, or paste some moves first."); return; }
    if (problems.length) { setError(problems[0]); return; }

    setQueueing(true);
    try {
      await createJob({
        kind: mode === "moves" ? "moves" : mode,
        title: draft.title,
        category,
        chapter: chapter || null,
        spec,
        options,
      });
      setNotice(`"${draft.title}" is queued. The studio will render it and it will appear below.`);
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't queue that video.");
    } finally {
      setQueueing(false);
    }
  }

  /* -------------------------------------------------------------- render */

  const studioOffline = jobs.some(isStale);
  const filteredTopics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    if (!q) return TOPIC_INDEX;
    return TOPIC_INDEX.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.group || "").toLowerCase().includes(q) ||
      (t.eco || "").toLowerCase().includes(q));
  }, [topicQuery]);

  return (
    <div className="space-y-6">
      {/* ============================ builder ============================ */}
      <div className="bg-panel border border-line rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-gold tracking-widest uppercase">Content Ops</span>
        <h2 className="font-display text-2xl mt-2 text-ink">Make a lesson video</h2>
        <p className="text-sm text-ink-dim mt-1 mb-6">
          Nothing here needs a video editor. Choose what to teach, check the words,
          and the academy PC renders a narrated video you can put straight into a course.
        </p>

        {studioOffline && (
          <div className="mb-6 border border-gold/40 bg-gold/5 rounded-xl p-4">
            <p className="text-sm text-ink">
              The studio isn&apos;t answering. You can still queue videos — they will
              render as soon as it is running.
            </p>
            <p className="text-xs text-ink-dim mt-1 font-mono">
              On the academy PC: open the studio folder and double-click run-worker.bat
            </p>
          </div>
        )}

        {/* mode */}
        <div className="flex flex-wrap gap-2 mb-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => changeMode(m.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                mode === m.key
                  ? "border-gold text-gold bg-gold/10"
                  : "border-line text-ink-dim hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-dim mb-6">{MODES.find((m) => m.key === mode)?.hint}</p>

        {/* ---- mode: module ---- */}
        {mode === "module" && (
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <Field label="Module" htmlFor="studio-template">
              <select id="studio-template" value={templateId}
                      onChange={(e) => loadTemplate(e.target.value)} className={INPUT}>
                {MODULE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </Field>
            <Field label="Goes into chapter" htmlFor="studio-chapter">
              <input id="studio-chapter" list="studio-chapter-options" value={chapter}
                     onChange={(e) => setChapter(e.target.value)}
                     placeholder="e.g. Opening Principles" className={INPUT} />
              <datalist id="studio-chapter-options">
                {chapters.map((c) => <option key={c.id} value={c.title} />)}
                {SUGGESTED_CHAPTERS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
          </div>
        )}

        {/* ---- mode: topic ---- */}
        {mode === "topic" && (
          <div className="mb-6">
            <Field label="Search the library" htmlFor="studio-topic">
              <input id="studio-topic" value={topicQuery}
                     onChange={(e) => setTopicQuery(e.target.value)}
                     placeholder="rook, Sicilian, fork, smothered mate…" className={INPUT} />
            </Field>
            <div className="mt-3 max-h-64 overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {filteredTopics.length === 0 && (
                <p className="p-4 text-sm text-ink-dim">
                  Nothing in the library matches that. Use <span className="text-ink">Paste moves</span> to
                  build it by hand.
                </p>
              )}
              {filteredTopics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadTopic(t.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-void/60 transition-colors ${
                    topicId === t.id ? "bg-gold/10" : ""
                  }`}
                >
                  <span className="text-base text-ink">{t.name}</span>
                  <span className="block text-xs font-mono text-ink-dim uppercase tracking-wide">
                    {t.group} · {t.tagline}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- mode: moves ---- */}
        {mode === "moves" && (
          <div className="space-y-4 mb-6">
            <Field label="Moves" htmlFor="studio-moves"
                   hint="Paste a game or a line. Move numbers, comments and a result are all fine.">
              <textarea id="studio-moves" rows={4} value={movesText}
                        onChange={(e) => setMovesText(e.target.value)}
                        placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"
                        className={`${INPUT} font-mono`} />
            </Field>
            <Field label="Starting position" htmlFor="studio-fen"
                   hint="Leave empty to start from the normal position. Paste a FEN to start anywhere else.">
              <input id="studio-fen" value={startFen}
                     onChange={(e) => setStartFen(e.target.value)}
                     placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                     className={`${INPUT} font-mono text-sm`} />
            </Field>
            <Button variant="outline" onClick={loadMoves}>Read these moves</Button>
          </div>
        )}

        {/* ---- the lesson ---- */}
        {draft.segments.length > 0 && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Title" htmlFor="studio-title">
                <input id="studio-title" value={draft.title}
                       onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                       className={INPUT} />
              </Field>
              <Field label="Subtitle on the opening card" htmlFor="studio-tagline">
                <input id="studio-tagline" value={draft.tagline}
                       onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                       className={INPUT} />
              </Field>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-mono text-ink-dim uppercase tracking-wide">The script</p>
                <p className="text-sm text-ink-dim mt-0.5">
                  This is exactly what the voice will say. Change any line.
                </p>
              </div>
              <button onClick={() => setShowScript((s) => !s)}
                      className="text-sm font-mono text-brand-emerald hover:text-brand-emerald/80 shrink-0">
                {showScript ? "Hide" : "Show"}
              </button>
            </div>

            {showScript && (
              <div className="mt-3 space-y-3">
                <Line label="Opening line" value={draft.introSpeech}
                      onChange={(v) => setDraft({ ...draft, introSpeech: v })} />

                {draft.segments.map((segment, sIndex) => (
                  <SegmentEditor
                    key={sIndex}
                    index={sIndex}
                    segment={segment}
                    onChange={(next) => setDraft({
                      ...draft,
                      segments: draft.segments.map((s, i) => (i === sIndex ? next : s)),
                    })}
                    onRemove={draft.segments.length > 1 ? () => setDraft({
                      ...draft,
                      segments: draft.segments.filter((_, i) => i !== sIndex),
                    }) : null}
                  />
                ))}

                <Line label="Closing line" value={draft.outroSpeech}
                      onChange={(v) => setDraft({ ...draft, outroSpeech: v })} />
                <Line label="Word on the closing card" value={draft.outroStamp} single
                      onChange={(v) => setDraft({ ...draft, outroStamp: v })} />
              </div>
            )}

            {/* ---- options ---- */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-line">
              <Field label="Voice" htmlFor="studio-voice">
                <select id="studio-voice" value={options.voice} disabled={options.silent}
                        onChange={(e) => setOptions({ ...options, voice: e.target.value })}
                        className={INPUT}>
                  {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Speed" htmlFor="studio-rate">
                <select id="studio-rate" value={options.rate} disabled={options.silent}
                        onChange={(e) => setOptions({ ...options, rate: e.target.value })}
                        className={INPUT}>
                  {SPEEDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Shape" htmlFor="studio-shape">
                <select id="studio-shape" value={options.vertical ? "vertical" : "square"}
                        onChange={(e) => setOptions({ ...options, vertical: e.target.value === "vertical" })}
                        className={INPUT}>
                  <option value="square">Square — for the course</option>
                  <option value="vertical">Tall — for Reels and Shorts</option>
                </select>
              </Field>
              <Field label="Category" htmlFor="studio-category">
                <select id="studio-category" value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={`${INPUT} capitalize`}>
                  {ADMIN_VIDEO_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="capitalize">{c}</option>
                  ))}
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 mt-4 text-sm text-ink-dim cursor-pointer">
              <input type="checkbox" checked={options.silent}
                     onChange={(e) => setOptions({ ...options, silent: e.target.checked })}
                     className="accent-[#d4af37] w-4 h-4" />
              No voice — I will record it myself afterwards
            </label>

            {problems.length > 0 && (
              <div className="mt-4 border border-danger/40 bg-danger/5 rounded-xl p-4">
                <p className="text-sm text-danger font-semibold">
                  {problems.length} thing{problems.length > 1 ? "s" : ""} to fix before this can render
                </p>
                <ul className="mt-2 space-y-1">
                  {problems.slice(0, 6).map((p, i) => (
                    <li key={i} className="text-sm text-ink-dim">· {p}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}
            {notice && <p className="mt-4 text-sm text-brand-emerald">{notice}</p>}

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Button onClick={queue} disabled={queueing || problems.length > 0}>
                {queueing ? "Queueing…" : "Make this video"}
              </Button>
              <span className="text-sm font-mono text-ink-dim">
                about {formatDuration(estimate)} long · {countFrames(draft)} pictures
              </span>
            </div>
          </>
        )}

        {draft.segments.length === 0 && (error || notice) && (
          <>
            {error && <p className="text-sm text-danger">{error}</p>}
            {notice && <p className="text-sm text-brand-emerald">{notice}</p>}
          </>
        )}
      </div>

      {/* ============================= queue ============================= */}
      <div className="bg-panel border border-line rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-gold tracking-widest uppercase">Studio</span>
        <h2 className="font-display text-xl mt-2 mb-4 text-ink">Videos being made</h2>

        {loading && <p className="text-sm text-ink-dim">Loading…</p>}
        {!loading && jobs.length === 0 && (
          <p className="text-sm text-ink-dim">
            Nothing yet. Build a lesson above and it will appear here while it renders.
          </p>
        )}

        <div className="space-y-3">
          {jobs.map((job) => (
            <StudioJob key={job.id} job={job} chapters={chapters} onChanged={refresh} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */

const INPUT =
  "mt-1 w-full bg-void border border-line rounded-lg px-3 py-2.5 text-base text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-50";

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-mono text-ink-dim uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-dim mt-1">{hint}</p>}
    </div>
  );
}

function Line({ label, value, onChange, single = false }) {
  const id = `line-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="bg-void/60 border border-line rounded-lg p-3">
      <label htmlFor={id} className="text-xs font-mono text-ink-dim uppercase tracking-wide">
        {label}
      </label>
      {single ? (
        <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)}
               placeholder="leave empty for just the logo"
               className="mt-1 w-full bg-transparent text-base text-ink focus:outline-none" />
      ) : (
        <textarea id={id} rows={2} value={value || ""} onChange={(e) => onChange(e.target.value)}
                  placeholder="leave empty for silence here"
                  className="mt-1 w-full bg-transparent text-base text-ink resize-y focus:outline-none" />
      )}
    </div>
  );
}

function SegmentEditor({ index, segment, onChange, onRemove }) {
  const [open, setOpen] = useState(index === 0);
  const set = (patch) => onChange({ ...segment, ...patch });
  const setFrame = (fIndex, patch) => set({
    frames: segment.frames.map((f, i) => (i === fIndex ? { ...f, ...patch } : f)),
  });

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-void/60 px-3 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 text-left flex-1">
          <span className="text-xs font-mono text-ink-dim uppercase tracking-wide">
            Part {index + 1}
          </span>
          <span className="block text-base text-ink truncate">
            {segment.heading || "No section title"}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-ink-dim">{segment.frames.length} pictures</span>
          <button onClick={() => setOpen((o) => !o)}
                  className="text-sm font-mono text-brand-emerald hover:text-brand-emerald/80">
            {open ? "Hide" : "Edit"}
          </button>
          {onRemove && (
            <button onClick={onRemove} className="text-sm font-mono text-danger hover:text-danger/80">
              Remove
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`seg-h-${index}`} className="text-xs font-mono text-ink-dim uppercase tracking-wide">
                Section title
              </label>
              <input id={`seg-h-${index}`} value={segment.heading || ""}
                     onChange={(e) => set({ heading: e.target.value })}
                     placeholder="leave empty for no section card"
                     className="mt-1 w-full bg-void border border-line rounded-lg px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label htmlFor={`seg-s-${index}`} className="text-xs font-mono text-ink-dim uppercase tracking-wide">
                Said over that card
              </label>
              <input id={`seg-s-${index}`} value={segment.headingSpeech || ""}
                     onChange={(e) => set({ headingSpeech: e.target.value })}
                     className="mt-1 w-full bg-void border border-line rounded-lg px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
          </div>

          {segment.frames.map((frame, fIndex) => (
            <div key={fIndex} className="bg-void/60 border border-line rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-gold uppercase tracking-wide">
                  {frame.san ? `Move ${frame.san}` : (frame.cap || "Hold on this position")}
                  {frame.sq?.length ? ` · ${frame.sq.length} squares lit` : ""}
                </span>
                <button
                  onClick={() => set({ frames: segment.frames.filter((_, i) => i !== fIndex) })}
                  className="text-xs font-mono text-danger hover:text-danger/80 shrink-0"
                >
                  Remove
                </button>
              </div>
              <textarea
                aria-label={`Narration for picture ${fIndex + 1} of part ${index + 1}`}
                rows={2}
                value={frame.say || ""}
                onChange={(e) => setFrame(fIndex, { say: e.target.value })}
                placeholder="leave empty to hold silently"
                className="mt-2 w-full bg-transparent text-base text-ink resize-y focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function countFrames(draft) {
  return (draft.segments || []).reduce(
    (total, s) => total + (s.heading ? 1 : 0) + (s.frames?.length || 0), 2,
  );
}

function lowerFirst(text) {
  if (!text) return "this";
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}
