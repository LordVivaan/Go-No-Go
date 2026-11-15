import {
  handleEvaluateMissionRequest,
  type EvaluateMissionRuntimeEnv,
} from '../../src/server/missionEvaluator';

interface PagesFunctionContext<Env = unknown> {
  request: Request;
  env: Env;
}

/**
 * Cloudflare Pages Function handling POST /api/evaluate-mission.
 * Reads GEMINI_API_KEY and optional GEMINI_MODEL strictly from context.env.
 */
export async function onRequestPost(
  context: PagesFunctionContext<EvaluateMissionRuntimeEnv>
): Promise<Response> {
  return handleEvaluateMissionRequest(context.request, context.env);
}

export async function onRequest(
  context: PagesFunctionContext<EvaluateMissionRuntimeEnv>
): Promise<Response> {
  return handleEvaluateMissionRequest(context.request, context.env);
}
