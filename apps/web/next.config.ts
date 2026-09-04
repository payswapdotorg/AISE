import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AISE-015: the workspace server composes the canonical
  // engineering-model libraries (authoritative reads). They are
  // TS-source workspace packages whose internal imports use the
  // Node-ESM `.js`-extension convention (pointing at `.ts`
  // sources), so they must be transpiled AND extension-aliased.
  transpilePackages: [
    "@aise/engineering-model",
    "@aise/backend-reality-model",
    "@aise/backend-semantics",
    "@aise/backend-geometry",
  ],
  webpack: (config) => {
    // `.js` imports inside the workspace TS packages resolve to
    // their `.ts` sources (the standard monorepo mapping).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
