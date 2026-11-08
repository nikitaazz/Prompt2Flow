from fastapi import FastAPI, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Literal, Dict
from contextlib import contextmanager
from datetime import datetime, timezone

import os
import sys
import json
import re
import time
import unicodedata
import requests
import jwt
import bcrypt
from dotenv import load_dotenv

load_dotenv()

# Keep Unicode startup logs from crashing the backend on legacy Windows consoles.
for output_stream in (sys.stdout, sys.stderr):
    if hasattr(output_stream, "reconfigure"):
        output_stream.reconfigure(encoding="utf-8", errors="replace")

app = FastAPI()

print(">>> Loading main.py (auth + categories + Postgres/SQLite support)")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,https://bp-t2-m-fast-api-project.vercel.app")
origins_list = list(dict.fromkeys([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    *[origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()],
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── CATEGORIES ───────────────────────────────────────────────
DEFAULT_CATEGORY = "Other"
PREDEFINED_CATEGORIES = [
  "Finance",
  "Economy",
  "HR",
  "IT",
  "Marketing",
  "Operations",
  "Law",
  "Services",
  "Education",
  "Sport",
  "Local government",
  "Customer service",
  "Healthcare",
  DEFAULT_CATEGORY,
]

# Categories saved by the earlier Slovak version of the app; migrated to English on startup.
LEGACY_CATEGORY_NAMES = {
  "Financie": "Finance",
  "Hospodárstvo": "Economy",
  "Operácie": "Operations",
  "Právo": "Law",
  "Služby": "Services",
  "Školstvo": "Education",
  "Šport": "Sport",
  "Územné celky": "Local government",
  "Zákaznícky servis": "Customer service",
  "Zdravotníctvo": "Healthcare",
  "Iné": DEFAULT_CATEGORY,
}
ALL_CATEGORIES_FILTER = ("", "All")

# ─── SECURITY ─────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("❌ JWT_SECRET_KEY is not set in .env!")
ALGORITHM = "HS256"



# ─── PYDANTIC MODELS ──────────────────────────────────────────
class Node(BaseModel):
    id: str
    type: str
    label: str
    actor: Optional[str] = None
    duration_minutes: Optional[int] = None
    cost_euros: Optional[float] = None


class Edge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None


class ProcessModel(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


class TextInput(BaseModel):
    description: str
    min_nodes: Optional[int] = 2
    max_nodes: Optional[int] = 10
    include_kpi: Optional[bool] = False


class PromptReviewRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=12000)


class ReviewOption(BaseModel):
    label: str
    clarification: str


class ReviewQuestion(BaseModel):
    question: str
    options: List[ReviewOption] = []
    target: str = ""          # which part of the structure it clarifies: "step:<n>", "trigger", "roles", "outcome", "resources"
    target_label: str = ""    # human-readable form of the target, e.g. "Step 2 – Approve request"


class StepCheck(BaseModel):
    """The AI's verdict on one step of the step-by-step description."""
    number: str = ""
    text: str
    clear: bool = True
    issue: str = ""


class PromptReviewResponse(BaseModel):
    """Review of a process description written as a short overview followed by a step-by-step description."""
    overall_review: str = ""
    overview_present: bool = False         # short description of the process in the user's own words
    steps_listed: bool = False             # step-by-step description (numbered steps)
    step_checks: List[StepCheck] = []      # is each step understandable to the AI?
    trigger_defined: bool = False          # what starts the process
    activities_identified: bool = False    # main activities and tasks
    roles_specified: bool = False          # responsible employees
    resources_identified: bool = False     # resources and documents used
    outcome_defined: bool = False          # expected outcome
    actor_assignments_clear: bool = False
    unclear_tasks: List[str] = []
    suggestions: List[str] = []
    activity_count: int = 0
    questions: List[ReviewQuestion] = []


class DiagramAccuracyRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=12000)
    model: dict
    evaluator: Literal["gemini", "nvidia"] = "gemini"


class AccuracyRequirement(BaseModel):
    text: str
    category: str = "step"
    importance: int = Field(2, ge=1, le=3)
    status: Literal["met", "partial", "missing"] = "missing"
    evidence: str = ""


class DiagramAccuracyResponse(BaseModel):
    accuracy_percent: int = Field(..., ge=0, le=100)
    diagram_prompt: str
    summary: str
    matches: List[str]
    missing: List[str]
    extra: List[str]
    requirements: List[AccuracyRequirement] = []
    category_scores: Dict[str, int] = {}
    evaluator: str = ""


class ProcessResourcesRequest(BaseModel):
    description: Optional[str] = Field(None, max_length=12000)
    model: dict


class SpecialistInfo(BaseModel):
    role: str
    qualification: str = ""
    responsibilities: List[str] = []
    steps: List[str] = []


class ToolInfo(BaseModel):
    name: str
    kind: str = "tool"
    purpose: str = ""
    steps: List[str] = []


class ProcessResourcesResponse(BaseModel):
    summary: str = ""
    specialists: List[SpecialistInfo] = []
    tools: List[ToolInfo] = []


class AssistantChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    messages: List[AssistantChatMessage] = Field(..., min_items=1, max_items=24)
    process_description: Optional[str] = Field(None, max_length=12000)
    current_model: Optional[dict] = None


class AssistantChatResponse(BaseModel):
    reply: str


class EditModelRequest(BaseModel):
    instruction: str
    current_model: dict


class CatalogSaveRequest(BaseModel):
    title: str
    prompt: str
    min_nodes: int
    max_nodes: int
    final_node_count: int
    model_json: dict
    is_public: bool = False
    category: str = DEFAULT_CATEGORY


class VisibilityUpdate(BaseModel):
    is_public: bool


class UserRegister(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str


# ─── DATABASE SETUP (POSTGRESQL OR SQLITE FALLBACK) ───────────
DB_URL = os.getenv("DATABASE_URL")

if DB_URL:
    import psycopg2
    from psycopg2.extras import RealDictCursor

    USE_POSTGRES = True
    print("✅ Using PostgreSQL")
else:
    import sqlite3

    USE_POSTGRES = False
    DB_PATH = "process_catalog.db"
    print("⚠️ DATABASE_URL is not set in .env. Using local SQLite.")

# Placeholder that hides the SQL syntax difference (Postgres %s, SQLite ?)
PARAM_MARKER = "%s" if USE_POSTGRES else "?"


def init_db():
    if USE_POSTGRES:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            created_at VARCHAR(255) NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS processes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            min_nodes INTEGER NOT NULL,
            max_nodes INTEGER NOT NULL,
            final_node_count INTEGER NOT NULL,
            model_json TEXT NOT NULL,
            is_public BOOLEAN DEFAULT FALSE,
            category VARCHAR(255) DEFAULT 'Other',
            created_at VARCHAR(255) NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """)
    else:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS processes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            min_nodes INTEGER NOT NULL,
            max_nodes INTEGER NOT NULL,
            final_node_count INTEGER NOT NULL,
            model_json TEXT NOT NULL,
            is_public BOOLEAN DEFAULT 0,
            category TEXT DEFAULT 'Other',
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """)
        try:
            cursor.execute("ALTER TABLE processes ADD COLUMN category TEXT DEFAULT 'Other'")
            print("✅ Migration: column 'category' added")
        except sqlite3.OperationalError:
            pass

    # Rename categories saved under their former Slovak names
    for legacy_name, english_name in LEGACY_CATEGORY_NAMES.items():
        cursor.execute(f"UPDATE processes SET category = {PARAM_MARKER} WHERE category = {PARAM_MARKER}",
                       (english_name, legacy_name))

    conn.commit()
    cursor.close()
    conn.close()
    print("✅ Database initialised")


from contextlib import contextmanager

@contextmanager
def get_db():
    if DB_URL:  # ← DB_URL, not DATABASE_URL
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = False
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def get_cursor(conn):
    if USE_POSTGRES:
        return conn.cursor(cursor_factory=RealDictCursor)  # ← RealDictCursor is required here
    else:
        return conn.cursor()


# ─── AUTH HELPERS ─────────────────────────────────────────────
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")


def create_access_token(data: dict):
    to_encode = data.copy()
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        username: str = payload.get("username")
        if user_id is None or username is None:
            raise credentials_exception
    except jwt.PyJWTError as e:
        print(f"Token decoding error: {e}")
        raise credentials_exception
    return {"user_id": user_id, "username": username}


# ─── GROQ ─────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"


def groq_post(url: str, **kwargs) -> requests.Response:
    """requests.post to Groq that waits and retries once when Groq reports a short rate limit (429, wait up to 12 s)."""
    response = requests.post(url, **kwargs)
    if response.status_code == 429:
        wait = re.search(r"try again in ([\d.]+)s", response.text)
        if wait and float(wait.group(1)) <= 12:
            time.sleep(float(wait.group(1)) + 0.5)
            response = requests.post(url, **kwargs)
    return response


def generate_diagram_from_text(description: str, min_nodes: int, max_nodes: int,
                               include_kpi: bool = False) -> ProcessModel:
    print(f"🎯 PROMPT: {description[:50]}... | Nodes: {min_nodes} - {max_nodes}")

    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Set GROQ_API_KEY in .env")

    kpi_instruction = """
- Every "task" node also has "duration_minutes" (integer, estimated time in minutes; 480 = 1 working day)
  and "cost_euros" (number, estimated cost in EUR).""" if include_kpi else ""

    prompt = f"""Turn the process description below into a business process diagram. Return ONLY a JSON object:
{{
  "nodes": [
    {{"id": "start", "type": "startEvent", "label": "Triggering event"}},
    {{"id": "t1", "type": "task", "label": "Activity", "actor": "Role"}},
    {{"id": "gw1", "type": "gateway", "label": "Question?", "actor": "Role"}},
    {{"id": "end", "type": "endEvent", "label": "Outcome"}}
  ],
  "edges": [
    {{"id": "e1", "source": "start", "target": "t1"}},
    {{"id": "e2", "source": "gw1", "target": "t1", "label": "No"}}
  ]
}}

Rules:
- Do NOT invent anything. Every task is an activity the description explicitly states, in the same order. No extra
  "check", "prepare", "approve", "resubmit" or similar steps the text does not name. Do not invent roles either –
  "actor" is a role named in the description, otherwise null.
- Before building the diagram, analyse where the process BRANCHES and where it LOOPS:
  - branch (gateway): the description states a decision or condition ("if …", "otherwise", "approves or rejects");
  - loop: the description says work is repeated ("again", "until", "returns it", "if not OK, fixes it") – the gateway
    branch goes BACK to the existing earlier step; "does X again" is the loop itself, not a new step.
  Add a gateway only where the description needs one. A process without decisions is a straight line.
- Every gateway has at least 2 outgoing edges, each with a concrete label ("Yes"/"No", "Approved"/"Rejected").
- Use {min_nodes} to {max_nodes} task nodes as a guide; never add steps just to reach the minimum.
- Write all labels and roles in English, even if the description is in another language.
- startEvent label = what triggers the process, endEvent label = the outcome. Every activity of the description
  (including the first one) is a task – do not hide activities in the start or end event.{kpi_instruction}

Process description:
{description}
"""

    try:
        diagram = groq_json("You are a JSON generator. You output only valid JSON.", prompt, max_tokens=8192)
        node_ids = set()
        nodes = []
        for n in diagram.get("nodes") or []:
            if not isinstance(n, dict):
                continue
            node_id = str(n.get("id", f"node_{len(nodes)}"))
            nodes.append(Node(
                id=node_id,
                type=str(n.get("type", "task")),
                label=str(n.get("label", "Unknown task")),
                actor=n.get("actor"),
                duration_minutes=n.get("duration_minutes"),
                cost_euros=n.get("cost_euros"),
            ))
            node_ids.add(node_id)
        edges = [
            Edge(id=str(e.get("id", f"edge_{i}")), source=str(e.get("source")), target=str(e.get("target")), label=e.get("label"))
            for i, e in enumerate(diagram.get("edges") or [])
            if isinstance(e, dict) and str(e.get("source")) in node_ids and str(e.get("target")) in node_ids
        ]
        return ProcessModel(nodes=nodes, edges=edges)
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        print(f"💥 ERROR: {detail}")
        return dummy_model(f"Error: {str(detail)[:80]}")


AI_ERROR_LABEL = "AI error"


def dummy_model(msg: str) -> ProcessModel:
    return ProcessModel(
        nodes=[
            Node(id="start", type="startEvent", label=AI_ERROR_LABEL, actor=None),
            Node(id="end", type="endEvent", label=msg, actor=None),
        ],
        edges=[Edge(id="e1", source="start", target="end")],
    )


# ─── STARTUP ──────────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    init_db()


# ─── ENDPOINTS ────────────────────────────────────────────────
@app.get("/categories")
def get_categories():
    return {"categories": PREDEFINED_CATEGORIES}


@app.get("/")
def read_root():
    return {"message": "API is running"}


@app.post("/register")
def register_user(user: UserRegister):
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(
            f"SELECT id FROM users WHERE username = {PARAM_MARKER}",
            (user.username,)
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists")
        hashed_pw = get_password_hash(user.password)
        cursor.execute(
            f"INSERT INTO users (username, hashed_password, created_at) VALUES ({PARAM_MARKER}, {PARAM_MARKER}, {PARAM_MARKER})",
            (user.username, hashed_pw, datetime.now(timezone.utc).isoformat())
        )
        # ← do NOT call conn.commit() here, get_db() does it automatically
    return {"success": True, "message": "Account created. You can now sign in."}


@app.post("/login", response_model=TokenResponse)
def login_user(user: UserLogin):
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(
            f"SELECT id, username, hashed_password FROM users WHERE username = {PARAM_MARKER}",
            (user.username,)
        )
        row = cursor.fetchone()
        if not row or not verify_password(user.password, row["hashed_password"]):
            raise HTTPException(status_code=401, detail="Incorrect username or password")
        access_token = create_access_token(data={"sub": str(row["id"]), "username": row["username"]})
    return {"access_token": access_token, "token_type": "bearer", "username": row["username"]}

@app.post("/generate-model", response_model=ProcessModel)
def generate_model(input: TextInput) -> ProcessModel:
    return generate_diagram_from_text(input.description, input.min_nodes, input.max_nodes, input.include_kpi)


def groq_json(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.0,
              reasoning_effort: str = "medium") -> dict:
    """Calls Groq with JSON output and returns the parsed object (errors are mapped to HTTPException).
    On a short Groq rate limit (429 with a wait of up to 12 s) it waits and retries once."""
    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        raise HTTPException(status_code=503, detail="Set GROQ_API_KEY in .env.")
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_completion_tokens": max_tokens,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "reasoning_format": "hidden",
        "reasoning_effort": reasoning_effort,
    }
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    try:
        response = requests.post(GROQ_URL, headers=headers, json=payload, timeout=90)
        if response.status_code == 429:
            wait = re.search(r"try again in ([\d.]+)s", response.text)
            if wait and float(wait.group(1)) <= 12:
                time.sleep(float(wait.group(1)) + 0.5)
                response = requests.post(GROQ_URL, headers=headers, json=payload, timeout=90)
        response.raise_for_status()
        choices = response.json().get("choices", [])
        if not choices:
            raise ValueError("Groq returned no response")
        result = json.loads(choices[0].get("message", {}).get("content", ""))
        if not isinstance(result, dict):
            raise ValueError("Groq did not return a JSON object")
        return result
    except requests.exceptions.RequestException as exc:
        if exc.response is not None and exc.response.status_code == 429:
            wait = re.search(r"try again in ([\d.]+)s", exc.response.text)
            hint = f" Try again in {round(float(wait.group(1))) + 1} s." if wait else " Try again in a moment."
            raise HTTPException(status_code=429, detail="The AI is busy right now (Groq API rate limit)." + hint) from exc
        detail = exc.response.text[:400] if exc.response is not None else str(exc)[:160]
        raise HTTPException(status_code=503, detail=f"Groq API is unavailable: {detail}") from exc
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail=f"Groq returned an invalid response: {str(exc)[:200]}") from exc


# ─── GEMINI (independent evaluator) ───────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
GEMINI_FALLBACK_MODELS = [m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",") if m.strip()]
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_COOLDOWN_SECONDS = 300
_gemini_overloaded_until: Dict[str, float] = {}
_gemini_last_model = {"name": GEMINI_MODEL}


