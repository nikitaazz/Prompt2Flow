# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Prompt2Flow turns a plain-text business process description into an editable swimlane diagram (React Flow + Dagre), using an LLM. Users can then edit it by hand or with an AI "Copilot", check it against the description, view KPIs and statistics, save it to a catalog, and export it as PNG/JPG, BPMN 2.0 XML, UML XMI or UMLet UXF.

The git repository root is the parent folder (`Prompt2Flow/`), so git paths are prefixed with `BP_Prompt2Flow/`.

## Commands

The backend runs from this directory, with Python and the `venv/` virtual environment:

```bash
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The frontend is in `frontend/` (Vite + React 19):

```bash
npm --prefix frontend install
npm --prefix frontend run dev      # http://127.0.0.1:5173
npm --prefix frontend run lint     # ESLint
npm --prefix frontend run build
```

`.claude/launch.json` defines `backend` and `frontend` preview configurations for these same commands.

The project has no automated test suite. `test_main.http` contains only a few ad-hoc HTTP requests. To verify a change, run the app, or call the FastAPI endpoints directly (interactive docs at `http://127.0.0.1:8000/docs`).

## Configuration (`.env`, see `.env.example`)

- `GROQ_API_KEY` is used by every AI feature except the independent evaluators. Without it, generation and editing return a placeholder diagram (a start node labelled "AI error").
- `GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS` and `NVIDIA_API_KEY` / `NVIDIA_MODEL` configure the "Match with description" evaluators.
- `DATABASE_URL` selects PostgreSQL. When it is unset, the app falls back to the local SQLite file `process_catalog.db`.
- `JWT_SECRET_KEY` and `ADMIN_USER` control auth (the admin can see and manage every catalog entry). `ALLOWED_ORIGINS` sets CORS.
- In the frontend, `VITE_API_URL` sets the backend URL (default `http://127.0.0.1:8000`).

## Architecture

### Backend: `main.py` (single FastAPI module)

`main.py` is split into sections marked `# ─── NAME ───`.

- **Database:** raw SQL with no ORM. `init_db()` creates the `users` and `processes` tables and runs small migrations at startup (for example, renaming legacy Slovak category names to English). A query must work on both databases, so use `PARAM_MARKER` (`%s` for Postgres, `?` for SQLite) together with `get_db()` / `get_cursor()`. The diagram is stored as JSON text in `processes.model_json`. `frontend/src/migrate.py` is a stale SQLAlchemy script and is not used.
- **LLM calls:** `groq_json()` is the shared helper; it calls Groq and parses a JSON object, raising `HTTPException` on failure. `gemini_generate()` (with model fallback and a cooldown for overloaded models) and `nvidia_generate()` are the independent evaluators, registered in the `EVALUATORS` dict.
- **Diagram model:** `ProcessModel` = `nodes` + `edges`. A node's `type` is one of `startEvent`, `endEvent`, `task`, `gateway`, `fork` or `join`. Fork and join are UML parallel bars (a BPMN parallel gateway). `CONTROL_NODE_TYPES` (events + fork/join) are excluded from step numbering, roles and KPIs.
- **AI endpoints:**
  - `/generate-model` turns a description into a diagram (`generate_diagram_from_text`).
  - `/edit-model` applies Copilot instructions to the current model (`edit_diagram_with_ai`).
  - `/review-prompt` reviews the description while the user types.
  - `/review-edit` reviews a Copilot instruction against the current diagram while the user types (where/what to change, placement, roles, decision branches). Whether each referenced step exists is checked in code, not by the LLM.
  - `/evaluate-model` handles "Match with description" in three LLM steps. (1) `extract_requirements` splits the description into requirements, each with a verbatim `quote`; requirements whose quote is not found in the description are dropped. The list is cached per description + evaluator in the `requirement_sets` table, so every evaluation of a description uses the same requirements (`fixed_requirements=false` disables this for experiments). (2) `diagram_to_text` rewrites the diagram as prose without seeing the description. (3) The judge (`JUDGE_VOTES` parallel calls, 3 for NVIDIA; each requirement takes the median verdict) marks each requirement and names the steps that prove it (`step_refs`, numbered as in `describe_process_model` / `process_flow`). `check_requirement` then verifies those references against the graph: it can only lower a verdict, except for `order`: when both steps exist, the graph decides (forward reachable only → met, opposite → partial). The score is computed deterministically (met = 1, partial = 0.5, missing = 0, weighted by importance, ignored requirements left out). `/evaluate-model/ignore` marks a cached requirement as "not a requirement". If Gemini has no key, it falls back to Groq.
  - `/process-resources` estimates the specialists and machines/tools the steps need.
  - `/assistant-chat` and the review endpoints handle the remaining AI features.
- On failure, generation and editing return `dummy_model(...)` (HTTP 200) instead of an error status, so the frontend has to recognise the `AI_ERROR_LABEL` node itself.
- The prompts are long, hand-tuned English strings inline in each function. Generated labels and roles must be in English even when the description is in another language (for example, Slovak).

### Frontend: `frontend/src/`

- `App.jsx` (~2.5k lines) holds almost everything: canvas state, the API helpers, validation (the "linter"), the swimlane layout, all exporters, the Copilot and the composer.
  - **Node data:** every diagram node has React Flow type `task`. The real kind is in `data.nodeType`; `swimlane` nodes are layout-only. Use the helpers `isEventNode`, `isBarNode`, `isControlNode` and `isDecisionOf`. `data.isDecision` is derived (more than one outgoing edge, except for control nodes) and is not stored as a separate type.
  - **Layout pipeline:** whenever a diagram arrives from the AI, the catalog or a manual edit, it goes through the same steps: `withStartEnd()` guarantees exactly one start and one end event, then `buildSwimLaneLayout()` runs Dagre, groups nodes into lanes by `data.actor` and lets start/end and fork/join inherit a neighbour's role. After that come `setNodes`/`setEdges` and `saveHistory` (undo/redo).
  - **Model for the backend:** `serializeModel()` builds the backend `ProcessModel`. `structureSignatureOf()` decides when cached AI results (accuracy, resources, advice) are stale. They are reloaded lazily in a `useEffect` when the relevant statistics chapter is open.
  - **Exports:** `handleDownloadBpmn`, `handleDownloadUml` and `handleDownloadUxf` build the XML by hand. Each one has its own node-size and type mapping, so a new node type must be added to all three. A diagram must be saved to the catalog before it can be downloaded.
- `StatsReport.jsx` is the statistics modal (chapters for finance, resources, advice and match). The "match" chapter can send selected requirements back to the Copilot as an edit instruction.
- `CatalogPage.jsx` is the saved and public diagram browser; `AuthModal.jsx` handles sign-up and login. The JWT is kept in `localStorage` as `auth_token`.

## Conventions

- All UI text, generated labels and code comments are in English. The app was originally Slovak, and legacy Slovak strings are still matched in places (for example, end-node detection by "koniec" and the category migration).
- `use_cases.txt` documents use cases in the Cockburn fully-dressed format: part A covers the original application and part B covers the extensions. When you add a user-facing feature, add a use case to part B. `prompts.txt` contains sample process descriptions for manual testing.
