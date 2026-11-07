import { Fragment, useCallback, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  Position,
  MarkerType,
  Handle,
  getRectOfNodes,
  getTransformForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import CatalogPage from './CatalogPage';
import AuthModal from './AuthModal';
import StatsReport from './StatsReport';
import { toPng, toJpeg } from 'html-to-image';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;
const DECISION_HEIGHT = 80;
const EVENT_SIZE = 34;
const LANE_HEIGHT = 200;
const LANE_HEADER_WIDTH = 140;
const LANE_PADDING_X = 30;

// Colours match the tokens in index.css (nodes and lanes need them inline for the export)
const COLORS = {
  sidebarBg: '#1c2024',
  sidebarCard: '#2a2f35',
  accent: '#1d6b62',
  accentHover: '#175850',
  text: '#ffffff',
  textMuted: '#6f757d',
  danger: '#b4382d',
  success: '#2d7a4b',
  canvasBg: '#f8f7f4',
  laneBorder: '#d6d2c8'
};

// ── ALL CATEGORIES ──
const DEFAULT_CATEGORY = 'Other';
const CATEGORIES = [
  "Finance",
  "Economy",
  "HR",
  "IT",
  "Marketing",
  "Law",
  "Services",
  "Education",
  "Sport",
  "Local government",
  "Customer service",
  "Healthcare",
  "Operations",
  DEFAULT_CATEGORY,
];
const NO_ROLE = 'No role';

const Icons = {
  Generate: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
  Add: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Edit: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
  User: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  Users: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Align: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>,
  Save: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>,
  Folder: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
  Text: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>,
  Undo: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>,
  Redo: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>,
  KPI: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>),
    Info: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  ),
  Bpmn: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>),
  Menu: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="14" y2="17"></line></svg>,
  Close: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  Chart: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9v9z"></path><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"></path></svg>,
  Minus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  ArrowLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>,
  Check: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  Dash: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8.5" x2="12" y2="12.5"></line><line x1="12" y1="15.5" x2="12.01" y2="15.5"></line></svg>,
};

// Logo: two process steps connected by an edge
const LogoMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2.5" y="3.5" width="8" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="2" />
    <rect x="13.5" y="14" width="8" height="6.5" rx="1.6" fill="#8fd0c4" stroke="#8fd0c4" strokeWidth="2" />
    <path d="M10.5 6.75h3.25a2 2 0 0 1 2 2V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const EmptyIllustration = () => (
  <svg width="188" height="86" viewBox="0 0 188 86" fill="none" aria-hidden="true">
    <rect x="1" y="29" width="46" height="28" rx="6" fill="#fff" stroke="#c4bfb3" strokeWidth="1.5" />
    <path d="M11 43h26" stroke="#e4e1d9" strokeWidth="4" strokeLinecap="round" />
    <path d="M47 43h20" stroke="#b5b0a4" strokeWidth="1.5" strokeDasharray="3 3" />
    <path d="M94 19l25 24-25 24-25-24z" fill="#fbf6ea" stroke="#b8954a" strokeWidth="1.5" />
    <path d="M119 43h10a4 4 0 0 0 4-4V21a4 4 0 0 1 4-4h4" stroke="#b5b0a4" strokeWidth="1.5" />
    <path d="M119 43h10a4 4 0 0 1 4 4v18a4 4 0 0 0 4 4h4" stroke="#b5b0a4" strokeWidth="1.5" />
    <rect x="141" y="5" width="46" height="24" rx="6" fill="#fff" stroke="#1d6b62" strokeWidth="1.5" />
    <path d="M151 17h26" stroke="#cfe3de" strokeWidth="4" strokeLinecap="round" />
    <rect x="141" y="57" width="46" height="24" rx="6" fill="#fff" stroke="#c4bfb3" strokeWidth="1.5" />
    <path d="M151 69h18" stroke="#e4e1d9" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const DURATION_UNITS = [
  { label: 'min',  toMin: 1       },
  { label: 'h',    toMin: 60      },
  { label: 'd',    toMin: 1440     },
  { label: 'wk',   toMin: 10080    },
  { label: 'mo',   toMin: 40320   },
  { label: 'yr',   toMin: 483840  },
];

