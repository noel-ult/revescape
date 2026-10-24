import { ObjectivePolicy, ObjectiveSnapshot } from '../shared/agent';

export interface LunaOptions {
  apiKey?: string;
  enabled?: boolean;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxCalls?: number;
  totalBudgetMs?: number;
  allowCall?: () => boolean;
}

/** One bounded session shared by fresh/adapted runs. A failed call opens its circuit. */
export function createLunaPolicy(options: LunaOptions): ObjectivePolicy {
  const request = options.fetch ?? fetch;
  const deadline = Date.now() + (options.totalBudgetMs ?? 8_000);
  let calls = 0;
  let unavailable = !options.enabled ? 'Luna disabled' : !options.apiKey ? 'API key not configured' : '';
  return async (snapshot: ObjectiveSnapshot) => {
    const fallback = (reason: string) => ({ source: 'fallback' as const, reason });
    if (unavailable) return fallback(unavailable);
    const remaining = deadline - Date.now();
    if (options.signal?.aborted) return fallback('request cancelled');
    if (remaining <= 0 || calls >= (options.maxCalls ?? 8)) return fallback('decision budget reached');
    if (options.allowCall && !options.allowCall()) return fallback('server decision limit reached');
    calls++;
    // A cold connection from the deployed host measured ~2.4s. Keep a bounded
    // per-call margin while preserving the overall eight-second session budget.
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(options.timeoutMs ?? 4_000, remaining)));
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    try {
      const response = await request('https://api.openai.com/v1/decisions', {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-6-luna',
          input: [{ role: 'user', content: [{ type: 'input_json', data: snapshot }] }],
          questions: [{
            name: 'objective', type: 'choice',
            instructions: 'Choose the next objective for an escape scout. Evidence contains only observed beliefs, remembered hazards, unverified beacon signals, and public lift topology. Unknown tiles are unknown; an observed EXIT may still be a decoy. Aim to escape with few moves: collect useful keys, reveal new space, avoid repeated visits and known hazards, use legal lifts. Scores give the deterministic baseline ranking, not certainty. Select exactly one supplied objective. The engine handles routing and movement.',
            choices: snapshot.candidates.map(candidate => ({
              value: candidate.id,
              description: `${candidate.type} at (${candidate.target.row},${candidate.target.col}), ${candidate.moves} known-route moves, baseline utility ${candidate.score}`,
            })),
          }],
        }),
      });
      if (!response.ok) throw new Error('upstream unavailable');
      const body = await response.json();
      const answer = body?.answers?.find((item: { name?: string }) => item?.name === 'objective');
      if (answer?.type !== 'choice' || typeof answer.choice !== 'string' ||
        !snapshot.candidates.some(candidate => candidate.id === answer.choice)) throw new Error('invalid answer');
      return { source: 'luna', candidateId: answer.choice };
    } catch {
      // Never expose response bodies, credentials, or provider details to clients/logs.
      unavailable = signal.aborted ? 'decision timed out or cancelled' : 'decision unavailable';
      return fallback(unavailable);
    }
  };
}
