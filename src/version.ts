/**
 * The single source of truth for this server's version at runtime.
 *
 * It is a literal rather than a read of `package.json` because neither
 * alternative works here: `tsconfig.json` sets `rootDir: "src"`, so importing
 * `../package.json` shifts the `outDir` layout and breaks the `bin` path; and
 * `scripts/pack-mcpb.sh` deletes `package.json` from the bundle after using it
 * to install dependencies, so reading it at runtime throws for `.mcpb` users.
 *
 * Keep it in step with `package.json` when releasing — `test/version.test.ts`
 * fails if the two drift.
 */
export const VERSION = "0.5.0";
