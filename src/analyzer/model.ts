/**
 * Model Selection - picks the best available Copilot model for analysis.
 *
 * Some Copilot plans (e.g. student/edu) expose a limited, changing set of
 * models, so a hardcoded model id breaks session creation. We query the
 * user's subscription via listModels() and fall back gracefully.
 */

import type { CopilotClient, ModelInfo } from "@github/copilot-sdk";

/** Preferred models for deep code analysis, best first. */
export const MODEL_PREFERENCE = ["gpt-5", "claude-sonnet-4.5", "gpt-4.1", "gpt-4o"];

/** Last-resort model when the subscription cannot be queried. */
export const FALLBACK_MODEL = "gpt-4.1";

/** A model is usable when its policy is not explicitly disabled. */
function isUsable(model: ModelInfo): boolean {
  if (model.policy?.state === "disabled") return false;
  // Embedding models cannot run chat sessions
  if (model.id.includes("embedding")) return false;
  return true;
}

/**
 * Select the analysis model:
 * 1. An explicit override (--model flag) always wins.
 * 2. First MODEL_PREFERENCE entry available in the user's subscription.
 * 3. Any other usable model from the subscription.
 * 4. FALLBACK_MODEL when listModels() fails or returns nothing.
 */
export async function selectModel(
  client: CopilotClient,
  override?: string,
  verbose = false,
): Promise<string> {
  if (override) {
    if (verbose) console.log(`  [SDK] Using model override: ${override}`);
    return override;
  }

  let models: ModelInfo[];
  try {
    models = await client.listModels();
  } catch (error) {
    if (verbose) {
      console.log(
        `  [SDK] listModels() failed (${(error as Error).message}), falling back to ${FALLBACK_MODEL}`,
      );
    }
    return FALLBACK_MODEL;
  }

  const usable = models.filter(isUsable);
  if (usable.length === 0) {
    if (verbose) console.log(`  [SDK] No usable models listed, falling back to ${FALLBACK_MODEL}`);
    return FALLBACK_MODEL;
  }

  const available = new Set(usable.map((m) => m.id));
  for (const preferred of MODEL_PREFERENCE) {
    if (available.has(preferred)) {
      if (verbose) console.log(`  [SDK] Selected model: ${preferred}`);
      return preferred;
    }
  }

  const first = usable[0].id;
  if (verbose) {
    console.log(`  [SDK] No preferred model available, using first usable model: ${first}`);
  }
  return first;
}