// ── AppModal – replaces window.prompt / confirm / alert ────────
function AppModal({ config, onClose }) {
  const [value, setValue] = useState(config.defaultValue ?? '');
  const [durUnit, setDurUnit] = useState('min');
  const inputRef = useRef(null);
  useEffect(() => { if (config.type === 'prompt' && inputRef.current) inputRef.current.focus(); }, [config.type]);
  if (!config) return null;
  const onKey = e => {
    if (e.key === 'Enter' && config.type !== 'confirm') {
      if (config.type === 'duration') {
        const num = parseFloat(value);
        const unit = DURATION_UNITS.find(u => u.label === durUnit);
        onClose(isNaN(num) || value === '' ? null : String(Math.round(num * unit.toMin)));
      } else {
        onClose(value);
      }
    }
    if (e.key === 'Escape') onClose(null);
  };
  return (
    <div className="p2f-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(null); }}>
      <div className="p2f-modal" role="dialog" aria-modal="true" aria-labelledby="p2f-app-modal-title" onKeyDown={onKey}>
        <p id="p2f-app-modal-title" className="p2f-modal__title">{config.title}</p>
        {config.message && <p className="p2f-modal__message">{config.message}</p>}

        {config.type === 'prompt' && (
          <input ref={inputRef} className="p2f-field" value={value} onChange={e => setValue(e.target.value)} placeholder={config.placeholder} />
        )}
        {config.type === 'duration' && (
          <div className="p2f-field-row">
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="any"
              className="p2f-field"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0"
            />
            <select
              value={durUnit}
              onChange={e => setDurUnit(e.target.value)}
              className="p2f-field p2f-field--unit"
            >
              {DURATION_UNITS.map(u => (
                <option key={u.label} value={u.label}>{u.label}</option>
              ))}
            </select>
          </div>
        )}

        {config.type === 'select' && (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            className="p2f-field"
          >
            {config.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}

        <div className="p2f-modal__actions">
          {config.type === 'alert' && <button className="p2f-btn p2f-btn--primary" onClick={() => onClose(true)}>OK</button>}
          {(config.type === 'prompt' || config.type === 'select') && (
              <>
                <button className="p2f-btn" onClick={() => onClose(null)}>Cancel</button>
                <button className="p2f-btn p2f-btn--primary" onClick={() => {
                  if (config.type === 'duration') {
                    const num = parseFloat(value);
                    const unit = DURATION_UNITS.find(u => u.label === durUnit);
                    onClose(isNaN(num) || value === '' ? null : String(Math.round(num * unit.toMin)));
                  } else {
                    onClose(value);
                  }
                }}>Confirm
                </button>
              </>
          )}
          {config.type === 'confirm' && (
              <>
                <button className="p2f-btn" onClick={() => onClose(false)}>{config.cancelLabel || 'No'}</button>
                <button className={`p2f-btn ${config.danger ? 'p2f-btn--solid-danger' : 'p2f-btn--primary'}`}
                        onClick={() => onClose(true)}>{config.confirmLabel || 'Yes'}</button>
              </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoModal({ onClose }) {
  return (
    <div className="p2f-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p2f-modal p2f-modal--wide" role="dialog" aria-modal="true" aria-labelledby="p2f-info-title">
        <h2 id="p2f-info-title" className="p2f-modal__title p2f-modal__title--lg">About the tool and user guide</h2>

        <div className="p2f-prose">
          <p>
            This tool is for visualising and modelling business processes. Based on your process description, the AI
            creates a diagram with a number of steps within the range you choose, which you can then edit manually or
            with the help of AI. You can save process diagrams to the catalog privately or publicly, and you can also
            find public diagrams created by other people there.
          </p>

          <p>
            This tool was created as part of a bachelor's thesis. The original author is Timotej Jakubov.
          </p>

          <h3>Generating and editing with AI</h3>
          <p>
            Describe the process in the main window and click Create diagram. To change an existing diagram,
            switch to the Manage diagram tab, where you will find AI editing as well as tools for working with nodes.
          </p>

          <h3>Basic editing</h3>
          <p>
            In the toolbar above the canvas you can add nodes, align them and change their names, roles and KPIs.
            <br/>
            To edit a node, first click it to select it. You can then delete the selected node or change its name,
            role or KPIs (duration and cost).
            <br/>
            To edit an edge, click it first; you can then delete it or change its text.
          </p>

          <h3>Swimlanes</h3>
          <p>
            Lanes are generated automatically from the roles assigned to the steps. The system places steps with the
            same role into a shared lane and optimises the layout. To change a role, select the node and click Role,
            or click a lane header to rename the whole lane.
          </p>
          <h3>Notes</h3>
          <p>
            After the page is opened, the first diagram may take a little longer to generate.
            <br/>
            When many users are active at the same time you may see a "Too Many Requests" error; in that case AI
            generation and editing will not work for a few minutes up to an hour.
            <br/>
            The password cannot be changed after the account is created.
          </p>
        </div>

        <div className="p2f-modal__actions">
          <button className="p2f-btn p2f-btn--primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} h`;
  if (minutes < 10080) return `${(minutes / 1440).toFixed(1).replace(/\.0$/, '')} d`;
  if (minutes < 40320) return `${(minutes / 10080).toFixed(1).replace(/\.0$/, '')} wk`;
  if (minutes < 483840) return `${(minutes / 40320).toFixed(1).replace(/\.0$/, '')} mo`;
  return `${(minutes / 483840).toFixed(1).replace(/\.0$/, '')} yr`;
}

// Small KPI icons in a node (instead of emoji so they render the same in the export)
const KpiIcons = {
  Clock: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>,
  Euro: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6.6A7 7 0 1 0 18 17.4"></path><line x1="4" y1="10" x2="13" y2="10"></line><line x1="4" y1="14" x2="13" y2="14"></line></svg>,
};
const kpiItemStyle = { display: 'inline-flex', alignItems: 'center', gap: '3px' };

// ── START AND END NODES (UML: filled circle / circle with a dot) ──
const isStartEventNode = (node) => node?.data?.nodeType === 'startEvent';
const isEndEventNode = (node) => node?.data?.nodeType === 'endEvent';
const isEventNode = (node) => isStartEventNode(node) || isEndEventNode(node);

const EventNode = ({ data, selected }) => {
  const isStart = data.nodeType === 'startEvent';
  const isInvalid = data.isInvalid === true;
  const color = selected ? COLORS.accent : isInvalid ? COLORS.danger : '#1c2024';
  const r = EVENT_SIZE / 2;
  return (
    <div title={isInvalid ? data.validationMsg : data.baseLabel} style={{ width: EVENT_SIZE, height: EVENT_SIZE, position: 'relative' }}>
      {!isStart && <Handle type="target" position={Position.Left} className="p2f-handle" style={{ opacity: 0, width: 10, height: 10, left: -5 }} />}
      <svg width={EVENT_SIZE} height={EVENT_SIZE} style={{ display: 'block', overflow: 'visible', filter: selected ? 'drop-shadow(0 2px 6px rgba(29,107,98,.35))' : 'none' }}>
        {isStart
          ? <circle cx={r} cy={r} r={r - 3} fill={color} />
          : <>
            <circle cx={r} cy={r} r={r - 2} fill="#ffffff" stroke={color} strokeWidth="2" />
            <circle cx={r} cy={r} r={r - 8} fill={color} />
          </>}
      </svg>
      <div style={{ position: 'absolute', top: EVENT_SIZE + 5, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: '10.5px', fontWeight: 500, color: isInvalid ? '#8f2a21' : '#6f757d', pointerEvents: 'none' }}>
        {data.baseLabel || (isStart ? 'Start' : 'End')}
      </div>
      {isStart && <Handle type="source" position={Position.Right} className="p2f-handle" style={{ opacity: 0, width: 10, height: 10, right: -5 }} />}
    </div>
  );
};

// ── CUSTOM NODE COMPONENT ─────────────────────────────────
const TaskNode = ({ data, selected }) => {
  if (data.nodeType === 'startEvent' || data.nodeType === 'endEvent') return <EventNode data={data} selected={selected} />;
  const isDecision = data.isDecision === true;
  const isInvalid = data.isInvalid === true;
  const strokeColor = selected ? COLORS.accent : isInvalid ? COLORS.danger : isDecision ? '#b8954a' : '#c4bfb3';
  const fillColor = isInvalid ? '#fbefed' : isDecision ? '#fbf6ea' : '#ffffff';
  const strokeWidth = isInvalid ? 2.5 : selected ? 2 : 1.5;
  const hasKpi = !isDecision && (data.durationMinutes != null || data.costEuros != null);
  const nodeHeight = hasKpi ? NODE_HEIGHT + 22 : NODE_HEIGHT;
  const shadow = selected
    ? 'drop-shadow(0 3px 8px rgba(29,107,98,.28))'
    : isInvalid ? 'drop-shadow(0 2px 6px rgba(180,56,45,.22))' : 'drop-shadow(0 1px 2px rgba(28,32,36,.10))';

  return (
    <div style={{ width: NODE_WIDTH, height: isDecision ? DECISION_HEIGHT : nodeHeight, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isDecision ? '10px 30px' : '6px 10px' }}>
      <Handle type="target" position={Position.Left} className="p2f-handle" style={{ opacity: 0, width: 10, height: 10, left: isDecision ? 10 : -5 }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: -1, filter: shadow, transition: 'filter .15s ease' }}>
        {isDecision ? (
          <svg width="100%" height="100%" viewBox={`0 0 ${NODE_WIDTH} ${DECISION_HEIGHT}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
            <polygon points={`${NODE_WIDTH/2},2 ${NODE_WIDTH-2},${DECISION_HEIGHT/2} ${NODE_WIDTH/2},${DECISION_HEIGHT-2} 2,${DECISION_HEIGHT/2}`} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </svg>
        ) : (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <rect x="1" y="1" width={NODE_WIDTH-2} height={nodeHeight-2} rx="7" fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </svg>
        )}
      </div>
      <div style={{ fontSize: '12px', color: isInvalid ? '#8f2a21' : '#1c2024', fontWeight: isDecision ? '600' : '500', textAlign: 'center', zIndex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%' }}>
        <span>{data.label}</span>
        {hasKpi && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#454b53', background: '#f3f2ee', padding: '2px 7px', borderRadius: '4px', border: '1px solid #e4e1d9', lineHeight: 1.4, flexWrap: 'wrap', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {data.durationMinutes != null
              ? <span title="Estimated time" style={kpiItemStyle}><KpiIcons.Clock /> {formatDuration(data.durationMinutes)}</span>
              : null}
            {data.costEuros != null ? (
              <span title="Estimated cost" style={kpiItemStyle}><KpiIcons.Euro /> {Number.isInteger(data.costEuros) ? data.costEuros : data.costEuros.toFixed(2)} EUR</span>
            ) : null}
          </div>
        )}
      </div>
      {isInvalid && (
        <div title={data.validationMsg} style={{ position: 'absolute', top: -8, right: -8, background: COLORS.danger, color: 'white', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(28,32,36,.25)', cursor: 'help' }}>!</div>
      )}
      <Handle type="source" position={Position.Right} className="p2f-handle" style={{ opacity: 0, width: 10, height: 10, right: isDecision ? 10 : -5 }} />
    </div>
  );
};

const SwimlaneNode = ({ data }) => {
  const isEven = data.index % 2 === 0;
  return (
    <div style={{ width: '100%', height: '100%', borderBottom: `1px solid ${COLORS.laneBorder}`, borderLeft: `1px solid ${COLORS.laneBorder}`, borderRight: `1px solid ${COLORS.laneBorder}`, borderTop: data.isFirst ? `1px solid ${COLORS.laneBorder}` : 'none', display: 'flex', position: 'relative', backgroundColor: isEven ? 'rgba(28, 32, 36, 0.025)' : 'rgba(255, 255, 255, 0.55)', zIndex: -2, boxSizing: 'border-box' }}>
      {/* The lane header is clickable (renames the role); nodrag/nopan so it does not drag the canvas */}
      <div className="p2f-lane-head nodrag nopan" role="button" tabIndex={0} title="Click to rename the lane"
        onClick={() => data.onRename?.(data.actor)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); data.onRename?.(data.actor); } }}
        style={{ position: 'absolute', left: -20, top: '50%', transform: 'translateY(-50%)', width: LANE_HEADER_WIDTH, backgroundColor: '#ffffff', color: '#1c2024', fontWeight: '600', fontSize: '13px', padding: '11px 10px', textAlign: 'center', borderRadius: '7px', border: '1px solid #e4e1d9', borderLeft: `3px solid ${COLORS.accent}`, boxShadow: '0 1px 2px rgba(28,32,36,.06)', zIndex: 1, pointerEvents: 'all', cursor: 'pointer' }}>
        {data.label}
        <span className="p2f-lane-edit" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </span>
      </div>
    </div>
  );
};

const nodeTypes = { swimlane: SwimlaneNode, task: TaskNode };
const makeLabel = (baseLabel, actor, showActors) => actor && showActors ? `${baseLabel} \n(${actor})` : baseLabel;
const stripLaneProps = (nodes) => nodes.filter((n) => n.type !== 'swimlane').map((n) => ({ ...n, parentNode: undefined, extent: undefined, position: { x: 0, y: 0 } }));

// Every diagram has exactly one start and one end node. If they are missing, they are added and
// connected to the steps without an input / output. Older diagrams with a text "Start"/"End" node
// (including the Slovak "Začiatok"/"Koniec" from earlier versions) are converted.
function withStartEnd(taskList, edgeList, edgeDefaults) {
  const hasIn = (id, list) => list.some((e) => e.target === id);
  const hasOut = (id, list) => list.some((e) => e.source === id);
  let nodesOut = taskList.map((n) => isEventNode(n) ? { ...n, data: { ...n.data, isDecision: false } } : n);
  const convert = (nodeType, isCandidate) => {
    if (nodesOut.some((n) => n.data?.nodeType === nodeType)) return;
    const candidate = nodesOut.find(isCandidate);
    if (candidate) nodesOut = nodesOut.map((n) => n.id === candidate.id ? { ...n, data: { ...n.data, nodeType, isDecision: false, durationMinutes: null, costEuros: null } } : n);
  };
  const labelOf = (n) => (n.data?.baseLabel || '').trim().toLowerCase();
  convert('startEvent', (n) => !isEventNode(n) && (n.id === 'start' || /^(start|začiatok)/.test(labelOf(n))) && !hasIn(n.id, edgeList));
  convert('endEvent', (n) => !isEventNode(n) && (n.id === 'end' || /^(end|koniec)/.test(labelOf(n))) && !hasOut(n.id, edgeList));

  const edgesOut = [...edgeList];
  const work = nodesOut.filter((n) => !isEventNode(n));
  if (!work.length) return { nodes: nodesOut, edges: edgesOut };
  const freeId = (base) => {
    let id = base;
    for (let i = 1; nodesOut.some((n) => n.id === id) || edgesOut.some((e) => e.id === id); i += 1) id = `${base}_${i}`;
    return id;
  };
  const makeEvent = (id, nodeType, label) => ({ id, type: 'task', data: { label, baseLabel: label, actor: '', nodeType, isDecision: false }, position: { x: 0, y: 0 } });
  const link = (source, target) => ({ id: freeId(`e_${source}_${target}`), source, target, label: null, ...edgeDefaults });

  if (!nodesOut.some(isStartEventNode)) {
    const id = freeId('start');
    const entries = work.filter((n) => !hasIn(n.id, edgesOut));
    nodesOut = [makeEvent(id, 'startEvent', 'Start'), ...nodesOut];
    (entries.length ? entries : [work[0]]).forEach((n) => edgesOut.push(link(id, n.id)));
  }
  if (!nodesOut.some(isEndEventNode)) {
    const id = freeId('end');
    const exits = work.filter((n) => !hasOut(n.id, edgesOut));
    nodesOut = [...nodesOut, makeEvent(id, 'endEvent', 'End')];
    (exits.length ? exits : [work[work.length - 1]]).forEach((n) => edgesOut.push(link(n.id, id)));
  }
  return { nodes: nodesOut, edges: edgesOut };
}

// Model for the backend (AI review, statistics) – without positions and visual properties
const serializeModel = (taskList, edgeList) => ({
  nodes: taskList.map((n) => ({ id: n.id, type: n.data.nodeType || 'task', label: n.data.baseLabel || n.data.label, actor: n.data.actor || null, duration_minutes: n.data.durationMinutes ?? null, cost_euros: n.data.costEuros ?? null })),
  edges: edgeList.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label || null })),
});
// Structure signature (without KPIs) – tells whether the comparison with the description is stale
const structureSignatureOf = (taskList, edgeList) => JSON.stringify({
  n: taskList.map((n) => [n.id, n.data.baseLabel || n.data.label, n.data.actor || '', n.data.nodeType || 'task']),
  e: edgeList.map((e) => [e.source, e.target, e.label || '']),
});


async function editDiagramFromText(instruction, currentModel) {
  const response = await fetch(`${API}/edit-model`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction, current_model: currentModel }),
  });
  if (!response.ok) throw new Error('AI API failed while editing');
  return response.json();
}

async function generateDiagramFromText(description, minNodes, maxNodes, includeKpi) {
  const response = await fetch(`${API}/generate-model`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, min_nodes: parseInt(minNodes, 10), max_nodes: parseInt(maxNodes, 10), include_kpi: includeKpi }),
  });
  if (!response.ok) throw new Error('AI API failed');
  return response.json();
}

async function evaluateGeneratedDiagram(description, model) {
  const response = await fetch(`${API}/evaluate-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, model }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Semantic comparison failed (${response.status})`);
  return data;
}

async function fetchProcessResources(description, model) {
  const response = await fetch(`${API}/process-resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, model }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Resource analysis failed (${response.status})`);
  return data;
}

async function reviewPromptWithAI(prompt, signal) {
  const response = await fetch(`${API}/review-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `AI review failed (${response.status})`);
  return data;
}

async function requestAssistantReply(messages, processDescription, currentModel) {
  const response = await fetch(`${API}/assistant-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, process_description: processDescription, current_model: currentModel }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `AI assistant failed (${response.status})`);
  return data;
}

async function reviewDiagramWithAI(model, processDescription) {
  const result = await requestAssistantReply([{
    role: 'user',
    content: 'Review this process diagram and suggest concrete improvements. Answer in English exactly in this format, without any polite introduction:\nSUMMARY: one short sentence on whether the process is understandable.\nRECOMMENDATIONS:\n• [a concrete step that can be merged, removed or simplified]\n• [a missing check, decision or responsible role]\nGive at most 3 recommendations and only those that really concern the diagram. If nothing needs to change, write under RECOMMENDATIONS: The process is clear and I see no significant simplification. Do not write a Markdown table or a long paragraph. Do not change the diagram.',
  }], processDescription, model);
  return result.reply;
}

async function reviewStatsWithAI(model, processDescription) {
  const result = await requestAssistantReply([{
    role: 'user',
    content: 'Write a short bottleneck analysis of this business process for the statistics window. First find the step with the highest stated duration and/or cost, using only the KPI values from the diagram. Answer in English in this format:\nBOTTLENECK STEP: the step name and its duration/cost, if stated.\nRECOMMENDATION: what exactly to speed up or make cheaper.\nPOSSIBLE REPLACEMENT: a concrete alternative method or step that could replace or improve the current one.\nIf KPIs are missing, say plainly that the bottleneck cannot be determined by time/cost and give one structural recommendation without invented numbers. Do not repeat the general diagram review. Do not use Markdown (no ** or #); start each section on a new line.',
  }], processDescription, model);
  return result.reply;
}

const SidebarButton = ({ icon: Icon, label, onClick, disabled, variant = 'default', fullWidth = false }) => (
  <button className={`p2f-sidebar-button p2f-btn p2f-btn--${variant}${fullWidth ? ' p2f-btn--block' : ''}`} onClick={onClick} disabled={disabled}>
    {Icon && <Icon />} {label}
  </button>
);

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [nextId, setNextId] = useState(1);
  const [showActors, setShowActors] = useState(true);
  const [promptText, setPromptText] = useState('');
  const [promptReview, setPromptReview] = useState(null);
  const [answeredQuestions, setAnsweredQuestions] = useState([]);
  const [promptReviewStatus, setPromptReviewStatus] = useState('idle');
  const [promptReviewError, setPromptReviewError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [composerMode, setComposerMode] = useState('create');
  // The chat is expanded only while it has focus; otherwise it is a compact bar at the bottom.
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(true);
  const assistantInputRef = useRef(null);
  const composerRef = useRef(null);
  const composerPointerRef = useRef(false);
  const renameLaneRef = useRef(null);
  const [adviceMode, setAdviceMode] = useState('prompt');
  const [diagramReview, setDiagramReview] = useState('');
  const [isDiagramReviewLoading, setIsDiagramReviewLoading] = useState(false);
  const [statsReview, setStatsReview] = useState('');
  const [isStatsReviewLoading, setIsStatsReviewLoading] = useState(false);
  const [diagramAccuracy, setDiagramAccuracy] = useState(null);
  const [isDiagramAccuracyLoading, setIsDiagramAccuracyLoading] = useState(false);
  const [diagramAccuracyError, setDiagramAccuracyError] = useState('');
  const [accuracySignature, setAccuracySignature] = useState(null);
  const accuracyRequestRef = useRef(0);
  const accuracyAttemptRef = useRef(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsChapter, setStatsChapter] = useState('finance');
  const [statsReviewSignature, setStatsReviewSignature] = useState(null);
  const [diagramReviewSignature, setDiagramReviewSignature] = useState(null);
  const [resources, setResources] = useState({ data: null, loading: false, error: '', signature: null });
  const resourcesRequestRef = useRef(0);
  const [showToolsPanel, setShowToolsPanel] = useState(false);

  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);

  const [isSavedToCatalog, setIsSavedToCatalog] = useState(false);

  const [minNodes, setMinNodes] = useState('5');
  const [maxNodes, setMaxNodes] = useState('10');
  const [includeKpi, setIncludeKpi] = useState(true);
  const [laneCustomWidth, setLaneCustomWidth] = useState(null);
  const [, setLaneMinWidth] = useState(800);
  const [view, setView] = useState('editor');
  const [username, setUsername] = useState(localStorage.getItem('auth_username') || null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    if (composerMode !== 'create') {
      setPromptReview(null);
      setPromptReviewError('');
      setPromptReviewStatus('idle');
      return undefined;
    }

    const prompt = promptText.trim();
    if (prompt.length < 30) {
      setPromptReview(null);
      setPromptReviewError('');
      setPromptReviewStatus(prompt ? 'waiting' : 'idle');
      return undefined;
    }

    const controller = new AbortController();
    setPromptReviewStatus('waiting');
    setPromptReviewError('');
    const timeoutId = setTimeout(async () => {
      setPromptReviewStatus('loading');
      try {
        const review = await reviewPromptWithAI(prompt, controller.signal);
        setPromptReview(review);
        // The step-range decision stays valid for later reviews; AI questions are new
        setAnsweredQuestions((prev) => prev.filter((key) => key === 'range'));
        setPromptReviewStatus('ready');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setPromptReviewError(error.message);
        setPromptReviewStatus('error');
      }
    }, 900);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [promptText, composerMode]);

  // ─── LINTER: automatic check of the diagram logic ───
  useEffect(() => {
    setNodes(nds => {
      let changed = false;

      // 1. Count inputs and outputs of every node
      const inCount = {};
      const outCount = {};
      nds.forEach(n => {
        if (n.type !== 'swimlane') {
          inCount[n.id] = 0;
          outCount[n.id] = 0;
        }
      });

      edges.forEach(e => {
        if (inCount[e.target] !== undefined) inCount[e.target]++;
        if (outCount[e.source] !== undefined) outCount[e.source]++;
      });

      // 2. Count how many nodes in the whole diagram have exactly 0 inputs and 0 outputs
      let zeroInTotal = 0;
      let zeroOutTotal = 0;
      nds.forEach(n => {
        if (n.type !== 'swimlane') {
          if (inCount[n.id] === 0) zeroInTotal++;
          if (outCount[n.id] === 0) zeroOutTotal++;
        }
      });

      // 3. Evaluate errors for every node
      const hasEvents = nds.some(n => n.type !== 'swimlane' && isEventNode(n));
      const newNodes = nds.map(n => {
        if (n.type === 'swimlane') return n;

        const incomingCount = inCount[n.id];
        const outgoingCount = outCount[n.id];

        // The diagram has its own start/end nodes; the text fallback is only for older diagrams without them
        const labelLower = (n.data.baseLabel || n.data.label || '').toLowerCase();
        const isExplicitStart = hasEvents ? isStartEventNode(n) : n.id === 'start' || labelLower.includes('začiatok') || labelLower.includes('start');
        const isExplicitEnd = hasEvents ? isEndEventNode(n) : n.id === 'end' || labelLower.includes('koniec') || labelLower.includes('end');

        // A node is the START if it is explicitly named so, OR if it is the ONLY node in the diagram without an input
        const isStart = isExplicitStart || (incomingCount === 0 && zeroInTotal === 1);

        // A node is the END if it is explicitly named so, OR if it is the ONLY node in the diagram without an output
        const isEnd = isExplicitEnd || (outgoingCount === 0 && zeroOutTotal === 1);

        let isInvalid = false;
        let validationMsg = '';

        if (!isStart && incomingCount === 0) {
          isInvalid = true;
          validationMsg = 'Error – missing incoming edge! This process step is unreachable.';
        } else if (!isEnd && outgoingCount === 0) {
          isInvalid = true;
          validationMsg = 'Error – missing outgoing edge! The process ends here unexpectedly – a dead end.';
        }

        if (n.data.isInvalid !== isInvalid || n.data.validationMsg !== validationMsg) {
          changed = true;
          return { ...n, data: { ...n.data, isInvalid, validationMsg } };
        }
        return n;
      });

      return changed ? newNodes : nds;
    });
  }, [edges, setNodes]);

  // ─ Modal ───────────────────────────────────────────────────────────────
  const [modalConfig, setModalConfig] = useState(null);
  const modalResolveRef = useRef(null);
  const showModal = (cfg) => new Promise(res => { modalResolveRef.current = res; setModalConfig(cfg); });
  const handleModalClose = (v) => { setModalConfig(null); if (modalResolveRef.current) { modalResolveRef.current(v); modalResolveRef.current = null; } };
  const modalAlert   = (msg, title = 'Notice') => showModal({ type: 'alert', title, message: msg });
  const modalPrompt  = (title, placeholder = '', defaultValue = '') => showModal({ type: 'prompt', title, placeholder, defaultValue });
  const modalConfirm = (msg, title = 'Confirm', confirmLabel = 'Yes', cancelLabel = 'No', danger = false) =>
    showModal({ type: 'confirm', title, message: msg, confirmLabel, cancelLabel, danger });

  const ensureSavedBeforeDownload = async () => {
    if (isSavedToCatalog) return true;

    await modalAlert(
      'Before downloading, save the diagram to the catalog first. It can be private.',
      'Save the diagram first'
    );
    return false;
  };
  // ─ Undo/Redo history ───────────────────────────────────────────────
  const histRef = useRef([{ nodes: [], edges: [] }]);
  const histIdxRef = useRef(0);
  const saveHistory = useCallback((ns, es) => {
    const cleanNodes = (items) => items.map(({ selected, dragging, positionAbsolute, ...rest }) => rest);

    if (histRef.current.length > 0 && histIdxRef.current >= 0) {
      const current = histRef.current[histIdxRef.current];
      if (JSON.stringify(cleanNodes(current.nodes)) === JSON.stringify(cleanNodes(ns)) &&
          JSON.stringify(current.edges) === JSON.stringify(es)) {
        return;
      }
    }

    histRef.current = histRef.current.slice(0, histIdxRef.current + 1);
    histRef.current.push({
      nodes: JSON.parse(JSON.stringify(ns)),
      edges: JSON.parse(JSON.stringify(es)),
    });
    if (histRef.current.length > 50) {
      histRef.current.shift();
    }
    histIdxRef.current = histRef.current.length - 1;
    setIsSavedToCatalog(false);
  }, []);
  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current -= 1;
    const s = histRef.current[histIdxRef.current];
    setNodes(JSON.parse(JSON.stringify(s.nodes)));
    setEdges(JSON.parse(JSON.stringify(s.edges)));
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (histIdxRef.current >= histRef.current.length - 1) return;
    histIdxRef.current += 1;
    const s = histRef.current[histIdxRef.current];
    setNodes(JSON.parse(JSON.stringify(s.nodes)));
    setEdges(JSON.parse(JSON.stringify(s.edges)));
  }, [setNodes, setEdges]);
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey||e.metaKey) && e.key==='z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey||e.metaKey) && (e.key==='y'||(e.key==='z'&&e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo]);

  const taskNodes = nodes.filter((n) => n.type !== 'swimlane');
  const firstSwimlane = nodes.find((n) => n.type === 'swimlane');
  const laneControls = firstSwimlane?.data;
  const workNodes = taskNodes.filter((n) => !isEventNode(n));
  const currentModel = serializeModel(taskNodes, edges);
  const modelSignature = JSON.stringify(currentModel);
  const structureSignature = structureSignatureOf(taskNodes, edges);
  const isAccuracyStale = Boolean(diagramAccuracy) && accuracySignature !== structureSignature;

  const showDiagramReview = (model, description) => {
    setAdviceMode('diagram');
    setDiagramReview('');
    setStatsReview('');
    setStatsReviewSignature(null);
    setDiagramReviewSignature(JSON.stringify(model));
    setIsDiagramReviewLoading(true);
    reviewDiagramWithAI(model, description)
      .then(setDiagramReview)
      .catch((error) => setDiagramReview(`Could not load the AI diagram review: ${error.message}`))
      .finally(() => setIsDiagramReviewLoading(false));
  };

  const showStatsReview = (model, description) => {
    setStatsReview('');
    setStatsReviewSignature(JSON.stringify(model));
    setIsStatsReviewLoading(true);
    reviewStatsWithAI(model, description)
      .then(setStatsReview)
      .catch((error) => setStatsReview(`Could not load the AI statistics analysis: ${error.message}`))
      .finally(() => setIsStatsReviewLoading(false));
  };

  // Compares the diagram with the description; signature = the diagram state the result belongs to
  const runAccuracyCheck = (model, description, signature) => {
    const requestId = accuracyRequestRef.current + 1;
    accuracyRequestRef.current = requestId;
    accuracyAttemptRef.current = signature;
    setDiagramAccuracyError('');
    if (!description?.trim()) {
      setDiagramAccuracy(null);
      setAccuracySignature(signature);
      setIsDiagramAccuracyLoading(false);
      return;
    }
    setIsDiagramAccuracyLoading(true);
    evaluateGeneratedDiagram(description, model)
      // The signature changes only on success so a failed recheck does not hide that the result is stale
      .then((result) => { if (accuracyRequestRef.current === requestId) { setDiagramAccuracy(result); setAccuracySignature(signature); } })
      .catch((error) => { if (accuracyRequestRef.current === requestId) setDiagramAccuracyError(error.message); })
      .finally(() => { if (accuracyRequestRef.current === requestId) setIsDiagramAccuracyLoading(false); });
  };

  const loadResources = (model, description, signature) => {
    const requestId = resourcesRequestRef.current + 1;
    resourcesRequestRef.current = requestId;
    setResources((prev) => ({ ...prev, loading: true, error: '', signature }));
    fetchProcessResources(description, model)
      .then((data) => { if (resourcesRequestRef.current === requestId) setResources({ data, loading: false, error: '', signature }); })
      .catch((error) => { if (resourcesRequestRef.current === requestId) setResources((prev) => ({ ...prev, loading: false, error: error.message })); });
  };

  // New diagram (generation, catalog): old AI results do not belong to it
  const resetDiagramInsights = () => {
    accuracyRequestRef.current += 1;
    resourcesRequestRef.current += 1;
    setDiagramAccuracy(null);
    setDiagramAccuracyError('');
    setIsDiagramAccuracyLoading(false);
    setAccuracySignature(null);
    accuracyAttemptRef.current = null;
    setResources({ data: null, loading: false, error: '', signature: null });
    setStatsReview('');
    setStatsReviewSignature(null);
  };

  const openStats = (chapter = 'finance') => {
    setStatsChapter(chapter);
    setShowStatsModal(true);
  };

  // Statistics chapters load AI data only when opened and the diagram has changed since
  useEffect(() => {
    if (!showStatsModal || !workNodes.length) return;
    if (statsChapter === 'resources' && resources.signature !== modelSignature && !resources.loading) {
      loadResources(currentModel, promptText, modelSignature);
    }
    if (statsChapter === 'advice') {
      // showDiagramReview resets the bottleneck analysis, so it runs first
      if (diagramReviewSignature !== modelSignature && !isDiagramReviewLoading) showDiagramReview(currentModel, promptText);
      if ((statsReviewSignature !== modelSignature || diagramReviewSignature !== modelSignature) && !isStatsReviewLoading) showStatsReview(currentModel, promptText);
    }
    if (statsChapter === 'match' && accuracyAttemptRef.current !== structureSignature && !isDiagramAccuracyLoading) {
      runAccuracyCheck(currentModel, promptText, structureSignature);
    }
  }, [showStatsModal, statsChapter, modelSignature, structureSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showStatsModal) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape' && !modalConfig) setShowStatsModal(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showStatsModal, modalConfig]);

  // ── AI chat: expand on focus, collapse when focus leaves ──
  const handleComposerFocus = () => setIsComposerCollapsed(false);

  const handleComposerBlur = (event) => {
    const next = event.relatedTarget;
    if (next && composerRef.current?.contains(next)) return;
    // A click on a non-interactive part of the chat (e.g. advice text) or a button that just became disabled
    if (!next && (composerPointerRef.current || event.target.disabled)) return;
    setIsComposerCollapsed(true);
  };

  const handleComposerPointerDown = () => {
    composerPointerRef.current = true;
    const reset = () => {
      composerPointerRef.current = false;
      window.removeEventListener('pointerup', reset);
      window.removeEventListener('pointercancel', reset);
    };
    window.addEventListener('pointerup', reset);
    window.addEventListener('pointercancel', reset);
  };

  const handleComposerClick = (event) => {
    if (event.target.closest('button, a, input, textarea, select, label, summary')) return;
    if (!window.getSelection()?.isCollapsed) return;
    assistantInputRef.current?.focus();
  };

  const handleComposerKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (composerRef.current?.contains(document.activeElement)) document.activeElement.blur();
    setIsComposerCollapsed(true);
  };

  const submitOnModEnter = (event) => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const form = event.currentTarget.form;
    const submitter = form?.querySelector('button[type="submit"]');
    if (submitter && !submitter.disabled) form.requestSubmit(submitter);
  };

  // If the chat is expanded without focus (after clicking the advice text), a click outside or Esc collapses it.
  useEffect(() => {
    if (isComposerCollapsed) {
      // Show the start of the text in the collapsed bar, not the last line
      if (assistantInputRef.current) assistantInputRef.current.scrollTop = 0;
      return undefined;
    }
    const onPointerDown = (event) => {
      if (composerRef.current?.contains(event.target)) return;
      if (composerRef.current?.contains(document.activeElement)) return;
      setIsComposerCollapsed(true);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !composerRef.current?.contains(document.activeElement)) setIsComposerCollapsed(true);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isComposerCollapsed]);

  const edgeOptions = {
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8d9096' },
    style: { stroke: '#8d9096', strokeWidth: 1.75 },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: '#ffffff', color: '#1c2024', fillOpacity: 0.95, stroke: '#d6d2c8', strokeWidth: 1 },
    labelStyle: { fill: '#1c2024', fontWeight: 600, fontSize: 12 },
  };

  const onConnect = useCallback(async (params) => {
    // Only plain edges leave the start node – it is not a decision, so no conditions are asked for
    if (isEventNode(nodes.find((n) => n.id === params.source))) {
      const nextEdges = addEdge({ ...params, ...edgeOptions, label: null }, edges);
      setEdges(nextEdges);
      saveHistory(nodes, nextEdges);
      return;
    }
    const currentSourceEdges = edges.filter(e => e.source === params.source);
    const currentCount = currentSourceEdges.length;

    let newEdgeLabel = null;
    const firstEdgeLabelUpdates = {};

    if (currentCount === 1) {
      const r2 = await modalPrompt('Condition for the NEW path (e.g. Yes):', 'Yes', 'Yes');
      if (r2 === null) return;
      newEdgeLabel = r2.trim() || 'Option 2';
      const firstEdge = currentSourceEdges[0];
      if (!firstEdge.label || firstEdge.label.trim() === '') {
        const r1 = await modalPrompt('Condition for the FIRST path (e.g. No):', 'No', 'No');
        if (r1 === null) return;
        firstEdgeLabelUpdates[firstEdge.id] = r1.trim() || 'Option 1';
      }
    } else if (currentCount > 1) {
      const rn = await modalPrompt('Condition for the new path:', `Option ${currentCount + 1}`, `Option ${currentCount + 1}`);
      if (rn === null) return;
      newEdgeLabel = rn.trim() || `Option ${currentCount + 1}`;
    }

      const updatedEdgesBase = edges.map((e) =>
        firstEdgeLabelUpdates[e.id] ? { ...e, label: firstEdgeLabelUpdates[e.id] } : e
      );
      const nextEdges = addEdge({ ...params, ...edgeOptions, label: newEdgeLabel }, updatedEdgesBase);
      const nextNodes = currentCount >= 1
        ? nodes.map((n) => n.id === params.source ? { ...n, data: { ...n.data, isDecision: true } } : n)
        : nodes;

      setEdges(nextEdges);
      setNodes(nextNodes);
      saveHistory(nextNodes, nextEdges);
  }, [edges, nodes, setEdges, setNodes, edgeOptions]);

  const onSelectionChange = useCallback(({ nodes: sel }) => {
    const nonLane = sel?.find((n) => n.type !== 'swimlane');
    setSelectedNodeId(nonLane ? nonLane.id : null);
    if (nonLane) setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = (_event, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); };

  const buildSwimLaneLayout = useCallback((inputTaskNodes, currentEdges, customWidth = laneCustomWidth) => {
    // Start/end have no role of their own – they belong to the lane of the first following / last preceding step
    const actorOfStep = (id) => inputTaskNodes.find((n) => n.id === id && !isEventNode(n))?.data?.actor || '';
    const currentTaskNodes = inputTaskNodes.map((n) => {
      if (!isEventNode(n)) return n;
      const neighbours = isStartEventNode(n)
        ? currentEdges.filter((e) => e.source === n.id).map((e) => e.target)
        : currentEdges.filter((e) => e.target === n.id).map((e) => e.source);
      const actor = neighbours.map(actorOfStep).find(Boolean) || '';
      return actor === (n.data.actor || '') ? n : { ...n, data: { ...n.data, actor, label: n.data.baseLabel } };
    });

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });

    const sizeOf = (n) => isEventNode(n)
      ? { width: EVENT_SIZE, height: EVENT_SIZE }
      : { width: NODE_WIDTH, height: n.data?.isDecision === true ? DECISION_HEIGHT : NODE_HEIGHT };
    currentTaskNodes.forEach((n) => g.setNode(n.id, sizeOf(n)));
    currentEdges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);

    const xMap = {};
    currentTaskNodes.forEach((n) => { xMap[n.id] = g.node(n.id).x - sizeOf(n).width / 2; });

    const contentMaxX = currentTaskNodes.length > 0 ? Math.max(...currentTaskNodes.map((n) => xMap[n.id])) + NODE_WIDTH + LANE_PADDING_X : 400;
    const calculatedMinWidth = LANE_HEADER_WIDTH + contentMaxX + (LANE_PADDING_X * 2);
    setLaneMinWidth(calculatedMinWidth);
    const finalLaneWidth = customWidth !== null ? Math.max(customWidth, calculatedMinWidth) : calculatedMinWidth;

    const actorOrder = [];
    const seen = new Set();
    currentTaskNodes.forEach((n) => {
      const actor = n.data?.actor || '';
      if (!seen.has(actor)) { seen.add(actor); actorOrder.push(actor); }
    });

    const laneNodes = [];
    const positionedTaskNodes = [];
    const handleWidthChange = (newWidth) => setLaneCustomWidth(newWidth);
    const handleLaneRename = (laneActor) => renameLaneRef.current?.(laneActor);

    actorOrder.forEach((actor, idx) => {
      const laneY = idx * LANE_HEIGHT;
      const laneId = `__lane__${actor || '__none__'}`;
      laneNodes.push({
        id: laneId, type: 'swimlane',
        data: { label: actor || NO_ROLE, actor, index: idx, isFirst: idx === 0, currentWidth: finalLaneWidth, minWidth: calculatedMinWidth, onWidthChange: handleWidthChange, onRename: handleLaneRename },
        position: { x: 0, y: laneY }, style: { width: finalLaneWidth, height: LANE_HEIGHT }, selectable: false, draggable: false, zIndex: -1,
      });

      currentTaskNodes.filter((n) => (n.data?.actor || '') === actor).forEach((n) => {
        const dagreNode = g.node(n.id);
        const relativeY = Math.max(0, dagreNode.y - sizeOf(n).height / 2);
        positionedTaskNodes.push({
          ...n, parentNode: laneId, extent: 'parent',
          position: { x: LANE_HEADER_WIDTH + LANE_PADDING_X + xMap[n.id], y: relativeY },
          sourcePosition: Position.Right, targetPosition: Position.Left, zIndex: 10,
        });
      });
    });
    return { nodes: [...laneNodes, ...positionedTaskNodes], edges: currentEdges };
  }, [laneCustomWidth]);

  useEffect(() => {
    if (nodes.length > 0 && laneCustomWidth !== null) {
      const currentTasks = nodes.filter((n) => n.type !== 'swimlane');
      const { nodes: laid } = buildSwimLaneLayout(currentTasks, edges, laneCustomWidth);
      setNodes(laid);
    }
  }, [laneCustomWidth]);

  const loadModel = async () => {
    setIsLoading(true); setLaneCustomWidth(null);
    try {
      const sourceDescription = promptText.trim() || 'Generate a simple business process';
      const data = await generateDiagramFromText(sourceDescription, minNodes, maxNodes, includeKpi);
      if (data.nodes.some(n => n.id === "start" && n.label === "AI error")) {
        await modalAlert(data.nodes.find(n => n.id === 'end')?.label || 'AI error', 'AI error');
        setIsLoading(false); return;
      }
      const rawEdges = (data.edges || []).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label || null, ...edgeOptions }));
      const outgoingCounts = {};
      rawEdges.forEach(e => { outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1; });

      const rawNodes = (data.nodes || []).map((node) => ({
        id: node.id, type: 'task',
        data: { 
          label: makeLabel(node.label, node.actor || '', showActors), 
          baseLabel: node.label, 
          actor: node.actor || '', 
          nodeType: node.type || 'task', 
          isDecision: (outgoingCounts[node.id] || 0) > 1,
          durationMinutes: node.duration_minutes ?? null,
          costEuros: node.cost_euros ?? null,
        },
        position: { x: 0, y: 0 },
      }));

      const normalized = withStartEnd(rawNodes, rawEdges, edgeOptions);
      const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(normalized.nodes, normalized.edges);
      setNodes(laid); setEdges(laidEdges);
      histRef.current = []; histIdxRef.current = -1;
      saveHistory(laid, laidEdges);
      setSelectedNodeId(null); setSelectedEdgeId(null); setNextId(1);
      const laidTasks = laid.filter((n) => n.type !== 'swimlane');
      const generatedModel = serializeModel(laidTasks, laidEdges);
      resetDiagramInsights();
      showDiagramReview(generatedModel, sourceDescription);
      runAccuracyCheck(generatedModel, sourceDescription, structureSignatureOf(laidTasks, laidEdges));
    } catch (err) {
      await modalAlert(`Generation failed: ${err.message}`, 'Error');
    } finally { setIsLoading(false); }
  };

  const handleLogout = () => { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_username'); setUsername(null); setView('editor'); };
  const requireAuth = (actionCallback) => { if (localStorage.getItem('auth_token')) { actionCallback(); } else { setPendingAction(() => actionCallback); setShowAuthModal(true); } };
  const onLoginSuccess = (user) => { setUsername(user); setShowAuthModal(false); if (pendingAction) { pendingAction(); setPendingAction(null); } };

  const executeSaveToCatalog = async () => {
  if (taskNodes.length === 0) {
    await modalAlert("There is nothing to save.", "Empty diagram");
    return;
  }

  const hasErrors = taskNodes.some(n => n.data.isInvalid);
  if (hasErrors) {
    const proceed = await modalConfirm(
      "Your diagram contains logic errors (dead ends or missing inputs). Do you want to save it anyway?",
      "Warning – broken connections", "Ignore and continue", "Go back and fix", true
    );
    if (!proceed) return;
  }

  const title = await modalPrompt("Diagram name", "e.g. Invoice approval");
  if (!title || !title.trim()) return;

  // ── Category selection ──
  const categoryIndex = await showModal({
    type: 'select',
    title: 'Diagram category',
    message: 'Choose the category this process belongs to:',
    options: CATEGORIES,
    defaultValue: DEFAULT_CATEGORY,
  });
  const chosenCategory = categoryIndex ?? DEFAULT_CATEGORY;

  const isPublic = await modalConfirm(
    "Do you want to publish the diagram for other users?",
    "Diagram visibility", "Yes, make it public", "No, keep it private"
  );
    const processModel = {
      nodes: taskNodes.map((n) => ({ id: n.id, type: n.data.nodeType || 'task', label: n.data.baseLabel || n.data.label, actor: n.data.actor || null, isDecision: n.data.isDecision || false })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label || null })),
    };
    try {
      const resp = await fetch(`${API}/catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({
          title: title.trim(),
          prompt: promptText,
          min_nodes: Number(minNodes),
          max_nodes: Number(maxNodes),
          final_node_count: taskNodes.length,
          model_json: processModel,
          is_public: isPublic,
          category: chosenCategory,
        }),
      });
      if (resp.status === 401) { handleLogout(); await modalAlert('Your sign-in has expired. Please sign in again.', 'Session expired'); return; }
      if (!resp.ok) throw new Error('Saving failed');
      setIsSavedToCatalog(true);
      await modalAlert(`Diagram "${title.trim()}" was saved successfully.`, 'Saved');
    } catch (err) { await modalAlert('Saving failed. Please try again.', 'Error'); }
  };

  const saveToCatalog = () => requireAuth(executeSaveToCatalog);
  const openCatalog = () => requireAuth(() => setView('catalog'));

  // ─ Export the diagram to BPMN 2.0 XML ─────────────────────────────────
  const handleDownloadBpmn = async () => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    if (taskNodes.length === 0) { modalAlert('The diagram is empty.'); return; }
    const hasErrors = taskNodes.some(n => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
      'The diagram has unfinished steps or missing incoming edges marked in red. Do you want to download the BPMN file anyway?',
      'Download BPMN with errors',
      'Ignore and download BPMN',
      'Cancel download'
    );
    if (!proceed) return;
    }

    // ── Layout constants ─────────────────────────────────────────────────
    const POOL_LABEL_W = 30;
    const LANE_LABEL_W = 30;
    const HEADER_W     = POOL_LABEL_W + LANE_LABEL_W;
    const COL_W        = 200;
    const ROW_H        = 140;
    const NODE_W       = 120;
    const NODE_H       = 60;
    const GW_SIZE      = 50;
    const SE_SIZE      = 36;
    const PAD_X        = 40;
    const POOL_X       = 80;
    const POOL_Y       = 80;

    // ── Unique lanes ─────────────────────────────────────────────────────
    const actorOrder = [];
    const seenActors = new Set();
    taskNodes.forEach(n => {
      const a = n.data.actor || NO_ROLE;
      if (!seenActors.has(a)) { seenActors.add(a); actorOrder.push(a); }
    });
    const laneCount = actorOrder.length;
    const laneIdxOf = {};
    actorOrder.forEach((a, i) => { laneIdxOf[a] = i; });

    // ── Step 1: initial columns (cycles -> robust DFS + Kahn) ────────────
    const outMap = {};
    const inMap = {};
    taskNodes.forEach(n => { outMap[n.id] = []; inMap[n.id] = []; });
    edges.forEach(e => {
      if (outMap[e.source]) outMap[e.source].push(e.target);
      if (inMap[e.target]) inMap[e.target].push(e.source);
    });

    const visited = new Set();
    const visiting = new Set();
    const backEdges = new Set();

    const dfs = (u) => {
      visited.add(u);
      visiting.add(u);
      (outMap[u] || []).forEach(v => {
        if (visiting.has(v)) {
          backEdges.add(u + '->' + v);
        } else if (!visited.has(v)) {
          dfs(v);
        }
      });
      visiting.delete(u);
    };

    const sortedByIn = [...taskNodes].sort((a, b) => inMap[a.id].length - inMap[b.id].length);
    sortedByIn.forEach(n => {
      if (!visited.has(n.id)) dfs(n.id);
    });

    const dagInDeg = {};
    const dagOutMap = {};
    taskNodes.forEach(n => { dagInDeg[n.id] = 0; dagOutMap[n.id] = []; });
    edges.forEach(e => {
      if (!backEdges.has(e.source + '->' + e.target)) {
        if (dagOutMap[e.source]) dagOutMap[e.source].push(e.target);
        if (dagInDeg[e.target] !== undefined) dagInDeg[e.target]++;
      }
    });

    const col = {};
    const bfsQ = taskNodes.filter(n => dagInDeg[n.id] === 0).map(n => n.id);
    bfsQ.forEach(id => { col[id] = 0; });
    const proc = [...bfsQ];
    while (proc.length > 0) {
      const cur = proc.shift();
      (dagOutMap[cur] || []).forEach(nxt => {
        col[nxt] = Math.max(col[nxt] || 0, (col[cur] || 0) + 1);
        dagInDeg[nxt]--;
        if (dagInDeg[nxt] === 0) proc.push(nxt);
      });
    }
    taskNodes.forEach(n => { if (col[n.id] === undefined) col[n.id] = 0; });

    // ── Step 2: iterative stabilisation (max 50 rounds) ──────────────────
    // For a "strict left-to-right" layout resolve collisions GLOBALLY, not only per lane.
    for (let iter = 0; iter < 50; iter++) {
      let changed = false;

      // A) Edge condition: col[target] > col[source]
      edges.forEach(e => {
        const cs = col[e.source];
        const ct = col[e.target];
        const isBackEdge = backEdges.has(e.source + '->' + e.target);

        if (!isBackEdge && cs !== undefined && ct !== undefined && ct <= cs) {
          col[e.target] = cs + 1;
          changed = true;
        }
      });

      // B) Collisions GLOBALLY IN THE WHOLE DIAGRAM
      const colUsed = {};
      taskNodes
        .slice()
        .sort((a, b) => (col[a.id] || 0) - (col[b.id] || 0))
        .forEach(n => {
          let c = col[n.id] || 0;
          const startC = c;
          while (colUsed[c]) c++;
          if (c !== startC) { col[n.id] = c; changed = true; }
          colUsed[c] = true;
        });

      if (!changed) break;
    }


    // ── Final maxCol and diagram size ────────────────────────────────────
    const maxCol   = Math.max(0, ...taskNodes.map(n => col[n.id] || 0));
    const contentW = PAD_X + (maxCol + 1) * COL_W + PAD_X;
    const laneW    = Math.max(LANE_LABEL_W + contentW, 800);
    const totalH   = laneCount * ROW_H;

    // ── Node positions ───────────────────────────────────────────────────
    const isStartNode = n => isStartEventNode(n) || n.id === 'start' || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('začiatok');
    const isEndNode   = n => isEndEventNode(n) || n.id === 'end'   || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('koniec');
    const nodeSize    = n => {
      if (isStartNode(n) || isEndNode(n)) return { w: SE_SIZE, h: SE_SIZE };
      if (n.data.isDecision)               return { w: GW_SIZE, h: GW_SIZE };
      return { w: NODE_W, h: NODE_H };
    };

    const nodePos = {};
    taskNodes.forEach(n => {
      const li       = laneIdxOf[n.data.actor || NO_ROLE] ?? 0;
      const { w, h } = nodeSize(n);
      const cx = POOL_X + HEADER_W + PAD_X + (col[n.id] || 0) * COL_W + NODE_W / 2;
      const cy = POOL_Y + li * ROW_H + ROW_H / 2;
      nodePos[n.id] = {
        x: Math.round(cx - w / 2), y: Math.round(cy - h / 2),
        w, h, cx: Math.round(cx),  cy: Math.round(cy)
      };
    });

    const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const processId     = 'Process_1';
    const collabId      = 'Collaboration_1';
    const participantId = 'Participant_1';

    // ── laneSet ──────────────────────────────────────────────────────────
    let laneSetXml = '\n    <bpmn:laneSet id="LaneSet_1">';
    actorOrder.forEach((actor, idx) => {
      const refs = taskNodes
        .filter(n => (n.data.actor || NO_ROLE) === actor)
        .map(n => '\n        <bpmn:flowNodeRef>' + n.id + '</bpmn:flowNodeRef>')
        .join('');
      laneSetXml += '\n      <bpmn:lane id="Lane_' + idx + '" name="' + esc(actor) + '">' + refs + '\n      </bpmn:lane>';
    });
    laneSetXml += '\n    </bpmn:laneSet>';

    // ── Nodes ────────────────────────────────────────────────────────────
    let bpmnNodes = '';
    taskNodes.forEach(n => {
      const lbl = n.data.baseLabel || n.data.label || '';
      let et = 'bpmn:task';
      if (isStartNode(n))         et = 'bpmn:startEvent';
      else if (isEndNode(n))      et = 'bpmn:endEvent';
      else if (n.data.isDecision) et = 'bpmn:exclusiveGateway';

      bpmnNodes += '\n    <' + et + ' id="' + n.id + '" name="' + esc(lbl) + '">';
      const hasDur  = n.data.durationMinutes != null;
      const hasCost = n.data.costEuros != null;
      if (et === 'bpmn:task' && (hasDur || hasCost)) {
        let doc = '';
        if (hasDur) doc += `Duration: ${formatDuration(n.data.durationMinutes)}`;
        if (hasDur && hasCost) doc += ' | ';
        if (hasCost)           doc += 'Cost: ' + n.data.costEuros + ' EUR';
        bpmnNodes += '\n      <bpmn:documentation>' + doc + '</bpmn:documentation>';
        bpmnNodes += '\n      <bpmn:extensionElements>\n        <camunda:properties>';
        if (hasDur)  bpmnNodes += '\n          <camunda:property name="durationMinutes" value="' + n.data.durationMinutes + '" />';
        if (hasCost) bpmnNodes += '\n          <camunda:property name="costEuros" value="' + n.data.costEuros + '" />';
        bpmnNodes += '\n        </camunda:properties>\n      </bpmn:extensionElements>';
      }
      edges.filter(e => e.target === n.id).forEach(e => { bpmnNodes += '\n      <bpmn:incoming>' + e.id + '</bpmn:incoming>'; });
      edges.filter(e => e.source === n.id).forEach(e => { bpmnNodes += '\n      <bpmn:outgoing>' + e.id + '</bpmn:outgoing>'; });
      bpmnNodes += '\n    </' + et + '>';
    });

    // ── Edges ────────────────────────────────────────────────────────────
    let bpmnEdges = '';
    edges.forEach(e => {
      bpmnEdges += '\n    <bpmn:sequenceFlow id="' + e.id + '" sourceRef="' + e.source + '" targetRef="' + e.target + '" name="' + esc(e.label || '') + '" />';
    });

    // ── DI: Participant + Lanes ──────────────────────────────────────────
    const partTotalW = POOL_LABEL_W + laneW;
    let diShapes = '\n      <bpmndi:BPMNShape id="' + participantId + '_di" bpmnElement="' + participantId + '" isHorizontal="true">'
      + '\n        <dc:Bounds x="' + POOL_X + '" y="' + POOL_Y + '" width="' + partTotalW + '" height="' + totalH + '" />'
      + '\n      </bpmndi:BPMNShape>';
    actorOrder.forEach((_, idx) => {
      diShapes += '\n      <bpmndi:BPMNShape id="Lane_' + idx + '_di" bpmnElement="Lane_' + idx + '" isHorizontal="true">'
        + '\n        <dc:Bounds x="' + (POOL_X + POOL_LABEL_W) + '" y="' + (POOL_Y + idx * ROW_H) + '" width="' + laneW + '" height="' + ROW_H + '" />'
        + '\n      </bpmndi:BPMNShape>';
    });

    // ── DI: Nodes ────────────────────────────────────────────────────────
    taskNodes.forEach(n => {
      const p = nodePos[n.id];
      diShapes += '\n      <bpmndi:BPMNShape id="' + n.id + '_di" bpmnElement="' + n.id + '"'
        + (n.data.isDecision ? ' isMarkerVisible="true"' : '') + '>'
        + '\n        <dc:Bounds x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" />'
        + '\n      </bpmndi:BPMNShape>';
    });

    // ── DI: Edges (based on the Camunda / BPMN.io rules) ─────────────────

    const routeEdge = (sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards) => {
      const midGapSource = POOL_X + HEADER_W + PAD_X + sc * COL_W + NODE_W + (COL_W - NODE_W) / 2;
      const midGapTarget = POOL_X + HEADER_W + PAD_X + (tc - 1) * COL_W + NODE_W + (COL_W - NODE_W) / 2;

      // ── 1. BACKWARDS loop (the arrow goes back) ────────────────────────
      if (isBackwards) {
        const outX = x1 + 15;
        const detourY = Math.round(POOL_Y + scRow * ROW_H + 15);
        const inX = x2 - 15;

        return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
             + '\n        <di:waypoint x="' + outX + '" y="' + y1 + '" />'
             + '\n        <di:waypoint x="' + outX + '" y="' + detourY + '" />'
             + '\n        <di:waypoint x="' + inX + '" y="' + detourY + '" />'
             + '\n        <di:waypoint x="' + inX + '" y="' + y2 + '" />'
             + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
      }

      // ── 2. FORWARDS (different lanes) ──────────────────────────────────
      if (scRow !== tcRow) {
        if (tc === sc + 1) {
          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y2 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        } else {

          const isGoingDown = tcRow > scRow;

          const highwayY = isGoingDown 
            ? Math.round(POOL_Y + (scRow + 1) * ROW_H)
            : Math.round(POOL_Y + scRow * ROW_H);

          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + highwayY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + highwayY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + y2 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        }
      }

      // ── 3. FORWARDS (same lane) ────────────────────────────────────────
      if (scRow === tcRow) {
        if (tc === sc + 1) {
          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        } else {
          const detourY = Math.round(POOL_Y + scRow * ROW_H + ROW_H - 10);

          return '\n        <di:waypoint x="' + x1 + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + y1 + '" />'
               + '\n        <di:waypoint x="' + midGapSource + '" y="' + detourY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + detourY + '" />'
               + '\n        <di:waypoint x="' + midGapTarget + '" y="' + y2 + '" />'
               + '\n        <di:waypoint x="' + x2 + '" y="' + y2 + '" />';
        }
      }
    };

    let diEdges = '';
    edges.forEach(e => {
      const sn = taskNodes.find(n => n.id === e.source);
      const tn = taskNodes.find(n => n.id === e.target);
      if (!sn || !tn) return;

      const sp = nodePos[sn.id];
      const tp = nodePos[tn.id];
      const sc = col[sn.id] || 0;
      const tc = col[tn.id] || 0;
      const scRow = laneIdxOf[sn.data.actor || NO_ROLE] ?? 0;
      const tcRow = laneIdxOf[tn.data.actor || NO_ROLE] ?? 0;

      const x1 = sp.x + sp.w;   const y1 = sp.cy;
      const x2 = tp.x;          const y2 = tp.cy;
      const isBackwards = tc <= sc;

      const wpts = routeEdge(sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards);
      diEdges += '\n      <bpmndi:BPMNEdge id="' + e.id + '_di" bpmnElement="' + e.id + '">' + wpts + '\n      </bpmndi:BPMNEdge>';
    });

    // ── Final XML ────────────────────────────────────────────────────────
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
      + 'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
      + 'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
      + 'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
      + 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" '
      + 'id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">\n'
      + '  <bpmn:collaboration id="' + collabId + '">\n'
      + '    <bpmn:participant id="' + participantId + '" name="Process" processRef="' + processId + '" />\n'
      + '  </bpmn:collaboration>\n'
      + '  <bpmn:process id="' + processId + '" isExecutable="true">'
      + laneSetXml + bpmnNodes + '\n' + bpmnEdges
      + '\n  </bpmn:process>\n'
      + '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n'
      + '    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="' + collabId + '">'
      + diShapes + diEdges
      + '\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>';

    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.bpmn';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 250);
  };

  // ─ Export the diagram to a UML Activity Diagram (XMI 2.1) ──────────
  const handleDownloadUml = async () => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    if (taskNodes.length === 0) { modalAlert('The diagram is empty.'); return; }
    const hasErrors = taskNodes.some(n => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
        'The diagram has unfinished steps or missing incoming edges marked in red. Do you want to download the XMI file anyway?',
        'Download XMI with errors',
        'Ignore and download XMI',
        'Cancel download'
      );
      if (!proceed) return;
    }

    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let nodesXml = '';
    taskNodes.forEach(n => {
      const lbl = esc(n.data.baseLabel || n.data.label || '');
      const isStart = isStartEventNode(n) || n.id === 'start' || lbl.toLowerCase().includes('začiatok');
      const isEnd = isEndEventNode(n) || n.id === 'end' || lbl.toLowerCase().includes('koniec');
      let type = 'uml:OpaqueAction';
      if (isStart) type = 'uml:InitialNode';
      else if (isEnd) type = 'uml:ActivityFinalNode';
      else if (n.data.isDecision) type = 'uml:DecisionNode';

      nodesXml += `\n        <node xmi:type="${type}" xmi:id="${n.id}" name="${lbl}" />`;
    });

    let edgesXml = '';
    edges.forEach(e => {
      const lbl = esc(e.label || '');
      edgesXml += `\n        <edge xmi:type="uml:ControlFlow" xmi:id="${e.id}" source="${e.source}" target="${e.target}" name="${lbl}" />`;
    });

    const actorOrder = [];
    const seenActors = new Set();
    taskNodes.forEach(n => {
      const a = n.data.actor || NO_ROLE;
      if (!seenActors.has(a)) { seenActors.add(a); actorOrder.push(a); }
    });

    let partitionsXml = '';
    actorOrder.forEach((actor, idx) => {
      let refs = '';
      taskNodes.forEach(n => {
        if ((n.data.actor || NO_ROLE) === actor) {
          refs += `\n          <node xmi:idref="${n.id}" />`;
        }
      });
      partitionsXml += `\n        <group xmi:type="uml:ActivityPartition" xmi:id="Partition_${idx}" name="${esc(actor)}">${refs}\n        </group>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://www.eclipse.org/uml2/3.0.0/UML">
  <uml:Model xmi:id="Model_1" name="ProcessModel">
    <packagedElement xmi:type="uml:Activity" xmi:id="Activity_1" name="ProcessActivity">${nodesXml}${edgesXml}${partitionsXml}
    </packagedElement>
  </uml:Model>
</xmi:XMI>`;

    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'diagram.xmi';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 250);
  };

  // ─ Export the diagram to UXF (UMLet) ────────────────────────────────────
  const handleDownloadUxf = async () => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    if (taskNodes.length === 0) { modalAlert('The diagram is empty.'); return; }
    const hasErrors = taskNodes.some(n => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
        'The diagram has unfinished steps or missing incoming edges marked in red. Do you want to download the UXF file anyway?',
        'Download UXF with errors',
        'Ignore and download UXF',
        'Cancel download'
      );
      if (!proceed) return;
    }

    // ── Layout constants and Kahn BFS (same logic as BPMN) ───────────────
    const POOL_LABEL_W = 30;
    const LANE_LABEL_W = 30;
    const HEADER_W     = POOL_LABEL_W + LANE_LABEL_W;
    const COL_W        = 200;
    const ROW_H        = 140;
    const NODE_W       = 120;
    const NODE_H       = 60;
    const GW_SIZE      = 50;
    const SE_SIZE      = 36;
    const PAD_X        = 40;
    const POOL_X       = 80;
    const POOL_Y       = 80;

    const actorOrder = [];
    const seenActors = new Set();
    taskNodes.forEach(n => {
      const a = n.data.actor || NO_ROLE;
      if (!seenActors.has(a)) { seenActors.add(a); actorOrder.push(a); }
    });
    const laneCount = actorOrder.length;
    const laneIdxOf = {};
    actorOrder.forEach((a, i) => { laneIdxOf[a] = i; });

    const outMap = {};
    const inMap = {};
    taskNodes.forEach(n => { outMap[n.id] = []; inMap[n.id] = []; });
    edges.forEach(e => {
      if (outMap[e.source]) outMap[e.source].push(e.target);
      if (inMap[e.target]) inMap[e.target].push(e.source);
    });

    const visited = new Set();
    const visiting = new Set();
    const backEdges = new Set();
    const dfs = (u) => {
      visited.add(u);
      visiting.add(u);
      (outMap[u] || []).forEach(v => {
        if (visiting.has(v)) backEdges.add(u + '->' + v);
        else if (!visited.has(v)) dfs(v);
      });
      visiting.delete(u);
    };
    const sortedByIn = [...taskNodes].sort((a, b) => inMap[a.id].length - inMap[b.id].length);
    sortedByIn.forEach(n => { if (!visited.has(n.id)) dfs(n.id); });

    const dagInDeg = {};
    const dagOutMap = {};
    taskNodes.forEach(n => { dagInDeg[n.id] = 0; dagOutMap[n.id] = []; });
    edges.forEach(e => {
      if (!backEdges.has(e.source + '->' + e.target)) {
        if (dagOutMap[e.source]) dagOutMap[e.source].push(e.target);
        if (dagInDeg[e.target] !== undefined) dagInDeg[e.target]++;
      }
    });

    const col = {};
    const bfsQ = taskNodes.filter(n => dagInDeg[n.id] === 0).map(n => n.id);
    bfsQ.forEach(id => { col[id] = 0; });
    const proc = [...bfsQ];
    while (proc.length > 0) {
      const cur = proc.shift();
      (dagOutMap[cur] || []).forEach(nxt => {
        col[nxt] = Math.max(col[nxt] || 0, (col[cur] || 0) + 1);
        dagInDeg[nxt]--;
        if (dagInDeg[nxt] === 0) proc.push(nxt);
      });
    }
    taskNodes.forEach(n => { if (col[n.id] === undefined) col[n.id] = 0; });

    for (let iter = 0; iter < 50; iter++) {
      let changed = false;
      edges.forEach(e => {
        const cs = col[e.source];
        const ct = col[e.target];
        const isBackEdge = backEdges.has(e.source + '->' + e.target);
        if (!isBackEdge && cs !== undefined && ct !== undefined && ct <= cs) {
          col[e.target] = cs + 1;
          changed = true;
        }
      });
      const colUsed = {};
      taskNodes.slice().sort((a, b) => (col[a.id] || 0) - (col[b.id] || 0)).forEach(n => {
        let c = col[n.id] || 0;
        const startC = c;
        while (colUsed[c]) c++;
        if (c !== startC) { col[n.id] = c; changed = true; }
        colUsed[c] = true;
      });
      if (!changed) break;
    }

    const maxCol = Math.max(0, ...taskNodes.map(n => col[n.id] || 0));
    const contentW = PAD_X + (maxCol + 1) * COL_W + PAD_X;
    const laneW = Math.max(LANE_LABEL_W + contentW, 800);

    const isStartNode = n => isStartEventNode(n) || n.id === 'start' || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('začiatok');
    const isEndNode   = n => isEndEventNode(n) || n.id === 'end'   || (n.data.baseLabel || n.data.label || '').toLowerCase().includes('koniec');
    const nodeSize    = n => {
      if (isStartNode(n) || isEndNode(n)) return { w: SE_SIZE, h: SE_SIZE };
      if (n.data.isDecision)               return { w: GW_SIZE, h: GW_SIZE };
      return { w: NODE_W, h: NODE_H };
    };

    const nodePos = {};
    taskNodes.forEach(n => {
      const li = laneIdxOf[n.data.actor || NO_ROLE] ?? 0;
      const { w, h } = nodeSize(n);
      const cx = POOL_X + HEADER_W + PAD_X + (col[n.id] || 0) * COL_W + NODE_W / 2;
      const cy = POOL_Y + li * ROW_H + ROW_H / 2;
      nodePos[n.id] = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, cx: Math.round(cx), cy: Math.round(cy) };
    });

    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ── UXF XML generation ──────────────────────────────────────────────
    let elementsXml = '';

    // Swimlanes
    actorOrder.forEach((actor, idx) => {
      elementsXml += `\n  <element>
    <id>UMLGeneric</id>
    <coordinates><x>${POOL_X}</x><y>${POOL_Y + idx * ROW_H}</y><w>${laneW}</w><h>${ROW_H}</h></coordinates>
    <panel_attributes>halign=left\nvalign=center\n${esc(actor)}</panel_attributes>
    <additional_attributes/>
  </element>`;
    });

    // Nodes
    taskNodes.forEach(n => {
      const { x, y, w, h } = nodePos[n.id];
      const lbl = esc(n.data.baseLabel || n.data.label || '');
      let idType = 'UMLState';
      let panelAttrs = lbl;

      let textElement = '';
      if (isStartNode(n)) {
        idType = 'UMLSpecialState';
        panelAttrs = 'type=initial';
      } else if (isEndNode(n)) {
        idType = 'UMLSpecialState';
        panelAttrs = 'type=final';
      } else if (n.data.isDecision) {
        idType = 'UMLSpecialState';
        panelAttrs = 'type=decision';
      }

      if (idType === 'UMLSpecialState' && lbl) {
        textElement = `\n  <element>
    <id>Text</id>
    <coordinates><x>${x + w/2 - 70}</x><y>${y + h + 5}</y><w>140</w><h>60</h></coordinates>
    <panel_attributes>halign=center\n${lbl}</panel_attributes>
    <additional_attributes/>
  </element>`;
      }

      elementsXml += `\n  <element>
    <id>${idType}</id>
    <coordinates><x>${x}</x><y>${y}</y><w>${w}</w><h>${h}</h></coordinates>
    <panel_attributes>${panelAttrs}</panel_attributes>
    <additional_attributes/>
  </element>${textElement}`;
    });

    // Edges
    const routeEdgePts = (sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards) => {
      const midGapSource = POOL_X + HEADER_W + PAD_X + sc * COL_W + NODE_W + (COL_W - NODE_W) / 2;
      const midGapTarget = POOL_X + HEADER_W + PAD_X + (tc - 1) * COL_W + NODE_W + (COL_W - NODE_W) / 2;
      if (isBackwards) {
        const outX = x1 + 15;
        const detourY = Math.round(POOL_Y + scRow * ROW_H + 15);
        const inX = x2 - 15;
        return [{x: x1, y: y1}, {x: outX, y: y1}, {x: outX, y: detourY}, {x: inX, y: detourY}, {x: inX, y: y2}, {x: x2, y: y2}];
      }
      if (scRow !== tcRow) {
        if (tc === sc + 1) return [{x: x1, y: y1}, {x: midGapSource, y: y1}, {x: midGapSource, y: y2}, {x: x2, y: y2}];
        const isGoingDown = tcRow > scRow;
        const highwayY = isGoingDown ? Math.round(POOL_Y + (scRow + 1) * ROW_H) : Math.round(POOL_Y + scRow * ROW_H);
        return [{x: x1, y: y1}, {x: midGapSource, y: y1}, {x: midGapSource, y: highwayY}, {x: midGapTarget, y: highwayY}, {x: midGapTarget, y: y2}, {x: x2, y: y2}];
      }
      if (scRow === tcRow) {
        if (tc === sc + 1) return [{x: x1, y: y1}, {x: x2, y: y2}];
        const detourY = Math.round(POOL_Y + scRow * ROW_H + ROW_H - 10);
        return [{x: x1, y: y1}, {x: midGapSource, y: y1}, {x: midGapSource, y: detourY}, {x: midGapTarget, y: detourY}, {x: midGapTarget, y: y2}, {x: x2, y: y2}];
      }
      return [];
    };

    edges.forEach(e => {
      const sn = taskNodes.find(n => n.id === e.source);
      const tn = taskNodes.find(n => n.id === e.target);
      if (!sn || !tn) return;

      const sp = nodePos[sn.id];
      const tp = nodePos[tn.id];
      const sc = col[sn.id] || 0;
      const tc = col[tn.id] || 0;
      const scRow = laneIdxOf[sn.data.actor || NO_ROLE] ?? 0;
      const tcRow = laneIdxOf[tn.data.actor || NO_ROLE] ?? 0;
      const isBackwards = tc <= sc;

      const x1 = sp.x + sp.w;   const y1 = sp.cy;
      const x2 = tp.x;          const y2 = tp.cy;

      const pts = routeEdgePts(sc, tc, x1, y1, x2, y2, scRow, tcRow, isBackwards);
      if (pts.length === 0) return;

      const minX = Math.min(...pts.map(p => p.x));
      const minY = Math.min(...pts.map(p => p.y));
      const maxX = Math.max(...pts.map(p => p.x));
      const maxY = Math.max(...pts.map(p => p.y));


      const PAD = 20;
      const boxX = minX - PAD;
      const boxY = minY - PAD;
      const boxW = (maxX - minX) + PAD * 2;
      const boxH = (maxY - minY) + PAD * 2;

      const addAttrs = pts.map(p => Math.round(p.x - boxX) + '.0;' + Math.round(p.y - boxY) + '.0').join(';');
      const panelAttr = 'lt=-&gt;' + (e.label ? '\nm1=' + esc(e.label) : '');

      elementsXml += `\n  <element>
    <id>Relation</id>
    <coordinates><x>${boxX}</x><y>${boxY}</y><w>${boxW}</w><h>${boxH}</h></coordinates>
    <panel_attributes>${panelAttr}</panel_attributes>
    <additional_attributes>${addAttrs}</additional_attributes>
  </element>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<diagram program="umlet" version="15.0.0">\n  <zoom_level>10</zoom_level>${elementsXml}\n</diagram>`;

    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'diagram.uxf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 250);
  };

  // ─ Export the diagram as an image ─────────────────────────────────
  const handleDownload = async (format = 'png') => {
    const canDownload = await ensureSavedBeforeDownload();
    if (!canDownload) return;

    const viewport = document.querySelector('.react-flow__viewport');
    if (!viewport) { modalAlert('The diagram is not available.'); return; }

    const allNodes = nodes.filter(n => n.type !== 'swimlane');
    if (allNodes.length === 0) { modalAlert('The diagram is empty.'); return; }

    // LINTER CHECK before downloading the image
    const hasErrors = allNodes.some((n) => n.data.isInvalid);
    if (hasErrors) {
      const proceed = await modalConfirm(
        'The diagram has unfinished steps marked in red. Do you want to download the image with these errors?',
        'Download with errors',
        'Ignore and download',
        'Cancel download'
      );
      if (!proceed) return;
    }

    const PADDING = 60;
    const bounds = getRectOfNodes(nodes);
    const imgW = Math.round(bounds.width  + PADDING * 2);
    const imgH = Math.round(bounds.height + PADDING * 2);
    const [tx, ty, sc] = getTransformForBounds(bounds, imgW, imgH, 0.1, 2, 0.05);
    const fn = format === 'jpg' ? toJpeg : toPng;
    fn(viewport, {
      backgroundColor: COLORS.canvasBg, width: imgW, height: imgH, pixelRatio: 2,
      style: { width: imgW, height: imgH, transform: `translate(${tx}px, ${ty}px) scale(${sc})`, transformOrigin: 'top left' },
    }).then(url => { const a = document.createElement('a'); a.href = url; a.download = `diagram.${format}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 250); })
      .catch(() => modalAlert('Export failed. Check the console.', 'Error'));
  };

  const addNode = () => {
    const id = `new-${nextId}`; setNextId((n) => n + 1);
    const newNode = { id, type: 'task', data: { label: makeLabel(`Step ${nextId}`, '', showActors), baseLabel: `Step ${nextId}`, actor: '', nodeType: 'task', isDecision: false }, position: { x: 0, y: 0 } };
    // The first step in an empty diagram automatically gets a process start and end
    const base = taskNodes.length
      ? { nodes: [...stripLaneProps(nodes), newNode], edges }
      : withStartEnd([newNode], [], edgeOptions);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(base.nodes, base.edges);
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  };


  const editDiagramWithAI = async () => {
    if (!copilotPrompt.trim() || nodes.filter(n => n.type !== 'swimlane').length === 0) return;
    setIsCopilotLoading(true);
    try {
      const currentTasks = nodes.filter((n) => n.type !== 'swimlane');
      const currentModel = {
        nodes: currentTasks.map(n => ({
          id: n.id,
          type: n.data.nodeType || 'task',
          label: n.data.baseLabel || n.data.label,
          actor: n.data.actor || null,
          duration_minutes: n.data.durationMinutes ?? null,
          cost_euros: n.data.costEuros ?? null,
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label || null,
        })),
      };

      const data = await editDiagramFromText(copilotPrompt, currentModel);
      if (!data.nodes?.length) throw new Error('The AI returned no nodes');

      const outgoingCounts = {};
      data.edges.forEach(e => { outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1; });

      const rawNodes = data.nodes.map(node => ({
        id: node.id,
        type: 'task',
        data: {
          label: makeLabel(node.label, node.actor || '', showActors),
          baseLabel: node.label,
          actor: node.actor || '',
          nodeType: node.type || 'task',
          isDecision: (outgoingCounts[node.id] || 0) > 1,
          durationMinutes: node.duration_minutes ?? null,
          costEuros: node.cost_euros ?? null,
        },
        position: { x: 0, y: 0 },
      }));

      const rawEdges = data.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || null,
        ...edgeOptions,
      }));

      setLaneCustomWidth(null);
      const normalized = withStartEnd(rawNodes, rawEdges, edgeOptions);
      const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(normalized.nodes, normalized.edges);
      setNodes(laid);
      setEdges(laidEdges);
      saveHistory(laid, laidEdges);
      setSelectedNodeId(null); setSelectedEdgeId(null);
      showDiagramReview(serializeModel(laid.filter((n) => n.type !== 'swimlane'), laidEdges), promptText);
      setCopilotPrompt('');
    } catch (err) {
      await modalAlert(`Editing failed: ${err.message}`, 'Error');
    } finally {
      setIsCopilotLoading(false);
    }
  };

  const renameSelectedNode = async () => {
    if (!selectedNodeId) return;
    const cur = taskNodes.find(n => n.id === selectedNodeId);
    const newLabel = await modalPrompt('New step name:', '', cur?.data?.baseLabel || '');
    if (!newLabel || !newLabel.trim()) return;
    const updatedTasks = taskNodes.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, baseLabel: newLabel, label: makeLabel(newLabel, n.data.actor || '', showActors) } } : n);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  };

  const renameSelectedEdge = async () => {
    if (!selectedEdgeId) return;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    const newLabel = await modalPrompt('Edge condition:', '', edge?.label || '');
    if (newLabel !== null) {
      setEdges((eds) => eds.map((e) => e.id === selectedEdgeId ? { ...e, label: newLabel || undefined } : e));
    }
  };

  const editNodeKpi = async () => {
    if (!selectedNodeId) return;
    const cur = taskNodes.find(n => n.id === selectedNodeId);
    if (!cur) return;
    const durStr = await showModal({
      type: 'duration',
      title: 'Node duration',
      message: 'Enter a value and choose a unit:',
      defaultValue: '',
    });
    if (durStr === null) return;
    const costStr = await modalPrompt('Node cost (EUR)', 'e.g. 50', cur?.data?.costEuros?.toString() || '');
    if (costStr === null) return;
    const durationMinutes = durStr ? parseInt(durStr, 10) : null;
    const costEuros = costStr.trim() ? parseFloat(costStr.trim()) || null : null;
    const updatedTasks = taskNodes.map(n =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, durationMinutes, costEuros } } : n
    );
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid);
    setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  };

  const changeActorSelected = async () => {
    if (!selectedNodeId) return;
    const cur2 = taskNodes.find(n => n.id === selectedNodeId);
    const newActor = await modalPrompt('New role for the node:', '', cur2?.data?.actor || '');
    const updatedTasks = taskNodes.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, actor: newActor, label: makeLabel(n.data.baseLabel || n.data.label, newActor, showActors) } } : n);
    setLaneCustomWidth(null);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid); setEdges(laidEdges); setSelectedNodeId(null);
  };

  // Renaming a lane = changing the role of all its steps (click on the lane header)
  const renameLane = async (actor) => {
    const laneActor = actor || '';
    const newName = await modalPrompt('New lane (role) name:', 'e.g. Accountant', laneActor);
    if (newName === null) return;
    const nextActor = newName.trim();
    if (nextActor === laneActor) return;
    const updatedTasks = taskNodes.map((n) => !isEventNode(n) && (n.data.actor || '') === laneActor
      ? { ...n, data: { ...n.data, actor: nextActor, label: makeLabel(n.data.baseLabel || n.data.label, nextActor, showActors) } }
      : n);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedTasks, edges);
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  };
  useEffect(() => { renameLaneRef.current = renameLane; });

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    const edgesToDelete = edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
    const remainingEdges = edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId);

    let updatedNodes = stripLaneProps(nodes).filter((n) => n.id !== selectedNodeId);
    edgesToDelete.forEach(deletedEdge => {
      const srcId = deletedEdge.source;
      if (srcId !== selectedNodeId) {
        const remainingOut = remainingEdges.filter(e => e.source === srcId).length;
        if (remainingOut <= 1) {
          updatedNodes = updatedNodes.map(n => n.id === srcId ? { ...n, data: { ...n.data, isDecision: false } } : n);
        }
      }
    });

    setLaneCustomWidth(null);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(updatedNodes, remainingEdges);
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
    setSelectedNodeId(null);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    const edgeToDelete = edges.find((e) => e.id === selectedEdgeId);
    const sourceNodeId = edgeToDelete?.source;
    const remainingEdges = edges.filter((e) => e.id !== selectedEdgeId);

    let updatedNodes = nodes;
    if (sourceNodeId) {
      const remainingOut = remainingEdges.filter((e) => e.source === sourceNodeId).length;
      if (remainingOut <= 1) {
        updatedNodes = nodes.map((n) =>
          n.id === sourceNodeId ? { ...n, data: { ...n.data, isDecision: false } } : n
        );
      }
    }

    setNodes(updatedNodes);
    setEdges(remainingEdges);
    saveHistory(updatedNodes, remainingEdges);
    setSelectedEdgeId(null);
  };

  const toggleActors = () => {
    setShowActors((prev) => {
      const next = !prev;
      setNodes((nds) => nds.map((n) => n.type === 'swimlane' ? n : { ...n, data: { ...n.data, label: makeLabel(n.data.baseLabel || n.data.label, n.data.actor || '', next) } }));
      return next;
    });
  };

  const onLayout = useCallback(() => {
    setLaneCustomWidth(null);
    const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(stripLaneProps(nodes), edges);
    setNodes(laid); setEdges(laidEdges);
    saveHistory(laid, laidEdges);
  }, [nodes, edges, buildSwimLaneLayout]);

  if (view === 'catalog') {
    return (
      <div className="p2f-app">
        <header className="p2f-header">
          <button type="button" className="p2f-btn p2f-btn--ghost p2f-btn--sm" onClick={() => setView('editor')}><Icons.ArrowLeft /> Editor</button>
          <span className="p2f-header__divider" aria-hidden="true" />
          <div className="p2f-brand">
            <span className="p2f-brand__mark"><LogoMark /></span>
            <span className="p2f-brand__name">Prompt2Flow</span>
            <span className="p2f-brand__tag p2f-brand-subtitle">Catalog</span>
          </div>
          <span className="p2f-spacer" />
          <div className="p2f-user">
            <span className="p2f-user__avatar" aria-hidden="true">{(username || '?').charAt(0).toUpperCase()}</span>
            <span className="p2f-user__name">{username}</span>
            <button type="button" className="p2f-btn p2f-btn--sm" onClick={handleLogout}>Sign out</button>
          </div>
        </header>
        <div className="p2f-catalog-scroll">
          <CatalogPage username={username} onLogout={handleLogout}
            onLoadModel={(loadedNodes, loadedEdges, newPrompt) => {
              const fixedNodes = loadedNodes.map(n => ({ ...n, type: 'task' }));
              const outgoingCounts = {};
              loadedEdges.forEach(e => { outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1; });
              const nodesWithDecision = fixedNodes.map(n => ({
                ...n,
                data: { ...n.data, isDecision: n.data.isDecision || (outgoingCounts[n.id] || 0) > 1 }
              }));
              setLaneCustomWidth(null);
              const normalized = withStartEnd(nodesWithDecision, loadedEdges, edgeOptions);
              const { nodes: laid, edges: laidEdges } = buildSwimLaneLayout(normalized.nodes, normalized.edges);
              setNodes(laid); setEdges(laidEdges); setPromptText(newPrompt); setView('editor');
              resetDiagramInsights();
              setIsSavedToCatalog(true);
            }}
            onClose={() => setView('editor')} />
        </div>
      </div>
    );
  }
  // Start and end are added automatically: they inherit the role of the neighbouring step, have no KPIs and cannot be deleted
  const isEventSelected = isEventNode(taskNodes.find((n) => n.id === selectedNodeId));
  const managementActions = [
    { label: 'Add node', short: 'Add', icon: Icons.Add, onClick: addNode, group: 'diagram' },
    { label: 'Align', short: 'Align', icon: Icons.Align, onClick: onLayout, group: 'diagram' },
    { label: 'Rename node', short: 'Rename', icon: Icons.Edit, onClick: renameSelectedNode, disabled: !selectedNodeId, group: 'node' },
    { label: 'Change role', short: 'Role', icon: Icons.User, onClick: changeActorSelected, disabled: !selectedNodeId || isEventSelected, group: 'node' },
    { label: 'Node KPIs', short: 'KPI', icon: Icons.KPI, onClick: editNodeKpi, disabled: !selectedNodeId || isEventSelected, group: 'node' },
    { label: isEventSelected ? 'The process start and end cannot be deleted' : 'Delete node', short: 'Delete', icon: Icons.Trash, onClick: deleteSelectedNode, disabled: !selectedNodeId || isEventSelected, danger: true, group: 'node' },
    { label: 'Edge text', short: 'Text', icon: Icons.Text, onClick: renameSelectedEdge, disabled: !selectedEdgeId, group: 'edge' },
    { label: 'Delete edge', short: 'Delete', icon: Icons.Trash, onClick: deleteSelectedEdge, disabled: !selectedEdgeId, danger: true, group: 'edge' },
  ];
  const toolGroups = [
    { key: 'diagram', caption: null },
    { key: 'node', caption: 'Node' },
    { key: 'edge', caption: 'Edge' },
  ];
  const isAdviceBusy = adviceMode === 'diagram' ? isDiagramReviewLoading : composerMode === 'create' && promptReviewStatus === 'loading';

  // ── AI questions about the description: the answer is appended as "Clarification: …" (the step range changes directly) ──
  const rangeQuestion = (() => {
    const count = promptReview?.activity_count || 0;
    const min = parseInt(minNodes, 10);
    const max = parseInt(maxNodes, 10);
    if (!count || Number.isNaN(min) || Number.isNaN(max)) return null;
    if (count > max) return { key: 'range', isRange: true, question: `The description contains about ${count} activities, but the step range is ${min}–${max}. How should we proceed?`, options: [
      { label: `Raise the maximum to ${count}`, apply: () => setMaxNodes(String(count)) },
      { label: 'Merge related steps', apply: () => {} },
    ] };
    if (count < min) return { key: 'range', isRange: true, question: `The description contains only ${count} activities, but the minimum is ${min} steps. How should we proceed?`, options: [
      { label: `Lower the minimum to ${count}`, apply: () => setMinNodes(String(Math.max(1, count))) },
      { label: 'Split activities into sub-steps', apply: () => {} },
    ] };
    return null;
  })();
  const aiQuestions = composerMode === 'create' && promptReview && promptText.trim().length >= 30
    ? [rangeQuestion, ...(promptReview.questions || []).map((q) => ({ ...q, key: q.question }))]
      .filter((q) => q && q.options?.length && !answeredQuestions.includes(q.key))
    : [];
  const dismissAiQuestion = (key) => setAnsweredQuestions((prev) => [...prev, key]);
  const answerAiQuestion = (question, option) => {
    if (option.apply) option.apply();
    else {
      setAdviceMode('prompt');
      setDiagramReview('');
      setPromptText((prev) => `${prev.trimEnd()}\nClarification: ${option.clarification}`);
    }
    dismissAiQuestion(question.key);
  };
  const createDisabled = isLoading || !promptText.trim() || !minNodes || !maxNodes;
  const copilotDisabled = isCopilotLoading || !copilotPrompt.trim() || taskNodes.length === 0;

  return (
    <div className="p2f-app">
      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); setPendingAction(null); }} onLoginSuccess={onLoginSuccess} />}
      {showInfoModal && <InfoModal onClose={() => setShowInfoModal(false)} />}

      <header className="p2f-header">
        <button type="button" className="p2f-icon-btn" onClick={() => setShowToolsPanel((open) => !open)} aria-label="More tools" aria-expanded={showToolsPanel} title="More tools"><Icons.Menu /></button>
        <div className="p2f-brand">
          <span className="p2f-brand__mark"><LogoMark /></span>
          <span className="p2f-brand__name">Prompt2Flow</span>
          <span className="p2f-brand__tag p2f-brand-subtitle">AI · Groq</span>
        </div>
        <span className="p2f-spacer" />
        {username ? <div className="p2f-user">
          <span className="p2f-user__avatar" aria-hidden="true">{username.charAt(0).toUpperCase()}</span>
          <span className="p2f-user__name">{username}</span>
          <button type="button" className="p2f-btn p2f-btn--sm" onClick={handleLogout}>Sign out</button>
        </div> : <button type="button" className="p2f-btn p2f-btn--primary p2f-btn--sm" onClick={() => setShowAuthModal(true)}>Sign in</button>}
      </header>

      <main className="p2f-main">
        <div className="p2f-canvas">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStop={() => saveHistory(nodes, edges)} onConnect={onConnect} onSelectionChange={onSelectionChange} onEdgeClick={onEdgeClick} connectionLineType={ConnectionLineType.SmoothStep} fitView defaultEdgeOptions={edgeOptions}>
            <Background color="#cfcbc1" variant="dots" gap={22} size={1.6} />
          </ReactFlow>
        </div>
        <div className="p2f-dock" aria-hidden="true" />

        <div className="p2f-canvas-top">
          <div className="p2f-toolstrip" role="toolbar" aria-label="Diagram actions">
            {toolGroups.map((group, groupIndex) => <Fragment key={group.key}>
              {groupIndex > 0 && <span className="p2f-toolstrip__sep" aria-hidden="true" />}
              {group.caption && <span className="p2f-toolstrip__caption">{group.caption}</span>}
              {managementActions.filter((action) => action.group === group.key).map((action) => <button type="button" key={action.label} className={`p2f-tool${action.danger ? ' p2f-tool--danger' : ''}`} onClick={action.onClick} disabled={action.disabled} title={action.label} aria-label={action.label}><action.icon /><span className="p2f-tool__label">{action.short}</span></button>)}
            </Fragment>)}
          </div>
          {taskNodes.length > 0 && <div className="p2f-top-actions">
            {laneControls && <div className="p2f-seg" role="group" aria-label="Lane width">
              <button type="button" className="p2f-seg__btn" onClick={() => laneControls.onWidthChange(Math.max(laneControls.minWidth, laneControls.currentWidth - 150))} disabled={laneControls.currentWidth <= laneControls.minWidth} title="Narrow lanes" aria-label="Width -"><Icons.Minus /></button>
              <span className="p2f-seg__label">Width</span>
              <button type="button" className="p2f-seg__btn" onClick={() => laneControls.onWidthChange(laneControls.currentWidth + 150)} title="Widen lanes" aria-label="Width +"><Icons.Plus /></button>
            </div>}
            <button type="button" className="p2f-float-btn" onClick={() => openStats('finance')} title="Process statistics"><Icons.Chart /><span>Statistics</span></button>
            {(isDiagramAccuracyLoading || diagramAccuracy || diagramAccuracyError) && <button type="button" className={`p2f-match${isAccuracyStale ? ' is-stale' : ''}`} onClick={() => openStats('match')} title={isAccuracyStale ? 'The diagram changed since the comparison – open it and recalculate' : diagramAccuracyError || diagramAccuracy?.summary || 'Match between the diagram and the original description'}>
              <span>Match</span>
              {isDiagramAccuracyLoading ? <span className="p2f-match__value is-busy">…</span> : diagramAccuracy ? <>
                <span className="p2f-match__bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, Number(diagramAccuracy.accuracy_percent) || 0))}%` }} /></span>
                <span className="p2f-match__value">{diagramAccuracy.accuracy_percent}%</span>
              </> : <span className="p2f-match__value">—</span>}
            </button>}
          </div>}
        </div>

        {!taskNodes.length && <div className="p2f-empty">
          <EmptyIllustration />
          <div className="p2f-empty__title">Describe a process and the AI will create a diagram</div>
          <div className="p2f-empty__text">Type the process into the field below to get started.</div>
        </div>}

        <section ref={composerRef} className={`p2f-composer ${isComposerCollapsed ? 'is-collapsed' : 'is-expanded'}`} aria-label="AI assistant" onFocus={handleComposerFocus} onBlur={handleComposerBlur} onPointerDown={handleComposerPointerDown} onClick={handleComposerClick} onKeyDown={handleComposerKeyDown}>
          <div className="p2f-composer__drawer" inert={isComposerCollapsed}>
            <div className="p2f-composer__drawer-clip">
              <div className="p2f-composer__drawer-body">
                <div className="p2f-composer__head">
                  <div className="p2f-tabs" role="tablist" aria-label="Assistant mode">
                    <button type="button" role="tab" aria-selected={composerMode === 'create'} className="p2f-tab" onClick={() => { setComposerMode('create'); setAdviceMode('prompt'); setDiagramReview(''); }}>Create process</button>
                    <button type="button" role="tab" aria-selected={composerMode === 'manage'} className="p2f-tab" onClick={() => { setComposerMode('manage'); if (taskNodes.length) showDiagramReview(currentModel, promptText); else { setAdviceMode('prompt'); setDiagramReview(''); } }}>Manage diagram</button>
                  </div>
                  <span className="p2f-spacer" />
                  <span className="p2f-kbd-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> send · <kbd>Esc</kbd> collapse</span>
                </div>

                {aiQuestions.length > 0 && <div className="p2f-questions">
                  <div className="p2f-questions__title">AI questions<span>optional · the answer is added to the description</span></div>
                  {aiQuestions.map((q) => <div key={q.key} className="p2f-question">
                    <div className="p2f-question__head">
                      <div className="p2f-question__text">{q.question}</div>
                      <button type="button" className="p2f-question__skip" onClick={() => dismissAiQuestion(q.key)}>Skip</button>
                    </div>
                    <div className="p2f-question__options">
                      {q.options.map((option) => <button type="button" key={option.label} className="p2f-question__option" title={option.clarification} onClick={() => answerAiQuestion(q, option)}>{option.label}</button>)}
                      {!q.isRange && <form className="p2f-question__free" onSubmit={(event) => { event.preventDefault(); const value = event.currentTarget.elements.answer.value.trim(); if (value) answerAiQuestion(q, { clarification: `${q.question} ${value}` }); }}>
                        <input name="answer" className="p2f-question__input" placeholder="Other answer…" aria-label={`Your own answer: ${q.question}`} />
                        <button type="submit" className="p2f-question__send" aria-label="Add the answer to the description"><Icons.Check /></button>
                      </form>}
                    </div>
                  </div>)}
                </div>}

                <div className="p2f-advice" data-tone={adviceMode === 'diagram' ? 'diagram' : 'prompt'} aria-live="polite">
                  <div className="p2f-advice__title"><span className={`p2f-advice__dot${isAdviceBusy ? ' is-busy' : ''}`} />{adviceMode === 'diagram' ? (composerMode === 'manage' ? 'AI suggestions for changing the diagram' : 'AI diagram review') : composerMode === 'manage' ? 'Diagram editing suggestions' : 'Tips for the process description'}{adviceMode === 'diagram' && isDiagramReviewLoading && <span className="p2f-advice__status">· analysing</span>}</div>
                  {adviceMode === 'diagram' ? <div className="p2f-advice__body">{isDiagramReviewLoading ? (composerMode === 'manage' ? 'The AI is looking for concrete ways to improve the diagram…' : 'Checking steps, decisions and ways to simplify the process…') : diagramReview || 'The diagram review is not available yet.'}</div> : composerMode === 'manage' ? <div className="p2f-advice__muted">Describe a concrete change to the existing diagram. The AI changes only the requested steps and keeps the rest of the process.</div> : <div className="p2f-advice__muted">
                    {promptReviewStatus === 'idle' && 'Describe the process. Recommendations appear here; after generation the AI reviews the diagram.'}
                    {promptReviewStatus === 'waiting' && 'Add who performs each step and where decisions are made.'}
                    {promptReviewStatus === 'loading' && 'Groq is reviewing the description…'}
                    {promptReviewStatus === 'error' && promptReviewError}
                    {promptReviewStatus === 'ready' && promptReview && <div className="p2f-review">
                      <div className="p2f-review__summary">{promptReview.overall_review}</div>
                      <ul className="p2f-checklist">
                        {[
                          ['overview_present', 'The process overview is clear'],
                          ['steps_ordered', 'The order of steps is clear'],
                          ['actors_listed', 'The actors are listed'],
                          ['actor_assignments_clear', 'It is clear who performs each task'],
                        ].map(([key, label]) => {
                          const ok = Boolean(promptReview[key]);
                          return <li key={key} className={ok ? 'is-ok' : 'is-missing'}>
                            {ok ? <Icons.Check /> : <Icons.Dash />}<span>{label}{ok ? '' : ' — needs to be added'}</span>
                          </li>;
                        })}
                      </ul>
                      {promptReview.unclear_tasks?.length > 0 && <div className="p2f-review__note is-warn"><strong>Unclear tasks:</strong> {promptReview.unclear_tasks.join(' · ')}</div>}
                      {promptReview.suggestions?.length > 0 && <div className="p2f-review__note"><strong>Tips:</strong> {promptReview.suggestions.slice(0, 3).join(' · ')}</div>}
                    </div>}
                  </div>}
                </div>
              </div>
            </div>
          </div>

          {composerMode === 'create' ? <form className="p2f-composer__form" onSubmit={(event) => { event.preventDefault(); loadModel(); }}>
            <label className="p2f-composer__mode" htmlFor="p2f-assistant-input">New process</label>
            <textarea id="p2f-assistant-input" ref={assistantInputRef} className="p2f-composer__input" rows={1} value={promptText} onKeyDown={submitOnModEnter} onChange={(event) => { setAdviceMode('prompt'); setDiagramReview(''); setPromptText(event.target.value); }} placeholder={isComposerCollapsed ? 'Describe the process you want to model…' : 'Describe the process: how it starts, which steps follow, who performs them and where decisions are made…'} />
            <div className="p2f-composer__options">
              <label className="p2f-option">Steps <input type="number" min="1" className="p2f-num" value={minNodes} onChange={(event) => setMinNodes(event.target.value)} aria-label="Minimum number of steps" /><span aria-hidden="true">–</span><input type="number" min="2" className="p2f-num" value={maxNodes} onChange={(event) => setMaxNodes(event.target.value)} aria-label="Maximum number of steps" /></label>
              <label className="p2f-option p2f-option--check"><input type="checkbox" checked={includeKpi} onChange={(event) => setIncludeKpi(event.target.checked)} /> Estimate time and cost</label>
            </div>
            <button type="submit" className="p2f-btn p2f-btn--primary p2f-composer__submit" disabled={createDisabled}>{isLoading && <span className="p2f-spinner" aria-hidden="true" />}{isLoading ? 'Generating…' : 'Create diagram'}</button>
          </form> : <form className="p2f-composer__form" onSubmit={(event) => { event.preventDefault(); editDiagramWithAI(); }}>
            <label className="p2f-composer__mode" htmlFor="p2f-assistant-input">Edit diagram</label>
            <textarea id="p2f-assistant-input" ref={assistantInputRef} className="p2f-composer__input" rows={1} value={copilotPrompt} onKeyDown={submitOnModEnter} onChange={(event) => { setCopilotPrompt(event.target.value); }} placeholder={isComposerCollapsed ? 'Describe the change the AI should make to the diagram…' : "Example: After 'Select vegetables', add 'Packaging' (actor: Customer), duration 1 minute, cost 0.50 EUR. Connect it to the next step and preserve the rest of the diagram. Or: Rename 'Review order' to 'Check order details' and keep all connections unchanged."} />
            <div className="p2f-composer__options p2f-composer__options--buttons">
              <button type="button" className="p2f-btn p2f-btn--sm" onClick={toggleActors}>{showActors ? 'Hide roles in names' : 'Show roles'}</button>
              <button type="button" className="p2f-btn p2f-btn--sm" onClick={undo} title="Undo (Ctrl+Z)"><Icons.Undo /> Undo</button>
              <button type="button" className="p2f-btn p2f-btn--sm" onClick={redo} title="Redo (Ctrl+Y)"><Icons.Redo /> Redo</button>
            </div>
            <button type="submit" className="p2f-btn p2f-btn--primary p2f-composer__submit" disabled={copilotDisabled}>{isCopilotLoading && <span className="p2f-spinner" aria-hidden="true" />}{isCopilotLoading ? 'Editing…' : 'Apply changes'}</button>
          </form>}
        </section>

        {showToolsPanel && <>
          <button type="button" className="p2f-sheet-backdrop" aria-label="Close more tools" onClick={() => setShowToolsPanel(false)} />
          <aside className="p2f-sheet" aria-label="More tools and export">
            <div className="p2f-sheet__head"><strong className="p2f-sheet__title">More tools</strong><button type="button" className="p2f-icon-btn" onClick={() => setShowToolsPanel(false)} aria-label="Close"><Icons.Close /></button></div>
            <div className="p2f-sheet__group"><SidebarButton icon={Icons.Save} label="Save diagram" onClick={() => { setShowToolsPanel(false); saveToCatalog(); }} variant="success" fullWidth /><SidebarButton icon={Icons.Folder} label="Open catalog" onClick={() => { setShowToolsPanel(false); openCatalog(); }} fullWidth /><SidebarButton icon={Icons.Info} label="User guide" onClick={() => { setShowToolsPanel(false); setShowInfoModal(true); }} fullWidth /></div>
            <div className="p2f-sheet__section">
              <div className="p2f-sheet__section-title">Export</div>
              <div className="p2f-export-grid">
                <button type="button" className="p2f-export" onClick={() => handleDownload('png')}><strong>PNG</strong><span>Image</span></button>
                <button type="button" className="p2f-export" onClick={() => handleDownload('jpg')}><strong>JPG</strong><span>Image</span></button>
                <button type="button" className="p2f-export" onClick={handleDownloadBpmn}><strong>BPMN</strong><span>BPMN 2.0 XML</span></button>
                <button type="button" className="p2f-export" onClick={handleDownloadUml}><strong>XMI</strong><span>UML activity</span></button>
                <button type="button" className="p2f-export" onClick={handleDownloadUxf}><strong>UXF</strong><span>UMLet</span></button>
              </div>
              <p className="p2f-sheet__note">The diagram must be saved in the catalog before downloading.</p>
            </div>
          </aside>
        </>}
        {showStatsModal && workNodes.length > 0 && <div role="presentation" className="p2f-overlay" onClick={() => setShowStatsModal(false)}>
          <StatsReport
            chapter={statsChapter}
            onChapterChange={setStatsChapter}
            onClose={() => setShowStatsModal(false)}
            workNodes={workNodes}
            resources={resources}
            onReloadResources={() => loadResources(currentModel, promptText, modelSignature)}
            statsReview={statsReview}
            isStatsReviewLoading={isStatsReviewLoading}
            diagramReview={diagramReview}
            isDiagramReviewLoading={isDiagramReviewLoading}
            onRegenerateAdvice={() => { showDiagramReview(currentModel, promptText); showStatsReview(currentModel, promptText); }}
            accuracy={diagramAccuracy}
            isAccuracyLoading={isDiagramAccuracyLoading}
            accuracyError={diagramAccuracyError}
            isAccuracyStale={isAccuracyStale}
            onRecheckAccuracy={() => runAccuracyCheck(currentModel, promptText, structureSignature)}
            hasDescription={Boolean(promptText.trim())}
          />
        </div>}
      </main>
      {modalConfig && <AppModal config={modalConfig} onClose={handleModalClose} />}
    </div>
  );
}

export default App;