def _gemini_post(payload: dict) -> requests.Response:
    """Tries GEMINI_MODEL, then the fallback models. A model that is overloaded (429/5xx) or times out
    is skipped for a few minutes so the next request does not wait for it again."""
    models = list(dict.fromkeys([GEMINI_MODEL] + GEMINI_FALLBACK_MODELS))
    ready = [m for m in models if _gemini_overloaded_until.get(m, 0) <= time.time()] or models[-1:]
    last_error: Optional[Exception] = None
    for model in ready:
        try:
            response = requests.post(GEMINI_URL.format(model=model),
                                     headers={"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"},
                                     json=payload, timeout=(10, 45 if model != ready[-1] else 120))
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            last_error = exc
        else:
            if response.status_code != 429 and response.status_code < 500:
                _gemini_last_model["name"] = model
                return response
            last_error = requests.exceptions.HTTPError(response=response)
        print(f"⚠️ Gemini {model} unavailable, trying the next model")
        _gemini_overloaded_until[model] = time.time() + GEMINI_COOLDOWN_SECONDS
    raise last_error


def gemini_generate(system_prompt: str, user_prompt: str, max_tokens: int = 3000, as_json: bool = True):
    """Calls Gemini and returns the parsed JSON object (as_json=True) or plain text."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Set GEMINI_API_KEY in .env.")
    config = {"temperature": 0.0, "maxOutputTokens": max_tokens}
    if as_json:
        config["responseMimeType"] = "application/json"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": config,
    }
    try:
        response = _gemini_post(payload)
        response.raise_for_status()
        candidates = response.json().get("candidates") or []
        parts = (candidates[0].get("content") or {}).get("parts") or [] if candidates else []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
        if not text:
            raise ValueError("Gemini returned no response")
        if not as_json:
            return text
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
        result = json.loads(text)
        if not isinstance(result, dict):
            raise ValueError("Gemini did not return a JSON object")
        return result
    except requests.exceptions.RequestException as exc:
        if exc.response is not None and exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="Gemini API rate limit. Try again in a moment.") from exc
        detail = exc.response.text[:400] if exc.response is not None else str(exc)[:160]
        raise HTTPException(status_code=503, detail=f"Gemini API is unavailable: {detail}") from exc
    except (ValueError, TypeError, AttributeError, IndexError) as exc:
        raise HTTPException(status_code=502, detail=f"Gemini returned an invalid response: {str(exc)[:200]}") from exc


# ─── NVIDIA (second independent evaluator, OpenAI-compatible API) ───
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-ultra-550b-a55b").strip()
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"


def _parse_json_object(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("no JSON object in the response")
        result = json.loads(text[start:end + 1])
    if not isinstance(result, dict):
        raise ValueError("the response is not a JSON object")
    return result


def nvidia_generate(system_prompt: str, user_prompt: str, max_tokens: int = 3000, as_json: bool = True):
    """Calls the NVIDIA API and returns the parsed JSON object (as_json=True) or plain text."""
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=503, detail="Set NVIDIA_API_KEY in .env.")
    payload = {
        "model": NVIDIA_MODEL,
        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        "temperature": 0.0,
        "max_tokens": max_tokens,
    }
    try:
        response = requests.post(NVIDIA_URL, json=payload, timeout=(10, 180),
                                 headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"})
        response.raise_for_status()
        choices = response.json().get("choices") or []
        text = str(((choices[0].get("message") or {}).get("content") if choices else "") or "")
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
        if not text:
            raise ValueError("NVIDIA returned no response")
        return _parse_json_object(text) if as_json else text
    except requests.exceptions.RequestException as exc:
        if exc.response is not None and exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="NVIDIA API rate limit. Try again in a moment.") from exc
        detail = exc.response.text[:400] if exc.response is not None else str(exc)[:160]
        raise HTTPException(status_code=503, detail=f"NVIDIA API is unavailable: {detail}") from exc
    except (ValueError, TypeError, AttributeError, IndexError) as exc:
        raise HTTPException(status_code=502, detail=f"NVIDIA returned an invalid response: {str(exc)[:200]}") from exc


EVALUATORS = {"gemini": gemini_generate, "nvidia": nvidia_generate}


def diagram_to_text(model: dict, outline: str, evaluator: str = "gemini") -> str:
    """The evaluator reads the diagram (without seeing the original description) and writes it back as a plain process description."""
    compact = {
        "nodes": [{k: n.get(k) for k in ("id", "type", "label", "actor") if n.get(k) is not None}
                  for n in (model.get("nodes") or []) if isinstance(n, dict)],
        "edges": [{k: e.get(k) for k in ("source", "target", "label") if e.get(k) is not None}
                  for e in (model.get("edges") or []) if isinstance(e, dict)],
    }
    prompt = f"""Below is a business process diagram (BPMN-like JSON) and an outline of its flow.
