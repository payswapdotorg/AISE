/**
 * Ambient module declarations for Bun text imports of migration SQL files
 * (PROD-005). Bun natively loads `import x from "./f.sql" with { type: "text" }`
 * as the file's verbatim text; this declaration teaches tsc the same shape.
 * The .sql files stay the single source of truth ON DISK while being
 * statically importable (no runtime fs read that a serverless bundler
 * could drop).
 */

declare module "*.sql" {
  const content: string;
  export default content;
}
