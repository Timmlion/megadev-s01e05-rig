// A host that runs alone must not start half-configured: every required value is checked once,
// at boot, and a missing one stops the process with its name.

export type AgentEnv = {
  /** Signing keys the course may use, newest first. Two during the hour after a rotation. */
  pingKeys: string[];
  owner: string;
  modelKey: string;
  modelBase: string;
  model: string;
  course: string;
};

const DEFAULT_COURSE = 'https://hq.mega.dev';
// Not api/paas/v4: that one answers 429.
const DEFAULT_MODEL_BASE = 'https://api.z.ai/api/coding/paas/v4';
const DEFAULT_MODEL = 'glm-5.3-flash';

export function loadAgentEnv(env: NodeJS.ProcessEnv = process.env): AgentEnv {
  const missing: string[] = [];
  const get = (name: string, fallback?: string): string => {
    const v = env[name]?.trim() || fallback || '';
    if (!v) missing.push(name);
    return v;
  };

  const pingKey = get('MEGA_PING_KEY');
  const previous = env.MEGA_PING_KEY_PREVIOUS?.trim();
  const agent: AgentEnv = {
    pingKeys: previous ? [pingKey, previous] : [pingKey],
    owner: get('MEGA_OWNER'),
    modelKey: get('MODEL_API_KEY'),
    modelBase: get('MODEL_BASE_URL', DEFAULT_MODEL_BASE),
    model: get('MODEL_NAME', DEFAULT_MODEL),
    course: get('COURSE_BASE', DEFAULT_COURSE),
  };
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);
  return agent;
}
