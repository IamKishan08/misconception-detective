/**
 * Live smoke test for the Gemini connection. Makes real calls through the same AiService the server uses, so a pass means:
 * the key authenticates, the configured model exists, structured output parses, every reply was ACCEPTED by validation,
 * and every selection is RELEVANT to its question (see smokeCriteria.ts). It exits 0 only if ALL expected cases and the
 * template check pass; any miss, rejection or off-topic choice exits 1.
 * Prints categories and selections only: never the key, prompts or provider messages.
 *
 *   npm run smoke:gemini      (node --env-file=.env --import tsx scripts/smoke-gemini.ts)
 */
import { DEFAULT_MODEL, createGeminiClient } from '../src/ai/modelClient.js';
import { AiService, type FallbackReason } from '../src/ai/service.js';
import type { HelpContext } from '../src/engine/solver/help.js';
import { parseProblem } from '../src/engine/solver/parse.js';
import { solve } from '../src/engine/solver/solve.js';
import { SMOKE_CASES, judgeCase, judgeRun, type CaseVerdict } from './smokeCriteria.js';

const key = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
if (!key) {
  console.log('GEMINI_API_KEY is not set: nothing to test.');
  process.exit(2);
}

const failures: FallbackReason[] = [];
const ai = new AiService({ client: createGeminiClient(key, model), timeoutMs: 20_000, onFailure: (reason) => failures.push(reason) });

function problem(text: string) {
  const parsed = parseProblem(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.problem;
}

const verdicts: CaseVerdict[] = [];
const selections = [];
for (const c of SMOKE_CASES) {
  const p = problem(c.problem);
  const result = await ai.ask(p, c.question, c.causes);
  const ctx: HelpContext = { solution: solve(p), causes: c.causes };
  const verdict = judgeCase(c, { source: result.source, selection: result.selection, fallbackReason: result.fallbackReason }, ctx);
  verdicts.push(verdict);
  selections.push(result.selection);
  const shown = result.selection === undefined ? `fallback (${result.fallbackReason})` : JSON.stringify(result.selection);
  console.log(`${verdict.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${JSON.stringify(c.question)} -> ${shown}${verdict.ok ? '' : `  [${verdict.why}]`}`);
}

const template = await ai.explain('F1', 'F1.common_parts', 0);
console.log(`${template.source === 'gemini' ? 'PASS' : 'FAIL'}  template check: ${template.source} ${template.templateId}${template.fallbackReason ? ` (${template.fallbackReason})` : ''}`);

const summary = judgeRun({ caseVerdicts: verdicts, selections, template: { source: template.source, templateId: template.templateId }, health: ai.health, failureCategories: failures });
console.log(`model: ${model}`);
console.log(`cases passed: ${verdicts.filter((v) => v.ok).length}/${SMOKE_CASES.length}`);
console.log(`health after run: ${ai.health}`);
console.log(`failure categories: ${failures.length === 0 ? 'none' : failures.join(', ')}`);
if (!summary.pass) for (const problemText of summary.problems) console.log(`PROBLEM: ${problemText}`);
console.log(summary.pass ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED');
process.exit(summary.pass ? 0 : 1);