Write the process description that this diagram represents, as a person would describe the process in prose:
who does what, in which order, which decisions are made and with which conditions each branch continues, and how the process ends.
Describe ONLY what is in the diagram. Do not add, guess or improve anything. Write in English, plain text, no headings or lists.

DIAGRAM JSON:
{json.dumps(compact, ensure_ascii=False)}

FLOW OUTLINE:
{outline}
"""
    return EVALUATORS[evaluator]("You translate process diagrams into faithful plain-text process descriptions.",
                                 prompt, max_tokens=2000, as_json=False)


EVENT_NODE_TYPES = {"startEvent", "endEvent"}


def describe_process_model(model: dict) -> str:
    """Deterministic text description of the diagram: steps in flow order, roles and branches with conditions."""
    nodes = [n for n in (model.get("nodes") or []) if isinstance(n, dict) and n.get("id") is not None]
    edges = [e for e in (model.get("edges") or []) if isinstance(e, dict)]
    by_id = {str(n["id"]): n for n in nodes}
    outgoing = {nid: [] for nid in by_id}
    indegree = {nid: 0 for nid in by_id}
    for e in edges:
        source, target = str(e.get("source")), str(e.get("target"))
        if source in by_id and target in by_id:
            outgoing[source].append((target, e.get("label")))
            indegree[target] += 1

    starts = [nid for nid, n in by_id.items() if n.get("type") == "startEvent"]
    starts = starts or [nid for nid, deg in indegree.items() if deg == 0] or list(by_id)[:1]
    order, seen, queue = [], set(), list(starts)
    while queue:
        nid = queue.pop(0)
        if nid in seen:
            continue
        seen.add(nid)
        order.append(nid)
        queue.extend(target for target, _ in outgoing[nid] if target not in seen)
    order += [nid for nid in by_id if nid not in seen]

    numbers = {}
    for nid in order:
        if by_id[nid].get("type") not in EVENT_NODE_TYPES:
            numbers[nid] = len(numbers) + 1

    def name(nid: str) -> str:
        node_type = by_id[nid].get("type")
        if node_type == "startEvent":
            return "START"
        if node_type == "endEvent":
            return "END"
        return f'step {numbers[nid]} "{by_id[nid].get("label", "")}"'

    lines = []
    for nid in order:
        node = by_id[nid]
        node_type = node.get("type") or "task"
        if node_type == "endEvent":
            continue
        if node_type == "startEvent":
            head = "START"
        else:
            kind = "Decision" if node_type == "gateway" or len(outgoing[nid]) > 1 else "Step"
            head = f'{kind} {numbers[nid]}: "{node.get("label", "")}" (role: {node.get("actor") or "not stated"})'
        targets = [name(target) + (f" [condition: {label}]" if label else "") for target, label in outgoing[nid]]
        lines.append(f"{head} → " + ("; ".join(targets) if targets else "(does not continue)"))
    return "\n".join(lines) or "(empty diagram)"


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().strip().lower()


ACCURACY_STATUS_SCORE = {"met": 1.0, "partial": 0.5, "missing": 0.0}
ACCURACY_CATEGORIES = {"step", "actor", "decision", "order", "outcome"}


@app.post("/evaluate-model", response_model=DiagramAccuracyResponse)
def evaluate_generated_model(input: DiagramAccuracyRequest) -> DiagramAccuracyResponse:
    """An independent model (Gemini or NVIDIA, not the generator) first translates the diagram back into text
    without seeing the original description, then splits the original into requirements and judges each against that text.
    The score is computed deterministically. Gemini without GEMINI_API_KEY falls back to Groq and the outline."""
    outline = describe_process_model(input.model)
    evaluator = input.evaluator
    if evaluator == "gemini" and not GEMINI_API_KEY:
        evaluator = "groq"
    diagram_text = outline if evaluator == "groq" else diagram_to_text(input.model, outline, evaluator)
    evaluation_prompt = f"""You compare the user's ORIGINAL DESCRIPTION with the CONTENT OF A PROCESS DIAGRAM.

