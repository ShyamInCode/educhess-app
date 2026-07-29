/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        void: "#0f172a",
        panel: "#1e293b",
        "panel-2": "#172033",
        line: "#2d3b53",
        gold: { DEFAULT: "#d4af37", soft: "#f0d98c" },
        "brand-emerald": "#34d399",
        ink: { DEFAULT: "#e7ecf5", dim: "#93a1b8" },
        danger: "#f87171",
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
