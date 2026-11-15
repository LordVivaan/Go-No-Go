import {
  handleWeatherRequest,
  type WeatherRuntimeEnv,
} from '../../src/server/meteomaticsWeatherHandler';

interface PagesFunctionContext<Env = unknown> {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * Cloudflare Pages Function handling GET /api/weather.
 * Credentials are read strictly from server-side Cloudflare Pages secrets
 * (METEOMATICS_USERNAME / METEOMATICS_PASSWORD) via context.env.
 */
export async function onRequestGet(
  context: PagesFunctionContext<WeatherRuntimeEnv>,
): Promise<Response> {
  return handleWeatherRequest(context.request, context.env, {
    waitUntil: (promise) => context.waitUntil(promise),
  });
}

export async function onRequest(
  context: PagesFunctionContext<WeatherRuntimeEnv>,
): Promise<Response> {
  return handleWeatherRequest(context.request, context.env, {
    waitUntil: (promise) => context.waitUntil(promise),
  });
}
