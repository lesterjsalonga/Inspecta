import { parseTree, findNodeAtLocation } from 'jsonc-parser';
import { parseDocument } from 'yaml';

export const RULESET_VERSION = '1.0.0';
export const WORKFLOW_PATH = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const titles = {
  'INSTALL-01': 'Installation command review',
  'TEST-01': 'Test entry point',
  'CI-01': 'CI test invocation',
};
const limitations = {
  'INSTALL-01':
    'Only single-line, literal curl/wget → sh/bash pipelines in four root lifecycle scripts are recognized. Wrappers, quoted arguments, dependencies and external scripts are not followed. A match does not establish execution or intent.',
  'TEST-01':
    'Only scripts.test and the exact npm placeholder are assessed. File names and Vitest declarations are supporting signals, not proof of working tests or coverage.',
  'CI-01':
    'Only direct npm test / npm run test run steps are recognized. Triggers, conditions, checkout refs, working directories and test execution are not verified.',
};
const suggestions = {
  'INSTALL-01': [
    'Inspect the download source and purpose.',
    'Check integrity controls and expected setup behavior.',
    'Seek developer or security input if the purpose is unclear.',
  ],
  'TEST-01': [
    'Find the documented way to run tests.',
    'Inspect any custom scripts or external test suite.',
    'Compare the entry point with the project requirements.',
  ],
  'CI-01': [
    'Inspect delegated actions, commands and workflow conditions.',
    'Confirm whether CI is required to run tests.',
    'Record CI execution evidence separately from configuration evidence.',
  ],
};
function result(id, outcome, summary, evidence = [], extra = {}) {
  return {
    ruleId: id,
    version: RULESET_VERSION,
    title: titles[id],
    outcome,
    summary,
    evidence,
    confidence: outcome === 'inconclusive' || outcome === 'not_applicable' ? null : 'High',
    confidenceReason:
      'Direct observation within the documented inspection scope; not a defect probability.',
    limitations: limitations[id],
    investigation: suggestions[id],
    ...extra,
  };
}
function evidence(file, start, end, label) {
  const lines = file.text.split(/\r?\n/);
  const first = file.text.slice(0, start).split('\n').length;
  const last = file.text.slice(0, Math.max(start, end - 1)).split('\n').length;
  return {
    path: file.path,
    blob: file.blob,
    startLine: first,
    endLine: last,
    text: lines.slice(first - 1, last).join('\n'),
    label,
  };
}
function inventory(label, paths) {
  return { label, paths };
}
function duplicateKeys(node) {
  if (!node) return false;
  if (node.type === 'object') {
    const keys = node.children.map((p) => p.children[0].value);
    if (new Set(keys).size !== keys.length) return true;
  }
  return (node.children || []).some(duplicateKeys);
}
export function analyze(snapshot) {
  const files = snapshot.files || [];
  const paths = snapshot.inventory || files.map((f) => f.path);
  const pkg = files.find((f) => f.path === 'package.json');
  const all = (outcome, reason) =>
    Object.keys(titles).map((id) =>
      result(id, outcome, reason, [inventory('Inspected inventory', paths)]),
    );
  if (!pkg) {
    const absent = snapshot.inventoryComplete && !paths.includes('package.json');
    return all(
      absent ? 'not_applicable' : 'inconclusive',
      absent
        ? 'Unsupported: no root package.json in the complete inventory.'
        : 'Root package.json could not be inspected.',
    );
  }
  let manifest, tree;
  try {
    manifest = JSON.parse(pkg.text);
    tree = parseTree(pkg.text);
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object' || duplicateKeys(tree))
      throw new Error();
    if (
      manifest.scripts !== undefined &&
      (!manifest.scripts || Array.isArray(manifest.scripts) || typeof manifest.scripts !== 'object')
    )
      throw new Error();
  } catch {
    return all(
      'inconclusive',
      'Root package.json is malformed, ambiguous, or has an invalid scripts object.',
    );
  }
  if (Object.hasOwn(manifest, 'workspaces'))
    return all('not_applicable', 'npm workspaces are outside the single-package MVP scope.');
  const scripts = manifest.scripts || {};
  const scriptEvidence = (name) => {
    const node = findNodeAtLocation(tree, ['scripts', name]);
    return evidence(pkg, node.offset, node.offset + node.length, 'scripts.' + name);
  };
  const hooks = ['preinstall', 'install', 'postinstall', 'prepare'];
  // Intentionally narrow syntax. No shell parsing or execution.
  const pipeline =
    /^(?:curl|wget)\s+(?:-[\w=-]+\s+)*https?:\/\/[^\s"'|;&<>()]+\s*\|\s*(?:sh|bash)(?:\s+-[A-Za-z]+)*\s*$/;
  const matches = hooks.filter(
    (name) =>
      typeof scripts[name] === 'string' &&
      !scripts[name].includes('\n') &&
      !scripts[name].includes('$') &&
      !scripts[name].includes(String.fromCharCode(96)) &&
      pipeline.test(scripts[name].trim()),
  );
  const invalidHook = hooks.some(
    (name) => Object.hasOwn(scripts, name) && typeof scripts[name] !== 'string',
  );
  const install = result(
    'INSTALL-01',
    matches.length ? 'match' : invalidHook ? 'inconclusive' : 'no_match',
    matches.length
      ? 'An installation-related script contains a recognized download-and-execute pattern.'
      : invalidHook
        ? 'A lifecycle script has a non-string value.'
        : 'No supported pipeline pattern detected in the inspected lifecycle scripts.',
    matches.length
      ? matches.map(scriptEvidence)
      : [inventory('Inspected lifecycle keys: ' + hooks.join(', '), ['package.json'])],
  );
  const test = scripts.test;
  const placeholder = 'echo "Error: no test specified" && exit 1';
  const invalidTest = Object.hasOwn(scripts, 'test') && typeof test !== 'string';
  const gap =
    !Object.hasOwn(scripts, 'test') ||
    (typeof test === 'string' && (!test.trim() || test.trim() === placeholder));
  const testSignals = paths.filter((p) =>
    /(?:^|\/)vitest\.config\.[cm]?[jt]s$|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p),
  );
  const testResult = result(
    'TEST-01',
    invalidTest ? 'inconclusive' : gap ? 'match' : 'no_match',
    invalidTest
      ? 'scripts.test has a non-string value.'
      : gap
        ? 'The root npm test entry point is missing or matches a recognized placeholder.'
        : 'A non-placeholder npm test entry point is declared; its behavior was not executed.',
    Object.hasOwn(scripts, 'test')
      ? [scriptEvidence('test')]
      : [inventory('scripts.test was not found in the parsed root manifest.', ['package.json'])],
    {
      signals: {
        paths: testSignals,
        vitestDeclared: Boolean(manifest.devDependencies?.vitest || manifest.dependencies?.vitest),
        inventoryComplete: snapshot.inventoryComplete,
      },
    },
  );
  return [install, testResult, inspectCI(snapshot)];
}
function inspectCI(snapshot) {
  const paths = (snapshot.inventory || []).filter((p) => WORKFLOW_PATH.test(p));
  const found = [],
    unknown = [];
  if (!snapshot.inventoryComplete) unknown.push('The repository inventory is incomplete.');
  for (const path of paths) {
    const file = snapshot.files.find((f) => f.path === path);
    if (!file) {
      unknown.push(path + ' was not captured.');
      continue;
    }
    try {
      const doc = parseDocument(file.text, { uniqueKeys: true, stringKeys: true, customTags: [] });
      if (doc.errors.length || doc.warnings.length) throw new Error();
      const workflow = doc.toJS({ maxAliasCount: 30 });
      if (
        !workflow?.jobs ||
        Array.isArray(workflow.jobs) ||
        typeof workflow.jobs !== 'object' ||
        !Object.keys(workflow.jobs).length
      )
        throw new Error();
      for (const [name, job] of Object.entries(workflow.jobs)) {
        if (!job || typeof job !== 'object') throw new Error();
        if (job.uses) {
          unknown.push(path + ': reusable workflow in job ' + name);
          continue;
        }
        if (!Array.isArray(job.steps)) throw new Error();
        for (let i = 0; i < job.steps.length; i++) {
          const step = job.steps[i];
          if (!step || typeof step !== 'object') throw new Error();
          if ((step.run === undefined) === (step.uses === undefined)) throw new Error();
          const shell = step.shell || job.defaults?.run?.shell || workflow.defaults?.run?.shell;
          if (
            step.run !== undefined &&
            shell &&
            !['bash', 'sh', 'pwsh', 'powershell', 'cmd'].includes(shell)
          ) {
            unknown.push(path + ': unsupported shell ' + shell);
            continue;
          }
          if (
            step.uses &&
            !/^actions\/(?:checkout|setup-node|cache|upload-artifact|download-artifact)@[\w./-]+$/.test(
              step.uses,
            )
          ) {
            unknown.push(path + ': unsupported action ' + step.uses);
          }
          if (step.run !== undefined) {
            if (typeof step.run !== 'string') throw new Error();
            const node = doc.getIn(['jobs', name, 'steps', i, 'run'], true);
            // Do not mistake quoted text, heredocs, compound shell or expressions for direct commands.
            const lines = step.run
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s && !s.startsWith('#'));
            if (lines.some((s) => /[;&|<>$]/.test(s) || s.includes(String.fromCharCode(96)))) {
              unknown.push(path + ': compound or dynamic shell command');
              continue;
            }
            for (const line of lines) {
              if (/^npm (?:test|run test)(?:\s+--?[\w=-]+)*$/.test(line)) {
                if (!node?.range) {
                  unknown.push(path + ': aliased command cannot be located');
                  continue;
                }
                found.push(
                  evidence(
                    file,
                    node.range[0],
                    node.range[1],
                    'Job ' + name + ': declared test invocation',
                  ),
                );
              } else if (
                !/^(?:npm (?:ci|install|run build)(?:\s+--?[\w=-]+)*|echo(?:\s+.*)?|node --version|npm --version)$/.test(
                  line,
                )
              ) {
                unknown.push(path + ': unsupported command ' + line.slice(0, 120));
              }
            }
          }
        }
      }
    } catch {
      unknown.push(path + ': workflow is malformed or uses unsupported YAML structure.');
    }
  }
  if (unknown.length)
    return result(
      'CI-01',
      'inconclusive',
      'Test invocation could not be fully assessed.',
      [...found, inventory('Workflow paths inspected', paths)],
      { reasons: [...new Set(unknown)] },
    );
  if (found.length)
    return result(
      'CI-01',
      'no_match',
      'A direct npm test invocation is declared. Execution and passing results are not verified.',
      found,
    );
  return result(
    'CI-01',
    'match',
    'No supported direct npm test invocation was detected in the inspected GitHub Actions workflows.',
    [
      inventory(
        paths.length
          ? 'Inspected workflows and direct run steps'
          : 'No workflow files found in the complete inventory',
        paths,
      ),
    ],
    {
      confidence: 'Moderate',
      confidenceReason:
        'Absence of supported direct commands within a complete inventory; indirect test execution may use other conventions.',
    },
  );
}
