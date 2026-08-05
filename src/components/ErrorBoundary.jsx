import React from "react";

/**
 * Catches render/lifecycle throws so a single bad component doesn't blank the
 * whole site. React has no hook equivalent — an error boundary must be a class.
 *
 * Used twice, deliberately:
 *   - around <App/> in main.jsx, as the last line of defence
 *   - around the route outlet, so a broken page keeps the nav usable
 *     (`resetKey` clears the error when the visitor navigates elsewhere)
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    // Navigating away from a page that threw should give it a clean slate,
    // otherwise the visitor is stuck on the error card for the rest of the
    // session even on routes that work fine.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    // No error-reporting service is wired up yet; the console is all we have.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-16 text-center">
        <span className="font-mono text-sm tracking-[0.3em] text-[#f87171] uppercase">Something broke</span>
        <h1 className="font-display text-3xl mt-4 mb-3 text-[#e7ecf5]">
          This part of the site didn't load
        </h1>
        <p className="text-base text-[#93a1b8] mb-8">
          Sorry, that's on us, not you. Reloading usually fixes it. If it keeps
          happening, please{" "}
          <a href="/contact" className="text-[#d4af37] underline underline-offset-4">
            let us know
          </a>
          .
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold hover:bg-[#f0d98c] transition-colors"
        >
          Reload the page
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-8 text-left text-xs font-mono text-[#f87171] bg-[#172033] border border-[#2d3b53] rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}
