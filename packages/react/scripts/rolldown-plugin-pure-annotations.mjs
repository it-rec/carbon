/**
 * Rolldown plugin that prepends `/*@__PURE__*\/ ` to call expressions for a
 * fixed set of well-known React APIs whose return value is a plain data
 * structure with no side effects:
 *
 *   forwardRef(...), memo(...), createContext(...), lazy(...)
 *
 * Both bare calls and `React.<name>(...)` member-access calls are annotated.
 * The annotation lets bundlers drop unused components even when they're
 * wrapped in these higher-order calls.
 *
 * Uses the `@__PURE__` form rather than the older `#__PURE__` form because
 * Rolldown's `comments.annotation` preserver only recognizes the `@` form
 * (see CommentsOptions in rolldown). Webpack, Rollup and esbuild all
 * understand both forms, so downstream consumers benefit either way.
 *
 * Runs as a `transform` hook over source files (`.{js,jsx,ts,tsx}`), i.e.
 * before bundling and tree-shaking. Already-annotated call sites are skipped
 * via a leading-comment lookbehind.
 *
 * Equivalent in spirit to babel-plugin-annotate-pure-calls; we don't add a
 * second toolchain because the production build runs through tsdown
 * (Rolldown/OXC) and not Babel.
 */

const DEFAULT_NAMES = ['forwardRef', 'memo', 'createContext', 'lazy'];

function buildPattern(names) {
  const safe = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const union = safe.join('|');
  // Match `forwardRef(` or `React.forwardRef(` not already preceded by a
  // PURE annotation. Word boundary prevents matches like `myForwardRef(`.
  return new RegExp(
    `(?<!/\\*@__PURE__\\*/\\s)\\b((?:React\\s*\\.\\s*)?(?:${union})\\s*\\()`,
    'g'
  );
}

export function pureAnnotations({ names = DEFAULT_NAMES } = {}) {
  const pattern = buildPattern(names);
  return {
    name: 'carbon-pure-annotations',
    transform: {
      filter: { id: /\.[jt]sx?$/ },
      handler(code) {
        let count = 0;
        const next = code.replace(pattern, (_, head) => {
          count++;
          return `/*@__PURE__*/ ${head}`;
        });
        return count > 0 ? { code: next, map: null } : null;
      },
    },
  };
}
