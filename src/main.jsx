import React, { useCallback, useEffect, useState, useId } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

async function api(path, body) {
  const response = await fetch(
    '/api' + path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.scanId = data.scanId;
    throw error;
  }
  return data;
}
const go = (path) => {
  window.location.hash = path;
};
const short = (sha) => (sha ? sha.slice(0, 8) : 'Unresolved');
const date = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
function Icon({ name, size = 20 }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12" />
        <path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    repo: (
      <>
        <path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h14M7 3v10l3-2 3 2V3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    file: (
      <>
        <path d="M13 3H5v18h14V9l-6-6Zm0 0v6h6M8 13h8M8 17h5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.file}
    </svg>
  );
}
function Badge({ value }) {
  const label =
    {
      match: 'Review suggested',
      no_match: 'No rule match',
      inconclusive: 'Inconclusive',
      not_applicable: 'Not applicable',
    }[value] || value;
  return (
    <span className={'badge b-' + String(value).toLowerCase().replaceAll(' ', '-')}>{label}</span>
  );
}
function Field({ label, hint, children }) {
  const id = useId();
  const props = { id, 'aria-describedby': hint ? id + '-hint' : undefined };
  const control =
    children.type === 'div'
      ? React.cloneElement(
          children,
          {},
          React.Children.map(children.props.children, (child) =>
            child?.type === 'input' ? React.cloneElement(child, props) : child,
          ),
        )
      : React.cloneElement(children, props);
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      {control}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  );
}
function Title({ eyebrow, title, text, children }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children}
    </div>
  );
}
function Empty({ title, children }) {
  return (
    <div className="empty">
      <Icon name="file" size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/reviews');
  const [scans, setScans] = useState([]),
    [tasks, setTasks] = useState([]),
    [detail, setDetail] = useState(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || '/reviews');
      setError('');
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const load = useCallback(async () => {
    const [nextScans, nextTasks] = await Promise.all([api('/scans'), api('/tasks')]);
    setScans(nextScans);
    setTasks(nextTasks);
    if (/^\/(?:scans|tasks)\/[^/]+$/.test(route)) setDetail(await api(route));
    else setDetail(null);
  }, [route]);
  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  async function perform(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      if (e.scanId) go('/scans/' + e.scanId);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const createDemo = (variant) =>
    perform(async () => {
      const scan = await api('/demo', { variant });
      go('/scans/' + scan.id);
    });
  const isTasks = route.startsWith('/tasks');
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content').focus();
        }}
      >
        Skip to content
      </a>
      <header className="app-header">
        <a className="brand" href="#/reviews">
          <span className="brand-mark">
            <Icon name="search" size={23} />
          </span>
          inspecta
        </a>
        <nav aria-label="Main navigation">
          <a
            href="#/reviews"
            className={!isTasks ? 'active' : ''}
            aria-current={!isTasks ? 'page' : undefined}
          >
            Reviews
          </a>
          <a
            href="#/tasks"
            className={isTasks ? 'active' : ''}
            aria-current={isTasks ? 'page' : undefined}
          >
            Investigations
            <span className="nav-count" aria-label="open tasks">
              {tasks.filter((t) => t.status !== 'Closed').length}
            </span>
          </a>
        </nav>
        <span className="workspace-label">Local QA workspace</span>
      </header>
      <div className="workspace">
        <main id="main-content" tabIndex={-1}>
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading" role="status">
              Loading workspace…
            </div>
          ) : route === '/reviews' ? (
            <Reviews {...{ scans, tasks, busy, perform, createDemo }} />
          ) : route === '/tasks' ? (
            <Tasks tasks={tasks} />
          ) : route.startsWith('/scans/') && detail?.id === route.split('/')[2] ? (
            <Scan key={detail.id} scan={detail} {...{ tasks, busy, perform, createDemo }} />
          ) : route.startsWith('/tasks/') && detail?.id === route.split('/')[2] ? (
            <Task key={detail.id} task={detail} {...{ scans, busy, perform }} />
          ) : (
            <Empty title="Page not found">
              <a href="#/reviews">Return to repository reviews</a>
            </Empty>
          )}
          <footer>
            Observations support investigation. They do not establish that a repository is safe.
          </footer>
        </main>
      </div>
    </div>
  );
}
function Reviews({ scans, tasks, busy, perform, createDemo }) {
  const [url, setUrl] = useState(''),
    [commit, setCommit] = useState('');
  return (
    <>
      <div className="review-hero">
        <Title
          eyebrow="YOUR REVIEW WORKSPACE"
          title={
            <>
              <span>Observe.</span> <span>Investigate.</span>
              <br />
              <span>Verify.</span>
            </>
          }
          text="Keep the reasoning connected to the evidence."
        />
      </div>
      <div className="start-grid">
        <section className="new-review" aria-labelledby="capture-heading">
          <div className="panel-heading">
            <div>
              <h2 id="capture-heading">Begin with a snapshot.</h2>
              <p>
                Three focused checks.
                <br />A permanent reference for your review.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(async () => {
                const scan = await api('/scans', { url, commit });
                go('/scans/' + scan.id);
              });
            }}
          >
            <Field
              label="Public GitHub repository"
              hint="Single-package npm repositories are supported."
            >
              <div className="input-icon">
                <Icon name="repo" />
                <input
                  aria-label="Public GitHub repository"
                  type="url"
                  required
                  placeholder="https://github.com/owner/repository"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </Field>
            <details className="optional">
              <summary>
                Review a specific commit <span>Optional</span>
              </summary>
              <Field label="Commit SHA" hint="Leave blank to capture the current default branch.">
                <input
                  placeholder="Full 40-character SHA"
                  pattern="[a-fA-F0-9]{40}"
                  value={commit}
                  onChange={(e) => setCommit(e.target.value)}
                />
              </Field>
            </details>
            <div className="form-bottom">
              <button className="primary" disabled={busy}>
                {busy ? 'Working…' : 'Review repository'}
                <Icon name="arrow" size={18} />
              </button>
              <span>
                <Icon name="file" size={16} />
                Files are read, never executed.
              </span>
            </div>
          </form>
          <div className="check-strip" aria-label="Included checks">
            <span>Installation patterns</span>
            <span>Test entry point</span>
            <span>CI invocation</span>
          </div>
        </section>
        <section className="panel journal" aria-labelledby="journal-heading">
          <div className="panel-heading">
            <h2 id="journal-heading">Investigation journal</h2>
            <span className="muted">{tasks.length ? 'Recent tasks' : 'Your evidence trail'}</span>
          </div>
          {tasks.length ? (
            <>
              <ul className="journal-list">
                {tasks.slice(0, 2).map((task) => (
                  <li key={task.id}>
                    <Badge value={task.status} />
                    <h3>
                      <a href={'#/tasks/' + task.id}>{task.title}</a>
                    </h3>
                    <div className="journal-meta">
                      {task.repository} · {task.findings.map((f) => f.ruleId).join(', ')}
                    </div>
                    <p>Decision: {task.decision}</p>
                    <a className="text-action" href={'#/tasks/' + task.id}>
                      Open investigation <Icon name="arrow" size={16} />
                    </a>
                  </li>
                ))}
              </ul>
              <a className="text-action journal-all" href="#/tasks">
                View all investigations <Icon name="arrow" size={16} />
              </a>
            </>
          ) : (
            <div className="journal-empty">
              <Icon name="list" size={24} />
              <h3>Your first investigation starts with a finding.</h3>
              <p>
                Group related findings into a review task. Keep your notes, decision, and fix
                verification together.
              </p>
              <div className="journal-process">
                <span>Investigate</span>
                <span>Decide</span>
                <span>Verify</span>
              </div>
            </div>
          )}
          <div className="journal-demo">
            <div>
              <h3>Try a known example.</h3>
              <p>
                Explore a small demo fixture with known conditions. No GitHub connection needed.
              </p>
            </div>
            <button className="secondary" onClick={() => createDemo('before')} disabled={busy}>
              Open demo review <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
      </div>
      <div className="workspace-note">
        <Icon name="file" size={16} />
        Decisions stay separate from task status.
      </div>
      <section className="panel recent-reviews">
        <div className="panel-heading">
          <h2>
            Recent reviews <span className="count">{scans.length}</span>
          </h2>
          <span className="muted">Recorded repository snapshots</span>
        </div>
        {scans.length ? (
          <ScanTable scans={scans} />
        ) : (
          <Empty title="Your first review starts here">
            Enter a public repository above or explore the demo. Every captured snapshot will appear
            here.
          </Empty>
        )}
      </section>
    </>
  );
}
function ScanTable({ scans }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Repository / snapshot</th>
            <th>Commit</th>
            <th>Capture</th>
            <th>Findings</th>
            <th>Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => (
            <tr key={scan.id}>
              <td>
                <a className="table-link" href={'#/scans/' + scan.id}>
                  {scan.repository}
                  <Icon name="arrow" size={15} />
                </a>
                <small>
                  {scan.source === 'fixture'
                    ? 'Demo fixture · ' + scan.variant
                    : 'Public GitHub repository'}
                </small>
              </td>
              <td>
                <code>{short(scan.commit)}</code>
              </td>
              <td>
                <Badge value={scan.state} />
              </td>
              <td>{scan.state === 'failed' ? '—' : scan.findingCount}</td>
              <td className="muted">{date(scan.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Evidence({ items = [], finding }) {
  return (
    <div className="evidence-list">
      {items.map((item, i) => (
        <div className="evidence" key={i}>
          <div>
            <strong>{item.path || 'Scope evidence'}</strong>
            {item.startLine && (
              <span>
                Lines {item.startLine}–{item.endLine}
              </span>
            )}
            {item.path && finding?.source === 'github' && (
              <a
                target="_blank"
                rel="noreferrer"
                href={
                  'https://github.com/' +
                  finding.repository +
                  '/blob/' +
                  finding.commit +
                  '/' +
                  item.path.split('/').map(encodeURIComponent).join('/') +
                  '#L' +
                  item.startLine
                }
              >
                View at commit ↗
              </a>
            )}
          </div>
          <small>{item.label}</small>
          {item.text !== undefined && <pre>{item.text}</pre>}
          {item.paths && (
            <p className="path-list">
              {item.paths.slice(0, 60).join(' · ') || 'No matching paths in the inventory.'}
              {item.paths.length > 60 && ' · …additional paths omitted here'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
function Scan({ scan, tasks, busy, perform, createDemo }) {
  const [selected, setSelected] = useState([]),
    [title, setTitle] = useState(''),
    [existing, setExisting] = useState('');
  const availableTasks = tasks.filter(
    (t) => t.repository === scan.repository && t.status === 'Review',
  );
  return (
    <>
      <a href="#/reviews" className="back">
        ← Repository reviews
      </a>
      <Title
        eyebrow={
          scan.source === 'fixture' ? 'DEMO FIXTURE / ' + scan.variant : 'REPOSITORY SNAPSHOT'
        }
        title={scan.repository}
        text="Review the observations and choose what deserves investigation."
      >
        <Badge value={scan.state} />
      </Title>
      <div className="snapshot-meta">
        <span>
          <Icon name="repo" size={16} />
          <code>{scan.commit || 'Commit not resolved'}</code>
        </span>
        <span>
          <Icon name="clock" size={16} />
          {date(scan.createdAt)}
        </span>
        <span>Rules {scan.rulesetVersion}</span>
      </div>
      {scan.fixtureNote && <div className="notice">{scan.fixtureNote}</div>}
      {scan.error && (
        <div className="error" role="alert">
          {scan.error}
        </div>
      )}
      {scan.exclusions?.length > 0 && (
        <div className="notice warning">
          <strong>Inspection limitations</strong>
          <ul>
            {scan.exclusions.map((e, i) => (
              <li key={i}>
                {e.path}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="section-heading">
        <h2>
          Check results <span className="count">{scan.results.length}</span>
        </h2>
        <span className="muted">A match starts a review; it does not confirm an issue.</span>
      </div>
      <div className="results">
        {scan.results.map((check) => {
          const finding = scan.findings.find((f) => f.ruleId === check.ruleId);
          return (
            <section className="panel check-card" key={check.ruleId}>
              <div className="check-top">
                <div className="check-identity">
                  <span className="rule-id">{check.ruleId}</span>
                  <h3>{check.title}</h3>
                </div>
                <Badge value={check.outcome} />
              </div>
              <p className="check-summary">{check.summary}</p>
              {check.reasons && (
                <ul className="reasons">
                  {check.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              <details open={check.outcome === 'match'}>
                <summary>Evidence & investigation guidance</summary>
                <Evidence items={check.evidence} finding={finding || { ...scan }} />
                {check.signals && (
                  <p className="muted">
                    Supporting signals:{' '}
                    {check.signals.vitestDeclared ? 'Vitest declared. ' : 'No Vitest declaration. '}
                    {check.signals.paths.join(', ') || 'No recognized test paths.'}
                    {!check.signals.inventoryComplete && ' Inventory incomplete.'}
                  </p>
                )}
                {check.confidence && (
                  <p>
                    <strong>{check.confidence} observation confidence.</strong>{' '}
                    {check.confidenceReason}
                  </p>
                )}
                <p className="limitation">{check.limitations}</p>
                <ol className="investigation">
                  {check.investigation.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
              {finding && (
                <div className="finding-select">
                  {finding.taskId ? (
                    <a href={'#/tasks/' + finding.taskId}>View linked review task →</a>
                  ) : (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={selected.includes(finding.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, finding.id]
                              : selected.filter((id) => id !== finding.id),
                          )
                        }
                      />
                      Select {check.ruleId} for investigation
                    </label>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {selected.length > 0 && (
        <section className="panel grouping">
          <h2>
            Group {selected.length} finding{selected.length !== 1 ? 's' : ''} into one investigation
          </h2>
          <p className="muted">
            Group observations that share an underlying issue and can receive the same decision.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(async () => {
                let task;
                if (existing) {
                  const current = tasks.find((t) => t.id === existing);
                  task = await api('/tasks/' + existing + '/actions', {
                    action: 'attach',
                    revision: current.revision,
                    findingIds: selected,
                  });
                } else task = await api('/tasks', { title, findingIds: selected });
                setSelected([]);
                go('/tasks/' + task.id);
              });
            }}
          >
            <Field label="Destination">
              <select value={existing} onChange={(e) => setExisting(e.target.value)}>
                <option value="">Create a new review task</option>
                {availableTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            {!existing && (
              <Field label="Task title">
                <input
                  required
                  maxLength={160}
                  placeholder="What needs to be investigated?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
            )}
            <button disabled={busy} className="primary">
              {existing ? 'Link to task' : 'Create review task'}
              <Icon name="arrow" size={17} />
            </button>
          </form>
        </section>
      )}
      <details className="panel captured">
        <summary>Captured files and inspection scope</summary>
        <p>
          {scan.files?.length || 0} files captured · {scan.inventory?.length || 0} inventory entries
          · Inventory {scan.inventoryComplete ? 'complete' : 'incomplete'}
        </p>
        <p className="muted">
          Only the root package manifest and workflow files are captured. Other paths supply naming
          signals. Source code and dependencies are not evaluated.
        </p>
        {scan.files?.map((file) => (
          <details key={file.path}>
            <summary>{file.path}</summary>
            <pre>{file.text}</pre>
          </details>
        ))}
      </details>
      {scan.source === 'fixture' && (
        <div className="demo-banner">
          <div>
            <strong>Continue the fixture walkthrough</strong>
            <p>Capture a proposed fix or explore a workflow that cannot be assessed.</p>
          </div>
          <button className="secondary" disabled={busy} onClick={() => createDemo('after')}>
            Load proposed fix
          </button>
          <button className="secondary" disabled={busy} onClick={() => createDemo('delegated')}>
            Load delegated CI
          </button>
        </div>
      )}
    </>
  );
}
function Tasks({ tasks }) {
  const [status, setStatus] = useState(''),
    [decision, setDecision] = useState(''),
    [query, setQuery] = useState('');
  const filtered = tasks.filter(
    (t) =>
      (!status || t.status === status) &&
      (!decision || t.decision === decision) &&
      (t.repository + ' ' + t.title).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Title
        eyebrow="FOLLOW THE EVIDENCE"
        title="Review tasks"
        text="A place for the questions, the context, and the conclusions."
      />
      <div className="filters">
        <Field label="Search tasks or repositories">
          <input
            placeholder="Search investigations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['Review', 'Awaiting Fix', 'Verification', 'Closed'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Decision">
          <select value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="">All decisions</option>
            {['Undecided', 'Confirmed issue', 'Expected behavior', 'False positive'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <section className="panel">
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Investigation</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th>Evidence</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <a className="table-link" href={'#/tasks/' + t.id}>
                        {t.title}
                      </a>
                      <small>{t.repository}</small>
                    </td>
                    <td>
                      <Badge value={t.status} />
                    </td>
                    <td>{t.decision}</td>
                    <td>{t.findings.length} findings</td>
                    <td className="muted">{date(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={tasks.length ? 'No matching investigations' : 'Start with a finding'}>
            {tasks.length
              ? 'Adjust your filters to see more tasks.'
              : 'Select related findings from a repository review to open your first investigation.'}
          </Empty>
        )}
      </section>
    </>
  );
}
function Task({ task, scans, busy, perform }) {
  const [note, setNote] = useState(''),
    [report, setReport] = useState(task.report);
  const [decision, setDecision] = useState('Confirmed issue'),
    [rationale, setRationale] = useState(''),
    [criteria, setCriteria] = useState(task.criteria);
  const [targetCommit, setTarget] = useState(''),
    [scanId, setScanId] = useState(''),
    [plan, setPlan] = useState('');
  const [outcome, setOutcome] = useState('Passed'),
    [method, setMethod] = useState('Static inspection'),
    [expected, setExpected] = useState(task.criteria);
  const [actual, setActual] = useState(''),
    [proof, setProof] = useState(''),
    [covered, setCovered] = useState(false),
    [reason, setReason] = useState('');
  useEffect(() => {
    setExpected(task.criteria);
  }, [task.criteria]);
  const action = (name, data) =>
    perform(() =>
      api('/tasks/' + task.id + '/actions', {
        action: name,
        revision: task.revision,
        ...data,
      }),
    );
  const candidateScans = scans.filter(
    (s) => s.repository === task.repository && s.commit && s.state !== 'failed',
  );
  return (
    <>
      <a className="back" href="#/tasks">
        ← Review tasks
      </a>
      <Title eyebrow={task.repository} title={task.title} text={'Opened ' + date(task.createdAt)}>
        <Badge value={task.status} />
      </Title>
      <div className="workflow-steps">
        {['Review', 'Awaiting Fix', 'Verification', 'Closed'].map((s, i) => (
          <div key={s} className={s === task.status ? 'current' : ''}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            {s}
          </div>
        ))}
      </div>
      <div className="task-grid">
        <div className="task-main">
          <section className="panel padded">
            <h2>Investigation report</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action('report', report);
              }}
            >
              {Object.entries({
                steps: 'Inspection / reproduction steps',
                expected: 'Expected behavior',
                actual: 'Observed behavior',
                impact: 'Impact',
              }).map(([key, label]) => (
                <Field key={key} label={label}>
                  <textarea
                    rows={key === 'steps' ? 3 : 2}
                    maxLength={12000}
                    value={report[key]}
                    readOnly={task.status === 'Closed'}
                    onChange={(e) => setReport({ ...report, [key]: e.target.value })}
                  />
                </Field>
              ))}
              {task.status !== 'Closed' && (
                <button className="secondary" disabled={busy}>
                  Save report
                </button>
              )}
            </form>
          </section>
          <section className="panel padded">
            <h2>
              Source findings <span className="count">{task.findings.length}</span>
            </h2>
            {task.findings.map((f) => (
              <details className="task-finding" key={f.id}>
                <summary>
                  <span className="rule-id">{f.ruleId}</span>
                  {f.title} <code>{short(f.commit)}</code>
                </summary>
                <p>{f.summary}</p>
                <Evidence items={f.evidence} finding={f} />
                <a href={'#/scans/' + f.scanId}>Open original snapshot →</a>
              </details>
            ))}
          </section>
          <section className="panel padded">
            <h2>Add investigation evidence</h2>
            <p className="muted">
              Describe what you inspected, quote relevant evidence, and include source URLs and
              commits. Record missing information here.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action('note', { text: note });
              }}
            >
              <Field label="Investigation note">
                <textarea
                  required
                  maxLength={12000}
                  rows={4}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What did you learn, and what supports it?"
                />
              </Field>
              <button className="secondary" disabled={busy}>
                Add note
              </button>
            </form>
          </section>
          {task.attempts.length > 0 && (
            <section className="panel padded">
              <h2>Verification evidence</h2>
              {task.attempts.map((attempt) => (
                <div className="attempt" key={attempt.id}>
                  <div className="section-heading">
                    <Badge value={attempt.outcome} />
                    <code>{short(attempt.targetCommit)}</code>
                  </div>
                  <p>
                    <strong>{attempt.method}</strong> · {date(attempt.at)}
                  </p>
                  <dl>
                    <dt>Expected</dt>
                    <dd>{attempt.expected}</dd>
                    <dt>Observed</dt>
                    <dd>{attempt.actual}</dd>
                    <dt>Evidence</dt>
                    <dd>{attempt.evidence}</dd>
                  </dl>
                  {attempt.scanId && (
                    <a href={'#/scans/' + attempt.scanId}>Verification snapshot →</a>
                  )}
                </div>
              ))}
            </section>
          )}
          <section className="panel padded">
            <h2>Review history</h2>
            <ol className="history">
              {[...task.history].reverse().map((event) => (
                <li key={event.id}>
                  <span className="history-dot" />
                  <div>
                    <strong>{event.type}</strong>
                    <time>{date(event.at)}</time>
                    <p>{event.text}</p>
                    {event.status !== event.previousStatus && (
                      <small>
                        {event.previousStatus ? event.previousStatus + ' → ' : ''}
                        {event.status}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="task-actions">
          <section className="panel padded">
            <div className="eyebrow">REVIEW DECISION</div>
            <h2>{task.decision}</h2>
            {task.rationale && <p className="preserve">{task.rationale}</p>}
            {task.criteria && (
              <div className="criteria">
                <strong>Verification criteria</strong>
                <p>{task.criteria}</p>
              </div>
            )}
            {task.status === 'Review' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action('decide', { decision, rationale, criteria });
                }}
              >
                <Field label="Decision">
                  <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                    {['Confirmed issue', 'Expected behavior', 'False positive'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Decision rationale">
                  <textarea
                    required
                    rows={4}
                    maxLength={12000}
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                  />
                </Field>
                {decision === 'Confirmed issue' && (
                  <Field
                    label="Verification criteria"
                    hint="Define observable conditions for accepting the fix."
                  >
                    <textarea
                      required
                      rows={3}
                      maxLength={12000}
                      value={criteria}
                      onChange={(e) => setCriteria(e.target.value)}
                    />
                  </Field>
                )}
                <button className="primary full" disabled={busy}>
                  {decision === 'Confirmed issue'
                    ? 'Confirm & await fix'
                    : 'Record decision & close'}
                </button>
              </form>
            )}
            {task.status === 'Awaiting Fix' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action('prepare', { targetCommit, scanId, plan });
                }}
              >
                <h3>Prepare verification</h3>
                <Field label="Verification snapshot">
                  <select
                    value={scanId}
                    onChange={(e) => {
                      setScanId(e.target.value);
                      if (e.target.value)
                        setTarget(scans.find((s) => s.id === e.target.value).commit);
                    }}
                  >
                    <option value="">Enter commit manually</option>
                    {candidateScans.map((s) => (
                      <option key={s.id} value={s.id}>
                        {short(s.commit)} · {s.variant || s.state} · {date(s.createdAt)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Proposed-fix commit">
                  <input
                    required
                    pattern="[a-fA-F0-9]{40}"
                    value={targetCommit}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      setScanId('');
                    }}
                  />
                </Field>
                <Field label="Verification plan">
                  <textarea
                    required
                    rows={4}
                    maxLength={12000}
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                  />
                </Field>
                <button className="primary full" disabled={busy}>
                  Begin verification
                </button>
              </form>
            )}
            {task.status === 'Verification' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action('verify', {
                    outcome,
                    method,
                    expected,
                    actual,
                    evidence: proof,
                    criteriaCovered: covered,
                  });
                }}
              >
                <h3>Record a verification attempt</h3>
                <p className="muted">
                  Target <code>{short(task.verification.targetCommit)}</code>
                </p>
                {task.verification.scanId && (
                  <p>
                    <a href={'#/scans/' + task.verification.scanId}>
                      Inspect verification snapshot →
                    </a>
                  </p>
                )}
                <p className="preserve">{task.verification.plan}</p>
                <Field label="Verification method">
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option>Static inspection</option>
                    <option>External execution evidence</option>
                  </select>
                </Field>
                <Field label="Expected result">
                  <textarea
                    required
                    rows={3}
                    maxLength={12000}
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                  />
                </Field>
                <Field label="Observed result">
                  <textarea
                    required
                    rows={3}
                    maxLength={12000}
                    value={actual}
                    onChange={(e) => setActual(e.target.value)}
                  />
                </Field>
                <Field
                  label="Verification evidence"
                  hint="Include file/line references or a CI run URL and its commit."
                >
                  <textarea
                    required
                    rows={4}
                    maxLength={12000}
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                  />
                </Field>
                <Field label="Verification outcome">
                  <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    {['Passed', 'Failed', 'Inconclusive'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                {outcome === 'Passed' && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      required
                      checked={covered}
                      onChange={(e) => setCovered(e.target.checked)}
                    />
                    I checked every verification criterion.
                  </label>
                )}
                <p className="muted small">
                  Static inspection cannot establish that tests ran or passed.
                </p>
                <button className="primary full" disabled={busy}>
                  {outcome === 'Passed' ? 'Save verification & close' : 'Save verification attempt'}
                </button>
              </form>
            )}
            {task.status === 'Closed' && (
              <div className="closed-note">
                <Icon name="check" size={24} />
                <p>
                  This investigation is closed. Its evidence and earlier decisions remain available.
                </p>
              </div>
            )}
          </section>
          {task.status !== 'Review' && (
            <details className="panel padded">
              <summary>Return to review</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action('reopen', { reason });
                }}
              >
                <Field label="Reason for reassessment">
                  <textarea
                    required
                    rows={3}
                    maxLength={12000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <button className="secondary full" disabled={busy}>
                  Reopen investigation
                </button>
              </form>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);