Procedure:
1. Split the original description into 4 to 20 atomic requirements. Each one is a single verifiable thing that the description states EXPLICITLY. Categories:
   - "step": an activity that has to be performed in the process,
   - "actor": who performs a specific activity (only if the description says so),
   - "decision": a decision/branching and its branches or conditions,
   - "order": an important sequence (X follows Y),
   - "outcome": how the process ends.
   Do not invent requirements. Do not include obvious things (process start and end, time, costs, KPIs, visual layout).
2. importance: 3 = core of the process, 2 = important detail, 1 = minor detail.
3. For each requirement determine its status according to the diagram:
   - "met": the diagram contains it (different wording or synonyms are fine; one step may cover several requirements and vice versa),
   - "partial": only partially (the step exists but a different role performs it; the branch exists but without a condition; the order is slightly different),
   - "missing": it is not in the diagram.
   If a decision has no role but the directly preceding step is performed by the required role, treat the role as met.
   evidence: briefly name the diagram step that proves it, or why it is missing.
4. extra: at most 5 diagram steps that the description does not ask for and that are not a reasonable breakdown of a required step. They do not lower the score.
5. summary: 1–2 sentences – what the diagram captured and what important part is missing.

Respond in English and return only JSON:
{{
  "requirements": [{{"text": "...", "category": "step", "importance": 3, "status": "met", "evidence": "..."}}],
  "extra": ["..."],
  "summary": "..."
}}

ORIGINAL DESCRIPTION:
{input.description}

