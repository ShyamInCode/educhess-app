import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { getPublicStorageUrl, CAROUSEL_BUCKET } from "../../lib/media";

export default function AdminCarousels() {
  const { user } = useAuth();
  const [caption, setCaption] = useState("");
  const [position, setPosition] = useState(0);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  async function loadSlides() {
    setLoading(true);
    const { data, error } = await supabase.from("carousel_slides").select("*").order("position", { ascending: true });
    if (!error) setSlides(data || []);
    setLoading(false);
  }
  useEffect(() => {
    loadSlides();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!file) {
      setError("Choose an image file first.");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectPath = `${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(CAROUSEL_BUCKET)
        .upload(objectPath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("carousel_slides").insert({
        storage_path: objectPath,
        caption: caption.trim() || null,
        position: Number(position) || 0,
        uploaded_by: user?.id ?? null,
      });
      if (insertError) throw insertError;

      setSuccess("Slide added to the homepage carousel.");
      setCaption("");
      setPosition(0);
      setFile(null);
      e.target.reset?.();
      loadSlides();
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(slide) {
    if (!window.confirm(`Remove this slide from the carousel?`)) return;
    setDeletingId(slide.id);
    await supabase.storage.from(CAROUSEL_BUCKET).remove([slide.storage_path]);
    await supabase.from("carousel_slides").delete().eq("id", slide.id);
    setDeletingId(null);
    loadSlides();
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Homepage</span>
        <h2 className="font-display text-2xl mt-2 mb-6 text-[#e7ecf5]">Add a carousel slide</h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div>
            <label htmlFor="carousel-image" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Image</label>
            <input
              id="carousel-image"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1 w-full text-sm text-[#93a1b8] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#d4af37] file:text-[#0f172a] file:font-semibold hover:file:bg-[#f0d98c] file:cursor-pointer"
            />
          </div>
          <div>
            <label htmlFor="carousel-caption" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Caption (shown below the image)</label>
            <input
              id="carousel-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Our students at the Vizag District Open"
              className="mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>
          <div>
            <label htmlFor="carousel-position" className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Position (order, lowest first)</label>
            <input
              id="carousel-position"
              type="number"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="mt-1 w-32 bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            />
          </div>
          {error && <p className="text-[#f87171] text-sm">{error}</p>}
          {success && <p className="text-[#34d399] text-sm">{success}</p>}
          <button
            type="submit"
            disabled={uploading}
            className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Add Slide"}
          </button>
        </form>
      </div>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Homepage</span>
        <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5]">Current slides</h2>
        {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
        {!loading && slides.length === 0 && <p className="text-sm text-[#93a1b8]">No slides yet.</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {slides.map((s) => (
            <div key={s.id} className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl overflow-hidden">
              {/* object-contain so the admin previews the WHOLE upload — a
                  cropped preview hides what the visitor would lose. */}
              <img src={getPublicStorageUrl(CAROUSEL_BUCKET, s.storage_path)} alt={s.caption || ""} className="w-full aspect-video object-contain bg-[#0f172a]" />
              <div className="flex items-center justify-between gap-3 p-3">
                <p className="text-sm text-[#e7ecf5] truncate">{s.caption || "(no caption)"}</p>
                <button
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.id}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold text-[#f87171] border border-[#f87171]/40 hover:bg-[#f87171]/10 transition-colors disabled:opacity-50"
                >
                  {deletingId === s.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
