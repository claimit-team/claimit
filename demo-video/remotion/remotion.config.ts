// Remotion build overrides:
//   1. "@/*" path alias → apps/web/src for direct component import.
//   2. enableTailwind() → Tailwind v4 PostCSS pipeline.
//   3. Shim aliases that intercept Next/Firebase/data-fetch/store
//      modules with local stubs so the components can render in
//      isolation.
//
// `__dirname` is unreliable — Remotion eval's this config inside its
// own CLI module. Use `process.cwd()` instead (= our project root).
const path = require("node:path");

const { Config } = require("@remotion/cli/config");
const { enableTailwind } = require("@remotion/tailwind-v4");

const CWD = process.cwd();
const WEB_SRC = path.resolve(CWD, "../../apps/web/src");
const LOCAL_SRC = path.resolve(CWD, "src");
const SHIMS = path.resolve(CWD, "src/shims");

// All keys end with `$` (webpack exact-match) so a long alias like
// "@/store" can't swallow imports of "@/store/claim-assistant-prompt".
const exact = (name, file) => [`${name}$`, path.join(SHIMS, file)];

Config.overrideWebpackConfig((current) => {
  const withTailwind = enableTailwind(current);

  const shimPairs = [
    // Firebase + API client + Next runtime
    exact("@/lib/firebase", "firebase.ts"),
    exact("@/lib/api/claims", "api-claims.ts"),
    exact("@/lib/api/auth", "api-claims.ts"),
    exact("next/link", "next-link.tsx"),
    exact("next/navigation", "next-navigation.ts"),
    // Zustand stores
    exact("@/store", "stores.ts"),
    exact("@/store/claim-assistant-prompt", "stores.ts"),
    exact("@/store/claim-detail-refetch", "stores.ts"),
    exact("@/store/claim-redraft-progress", "stores.ts"),
    exact("@/store/ui", "stores.ts"),
    exact("@/store/auth", "stores.ts"),
    exact("@/store/notifications", "stores.ts"),
    // Hooks
    exact("@/hooks/use-media-query", "hooks.ts"),
    exact("@/hooks/useAssistantStream", "hooks.ts"),
    exact("@/hooks/useConversations", "hooks.ts"),
    // Heavy sub-components
    exact("@/components/assistant/markdown-message", "markdown-message.tsx"),
    // Workspace types package
    exact("@claimit/mongodb-types", "mongodb-types.ts"),
    // External
    exact("sonner", "sonner.tsx"),
  ];

  const existing = withTailwind.resolve?.alias;
  // Both the array-form and object-form merges should preserve the
  // exact-match semantics — `$` is honored either way.
  const merged = Array.isArray(existing)
    ? [
        ...shimPairs.map(([name, alias]) => ({ name, alias })),
        { name: "@local", alias: LOCAL_SRC },
        { name: "@", alias: WEB_SRC },
        ...existing,
      ]
    : {
        ...(existing ?? {}),
        ...Object.fromEntries(shimPairs),
        "@local": LOCAL_SRC,
        "@": WEB_SRC,
      };

  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: merged,
      // apps/web component files live OUTSIDE this project, so Node's
      // resolver walks up from apps/web/ and never sees our local
      // node_modules (lucide-react, tailwindcss, class-variance-authority,
      // @base-ui/react, etc. are all installed HERE). Add our node_modules
      // as an explicit search root so those bare imports resolve no matter
      // where the importing file physically lives.
      modules: [
        path.resolve(CWD, "node_modules"),
        ...(withTailwind.resolve?.modules ?? ["node_modules"]),
      ],
    },
  };
});