DIAGRAM (described as text):
{diagram_text}
"""
    judge_system = "You evaluate process diagrams against requirements and return only valid JSON."
    if evaluator == "groq":
        result = groq_json(judge_system, evaluation_prompt, max_tokens=3000)
    else:
        result = EVALUATORS[evaluator](judge_system, evaluation_prompt, max_tokens=8000)

    requirements = []
    for raw in result.get("requirements") or []:
        if not isinstance(raw, dict) or not str(raw.get("text", "")).strip():
            continue
        status_value = _ascii(raw.get("status"))
        status_value = status_value if status_value in ACCURACY_STATUS_SCORE else "missing"
        category = _ascii(raw.get("category"))
        try:
            importance = min(3, max(1, int(raw.get("importance", 2))))
        except (TypeError, ValueError):
            importance = 2
        requirements.append(AccuracyRequirement(
            text=str(raw["text"]).strip(),
            category=category if category in ACCURACY_CATEGORIES else "step",
            importance=importance,
            status=status_value,
            evidence=str(raw.get("evidence") or "").strip(),
        ))
    if not requirements:
        raise HTTPException(status_code=502, detail="The AI returned no requirements to compare.")

    def weighted_score(items: List[AccuracyRequirement]) -> int:
        total = sum(r.importance for r in items)
        return round(100 * sum(r.importance * ACCURACY_STATUS_SCORE[r.status] for r in items) / total) if total else 0

    category_scores = {
        category: weighted_score([r for r in requirements if r.category == category])
        for category in sorted({r.category for r in requirements})
    }
    return DiagramAccuracyResponse(
        accuracy_percent=weighted_score(requirements),
        diagram_prompt=diagram_text,
        summary=str(result.get("summary") or "").strip(),
        matches=[r.text for r in requirements if r.status == "met"],
        missing=[r.text + (" (partially)" if r.status == "partial" else "") for r in requirements if r.status != "met"],
        extra=[str(x).strip() for x in (result.get("extra") or []) if str(x).strip()][:5],
        requirements=requirements,
        category_scores=category_scores,
        evaluator={"gemini": f"Gemini ({_gemini_last_model['name']})", "nvidia": f"NVIDIA ({NVIDIA_MODEL})", "groq": f"Groq ({GROQ_MODEL})"}[evaluator],
    )


TOOL_KINDS = ["machine", "device", "tool", "software", "material"]


@app.post("/process-resources", response_model=ProcessResourcesResponse)
def process_resources(input: ProcessResourcesRequest) -> ProcessResourcesResponse:
    """Estimate of the specialists and machines/tools the process steps need."""
    diagram_text = describe_process_model(input.model)
    roles = sorted({str(n.get("actor")).strip() for n in (input.model.get("nodes") or [])
                    if isinstance(n, dict) and n.get("actor") and n.get("type") not in EVENT_NODE_TYPES})
    resources_prompt = f"""Analyse the business process and determine the resources it needs.

1. specialists: for EACH role in the diagram ({", ".join(roles) or "roles are not stated – derive them from the steps"}) provide:
   - "role": the role name EXACTLY as in the diagram,
   - "qualification": the required qualification, expertise or skills (1 sentence),
   - "responsibilities": 1–3 main responsibilities in this process,
   - "steps": names of the diagram steps that the role performs.
2. tools: machines, devices, tools, software and material that are used in the steps or are realistically needed for them (at most 12). For each:
   - "name" (e.g. "Accounting software"), "kind" (one of: {", ".join(TOOL_KINDS)}), "purpose" (what it is for, 1 sentence), "steps" (diagram steps).
   List a computer as general equipment at most once.
   If a tool is not explicitly in the description, estimate the usual equipment for the activity, but do not invent unrelated things.
3. summary: 1–2 sentences about which human and technical resources the process relies on most.

Respond in English and return only JSON:
{{"summary": "...", "specialists": [{{"role": "...", "qualification": "...", "responsibilities": ["..."], "steps": ["..."]}}], "tools": [{{"name": "...", "kind": "software", "purpose": "...", "steps": ["..."]}}]}}

PROCESS DESCRIPTION:
{input.description or "(not provided)"}

DIAGRAM (steps in flow order):
{diagram_text}
"""
    result = groq_json("You analyse business processes and return only valid JSON.", resources_prompt,
                       max_tokens=2600, temperature=0.2, reasoning_effort="low")

    def str_list(value) -> List[str]:
        return [str(x).strip() for x in (value or []) if str(x).strip()] if isinstance(value, list) else []

    specialists = [
        SpecialistInfo(role=str(s.get("role")).strip(), qualification=str(s.get("qualification") or "").strip(),
                       responsibilities=str_list(s.get("responsibilities")), steps=str_list(s.get("steps")))
        for s in (result.get("specialists") or []) if isinstance(s, dict) and str(s.get("role") or "").strip()
    ]
    tools = []
    for t in result.get("tools") or []:
        if not isinstance(t, dict) or not str(t.get("name") or "").strip():
            continue
        kind = next((k for k in TOOL_KINDS if _ascii(k) == _ascii(t.get("kind"))), "tool")
        tools.append(ToolInfo(name=str(t["name"]).strip(), kind=kind, purpose=str(t.get("purpose") or "").strip(),
                              steps=str_list(t.get("steps"))))
    return ProcessResourcesResponse(summary=str(result.get("summary") or "").strip(),
                                    specialists=specialists, tools=tools[:12])


REVIEW_ASPECTS = {  # target -> (review flag, label, suggestion when missing)
    "trigger": ("trigger_defined", "Triggering event", "Add what triggers the process, e.g. \"The process starts when …\"."),
    "roles": ("roles_specified", "Responsible roles", "Say who performs each step."),
    "outcome": ("outcome_defined", "Expected outcome", "Add the expected outcome, e.g. \"The process ends when …\"."),
    "resources": ("resources_identified", "Resources and documents", "Name the documents, forms or systems used in the steps."),
}
QUESTION_ASPECTS = ("trigger", "outcome", "roles")  # aspects worth a question; resources only get a tip


def _structured_questions(raw_questions, review: dict) -> List[ReviewQuestion]:
    """Keep only questions that clarify an unclear step or a missing aspect of the description structure."""
    unclear_steps = {_ascii(s.number): s for s in review.get("step_checks", []) if not s.clear}
    step_order = {key: i for i, key in enumerate(unclear_steps)}
    accepted = {}
    for q in raw_questions or []:
        if not isinstance(q, dict) or not str(q.get("question") or "").strip():
            continue
        target = _ascii(q.get("target")).replace(" ", "")
        if target.startswith("step:") and target[5:] in unclear_steps:
            step = unclear_steps[target[5:]]
            label = f"Step {step.number} – {step.text}"
            priority = step_order[target[5:]]
        elif target in QUESTION_ASPECTS and not review.get(REVIEW_ASPECTS[target][0]):
            label = REVIEW_ASPECTS[target][1]
            priority = 100 + QUESTION_ASPECTS.index(target)
        else:
            continue  # off-structure question
        options = [ReviewOption(label=str(o["label"]).strip(), clarification=str(o.get("clarification") or o["label"]).strip())
                   for o in (q.get("options") or []) if isinstance(o, dict) and str(o.get("label") or "").strip()]
        if len(options) < 2 or target in accepted:
            continue
        accepted[target] = (priority, ReviewQuestion(question=str(q["question"]).strip(), options=options[:3],
                                                     target=target, target_label=label))
    if any(key.startswith("step:") for key in accepted):
        accepted.pop("roles", None)  # the step questions already ask who performs the unclear steps
    return [question for _, question in sorted(accepted.values(), key=lambda item: item[0])][:3]


def _structural_suggestions(review: dict) -> List[str]:
    """Tips derived only from the structure: missing parts first, then what the questions do not already cover."""
    tips = []
    if not review.get("overview_present"):
        tips.append("Start with a short overview in your own words (1–3 sentences): what the process is about, what starts it and what its result is.")
    if not review.get("steps_listed"):
        tips.append("Describe the process step by step as a numbered list (1., 2., 3. …), one activity per step.")
    asked = {q.target for q in review.get("questions", [])}
    for step in review.get("step_checks", []):
        if not step.clear and f"step:{_ascii(step.number)}" not in asked and step.issue:
            tips.append(f"Step {step.number}: {step.issue}")
    for target, (flag, _, tip) in REVIEW_ASPECTS.items():
        if target == "roles" and any(key.startswith("step:") for key in asked):
            continue  # the step questions already ask who performs the unclear steps
        if not review.get(flag) and target not in asked:
            tips.append(tip)
    return tips[:3]


@app.post("/review-prompt", response_model=PromptReviewResponse)
def review_prompt(input: PromptReviewRequest) -> PromptReviewResponse:
    prompt = input.prompt.strip()
    if len(prompt) < 30:
        raise HTTPException(status_code=400, detail="Write at least 30 characters of the process so the AI can review it.")

    review_instructions = """Review the business process description and return only one JSON object with the fields:
{
  "overall_review": "short overall assessment in English",
  "overview_present": true,
  "steps_listed": true,
  "step_checks": [
    {"number": "1", "text": "short name of the step", "clear": true, "issue": ""},
    {"number": "2", "text": "short name of the step", "clear": false, "issue": "It is not stated who checks the invoice."}
  ],
  "trigger_defined": true,
  "activities_identified": true,
  "roles_specified": true,
  "resources_identified": false,
  "outcome_defined": false,
  "actor_assignments_clear": false,
  "unclear_tasks": ["a concrete step whose performer is unclear"],
  "activity_count": 0,
  "questions": [
    {"target": "step:2", "question": "Who checks the invoice in step 2?", "options": [
      {"label": "Manager", "clarification": "In step 2 the manager checks the invoice."},
      {"label": "Accountant", "clarification": "In step 2 the accountant checks the invoice."}
    ]}
  ]
}

