import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

/*
  Flat config (ESLint 9).

  Why this exists: the codebase already carried
  `// eslint-disable-next-line react-hooks/exhaustive-deps` comments while no
  linter was installed at all, so those suppressions were decorative and the
  rule they silenced never ran. Most of the P2.5 bug list — stale closures,
  uncleared timers, missing deps — is exactly what these rules catch.

  Run:  npm run lint        (report)
        npm run lint:fix    (autofix what is safe)
*/
export default [
  {
    ignores: ["dist/**", "node_modules/**", "public/stockfish/**", "backend/**"],
  },

  js.configs.recommended,

  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // This project imports React explicitly and does not use prop-types.
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",

      // Apostrophes in ordinary prose ("you're", "Child's Grade"). 38 hits,
      // zero of them bugs — this rule exists for a JSX-parsing footgun that
      // modern React doesn't have.
      "react/no-unescaped-entities": "off",

      // The two that would have caught real bugs in this codebase — keep them
      // as errors, not warnings, so they can't be ignored in passing.
      // exhaustive-deps immediately found a stale useMemo in Chessboard.
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",

      // --- react-hooks v7's newer, compiler-era rules ------------------
      // Both are reasonable advice for NEW code and both fire on deliberate,
      // working architecture here, so they are warnings: visible as debt,
      // not a blocked build. Revisit if this project adopts React Compiler.
      //
      // set-state-in-effect: fires on `setLoading(true)` at the top of a fetch
      // effect and on `setProfile(null)` when the user logs out — idiomatic
      // pre-compiler React, not cascading-render bugs.
      "react-hooks/set-state-in-effect": "warn",
      // refs: both boards keep the chess.js instance in a ref and force
      // re-renders manually, so `gameRef.current` is read during render by
      // design. Moving the position into state is a real refactor of a
      // deliberately rigid component (see CLAUDE.md on the board), not a lint fix.
      "react-hooks/refs": "warn",

      // Unused vars are usually a leftover from a refactor (we removed several
      // during the points-system deletion). Allow the _-prefix escape hatch.
      //
      // `React` is exempt: the automatic JSX runtime means the import is
      // technically unused in most files, but the house style imports it
      // everywhere and several files genuinely need it (React.Component,
      // forwardRef, StrictMode). Stripping ~15 imports would be churn, not a fix.
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(_|React$)",
          caughtErrors: "none",
        },
      ],

      // Real debt, not noise: captions matter for a children's education
      // product. Left as a warning because no caption files exist yet — see
      // ROADMAP P1-5. Promote to "error" once they do.
      "jsx-a11y/media-has-caption": "warn",

      // The chessboard renders piece glyphs as text inside buttons; the
      // accessible name comes from aria-label, which this rule accepts.
      "jsx-a11y/control-has-associated-label": "off",
    },
  },

  {
    // shadcn-style primitives are generic wrappers: <CardTitle> renders an
    // <h3 {...props}> and <Label> a bare <label {...props}>, with the content
    // and htmlFor supplied at each call site. The rules can't see through
    // that, so they fire on the wrapper rather than on real violations.
    // Call-site labelling is enforced by the a11y work in P2.6 instead.
    files: ["src/components/ui/**"],
    rules: {
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/label-has-associated-control": "off",
    },
  },

  {
    // Config files run in Node, not the browser.
    files: ["*.config.js", "vite.config.js", "tailwind.config.js", "postcss.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
