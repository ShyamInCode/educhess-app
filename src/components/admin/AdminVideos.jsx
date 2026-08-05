import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { getPublicVideoUrl, VIDEO_BUCKET } from "../../lib/media";
import { ADMIN_VIDEO_CATEGORIES } from "../../data/mockData";

const NEW_CHAPTER_VALUE = "__new_chapter__";

export default function AdminVideos() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(ADMIN_VIDEO_CATEGORIES[0]);
  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [chapterChoice, setChapterChoice] = useState(""); // existing chapter title, or NEW_CHAPTER_VALUE
  const [newChapterName, setNewChapterName] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recentVideos, setRecentVideos] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [deletingChapter, setDeletingChapter] = useState(null); // chapter id currently being deleted
  const [savingTier, setSavingTier] = useState(null); // chapter id whose min_tier is being saved
  const [chapterError, setChapterError] = useState("");

  async function loadChapters(forCategory) {
    setLoadingChapters(true);
    const { data, error } = await supabase
      .from("course_chapters")
      .select("*")
      .eq("category", forCategory)
      .order("position", { ascending: true })
      .order("title", { ascending: true });
    if (!error) {
      setChapters(data || []);
      // Default to the first existing chapter for this category, if any.
      setChapterChoice((data && data[0]?.title) || NEW_CHAPTER_VALUE);
    }
    setLoadingChapters(false);
  }

  async function loadRecentVideos() {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setRecentVideos(data || []);
    setLoadingList(false);
  }

  useEffect(() => {
    loadChapters(category);
  }, [category]);

  useEffect(() => {
    loadRecentVideos();
  }, []);

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setError("");
    setSuccess("");
  }

  // Deletes a chapter and everything filed under it: the video rows in
  // `videos` for that category+chapter, their files in Storage, and
  // finally the chapter row itself.
  async function handleDeleteChapter(chapter) {
    const confirmMsg = `Delete chapter "${chapter.title}"? This permanently deletes all of its videos too. This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setChapterError("");
    setDeletingChapter(chapter.id);
    try {
      // 1. Find every video filed under this category + chapter.
      const { data: chapterVideos, error: fetchErr } = await supabase
        .from("videos")
        .select("id, storage_path")
        .eq("category", category)
        .eq("chapter", chapter.title);
      if (fetchErr) throw fetchErr;

      // 2. Remove their files from Storage (skip rows with no stored path).
      const paths = (chapterVideos || []).map((v) => v.storage_path).filter(Boolean);
      if (paths.length) {
        const { error: storageErr } = await supabase.storage.from(VIDEO_BUCKET).remove(paths);
        if (storageErr) throw storageErr;
      }

      // 3. Delete the video rows.
      const { error: videosErr } = await supabase
        .from("videos")
        .delete()
        .eq("category", category)
        .eq("chapter", chapter.title);
      if (videosErr) throw videosErr;

      // 4. Delete the chapter itself.
      const { error: chapterErr } = await supabase.from("course_chapters").delete().eq("id", chapter.id);
      if (chapterErr) throw chapterErr;

      await loadChapters(category);
      await loadRecentVideos();
    } catch (err) {
      setChapterError(err.message || "Couldn't delete this chapter. Please try again.");
    } finally {
      setDeletingChapter(null);
    }
  }

  /**
   * Change which membership a chapter needs.
   *
   * A real UPDATE, which only works once migration_phase5_admin_update_policies
   * has run — course_chapters had no UPDATE policy before it.
   */
  async function handleChapterTier(chapter, minTier) {
    setChapterError("");
    setSavingTier(chapter.id);
    const { error } = await supabase
      .from("course_chapters")
      .update({ min_tier: minTier })
      .eq("id", chapter.id);
    setSavingTier(null);
    if (error) {
      setChapterError(error.message || "Couldn't change that chapter's tier.");
      return;
    }
    await loadChapters(category);
  }

  function handleChapterSelect(e) {
    setChapterChoice(e.target.value);
    setNewChapterName("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!file) {
      setError("Choose a video file from your file explorer first.");
      return;
    }
    if (!title.trim()) {
      setError("Give the video a title.");
      return;
    }
    const isNewChapter = chapterChoice === NEW_CHAPTER_VALUE;
    const chapterTitle = isNewChapter ? newChapterName.trim() : chapterChoice;
    if (!chapterTitle) {
      setError(isNewChapter ? "Name the new chapter." : "Choose a chapter.");
      return;
    }

    setUploading(true);
    try {
      // 0. If this is a brand new chapter, create the "folder" first.
      if (isNewChapter) {
        setProgressNote("Creating new chapter…");
        const nextPosition = chapters.length ? Math.max(...chapters.map((c) => c.position || 0)) + 1 : 1;
        const { error: chapterError } = await supabase
          .from("course_chapters")
          .upsert({ category, title: chapterTitle, position: nextPosition }, { onConflict: "category,title" });
        if (chapterError) throw chapterError;
      }

      // 1. Upload the file straight from the browser to Supabase Storage,
      //    namespaced by category/chapter so the library stays organized.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeChapter = chapterTitle.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const objectPath = `${category}/${safeChapter}/${Date.now()}-${safeName}`;
      setProgressNote("Uploading to Supabase Storage…");

      const { error: uploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(objectPath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "video/mp4" });

      if (uploadError) throw uploadError;

      const publicUrl = getPublicVideoUrl(objectPath);

      // 2. Insert the metadata row — title, category, chapter, public CDN URL.
      setProgressNote("Saving video metadata…");
      const { error: insertError } = await supabase.from("videos").insert({
        title: title.trim(),
        category,
        chapter: chapterTitle,
        url: publicUrl,
        storage_path: objectPath,
        uploaded_by: user?.id ?? null,
      });

      if (insertError) throw insertError;

      setSuccess(`"${title.trim()}" uploaded into ${category} → ${chapterTitle}.`);
      setTitle("");
      setFile(null);
      setNewChapterName("");
      e.target.reset?.();
      if (isNewChapter) await loadChapters(category);
      loadRecentVideos();
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setProgressNote("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Content Ops</span>
        <h2 className="font-display text-2xl mt-2 mb-6 text-[#e7ecf5]">Upload a course video</h2>

        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg" encType="multipart/form-data">
          <div>
            <label htmlFor="video-title" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Title</label>
            <input id="video-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Opening Principles, Lesson 3"
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>

          <div>
            <label htmlFor="video-category" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Category</label>
            <select id="video-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37] capitalize"
            >
              {ADMIN_VIDEO_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="video-chapter" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Chapter</label>
            <select id="video-chapter"
              value={chapterChoice}
              onChange={handleChapterSelect}
              disabled={loadingChapters}
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37] disabled:opacity-60"
            >
              {chapters.map((c) => (
                <option key={c.id} value={c.title}>{c.title}</option>
              ))}
              <option value={NEW_CHAPTER_VALUE}>+ Add new chapter…</option>
            </select>
            {chapterChoice === NEW_CHAPTER_VALUE && (
              <input
                required
                aria-label="New chapter name"
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                placeholder="New chapter name, e.g. Rook Endgames"
                className="mt-2 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              />
            )}
          </div>

          <div>
            <label htmlFor="video-file" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Video file</label>
            <input id="video-file"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="mt-1 w-full text-sm text-[#93a1b8] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#d4af37] file:text-[#0f172a] file:font-semibold hover:file:bg-[#f0d98c] file:cursor-pointer"
            />
            {file && <p className="text-xs text-[#93a1b8] mt-1 font-mono">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
          </div>

          {error && <p className="text-[#f87171] text-sm">{error}</p>}
          {success && <p className="text-[#34d399] text-sm">{success}</p>}
          {progressNote && <p className="text-[#f0d98c] text-sm font-mono">{progressNote}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload Video"}
          </button>
        </form>
      </div>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Content Ops</span>
        <h2 className="font-display text-xl mt-2 mb-1 text-[#e7ecf5]">Manage chapters — {category}</h2>
        <p className="text-sm text-[#93a1b8] mb-4">Deleting a chapter also permanently deletes every video filed under it.</p>

        {chapterError && <p className="text-[#f87171] text-sm mb-3">{chapterError}</p>}
        {loadingChapters && <p className="text-sm text-[#93a1b8]">Loading…</p>}
        {!loadingChapters && chapters.length === 0 && (
          <p className="text-sm text-[#93a1b8]">No chapters yet for this category.</p>
        )}
        <div className="space-y-2">
          {chapters.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
              <p className="text-base text-[#e7ecf5] truncate">{c.title}</p>
              <div className="flex items-center gap-2 shrink-0">
                {/* Which membership this chapter needs. Chapters default to
                    'pro'; set one to 'free' to give visitors a taster. */}
                <label htmlFor={`chapter-tier-${c.id}`} className="sr-only">
                  Minimum tier for {c.title}
                </label>
                <select
                  id={`chapter-tier-${c.id}`}
                  value={c.min_tier || "pro"}
                  onChange={(e) => handleChapterTier(c, e.target.value)}
                  disabled={savingTier === c.id}
                  className="bg-[#0f172a] border border-[#2d3b53] rounded-lg px-2 py-1.5 text-sm text-[#e7ecf5] focus:outline-none focus:ring-2 focus:ring-[#d4af37] disabled:opacity-50"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="academy">Academy</option>
                </select>
                <button
                  onClick={() => handleDeleteChapter(c)}
                  disabled={deletingChapter === c.id}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#f87171] border border-[#f87171]/40 hover:bg-[#f87171]/10 transition-colors disabled:opacity-50"
                >
                  {deletingChapter === c.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Library</span>
        <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5]">Recently uploaded</h2>
        {loadingList && <p className="text-sm text-[#93a1b8]">Loading…</p>}
        {!loadingList && recentVideos.length === 0 && (
          <p className="text-sm text-[#93a1b8]">No videos uploaded yet.</p>
        )}
        <div className="space-y-2">
          {recentVideos.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-4 bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-base text-[#e7ecf5] truncate">{v.title}</p>
                <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">{v.category} · {v.chapter}</p>
              </div>
              {v.url && (
                <a href={v.url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-mono text-[#34d399] hover:text-[#6ee7b7]">
                  View →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
