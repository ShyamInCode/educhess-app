import React, { useCallback, useEffect, useRef, useState } from "react";
import BenefitArt from "./BenefitArt";
import { CHESS_BENEFITS } from "../data/mockData";

const SLIDE_MS = 2000;

/**
 * "What the game builds" — an auto-advancing slider, one benefit per slide.
 *
 * Two seconds is a deliberately quick cadence, so the controls matter more
 * than usual: it pauses on hover, on keyboard focus and while a touch drag is
 * in progress, it can be driven with the arrow keys or the dots, and it does
 * not auto-advance at all for visitors who ask for reduced motion. Carousels
 * that move faster than people read are only tolerable when they are trivial
 * to stop and to step through.
 */
export default function ChessBenefits() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = CHESS_BENEFITS.length;
  const touchStartX = useRef(null);

  const go = useCallback((next) => setIndex(((next % total) + total) % total), [total]);

  useEffect(() => {
    if (paused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % total), SLIDE_MS);
    return () => clearInterval(id);
  }, [paused, total]);

  function onKeyDown(e) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  }

  // Swipe. Kept simple: horizontal intent only, with a threshold so a vertical
  // page scroll that drifts sideways doesn't change slide under the reader.
  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  }
  function onTouchEnd(e) {
    const start = touchStartX.current;
    touchStartX.current = null;
    setPaused(false);
    if (start == null) return;
    const dx = e.changedTouches[0].clientX - start;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  }

  return (
    /*
      This is the ARIA carousel pattern: a <section> with
      aria-roledescription="carousel" that owns hover/touch pausing and arrow
      keys, while the real controls are buttons inside it. The rule below
      cannot tell that apart from a div with a stray click handler.

      Arrow keys live here rather than on a focusable slide viewport on
      purpose: making a plain <div> tabbable to catch them is what
      no-noninteractive-tabindex warns about, and it is unnecessary since the
      prev/next buttons and dots are already in the tab order.
    */
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8"
      aria-roledescription="carousel"
      aria-label="What chess builds"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <h2 className="font-display text-2xl sm:text-3xl text-[#e7ecf5] mb-6">Why playing chess</h2>

      {/* Arrows flank the slide rather than sitting in the header, so the
          control that changes an item is next to the item it changes. */}
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => go(index - 1)}
          aria-label="Previous benefit"
          className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-full border border-[#2d3b53] text-lg text-[#93a1b8] hover:text-[#0f172a] hover:bg-[#d4af37] hover:border-[#d4af37] transition-colors"
        >
          ‹
        </button>

        {/* Viewport + track. Slides are laid out in a row and translated as
            one, so only transform animates and nothing reflows mid-slide. */}
        <div className="flex-1 min-w-0 overflow-hidden rounded-xl" aria-live="polite">
          <div
            className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {CHESS_BENEFITS.map((b, i) => (
              <div
                key={b.title}
                className="w-full shrink-0"
                aria-hidden={i !== index}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${total}: ${b.title}`}
              >
                <div className="bg-[#0f172a] border border-[#2d3b53] rounded-xl p-6 sm:p-8 grid sm:grid-cols-[auto_1fr] gap-6 sm:gap-8 items-center min-h-[210px]">
                  <div className="w-28 h-28 sm:w-36 sm:h-36 mx-auto sm:mx-0 shrink-0">
                    <BenefitArt name={b.art} />
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="font-display text-xl sm:text-2xl text-[#d4af37]">{b.title}</h3>
                    <p className="text-base text-[#93a1b8] mt-2 leading-relaxed max-w-prose">{b.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => go(index + 1)}
          aria-label="Next benefit"
          className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-full border border-[#2d3b53] text-lg text-[#93a1b8] hover:text-[#0f172a] hover:bg-[#d4af37] hover:border-[#d4af37] transition-colors"
        >
          ›
        </button>
      </div>

      <div className="flex justify-center gap-2 mt-5">
        {CHESS_BENEFITS.map((b, i) => (
          <button
            key={b.title}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show ${b.title}`}
            aria-current={i === index ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-7 bg-[#d4af37]" : "w-1.5 bg-[#2d3b53] hover:bg-[#93a1b8]"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
