import React, { useRef } from "react";
import { Link } from "react-router-dom";
import Carousel from "../components/Carousel";
import ChessBenefits from "../components/ChessBenefits";
import Testimonials from "../components/Testimonials";
import ContactForm from "../components/ContactForm";
import { HOMEPAGE_VIDEO_PATH } from "../data/mockData";
import { useSignedVideo } from "../lib/useSignedVideo";
import { useAutoplaySound } from "../lib/useAutoplaySound";

/*
  The homepage used to open with a maths word problem ("Queen = Rook + Bishop
  + X") that unlocked a Scholar's Mate board. It has been removed: this is a
  chess academy, and gating the first thing a visitor sees behind an arithmetic
  puzzle asked them to prove something before being told what is on offer. Its
  slot now explains what chess builds, which is the actual pitch to a parent.
*/
export default function HomePage() {
  const heroVideoRef = useRef(null);

  // The hero clip lives at the root of the private course-videos bucket,
  // where supabase/04_storage.sql lets anyone read it — it is marketing, not
  // the paid product. It still needs a signed URL, because the bucket as a
  // whole is private now.
  const hero = useSignedVideo(HOMEPAGE_VIDEO_PATH);

  // Autoplay with sound where the browser allows it, falling back to muted.
  // See src/lib/useAutoplaySound.js.
  useAutoplaySound(heroVideoRef, [hero.url]);

  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      {/* Hero */}
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-[70dvh]">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight text-[#e7ecf5]">
            Learn chess properly. <span className="text-[#d4af37]">From first move to first trophy.</span>
          </h1>
          <p className="text-base text-[#93a1b8] mt-4 max-w-md leading-relaxed">
            Coaching for every level, at two academies in Visakhapatnam.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link
              to="/courses"
              className="inline-block px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
            >
              See the curriculum
            </Link>
            <Link
              to="/puzzles"
              className="inline-block px-5 py-2.5 rounded-lg border border-[#2d3b53] text-[#e7ecf5] font-semibold text-sm hover:border-[#d4af37]/60 transition-colors"
            >
              Try a puzzle
            </Link>
          </div>
        </div>

        {/* Hero video. No object-cover: <video> letterboxes by default, so a
            clip of any aspect ratio is shown whole rather than cropped. */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-[#d4af37]/50 shadow-2xl bg-[#1e293b] aspect-video">
          {hero.url ? (
            <video
              key={hero.url}
              ref={heroVideoRef}
              className="w-full h-full"
              src={hero.url}
              autoPlay
              loop
              playsInline
              controls
              // A signed URL that expired while the tab sat open reads as a
              // media error. Ask for a fresh one rather than showing a
              // broken player.
              onError={hero.refresh}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="w-full h-full grid place-items-center">
              <p className="text-sm text-[#93a1b8] font-mono">
                {hero.status === "loading" ? "Loading…" : "Video unavailable"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12">
        <ChessBenefits />
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl sm:text-3xl text-[#e7ecf5] mb-6">What we offer</h2>
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            {
              t: "Coaching, not just videos",
              d: "Lessons taught and reviewed by a coach at both academies.",
            },
            {
              t: "Three coaching levels",
              d: "Basic, Tournament and Advanced, from first moves to game analysis.",
            },
            {
              t: "Workshops and tournaments",
              d: "Short intensives and online and offline events through the year.",
            },
          ].map((c) => (
            <div key={c.t} className="bg-[#1e293b]/60 border border-[#2d3b53] rounded-xl p-5">
              <h3 className="font-display text-base text-[#d4af37] mb-1">{c.t}</h3>
              <p className="text-sm text-[#93a1b8] leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Achievements: student results and tournament photos, admin-managed
          through the carousel section of the Admin Panel. */}
      <section className="mt-12">
        <h2 className="font-display text-2xl sm:text-3xl text-[#e7ecf5] mb-2">Achievements</h2>
        <p className="text-base text-[#93a1b8] mb-6 max-w-2xl">
          Results, medals and moments from the events our students play.
        </p>
        <Carousel />
      </section>

      <div className="mt-12">
        <Testimonials />
      </div>

      {/* Contact: embedded form, not a redirect. The address and phone cards
          that used to sit beside it are gone; the footer below states them. */}
      <div className="mt-12 bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <h2 className="font-display text-2xl text-[#e7ecf5] mb-6">Have questions before you start?</h2>
        <div className="max-w-xl">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