The description is expected to have this structure:
  A. A SHORT OVERVIEW of the business process in the user's own words (1–3 sentences): what the process is about,
     ideally what starts it and what its result is.
  B. A STEP-BY-STEP DESCRIPTION: the steps of the process in order, preferably as a numbered list (1., 2., 3. …),
     each step one activity – who does what, with which documents or resources, and what happens at decisions.

Your main task is to check whether YOU understand each step well enough to draw it in a process diagram.

Review rules:
1. overview_present: true only if there is a short overview of the process in the user's own words (separate from the steps).
   steps_listed: true only if the process is described step by step in a clear order (a numbered list is preferred).
2. step_checks: one item for EVERY step of the step-by-step description, in order ("number" = its number in the text, or the order if unnumbered;
   "text" = a short name of the step). If there is no step-by-step part, split the text into its activities and check those.
   A step is clear (clear = true) only if you know WHAT is done and WHO does it, and – if it is a decision – what happens in each case.
   If a step is unclear, set clear = false and write in "issue" one short sentence saying exactly what is missing or ambiguous
   (e.g. "It is not stated who approves the request.", "It is unclear what happens if the goods are not in stock.", "Two different activities are mixed in one step.").
   Do not mark a step unclear because of missing time or cost.
3. The five aspects – mark each true only if the description (overview or steps) really covers it; do not guess:
   trigger_defined (what starts the process), activities_identified (concrete activities in a clear order), roles_specified (who performs the activities),
   resources_identified (documents, forms, systems or tools used), outcome_defined (the expected result / how the process ends).
4. actor_assignments_clear: true only if every step says who performs it. unclear_tasks: steps whose performer is unclear (quoted or briefly named). Do not invent actors.
6. overall_review: 1–2 sentences on whether the description is understandable and what matters most. If the description is short or still
   being written, phrase it as an interim review. Be factual, brief and encouraging.
7. Respond in English, keep people's names and do not judge grammar.
8. activity_count: the number of separate activities in the description (several activities in one step count separately; an explicit decision by a role
   counts as an activity, a mere condition such as "if the goods are in stock" does not).
9. questions – STRICTLY limited to the structure above. Ask a question ONLY for:
   a) a step you marked clear = false: target "step:<number>", and the question asks exactly about that step's "issue"
      (who performs it, or what happens in the undescribed case of a decision) – mention the step number in the question;
   b) a missing aspect: target "trigger" (if trigger_defined is false), "outcome" (if outcome_defined is false),
      or "roles" (if roles_specified is false and no step question already asks who performs a step).
   Never ask about resources or documents. Priority: unclear steps first (in order), then trigger, outcome, roles.
   At most 3 questions, one per target.
   Do NOT ask anything else: no questions about time, duration, costs, frequency, volumes, exceptions or details the description does not mention,
   IT systems beyond what a step needs, improvements, or anything a "Clarification:" line has already answered. If everything is clear, return an empty list.
   Give 2–3 options for each question, taken from the roles, activities and documents the description already contains (do not invent new ones);
   "clarification" is a full sentence that gets appended to the description, written in the same language as the description."""

    # groq_json waits and retries once on a short Groq rate limit; low reasoning effort keeps the review fast
    review = groq_json(review_instructions, prompt, max_tokens=3000, temperature=0.2, reasoning_effort="low")
    try:
        step_checks = []
        for item in review.get("step_checks") or []:
            if not isinstance(item, dict) or not str(item.get("text") or "").strip():
                continue
            clear = item.get("clear") is not False and str(item.get("clear")).lower() != "false"
            step_checks.append(StepCheck(number=str(item.get("number") or len(step_checks) + 1).strip(),
                                         text=str(item["text"]).strip(), clear=clear,
                                         issue="" if clear else str(item.get("issue") or "").strip()))
        review["step_checks"] = step_checks[:30]
        for flag in ("overview_present", "steps_listed", "trigger_defined", "activities_identified", "roles_specified",
                     "resources_identified", "outcome_defined", "actor_assignments_clear"):
            review[flag] = str(review.get(flag)).strip().lower() == "true"
        review["questions"] = _structured_questions(review.get("questions"), review)
        review["suggestions"] = _structural_suggestions(review)
        try:
            review["activity_count"] = max(0, int(review.get("activity_count") or 0))
        except (TypeError, ValueError):
            review["activity_count"] = 0
        return PromptReviewResponse.parse_obj(review)
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Groq API returned an invalid response: {str(exc)[:160]}",
        ) from exc


@app.post("/assistant-chat", response_model=AssistantChatResponse)
def assistant_chat(input: AssistantChatRequest) -> AssistantChatResponse:
    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        raise HTTPException(status_code=503, detail="Set GROQ_API_KEY in .env.")

    diagram_context = "No diagram is open yet."
    if input.current_model:
        diagram_context = json.dumps(input.current_model, ensure_ascii=False)[:16000]

    system_prompt = f"""You are an auxiliary AI assistant in Prompt2Flow, an app for creating business processes.
