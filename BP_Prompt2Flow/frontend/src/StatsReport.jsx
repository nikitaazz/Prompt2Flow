import { useMemo, useState } from 'react';

// ── Process statistics: a report split into chapters ─────────────

const KPI_CHART_COLORS = ['#1d6b62', '#c98a3a', '#3f5f8a', '#b4523f', '#7d8f4e', '#8a6a9c', '#4c93a3', '#bfa04a', '#6b7178', '#a35a72'];

const STATS_CHAPTERS = [
  { key: 'finance', title: 'Cost and time', sub: 'Costs, duration and how they are distributed' },
  { key: 'resources', title: 'Actors and resources', sub: 'Roles, specialists, machines and tools' },
  { key: 'advice', title: 'AI recommendations', sub: 'What to remove, redesign or automate' },
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

// Duration of the process along its flow, unlike the plain sum of all steps:
// - parallel branches (fork…join) take as long as the slowest branch;
// - alternative branches (decisions) give a range from the fastest to the slowest way through the process;
// - a loop (an edge back to an earlier step) is not repeated in the fastest run and repeated once in the slowest.
// Returns { shortest, longest, criticalPath } – criticalPath holds the ids of the timed steps on the slowest way.
function processDuration(model) {
  const nodes = model?.nodes || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  (model?.edges || []).forEach((edge) => {
    if (!byId.has(edge.source) || !byId.has(edge.target)) return;
    outgoing.get(edge.source).push(edge.target);
    incoming.get(edge.target).push(edge.source);
  });

  // Depth-first search from the start: an edge to a node that is still open closes a loop.
  const state = new Map();
  const backEdges = new Set();
  const finished = [];
  const visit = (id) => {
    state.set(id, 'open');
    outgoing.get(id).forEach((target) => {
      if (state.get(target) === 'open') backEdges.add(`${id}>${target}`);
      else if (!state.has(target)) visit(target);
    });
    state.set(id, 'done');
    finished.push(id);
  };
  const starts = nodes.filter((node) => node.type === 'startEvent' || incoming.get(node.id).length === 0);
  starts.forEach((node) => { if (!state.has(node.id)) visit(node.id); });
  const order = finished.reverse();
  const isForward = (source, target) => !backEdges.has(`${source}>${target}`);

  const startIds = new Set(starts.map((node) => node.id));
  const durationOf = (id) => {
    const value = Number(byId.get(id).duration_minutes);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  // Duration of one run of the process: every branch that runs takes part, a join waits for all of them,
  // and at a decision listed in `choice` only the chosen branch runs. The run takes as long as its slowest way
  // to an end; a run that only leads back into a loop never reaches an end and returns null.
  const isEnd = (id) => byId.get(id).type === 'endEvent' || outgoing.get(id).length === 0;
  const runDuration = (choice) => {
    const finish = new Map();
    let slowest = null;
    order.forEach((id) => {
      const before = incoming.get(id).filter((source) => isForward(source, id) && finish.has(source) && (!choice.has(source) || choice.get(source) === id));
      if (!before.length && !startIds.has(id)) return; // not reached in this run
      const previous = before.map((source) => finish.get(source)).reduce((best, item) => (item.time > best.time ? item : best), { time: 0, path: [] });
      const own = durationOf(id);
      const item = { time: previous.time + own, path: own > 0 ? [...previous.path, id] : previous.path };
      finish.set(id, item);
      if (isEnd(id) && (!slowest || item.time > slowest.time)) slowest = item;
    });
    return slowest ? { ...slowest, reached: finish } : null;
  };

  // One repetition of a loop (back edge from `source` to the earlier step `target`) takes the slowest way from target to source.
  const repetitionTime = (target, source) => {
    const finish = new Map([[target, durationOf(target)]]);
    order.forEach((id) => {
      if (id === target) return;
      const before = incoming.get(id).filter((from) => isForward(from, id) && finish.has(from));
      if (before.length) finish.set(id, Math.max(...before.map((from) => finish.get(from))) + durationOf(id));
    });
    return finish.get(source) ?? 0;
  };

  // The slowest run takes the slowest branch at every decision, which is the longest way through the whole graph,
  // and repeats once every loop that starts in it.
  const fullRun = runDuration(new Map());
  if (!fullRun) return { shortest: 0, longest: 0, criticalPath: [] };
  const loopTime = [...backEdges].reduce((total, edge) => {
    const [source, target] = edge.split('>');
    return fullRun.reached.has(target) ? total + repetitionTime(target, source) : total;
  }, 0);
  const longestRun = { time: fullRun.time + loopTime, path: fullRun.path };

  // The fastest run is found by trying every combination of decision outcomes (diagrams have few decisions).
  const decisions = order
    .filter((id) => !['startEvent', 'endEvent', 'fork', 'join'].includes(byId.get(id).type))
    .map((id) => ({ id, targets: outgoing.get(id).filter((target) => isForward(id, target)) }))
    .filter((decision) => decision.targets.length > 1);
  const combinations = decisions.reduce((count, decision) => count * decision.targets.length, 1);
  let shortest = null;
  if (combinations <= 4096) {
    const choice = new Map();
    const tryFrom = (index) => {
      if (index === decisions.length) {
        const run = runDuration(choice);
        if (run && (shortest === null || run.time < shortest)) shortest = run.time;
        return;
      }
      decisions[index].targets.forEach((target) => {
        choice.set(decisions[index].id, target);
        tryFrom(index + 1);
      });
    };
    tryFrom(0);
  }

  return { shortest: shortest ?? longestRun.time, longest: longestRun.time, criticalPath: longestRun.path };
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
function FinanceChapter({ workNodes, model }) {
  const durationStats = summarizeProcessKpi(workNodes, 'durationMinutes');
  const flow = useMemo(() => processDuration(model), [model]);
  const criticalSteps = new Set(flow.criticalPath);
  const hasRange = flow.longest - flow.shortest > 1e-9;
  const costStats = summarizeProcessKpi(workNodes, 'costEuros');
  const steps = workNodes.filter((node) => !node.data?.isDecision || kpiValue(node, 'durationMinutes') !== null || kpiValue(node, 'costEuros') !== null);
  const shareField = costStats.sum > 0 ? 'costEuros' : 'durationMinutes';
  const shareTotal = shareField === 'costEuros' ? costStats.sum : durationStats.sum;
  const stepCount = workNodes.filter((node) => !node.data?.isDecision).length;

  return <div className="p2f-report__stack">
    <div className="p2f-tiles">
      <Tile tone="accent" label="Process duration"
        value={!durationStats.count ? '—' : hasRange ? `${formatStatisticDuration(flow.shortest)} – ${formatStatisticDuration(flow.longest)}` : formatStatisticDuration(flow.longest)}
        note={!durationStats.count ? `estimated for 0 of ${stepCount} steps` : hasRange ? 'fastest – slowest run of the process' : `along the flow, ${durationStats.count} of ${stepCount} steps timed`} />
      <Tile tone="amber" label="Total cost" value={costStats.count ? formatStatisticCost(costStats.sum) : '—'} note={`estimated for ${costStats.count} of ${stepCount} steps`} />
      <Tile label="Work time of all steps" value={durationStats.count ? formatStatisticDuration(durationStats.sum) : '—'} note={durationStats.count ? `${formatStatisticDuration(durationStats.average)} per step on average` : 'times are not filled in'} />
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
                  {criticalSteps.has(node.id) && <span className="p2f-tag" title="On the slowest way through the process: making this step faster shortens the whole process">critical path</span>}
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
    <p className="p2f-fineprint">Process duration follows the flow from start to end: parallel branches take as long as the slowest one, and decisions give a range from the fastest to the slowest run. The fastest run repeats no loop, the slowest repeats every loop once. Work time and total cost add up all steps, including every branch. All values are estimates based on the filled-in step KPIs, not measurements.</p>
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
const ADVICE_GROUPS = [
  { kind: 'remove', title: 'Remove', hint: 'steps that add no value' },
  { kind: 'redesign', title: 'Redesign', hint: 'merge, reorder, parallelise' },
  { kind: 'automate', title: 'Automate', hint: 'let a system do it' },
];

// Bottleneck from the step KPIs – computed here, no AI needed
function BottleneckLine({ workNodes }) {
  const duration = summarizeProcessKpi(workNodes, 'durationMinutes');
  const cost = summarizeProcessKpi(workNodes, 'costEuros');
  if (!duration.maximum && !cost.maximum) return null;
  const takes = duration.maximum && `takes ${formatStatisticDuration(duration.maximum.value)} (${percent(duration.maximum.value, duration.sum)}% of the time)`;
  const costs = cost.maximum && `costs ${formatStatisticCost(cost.maximum.value)} (${percent(cost.maximum.value, cost.sum)}% of the cost)`;
  const sameStep = duration.maximum && cost.maximum && duration.maximum.label === cost.maximum.label;
  return <div className="p2f-bottleneck">
    <span className="p2f-bottleneck__label">Bottleneck</span>
    {sameStep
      ? <span><strong>{duration.maximum.label}</strong> {takes} and {costs}</span>
      : <>
        {takes && <span><strong>{duration.maximum.label}</strong> {takes}</span>}
        {costs && <span><strong>{cost.maximum.label}</strong> {costs}</span>}
      </>}
  </div>;
}

function AdviceChapter({ workNodes, advice, onReload }) {
  const data = advice.data;
  const groups = ADVICE_GROUPS.map((group) => ({ ...group, ideas: (data?.ideas || []).filter((idea) => idea.kind === group.kind) })).filter((group) => group.ideas.length);

  return <div className="p2f-report__stack">
    <div className="p2f-report__toolbar">
      {advice.loading ? <Loading text="The AI is looking for steps to remove, redesign or automate…" />
        : advice.error ? <ErrorNote text={advice.error} onRetry={onReload} />
          : data?.summary ? <p className="p2f-report__lead">{data.summary}</p> : <span />}
      {!advice.loading && data && <button type="button" className="p2f-btn p2f-btn--sm" onClick={onReload}>Regenerate</button>}
    </div>

    <BottleneckLine workNodes={workNodes} />

    {advice.loading && !data
      ? <div className="p2f-skeleton-grid">{[1, 2, 3].map((i) => <div key={i} className="p2f-tool-card"><div className="p2f-skeleton" style={{ width: '40%' }} /><div className="p2f-skeleton" style={{ width: '90%', marginBottom: 0 }} /></div>)}</div>
      : groups.length ? <div className="p2f-idea-columns">{groups.map((group) => <section key={group.kind} className="p2f-idea-group" data-kind={group.kind}>
        <div className="p2f-idea-group__head"><span className="p2f-idea-group__dot" aria-hidden="true" />{group.title}<span className="p2f-idea-group__count">{group.ideas.length}</span><em>{group.hint}</em></div>
        <div className="p2f-idea-group__list">
          {group.ideas.map((idea, index) => <article key={`${idea.step}-${index}`} className="p2f-idea">
            {idea.step && <span className="p2f-chip p2f-chip--small p2f-idea__step">{idea.step}</span>}
            <p className="p2f-idea__text">{idea.text}</p>
            {idea.tool && <div className="p2f-idea__meta"><span>Tool</span>{idea.tool}</div>}
            {idea.effect && <div className="p2f-idea__meta"><span>Effect</span>{idea.effect}</div>}
          </article>)}
        </div>
      </section>)}</div>
        : data && !advice.error && <p className="p2f-panel__empty">The process already looks lean – the AI found nothing worth removing, redesigning or automating.</p>}

    <p className="p2f-fineprint">The bottleneck is calculated from the step KPIs. The ideas are AI suggestions based on the diagram, the KPIs and the process description – they do not change the diagram, the decision is yours.</p>
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

const EVALUATORS = [{ key: 'nvidia', label: 'NVIDIA' }, { key: 'gemini', label: 'Gemini' }];

function EvaluatorSwitch({ value, onChange, disabled }) {
  return <div className="p2f-seg" role="group" aria-label="Evaluator model">
    {EVALUATORS.map((e) => <button key={e.key} type="button" className={`p2f-seg__btn${value === e.key ? ' is-active' : ''}`} aria-pressed={value === e.key} onClick={() => value !== e.key && onChange(e.key)} disabled={disabled} title={`Evaluate with ${e.label}`} style={{ width: 'auto', padding: '0 10px', fontWeight: value === e.key ? 700 : 400 }}>{e.label}</button>)}
  </div>;
}

const FIX_ACTIONS = {
  missing: 'Add (missing from the diagram)',
  partial: 'Complete (only partly in the diagram)',
  met: 'Adjust (already in the diagram, see additional instructions)',
};

// Turns the ticked requirements / extra elements and the user's note into an edit instruction for the AI
function buildFixPrompt(requirements, extras, note) {
  const lines = ['Revise the diagram so it matches the original process description better.'];
  if (requirements.length) {
    lines.push('', 'Address these requirements from the description:');
    requirements.forEach((r, i) => {
      // "met" without a note: nothing concrete to change, so ask the AI to check it rather than point to missing instructions
      const action = r.status === 'met' && !note.trim() ? 'Check and correct if needed (marked as already in the diagram)' : FIX_ACTIONS[r.status] || FIX_ACTIONS.partial;
      lines.push(`${i + 1}. ${action}: ${r.text}${r.evidence ? ` (evaluator note: ${r.evidence})` : ''}`);
    });
  }
  if (extras.length) {
    lines.push('', 'Remove these elements, they are not in the description:');
    extras.forEach((item) => lines.push(`- ${item}`));
  }
  if (note.trim()) lines.push('', `Additional instructions: ${note.trim()}`);
  lines.push('', 'Keep the rest of the diagram unchanged.');
  return lines.join('\n');
}

function MatchChapter({ accuracy, isLoading, error, isStale, onRecheck, hasDescription, evaluator, onEvaluatorChange, onApplyFix, isApplyingFix, onToggleIgnored }) {
  const [picked, setPicked] = useState(() => new Set());
  const [note, setNote] = useState('');
  // A new evaluation gives new verdicts, so old ticks no longer apply (ignoring a requirement keeps them)
  const evaluationKey = accuracy ? `${accuracy.requirement_set}|${accuracy.diagram_prompt}|${accuracy.summary}` : '';
  const [pickedFor, setPickedFor] = useState(evaluationKey);
  if (pickedFor !== evaluationKey) {
    setPickedFor(evaluationKey);
    setPicked(new Set());
  }

  if (!hasDescription) {
    return <div className="p2f-report__stack"><p className="p2f-panel__empty">The diagram has no original process description, so there is nothing to compare it with. Describe the process in the "Create process" field and generate a diagram.</p></div>;
  }
  if (isLoading && !accuracy) return <div className="p2f-report__stack"><Loading text="The AI is splitting the description into requirements and checking them in the diagram…" /></div>;
  if (error && !accuracy) return <div className="p2f-report__stack"><EvaluatorSwitch value={evaluator} onChange={onEvaluatorChange} /><ErrorNote text={error} onRetry={onRecheck} /></div>;
  if (!accuracy) return <div className="p2f-report__stack"><Loading text="Preparing the comparison…" /></div>;

  const requirements = [...(accuracy.requirements || [])].sort((a, b) => Number(Boolean(a.ignored)) - Number(Boolean(b.ignored)) || (STATUS_META[a.status]?.order ?? 0) - (STATUS_META[b.status]?.order ?? 0) || b.importance - a.importance);
  const counts = requirements.reduce((acc, r) => (r.ignored ? acc : { ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const canIgnore = Boolean(onToggleIgnored && accuracy.requirement_set);
  const score = accuracy.accuracy_percent;
  const extras = accuracy.extra || [];
  const reqKey = (r, index) => `req:${index}:${r.text}`;
  const extraKey = (item, index) => `extra:${index}:${item}`;
  const toggle = (key) => setPicked((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const unmetKeys = requirements.flatMap((r, i) => (r.status === 'met' || r.ignored ? [] : [reqKey(r, i)]));
  const pickedReqs = requirements.filter((r, i) => picked.has(reqKey(r, i)));
  const pickedExtras = extras.filter((item, i) => picked.has(extraKey(item, i)));
  const canFix = Boolean(onApplyFix) && (pickedReqs.length > 0 || pickedExtras.length > 0 || note.trim().length > 0);
  const applyFix = async () => {
    if (!canFix || isApplyingFix) return;
    const ok = await onApplyFix(buildFixPrompt(pickedReqs, pickedExtras, note));
    if (ok) { setPicked(new Set()); setNote(''); }
  };
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
      <div className="p2f-panel__row">
        <h3 className="p2f-panel__title">Requirements from the description</h3>
        {onApplyFix && <div className="p2f-req-tools">
          <button type="button" className="p2f-btn p2f-btn--ghost p2f-btn--sm" onClick={() => setPicked((prev) => new Set([...prev, ...unmetKeys]))} disabled={!unmetKeys.length}>Select unmet</button>
          <button type="button" className="p2f-btn p2f-btn--ghost p2f-btn--sm" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</button>
        </div>}
      </div>
      <ul className="p2f-req-list">
        {requirements.map((r, index) => <li key={`${r.id || r.text}-${index}`} className={`p2f-req${onApplyFix ? ' p2f-req--pickable' : ''}${picked.has(reqKey(r, index)) ? ' is-picked' : ''}${r.ignored ? ' is-ignored' : ''}`}>
          {onApplyFix && <input type="checkbox" className="p2f-req__check" checked={picked.has(reqKey(r, index))} onChange={() => toggle(reqKey(r, index))} disabled={r.ignored} aria-label={`Fix: ${r.text}`} />}
          <span className="p2f-status" data-tone={r.ignored ? undefined : STATUS_META[r.status]?.tone}>{r.ignored ? 'Ignored' : STATUS_META[r.status]?.label}</span>
          <div className="p2f-req__body">
            <div className="p2f-req__text">{r.text}</div>
            {(r.evidence || r.step_refs?.length > 0) && <div className="p2f-req__evidence">
              {r.step_refs?.length > 0 && <span className="p2f-req__refs">{r.step_refs.length === 1 ? 'Step' : 'Steps'} {r.step_refs.join(', ')} · </span>}
              {r.evidence}{r.check && ` (check: ${r.check})`}
            </div>}
            {r.quote && <div className="p2f-req__quote">From the description: “{r.quote}”</div>}
          </div>
          <span className="p2f-req__meta">
            <span>{CATEGORY_LABELS[r.category] || r.category}</span>
            <span className="p2f-importance" title={`Importance ${r.importance} of 3`}>{[1, 2, 3].map((i) => <i key={i} className={i <= r.importance ? 'is-on' : ''} />)}</span>
            {canIgnore && r.id && <button type="button" className="p2f-req__ignore" onClick={() => onToggleIgnored(r)} title={r.ignored ? 'Count this requirement in the score again' : 'The evaluator misread the description: leave this out of the score'}>{r.ignored ? 'Count again' : 'Not a requirement'}</button>}
          </span>
        </li>)}
      </ul>
    </section>

    {extras.length > 0 && <section className="p2f-panel p2f-panel--soft">
      <h3 className="p2f-panel__title">Extra in the diagram <span className="p2f-panel__hint">does not lower the score{onApplyFix ? ' · tick to remove' : ''}</span></h3>
      {onApplyFix
        ? <ul className="p2f-extra-list">{extras.map((item, index) => <li key={`${item}-${index}`}>
          <label className={`p2f-extra${picked.has(extraKey(item, index)) ? ' is-picked' : ''}`}><input type="checkbox" checked={picked.has(extraKey(item, index))} onChange={() => toggle(extraKey(item, index))} /> <span>{item}</span></label>
        </li>)}</ul>
        : <ul className="p2f-plain-list">{extras.map((item) => <li key={item}>{item}</li>)}</ul>}
    </section>}

    {onApplyFix && <section className={`p2f-panel p2f-fix${pickedReqs.length + pickedExtras.length > 0 ? ' is-active' : ''}`}>
      <h3 className="p2f-panel__title">Fix the diagram <span className="p2f-panel__hint">{pickedReqs.length + pickedExtras.length} selected</span></h3>
      <textarea className="p2f-fix__note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What else should change? (optional) e.g. the Manager approves the order, not the Clerk" disabled={isApplyingFix} />
      {(pickedReqs.length > 0 || pickedExtras.length > 0 || note.trim()) && <details className="p2f-details p2f-fix__preview">
        <summary>Prompt that will be sent</summary>
        <pre className="p2f-outline">{buildFixPrompt(pickedReqs, pickedExtras, note)}</pre>
      </details>}
      <div className="p2f-fix__actions">
        <span className="p2f-fineprint">The AI edits the current diagram, then the match is recalculated.</span>
        <button type="button" className="p2f-btn p2f-btn--primary p2f-btn--sm" onClick={applyFix} disabled={!canFix || isApplyingFix}>{isApplyingFix && <span className="p2f-spinner" aria-hidden="true" />}{isApplyingFix ? 'Applying…' : 'Apply fix'}</button>
      </div>
    </section>}

    <details className="p2f-panel p2f-details">
      <summary>How the AI read the diagram</summary>
      <pre className="p2f-outline">{accuracy.diagram_prompt}</pre>
    </details>
    {accuracy.evaluator && <p className="p2f-fineprint">Evaluated by {accuracy.evaluator}.</p>}
    <p className="p2f-fineprint">The AI splits the original description into separate requirements (steps, actors, decisions, order, outcome) once and keeps the same list for every recalculation, so scores before and after an edit are comparable. Each requirement quotes the description. A judge then names the diagram steps that satisfy each requirement, and the app checks those steps in the diagram itself. The score is a weighted share: met = 1, partial = 0.5, missing = 0; weighted by importance 1–3. Ignored requirements and extra steps do not affect the score.</p>
  </div>;
}

export default function StatsReport({
  chapter, onChapterChange, onClose, workNodes, model,
  resources, onReloadResources,
  advice, onReloadAdvice,
  accuracy, isAccuracyLoading, accuracyError, isAccuracyStale, onRecheckAccuracy, hasDescription, accuracyEvaluator, onAccuracyEvaluatorChange,
  onApplyAccuracyFix, isApplyingFix, onToggleRequirementIgnored,
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
        {chapter === 'finance' && <FinanceChapter workNodes={workNodes} model={model} />}
        {chapter === 'resources' && <ResourcesChapter workNodes={workNodes} resources={resources} onReload={onReloadResources} />}
        {chapter === 'advice' && <AdviceChapter workNodes={workNodes} advice={advice} onReload={onReloadAdvice} />}
        {chapter === 'match' && <MatchChapter accuracy={accuracy} isLoading={isAccuracyLoading} error={accuracyError} isStale={isAccuracyStale} onRecheck={onRecheckAccuracy} hasDescription={hasDescription} evaluator={accuracyEvaluator} onEvaluatorChange={onAccuracyEvaluatorChange} onApplyFix={onApplyAccuracyFix} isApplyingFix={isApplyingFix} onToggleIgnored={onToggleRequirementIgnored} />}
      </div>
    </section>
  );
}
