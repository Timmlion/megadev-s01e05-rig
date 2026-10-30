// A host that runs alone must not start half-configured: every required value is checked once,
// at boot, and a missing one stops the process with its name.

export type AgentEnv = {
  /** Signing keys the course may use, newest first. Two during the hour after a rotation. */
  pingKeys: string[];
  owner: string;
  modelKey: string;
  modelBase: string;
  pulseModel: string;
  testModel: string;
  course: string;
};

const DEFAULT_COURSE = 'https://hq.mega.dev';
const DEFAULT_MODEL_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

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
    modelKey: get('GOOGLE_API_KEY'),
    modelBase: get('MODEL_BASE_URL', DEFAULT_MODEL_BASE),
    pulseModel: get('PULSE_MODEL', 'gemini-flash-lite-latest'),
    testModel: get('TEST_MODEL', 'gemini-flash-latest'),
    course: get('MEGA_COURSE', DEFAULT_COURSE),
  };
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);
  return agent;
}
