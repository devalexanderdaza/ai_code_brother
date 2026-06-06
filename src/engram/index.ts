/**
 * Engram bounded context - optional persistent memory integration.
 */

export { detectEngram, detectAgents, listEngramProjects } from "./detect.js";
export type { EngramStatus, AgentTool } from "./detect.js";
export { deriveProjectName } from "./project-name.js";
export type { DerivedProjectName } from "./project-name.js";
export { installEngram } from "./installer.js";
export type { InstallResult } from "./installer.js";
export {
  writeProjectConfig,
  mergeMcpConfig,
  upsertMemoryProtocol,
  memoryProtocolSection,
} from "./config-writer.js";
export type { WriteResult, WriteOutcome } from "./config-writer.js";
export { runEngramSetup, enableGitSync, ENGRAM_SETUP_TOOLS } from "./setup-runner.js";
export type { SetupResult } from "./setup-runner.js";
