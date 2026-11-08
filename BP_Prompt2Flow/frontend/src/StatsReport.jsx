import { useMemo } from 'react';

// ── Process statistics: a report split into chapters ─────────────

const KPI_CHART_COLORS = ['#1d6b62', '#c98a3a', '#3f5f8a', '#b4523f', '#7d8f4e', '#8a6a9c', '#4c93a3', '#bfa04a', '#6b7178', '#a35a72'];

const STATS_CHAPTERS = [
  { key: 'finance', title: 'Cost and time', sub: 'Costs, duration and how they are distributed' },
  { key: 'resources', title: 'Actors and resources', sub: 'Roles, specialists, machines and tools' },
  { key: 'advice', title: 'AI recommendations', sub: 'Bottlenecks and improvement ideas' },
  { key: 'match', title: 'Match with description', sub: 'How the diagram covers the process description' },
];

const CATEGORY_LABELS = { step: 'Steps', actor: 'Actors', decision: 'Decisions', order: 'Order', outcome: 'Outcome' };
const STATUS_META = {
  missing: { label: 'Missing', tone: 'bad', order: 0 },
  partial: { label: 'Partial', tone: 'warn', order: 1 },
  met: { label: 'Met', tone: 'ok', order: 2 },
};
const TOOL_KINDS = [
  { key: 'machine', label: 'Machines' },
  { key: 'device', label: 'Devices' },
  { key: 'tool', label: 'Tools' },
  { key: 'software', label: 'Software' },
  { key: 'material', label: 'Material' },
];

function formatStatisticDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${minutes.toFixed(2)} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(2)} h`;
  if (minutes < 10080) return `${(minutes / 1440).toFixed(2)} d`;
  if (minutes < 40320) return `${(minutes / 10080).toFixed(2)} wk`;
  if (minutes < 483840) return `${(minutes / 40320).toFixed(2)} mo`;
  return `${(minutes / 483840).toFixed(2)} yr`;
}

function formatStatisticCost(value) {
  return `${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

const nodeLabel = (node) => node.data?.baseLabel || node.data?.label || node.id;
const kpiValue = (node, field) => {
  const value = node.data?.[field];
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
};
const asciiKey = (text) => (text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const stepsWord = (count) => (count === 1 ? 'step' : 'steps');

function summarizeProcessKpi(nodes, field) {
  const values = nodes.flatMap((node) => {
    const value = kpiValue(node, field);
    return value === null ? [] : [{ value, label: nodeLabel(node) }];
  });
  if (!values.length) return { count: 0, sum: 0, average: null, minimum: null, maximum: null, values: [] };
  const sum = values.reduce((total, item) => total + item.value, 0);
  return {
    count: values.length,
    sum,
    average: sum / values.length,
    minimum: values.reduce((best, item) => item.value < best.value ? item : best),
    maximum: values.reduce((best, item) => item.value > best.value ? item : best),
    values,
  };
}

function KpiPieChart({ items, formatValue, label }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const nonZeroItems = items.filter((item) => item.value > 0);
  if (total <= 0 || nonZeroItems.length === 0) {
    return <div className="p2f-pie__empty">The pie chart needs at least one value greater than zero.</div>;
  }

  const slices = nonZeroItems.reduce((acc, item) => {
    const end = acc.end + (item.value / total) * 100;
    acc.parts.push(`${KPI_CHART_COLORS[items.indexOf(item) % KPI_CHART_COLORS.length]} ${acc.end}% ${end}%`);
    return { parts: acc.parts, end };
  }, { parts: [], end: 0 }).parts;

  return (
    <div aria-label={label} className="p2f-pie">
      <div role="img" aria-label={label} className="p2f-pie__disc" style={{ background: `conic-gradient(${slices.join(', ')})` }} />
      <div className="p2f-pie__legend">
        {items.map((item, index) => <div key={`${item.label}-${index}`} title={item.label} className="p2f-pie__item">
          <span className="p2f-pie__swatch" style={{ background: item.value > 0 ? KPI_CHART_COLORS[index % KPI_CHART_COLORS.length] : '#d6d2c8' }} />
          <span className="p2f-pie__name">{item.label}</span>
          <span className="p2f-pie__value">{formatValue(item.value)}<span>{((item.value / total) * 100).toFixed(2)}%</span></span>
        </div>)}
      </div>
    </div>
  );
}

// AI answers come as "HEADING: text" plus bullets; split them into sections and strip Markdown.
function parseAiSections(text) {
  const sections = [];
  let current = null;
  (text || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const heading = line.match(/^([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ /-]{2,48}):\s*(.*)$/);
    if (heading) {
      current = { label: heading[1].trim(), lines: heading[2] ? [heading[2].replace(/^[•*-]\s*/, '')] : [] };
      sections.push(current);
      return;
    }
    if (!current) {
      current = { label: '', lines: [] };
      sections.push(current);
    }
    current.lines.push(line.replace(/^[•*-]\s*/, ''));
  });
  return sections;
}

function AiSections({ text }) {
  const sections = parseAiSections(text);
  return <div className="p2f-ai-sections">
    {sections.map((section, index) => <div key={index} className="p2f-ai-section">
      {section.label && <div className="p2f-ai-section__label">{section.label.toLowerCase()}</div>}
      {section.lines.length > 1
        ? <ul>{section.lines.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ul>
        : <p>{section.lines[0]}</p>}
    </div>)}
  </div>;
}

function Loading({ text }) {
  return <div className="p2f-report__loading"><span className="p2f-spinner" aria-hidden="true" />{text}</div>;
}

function ErrorNote({ text, onRetry }) {
  return <div className="p2f-report__error">
    <span>{text}</span>
    {onRetry && <button type="button" className="p2f-btn p2f-btn--sm" onClick={onRetry}>Try again</button>}
  </div>;
}

function Tile({ label, value, note, tone, isText = false }) {
  return <div className="p2f-tile" data-tone={tone}>
    <div className="p2f-tile__label">{label}</div>
    <div className={`p2f-tile__value${isText ? ' p2f-tile__value--text' : ''}`} title={isText ? value : undefined}>{value}</div>
    {note && <div className="p2f-tile__note">{note}</div>}
  </div>;
}

function ShareBar({ value, tone }) {
  return <span className="p2f-share" data-tone={tone}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>;
}

// ── 01 Cost and time ──────────────────────────────────────────
function FinanceChapter({ workNodes }) {
  const durationStats = summarizeProcessKpi(workNodes, 'durationMinutes');
  const costStats = summarizeProcessKpi(workNodes, 'costEuros');
  const steps = workNodes.filter((node) => !node.data?.isDecision || kpiValue(node, 'durationMinutes') !== null || kpiValue(node, 'costEuros') !== null);
  const shareField = costStats.sum > 0 ? 'costEuros' : 'durationMinutes';
  const shareTotal = shareField === 'costEuros' ? costStats.sum : durationStats.sum;
  const stepCount = workNodes.filter((node) => !node.data?.isDecision).length;

  return <div className="p2f-report__stack">
    <div className="p2f-tiles">
      <Tile tone="accent" label="Total time" value={durationStats.count ? formatStatisticDuration(durationStats.sum) : '—'} note={`estimated for ${durationStats.count} of ${stepCount} steps`} />
      <Tile tone="amber" label="Total cost" value={costStats.count ? formatStatisticCost(costStats.sum) : '—'} note={`estimated for ${costStats.count} of ${stepCount} steps`} />
      <Tile label="Average per step" value={durationStats.count ? formatStatisticDuration(durationStats.average) : '—'} note={costStats.count ? `${formatStatisticCost(costStats.average)} per step` : 'costs are not filled in'} />
      <Tile label="Most demanding step" isText value={(costStats.maximum || durationStats.maximum)?.label ?? '—'} note={costStats.maximum ? formatStatisticCost(costStats.maximum.value) : durationStats.maximum ? formatStatisticDuration(durationStats.maximum.value) : ''} />
    </div>

    <div className="p2f-report__grid2">
      <section className="p2f-panel">
        <h3 className="p2f-panel__title">Time distribution</h3>
        {durationStats.count
          ? <KpiPieChart items={durationStats.values} formatValue={formatStatisticDuration} label="Share of time per step" />
          : <p className="p2f-panel__empty">No time estimates are filled in for the steps yet. Add them with the Node KPIs tool.</p>}
      </section>
      <section className="p2f-panel">
        <h3 className="p2f-panel__title">Cost distribution</h3>
        {costStats.count
          ? <KpiPieChart items={costStats.values} formatValue={formatStatisticCost} label="Share of cost per step" />
          : <p className="p2f-panel__empty">No cost estimates are filled in for the steps yet. Add them with the Node KPIs tool.</p>}
      </section>
    </div>

    <section className="p2f-panel">
      <h3 className="p2f-panel__title">Step overview</h3>
      <div className="p2f-table-wrap">
        <table className="p2f-table">
          <thead><tr><th>#</th><th>Step</th><th>Role</th><th className="is-num">Time</th><th className="is-num">Cost</th><th>Share of {shareField === 'costEuros' ? 'cost' : 'time'}</th></tr></thead>
          <tbody>
            {steps.map((node, index) => {
              const duration = kpiValue(node, 'durationMinutes');
              const cost = kpiValue(node, 'costEuros');
              const share = percent(kpiValue(node, shareField) ?? 0, shareTotal);
              const isSlowest = durationStats.maximum && duration === durationStats.maximum.value && nodeLabel(node) === durationStats.maximum.label;
              const isPriciest = costStats.maximum && cost === costStats.maximum.value && nodeLabel(node) === costStats.maximum.label;
              return <tr key={node.id}>
                <td className="is-muted">{index + 1}</td>
                <td>
                  <span className="p2f-table__strong">{nodeLabel(node)}</span>
                  {isPriciest && <span className="p2f-tag" data-tone="amber">most expensive</span>}
                  {isSlowest && <span className="p2f-tag" data-tone="accent">longest</span>}
                </td>
                <td className="is-muted">{node.data?.actor || 'No role'}</td>
                <td className="is-num">{duration === null ? '—' : formatStatisticDuration(duration)}</td>
                <td className="is-num">{cost === null ? '—' : formatStatisticCost(cost)}</td>
                <td><span className="p2f-share-cell"><ShareBar value={share} tone={shareField === 'costEuros' ? 'amber' : 'accent'} /><span>{share}%</span></span></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
    <p className="p2f-fineprint">Total time and cost are based on the filled-in step KPIs; with branching, data from all branches is included. This is an estimate, not a measurement of actual time.</p>
  </div>;
}

// ── 02 Actors and resources ────────────────────────────────────
function ResourcesChapter({ workNodes, resources, onReload }) {
  const actorRows = useMemo(() => {
    const rows = new Map();
    workNodes.forEach((node) => {
      const actor = node.data?.actor || 'No role';
      const row = rows.get(actor) || { actor, steps: [], decisions: 0, time: 0, cost: 0 };
      if (node.data?.isDecision) row.decisions += 1;
      else row.steps.push(nodeLabel(node));
      row.time += kpiValue(node, 'durationMinutes') ?? 0;
      row.cost += kpiValue(node, 'costEuros') ?? 0;
      rows.set(actor, row);
    });
    return [...rows.values()].sort((a, b) => b.steps.length - a.steps.length);
  }, [workNodes]);

  const totalSteps = actorRows.reduce((sum, row) => sum + row.steps.length, 0);
  const totalCost = actorRows.reduce((sum, row) => sum + row.cost, 0);
  const data = resources.data;
  const specialistByRole = new Map((data?.specialists || []).map((s) => [asciiKey(s.role), s]));
  const extraSpecialists = (data?.specialists || []).filter((s) => !actorRows.some((row) => asciiKey(row.actor) === asciiKey(s.role)));
  const toolGroups = TOOL_KINDS.map((kind) => ({ ...kind, items: (data?.tools || []).filter((tool) => tool.kind === kind.key) })).filter((group) => group.items.length);

  return <div className="p2f-report__stack">
    <div className="p2f-report__toolbar">
      {resources.loading ? <Loading text="The AI is estimating the required specialists and equipment…" />
        : resources.error ? <ErrorNote text={resources.error} onRetry={onReload} />
          : data?.summary ? <p className="p2f-report__lead">{data.summary}</p> : <span />}
      {!resources.loading && data && <button type="button" className="p2f-btn p2f-btn--sm" onClick={onReload}>Refresh analysis</button>}
    </div>

    <section>
      <h3 className="p2f-report__h">Roles and specialists</h3>
      <div className="p2f-role-grid">
        {actorRows.map((row) => {
          const specialist = specialistByRole.get(asciiKey(row.actor));
          return <article key={row.actor} className="p2f-role">
            <header className="p2f-role__head">
              <span className="p2f-role__avatar" aria-hidden="true">{row.actor.charAt(0).toUpperCase()}</span>
              <div>
                <div className="p2f-role__name">{row.actor}</div>
                <div className="p2f-role__meta">{row.steps.length} {stepsWord(row.steps.length)}{row.decisions ? ` · ${row.decisions} ${row.decisions === 1 ? 'decision' : 'decisions'}` : ''}</div>
              </div>
            </header>
            <div className="p2f-role__metrics">
              <div><span>Share of steps</span><span className="p2f-share-cell"><ShareBar value={percent(row.steps.length, totalSteps)} tone="accent" /><strong>{percent(row.steps.length, totalSteps)}%</strong></span></div>
              <div><span>Time</span><strong>{row.time ? formatStatisticDuration(row.time) : '—'}</strong></div>
              <div><span>Cost</span><strong>{row.cost ? `${formatStatisticCost(row.cost)} (${percent(row.cost, totalCost)}%)` : '—'}</strong></div>
            </div>
            {specialist?.qualification && <div className="p2f-role__block"><div className="p2f-role__label">Qualification</div><p>{specialist.qualification}</p></div>}
            {specialist?.responsibilities?.length > 0 && <div className="p2f-role__block"><div className="p2f-role__label">Responsibilities</div><ul>{specialist.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {row.steps.length > 0 && <div className="p2f-chips">{row.steps.map((step, index) => <span key={`${step}-${index}`} className="p2f-chip">{step}</span>)}</div>}
          </article>;
        })}
      </div>
      {extraSpecialists.length > 0 && <div className="p2f-panel p2f-panel--soft">
        <h4 className="p2f-panel__title">Other recommended specialists</h4>
        {extraSpecialists.map((s) => <p key={s.role} className="p2f-panel__line"><strong>{s.role}</strong>{s.qualification ? ` – ${s.qualification}` : ''}</p>)}
      </div>}
    </section>

    <section>
      <h3 className="p2f-report__h">Machines, devices and tools</h3>
      {resources.loading && !data ? <div className="p2f-skeleton-grid">{[1, 2, 3].map((i) => <div key={i} className="p2f-tool-card"><div className="p2f-skeleton" style={{ width: '50%' }} /><div className="p2f-skeleton" style={{ width: '85%', marginBottom: 0 }} /></div>)}</div>
        : toolGroups.length ? toolGroups.map((group) => <div key={group.key} className="p2f-tool-group">
          <div className="p2f-tool-group__label">{group.label}<span>{group.items.length}</span></div>
          <div className="p2f-tool-grid">
            {group.items.map((tool) => <article key={tool.name} className="p2f-tool-card">
              <div className="p2f-tool-card__name">{tool.name}</div>
              {tool.purpose && <p className="p2f-tool-card__purpose">{tool.purpose}</p>}
              {tool.steps?.length > 0 && <div className="p2f-chips">{tool.steps.map((step) => <span key={step} className="p2f-chip p2f-chip--small">{step}</span>)}</div>}
            </article>)}
          </div>
        </div>)
          : !resources.error && <p className="p2f-panel__empty">The AI has not identified any equipment yet.</p>}
    </section>
    <p className="p2f-fineprint">Roles, step counts, time and cost are calculated directly from the diagram. Qualifications, responsibilities and equipment are AI estimates based on the step names and the process description.</p>
  </div>;
}

// ── 03 AI recommendations ─────────────────────────────────────
function AdviceChapter({ statsReview, isStatsReviewLoading, diagramReview, isDiagramReviewLoading, onRegenerate }) {
  return <div className="p2f-report__stack">
    <div className="p2f-report__toolbar">
      <p className="p2f-report__lead">The AI recommendations are based on the current diagram, roles and filled-in KPIs. They do not change the diagram – the decision is yours.</p>
      <button type="button" className="p2f-btn p2f-btn--sm" onClick={onRegenerate} disabled={isStatsReviewLoading || isDiagramReviewLoading}>Regenerate</button>
    </div>
    <div className="p2f-report__grid2">
      <section className="p2f-panel p2f-panel--accent">
        <h3 className="p2f-panel__title">Bottleneck: time and cost</h3>
        {isStatsReviewLoading ? <Loading text="The AI is looking for the most time- or cost-intensive step…" />
          : statsReview ? <AiSections text={statsReview} /> : <p className="p2f-panel__empty">The analysis is not available yet.</p>}
      </section>
      <section className="p2f-panel p2f-panel--accent">
        <h3 className="p2f-panel__title">Process improvement ideas</h3>
        {isDiagramReviewLoading ? <Loading text="The AI is checking steps, decisions and ways to simplify…" />
          : diagramReview ? <AiSections text={diagramReview} /> : <p className="p2f-panel__empty">The diagram review is not available yet.</p>}
      </section>
    </div>
  </div>;
}

// ── 04 Match with description ───────────────────────────────────
function ScoreRing({ value }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const tone = value >= 85 ? 'ok' : value >= 60 ? 'warn' : 'bad';
  return <div className="p2f-score" data-tone={tone}>
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
      <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
      <circle cx="56" cy="56" r={radius} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(value / 100) * circumference} ${circumference}`} transform="rotate(-90 56 56)" />
    </svg>
    <span className="p2f-score__value">{value}<small>%</small></span>
  </div>;
}

const EVALUATORS = [{ key: 'gemini', label: 'Gemini' }, { key: 'nvidia', label: 'NVIDIA' }];

function EvaluatorSwitch({ value, onChange, disabled }) {
  return <div className="p2f-seg" role="group" aria-label="Evaluator model">
    {EVALUATORS.map((e) => <button key={e.key} type="button" className={`p2f-seg__btn${value === e.key ? ' is-active' : ''}`} aria-pressed={value === e.key} onClick={() => value !== e.key && onChange(e.key)} disabled={disabled} title={`Evaluate with ${e.label}`} style={{ width: 'auto', padding: '0 10px', fontWeight: value === e.key ? 700 : 400 }}>{e.label}</button>)}
  </div>;
}

function MatchChapter({ accuracy, isLoading, error, isStale, onRecheck, hasDescription, evaluator, onEvaluatorChange }) {
  if (!hasDescription) {
    return <div className="p2f-report__stack"><p className="p2f-panel__empty">The diagram has no original process description, so there is nothing to compare it with. Describe the process in the "Create process" field and generate a diagram.</p></div>;
  }
  if (isLoading && !accuracy) return <div className="p2f-report__stack"><Loading text="The AI is splitting the description into requirements and checking them in the diagram…" /></div>;
  if (error && !accuracy) return <div className="p2f-report__stack"><EvaluatorSwitch value={evaluator} onChange={onEvaluatorChange} /><ErrorNote text={error} onRetry={onRecheck} /></div>;
  if (!accuracy) return <div className="p2f-report__stack"><Loading text="Preparing the comparison…" /></div>;

  const requirements = [...(accuracy.requirements || [])].sort((a, b) => (STATUS_META[a.status]?.order ?? 0) - (STATUS_META[b.status]?.order ?? 0) || b.importance - a.importance);
  const counts = requirements.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const score = accuracy.accuracy_percent;
  const verdict = score >= 85 ? 'The diagram faithfully matches the description' : score >= 60 ? 'The diagram partly covers the description' : 'The diagram deviates significantly from the description';

  return <div className="p2f-report__stack">
    <section className="p2f-match-hero">
      <ScoreRing value={score} />
      <div className="p2f-match-hero__body">
        <div className="p2f-match-hero__verdict">{verdict}</div>
        {accuracy.summary && <p>{accuracy.summary}</p>}
        <div className="p2f-match-hero__counts">
          <span data-tone="ok">{counts.met || 0} met</span>
          <span data-tone="warn">{counts.partial || 0} partial</span>
          <span data-tone="bad">{counts.missing || 0} missing</span>
        </div>
      </div>
      <div className="p2f-match-hero__actions">
        <EvaluatorSwitch value={evaluator} onChange={onEvaluatorChange} disabled={isLoading} />
        {isStale && !isLoading && <span className="p2f-tag" data-tone="amber">diagram changed</span>}
        {error && <span className="p2f-tag" data-tone="bad" title={error}>recalculation failed</span>}
        <button type="button" className="p2f-btn p2f-btn--sm" onClick={onRecheck} disabled={isLoading}>{isLoading && <span className="p2f-spinner" aria-hidden="true" />}{isLoading ? 'Recalculating…' : 'Recalculate'}</button>
      </div>
    </section>

    {Object.keys(accuracy.category_scores || {}).length > 0 && <section className="p2f-panel">
      <h3 className="p2f-panel__title">Match by area</h3>
      <div className="p2f-cat-bars">
        {Object.entries(accuracy.category_scores).map(([key, value]) => <div key={key} className="p2f-cat-bar">
          <span>{CATEGORY_LABELS[key] || key}</span>
          <ShareBar value={value} tone={value >= 85 ? 'ok' : value >= 60 ? 'amber' : 'bad'} />
          <strong>{value}%</strong>
        </div>)}
      </div>
    </section>}

    <section className="p2f-panel">
      <h3 className="p2f-panel__title">Requirements from the description</h3>
      <ul className="p2f-req-list">
        {requirements.map((r, index) => <li key={`${r.text}-${index}`} className="p2f-req">
          <span className="p2f-status" data-tone={STATUS_META[r.status]?.tone}>{STATUS_META[r.status]?.label}</span>
          <div className="p2f-req__body">
            <div className="p2f-req__text">{r.text}</div>
            {r.evidence && <div className="p2f-req__evidence">{r.evidence}</div>}
          </div>
          <span className="p2f-req__meta">
            <span>{CATEGORY_LABELS[r.category] || r.category}</span>
            <span className="p2f-importance" title={`Importance ${r.importance} of 3`}>{[1, 2, 3].map((i) => <i key={i} className={i <= r.importance ? 'is-on' : ''} />)}</span>
          </span>
        </li>)}
      </ul>
    </section>

    {accuracy.extra?.length > 0 && <section className="p2f-panel p2f-panel--soft">
      <h3 className="p2f-panel__title">Extra in the diagram <span className="p2f-panel__hint">does not lower the score</span></h3>
      <ul className="p2f-plain-list">{accuracy.extra.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>}

    <details className="p2f-panel p2f-details">
      <summary>How the AI read the diagram</summary>
      <pre className="p2f-outline">{accuracy.diagram_prompt}</pre>
    </details>
    {accuracy.evaluator && <p className="p2f-fineprint">Evaluated by {accuracy.evaluator}.</p>}
    <p className="p2f-fineprint">The AI splits the original description into separate requirements (steps, actors, decisions, order, outcome) and checks each one in the diagram. The score is a weighted share: met = 1, partial = 0.5, missing = 0; weighted by importance 1–3. Extra steps do not lower the score.</p>
  </div>;
}

export default function StatsReport({
  chapter, onChapterChange, onClose, workNodes,
  resources, onReloadResources,
  statsReview, isStatsReviewLoading, diagramReview, isDiagramReviewLoading, onRegenerateAdvice,
  accuracy, isAccuracyLoading, accuracyError, isAccuracyStale, onRecheckAccuracy, hasDescription, accuracyEvaluator, onAccuracyEvaluatorChange,
}) {
  const actorCount = new Set(workNodes.map((node) => node.data?.actor || 'No role')).size;
  const decisionCount = workNodes.filter((node) => node.data?.isDecision).length;

  return (
    <section className="p2f-dialog p2f-report" role="dialog" aria-modal="true" aria-labelledby="process-stats-title" onClick={(event) => event.stopPropagation()}>
      <header className="p2f-report__head">
        <div className="p2f-spacer">
          <h2 id="process-stats-title" className="p2f-report__title">Process statistics</h2>
          <div className="p2f-dialog__sub">{workNodes.length - decisionCount} {workNodes.length - decisionCount === 1 ? 'step' : 'steps'} · {decisionCount} {decisionCount === 1 ? 'decision' : 'decisions'} · {actorCount} {actorCount === 1 ? 'role' : 'roles'}</div>
        </div>
        <button type="button" className="p2f-icon-btn" onClick={onClose} aria-label="Close statistics">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </header>

      <nav className="p2f-chapters" role="tablist" aria-label="Statistics chapters">
        {STATS_CHAPTERS.map((item, index) => <button key={item.key} type="button" role="tab" aria-selected={chapter === item.key} className="p2f-chapter" onClick={() => onChapterChange(item.key)}>
          <span className="p2f-chapter__num">{String(index + 1).padStart(2, '0')}</span>
          <span className="p2f-chapter__text">
            <span className="p2f-chapter__title">{item.title}{item.key === 'match' && accuracy && !isAccuracyLoading && <span className="p2f-chapter__badge">{accuracy.accuracy_percent}%</span>}</span>
            <span className="p2f-chapter__sub">{item.sub}</span>
          </span>
        </button>)}
      </nav>

      {/* key = chapter so a new chapter opens from the top */}
      <div key={chapter} className="p2f-report__body" role="tabpanel">
        {chapter === 'finance' && <FinanceChapter workNodes={workNodes} />}
        {chapter === 'resources' && <ResourcesChapter workNodes={workNodes} resources={resources} onReload={onReloadResources} />}
        {chapter === 'advice' && <AdviceChapter statsReview={statsReview} isStatsReviewLoading={isStatsReviewLoading} diagramReview={diagramReview} isDiagramReviewLoading={isDiagramReviewLoading} onRegenerate={onRegenerateAdvice} />}
        {chapter === 'match' && <MatchChapter accuracy={accuracy} isLoading={isAccuracyLoading} error={accuracyError} isStale={isAccuracyStale} onRecheck={onRecheckAccuracy} hasDescription={hasDescription} evaluator={accuracyEvaluator} onEvaluatorChange={onAccuracyEvaluatorChange} />}
      </div>
    </section>
  );
}
