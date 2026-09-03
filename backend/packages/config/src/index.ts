import process from "node:process";

export {
  loadConfig,
  type AiseApiConfig,
  type AiseConfig,
  type AiseEnv,
  type AiseWorkerConfig,
  type LoadConfigFailure,
  type LoadConfigResult,
  type LoadConfigSuccess,
} from "./load-config.js";

/**
 * Loads a `.env` file (default: `./.env` relative to the service working
 * directory) into `process.env` when present.
 *
 * Returns `true` when a file was loaded, `false` when no file exists —
 * absence of an env file is normal and is not an error. Malformed files
 * still throw, as Node itself rejects them.
 *
 * Note: values already present in `process.env` (e.g. real environment
 * variables set by the platform) take precedence over `.env` contents.
 */
export function loadEnvFileIfPresent(path?: string): boolean {
  try {
    process.loadEnvFile(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