Help the user think through steps, roles, decisions, risks and a clear process description. Answer in English, briefly and to the point. If the request is unclear, ask one concrete question. Do not claim that you changed or saved the diagram — you only give advice in this chat.

Process description in the editor:
{input.process_description or "(empty so far)"}

Current diagram:
{diagram_context}"""

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend({"role": turn.role, "content": turn.content} for turn in input.messages[-16:])

    try:
        response = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "max_completion_tokens": 1200,
                "temperature": 0.5,
            },
            timeout=90,
        )
        response.raise_for_status()
        choices = response.json().get("choices", [])
        if not choices:
            raise ValueError("Groq API returned no response.")
        reply = choices[0].get("message", {}).get("content", "").strip()
        if not reply:
            raise ValueError("Groq API returned an empty response.")
        return AssistantChatResponse(reply=reply)
    except requests.exceptions.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Groq API is unavailable: {exc.response.text[:400] if exc.response is not None else str(exc)[:160]}") from exc
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail=f"The assistant returned an invalid response: {str(exc)[:160]}") from exc


@app.post("/catalog", response_model=dict)
def save_to_catalog(payload: CatalogSaveRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    category = payload.category if payload.category in PREDEFINED_CATEGORIES else DEFAULT_CATEGORY

    with get_db() as conn:
        cursor = get_cursor(conn)

        if USE_POSTGRES:
            cursor.execute(
                f"""
                INSERT INTO processes
                (user_id, title, prompt, min_nodes, max_nodes, final_node_count, model_json, is_public, category, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (user_id, payload.title, payload.prompt, payload.min_nodes, payload.max_nodes, payload.final_node_count,
                 json.dumps(payload.model_json), payload.is_public, category, datetime.now(timezone.utc).isoformat())
            )
            inserted_id = cursor.fetchone()["id"]
        else:
            cursor.execute(
                f"""
                INSERT INTO processes
                (user_id, title, prompt, min_nodes, max_nodes, final_node_count, model_json, is_public, category, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, payload.title, payload.prompt, payload.min_nodes, payload.max_nodes, payload.final_node_count,
                 json.dumps(payload.model_json), payload.is_public, category, datetime.now(timezone.utc).isoformat())
            )
            inserted_id = cursor.lastrowid

        conn.commit()
    return {"id": inserted_id, "success": True, "category": category}


@app.get("/catalog", response_model=List[dict])
def list_catalog(q: str = Query(None, description="Full-text search"),
                 category: str = Query(None, description="Filter by category"),
                 current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    admin_env = os.getenv("ADMIN_USER")
    is_admin = admin_env and current_user["username"] == admin_env

    with get_db() as conn:
        cursor = get_cursor(conn)

        if is_admin:
            conditions = ["1=1"]
            params = []
        else:
            conditions = [f"p.user_id = {PARAM_MARKER}"]
            params = [user_id]

        if q:
            like = f"%{q}%"
            conditions.append(
                f"(p.title LIKE {PARAM_MARKER} OR p.prompt LIKE {PARAM_MARKER} OR p.model_json LIKE {PARAM_MARKER})")
            params.extend([like, like, like])

        if category and category not in ALL_CATEGORIES_FILTER:
            conditions.append(f"p.category = {PARAM_MARKER}")
            params.append(category)

        where_clause = " AND ".join(conditions)

        cursor.execute(f'''
            SELECT p.id, p.title, p.prompt, p.min_nodes, p.max_nodes, p.final_node_count, p.is_public, p.category, p.created_at, p.model_json, u.username
            FROM processes p
            JOIN users u ON p.user_id = u.id
            WHERE {where_clause} ORDER BY p.id DESC
        ''', params)

        rows = cursor.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["owner"] = r["username"]

            if not r.get("category"):
                r["category"] = DEFAULT_CATEGORY

            if isinstance(r.get("model_json"), str):
                try:
                    r["model_json"] = json.loads(r["model_json"])
                except Exception:
                    r["model_json"] = {"nodes": [], "edges": []}
            result.append(r)

    return result


@app.get("/catalog/{process_id}", response_model=dict)
def get_process(process_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    admin_env = os.getenv("ADMIN_USER")
    is_admin = admin_env and current_user["username"] == admin_env

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f'''
            SELECT p.*, u.username
            FROM processes p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = {PARAM_MARKER}
        ''', (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Process {process_id} does not exist")

        if not is_admin and row["user_id"] != user_id and not row["is_public"]:
            raise HTTPException(status_code=403, detail="You do not have access to this diagram")

        result = dict(row)
        result["model_json"] = json.loads(result["model_json"])
        result["owner"] = result["username"]

        if not result.get("category"):
            result["category"] = DEFAULT_CATEGORY

    return result


@app.delete("/catalog/{process_id}", response_model=dict)
def delete_process(process_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT user_id FROM processes WHERE id = {PARAM_MARKER}", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Process #{process_id} does not exist")

        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="You can only delete your own diagrams")

        cursor.execute(f"DELETE FROM processes WHERE id = {PARAM_MARKER}", (process_id,))
        conn.commit()
    return {"success": True, "deleted_id": process_id}


@app.patch("/catalog/{process_id}/visibility")
def update_visibility(process_id: int, payload: VisibilityUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    admin_env = os.getenv("ADMIN_USER")
    is_admin = admin_env and current_user["username"] == admin_env

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT user_id FROM processes WHERE id = {PARAM_MARKER}", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Process does not exist")

        if not is_admin and row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="You can only edit your own diagrams")

        is_pub = payload.is_public if USE_POSTGRES else (1 if payload.is_public else 0)

        cursor.execute(f"UPDATE processes SET is_public = {PARAM_MARKER} WHERE id = {PARAM_MARKER}",
                       (is_pub, process_id))
        conn.commit()

    return {"success": True, "is_public": payload.is_public}


def edit_diagram_with_ai(instruction: str, current_model: dict) -> ProcessModel:
    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Set GROQ_API_KEY in .env")

    current_json = json.dumps(current_model, ensure_ascii=False, indent=2)

    prompt = f"""You have an existing JSON diagram of a business process. The user wants to make a change.
Your ONLY task is to return the modified JSON and ABSOLUTELY NO OTHER TEXT.

EXISTING DIAGRAM:
{current_json}

USER REQUEST:
{instruction}

RULES (MUST BE FOLLOWED STRICTLY):
1. Return the COMPLETE JSON object in the SAME format as the input (keys: "nodes" and "edges").
2. KEEP all original IDs of nodes and edges that do NOT change.
3. KEEP all original values: duration_minutes, cost_euros, actor – unless you change them explicitly.
4. Add/modify/delete ONLY what the user asks for.
5. New nodes get IDs with the prefix "n" (e.g. nt1, nt2) and new edges "ne1", "ne2", etc.
6. Every gateway must have at least 2 outgoing edges with a filled-in label.
7. The last element of a list MUST NOT be followed by a comma!
8. Return ONLY valid JSON without any text before or after it.
9. Write all new and changed labels, conditions and roles in English, even if the user's request is written in another language.

RULES FOR CARRYING OUT THE REQUEST PRECISELY:
10. First identify the target node by its name (label); do not change another node just because it has a similar name.
11. For a request "after node X add Y", insert the new node Y directly after X: remove the original edge X -> N and create X -> Y and Y -> N. Keep the original node N and its other connections.
12. If the user says "connect to the next step in the existing process", connect the new node into the original flow at the right place; do not create a new disconnected branch or a new end node.
13. When adding a node, carry over exactly the given name, role/actor, duration and cost. Write the duration into duration_minutes as a number of minutes (e.g. 1 minute = 1); write the cost into cost_euros as a number in EUR (e.g. €0.50 = 0.5).
14. If the target node or connection is ambiguous, keep the diagram and make no unfounded changes.
15. Check that all original nodes and their original connections stayed intact, except the edges that had to be reconnected because of the requested change.
16. For every task node without a cost (including new nodes) estimate cost_euros. Use a realistic approximate estimate in EUR based on the activity and role; if the activity has no direct cost, set 0.0. Always keep existing cost_euros unless the user explicitly asks to change them.
"""

    try:
        resp = groq_post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a JSON editor. You output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "max_completion_tokens": 8192,
                "temperature": 0.0,
                "response_format": {"type": "json_object"},
                "reasoning_format": "hidden",
            },
            timeout=90,
        )
        resp.raise_for_status()
        data = resp.json()

        # ── ROBUST response parsing (same as in generate_diagram_from_text) ──
        choices = data.get("choices", [])
        if not choices:
            raise ValueError("Groq returned no choices")

        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message", {})
            content = message.get("content", "") if isinstance(message, dict) else str(message)
        else:
            content = str(first)

        content = content.strip()

        if content.startswith("```"):
            lines = content.split('\n')
            lines = lines[1:] if len(lines) > 0 and lines[0].startswith("```") else lines
            lines = lines[:-1] if len(lines) > 0 and lines[-1].startswith("```") else lines
            content = '\n'.join(lines).strip()

        try:
            diagram = json.loads(content)
        except json.JSONDecodeError:
            start_idx = content.find('{')
            end_idx = content.rfind('}') + 1
            if start_idx != -1 and end_idx > start_idx:
                diagram = json.loads(content[start_idx:end_idx])
            else:
                raise ValueError("Groq returned invalid JSON")

        if isinstance(diagram, list):
            diagram = diagram[0] if len(diagram) > 0 and isinstance(diagram[0], dict) else {}

        if not isinstance(diagram, dict):
            raise ValueError(f"Unexpected response type: {type(diagram)}")

        # ── Map of original nodes (dict items only) ──
        original_nodes_map = {
            n["id"]: n
            for n in current_model.get("nodes", [])
            if isinstance(n, dict) and "id" in n
        }

        # ── Process nodes (nodes may also arrive as a dict instead of a list) ──
        raw_nodes = diagram.get("nodes", [])
        if not isinstance(raw_nodes, list):
            raw_nodes = list(raw_nodes.values()) if isinstance(raw_nodes, dict) else []

        nodes = []
        node_ids = set()
        for n in raw_nodes:
            if not isinstance(n, dict):
                continue
            nid = str(n.get("id", f"node_{len(nodes)}"))
            orig = original_nodes_map.get(nid, {})
            nodes.append(Node(
                id=nid,
                type=str(n.get("type", "task")),
                label=str(n.get("label", "Unknown task")),
                actor=n.get("actor") or orig.get("actor"),
                duration_minutes=n.get("duration_minutes") if n.get("duration_minutes") is not None else orig.get(
                    "duration_minutes"),
                cost_euros=n.get("cost_euros") if n.get("cost_euros") is not None else orig.get("cost_euros"),
            ))
            node_ids.add(nid)

        # ── Process edges (edges may also arrive as a dict instead of a list) ──
        raw_edges = diagram.get("edges", [])
        if not isinstance(raw_edges, list):
            raw_edges = list(raw_edges.values()) if isinstance(raw_edges, dict) else []

        edges = []
        for e in raw_edges:
            if not isinstance(e, dict):
                continue
            src = str(e.get("source", ""))
            tgt = str(e.get("target", ""))
            if src in node_ids and tgt in node_ids:
                edges.append(Edge(
                    id=str(e.get("id", f"edge_{len(edges)}")),
                    source=src,
                    target=tgt,
                    label=e.get("label"),
                ))

        return ProcessModel(nodes=nodes, edges=edges)

    except Exception as exc:
        print(f"Copilot error: {exc}")
        return dummy_model(f"Copilot error: {str(exc)[:40]}")


@app.post("/edit-model", response_model=ProcessModel)
def edit_model(input: EditModelRequest) -> ProcessModel:
    return edit_diagram_with_ai(input.instruction, input.current_model)


@app.get("/public-catalog", response_model=List[dict])
def list_public_catalog(
        q: str = Query("", description="Full-text search"),
        category: str = Query("", description="Filter by category"),
):
    with get_db() as conn:
        cursor = get_cursor(conn)

        # Postgres uses booleans, SQLite uses 1/0
        is_pub_cond = "p.is_public = TRUE" if USE_POSTGRES else "p.is_public = 1"
        conditions = [is_pub_cond]
        params = []

        if q:
            like = f"%{q}%"
            conditions.append(
                f"(p.title LIKE {PARAM_MARKER} OR p.prompt LIKE {PARAM_MARKER} OR p.model_json LIKE {PARAM_MARKER})")
            params.extend([like, like, like])

        if category and category not in ALL_CATEGORIES_FILTER:
            conditions.append(f"p.category = {PARAM_MARKER}")
            params.append(category)

        where_clause = " AND ".join(conditions)
        cursor.execute(
            f"""
            SELECT p.id, p.title, p.prompt, p.min_nodes, p.max_nodes,
                   p.final_node_count, p.created_at, p.category, p.model_json,
                   u.username
            FROM processes p
            JOIN users u ON p.user_id = u.id
            WHERE {where_clause}
            ORDER BY p.id DESC
            """,
            params
        )

        rows = cursor.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["is_public"] = True
            r["owner"] = r["username"]
            if not r.get("category"):
                r["category"] = DEFAULT_CATEGORY
            if isinstance(r.get("model_json"), str):
                try:
                    r["model_json"] = json.loads(r["model_json"])
                except Exception:
                    r["model_json"] = {"nodes": [], "edges": []}
            result.append(r)

        return result
