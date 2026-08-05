import React from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * Real 404 page.
 *
 * The `*` route used to `<Navigate to="/" replace>`, which was worse than
 * doing nothing: the visitor silently landed on the homepage with no idea the
 * URL was wrong, and `replace` wiped the bad URL from history so the Back
 * button skipped straight past it. A mistyped or dead link just looked like
 * the site was broken.
 */
export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-20 text-center">
      <span className="font-mono text-sm tracking-[0.3em] text-[#d4af37] uppercase">Error 404</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-4 mb-3 text-[#e7ecf5]">This square is empty</h1>
      <p className="text-base text-[#93a1b8] mb-2">
        We couldn't find a page at{" "}
        <code className="font-mono text-[#e7ecf5] break-all">{location.pathname}</code>.
      </p>
      <p className="text-base text-[#93a1b8] mb-8">
        It may have moved, or the link might have a typo.
      </p>

      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          to="/"
          className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold hover:bg-[#f0d98c] transition-colors"
        >
          Back to home
        </Link>
        <Link
          to="/courses"
          className="px-5 py-2.5 rounded-lg border border-[#2d3b53] text-[#e7ecf5] font-semibold hover:border-[#d4af37]/60 transition-colors"
        >
          Browse courses
        </Link>
        <Link
          to="/contact"
          className="px-5 py-2.5 rounded-lg border border-[#2d3b53] text-[#e7ecf5] font-semibold hover:border-[#d4af37]/60 transition-colors"
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}
