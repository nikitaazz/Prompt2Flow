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

print(">>> Nacitavam main.py (so zabezpecenim + kategoriami + Postgres/SQLite podpora)")

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

# ─── KATEGÓRIE ────────────────────────────────────────────────
PREDEFINED_CATEGORIES = [
  "Financie",
  "Hospodárstvo",
  "HR",
  "IT",
  "Marketing",
  "Operácie",
  "Právo",
  "Služby",
  "Školstvo",
  "Šport",
  "Územné celky",
  "Zákaznícky servis",
  "Zdravotníctvo",
  "Iné",
]

# ─── BEZPEČNOSŤ ───────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("❌ JWT_SECRET_KEY nie je nastavený v .env!")
ALGORITHM = "HS256"



# ─── PYDANTIC MODELY ──────────────────────────────────────────
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


class PromptReviewResponse(BaseModel):
    overall_review: str
    structure_ok: bool
    overview_present: bool
    steps_ordered: bool
    actors_listed: bool
    structure_feedback: str
    actor_assignments_clear: bool
    unclear_tasks: List[str]
    suggestions: List[str]
    activity_count: int = 0
    questions: List[ReviewQuestion] = []


class DiagramAccuracyRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=12000)
    model: dict


class AccuracyRequirement(BaseModel):
    text: str
    category: str = "krok"
    importance: int = Field(2, ge=1, le=3)
    status: Literal["splnene", "ciastocne", "chyba"] = "chyba"
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
    kind: str = "nástroj"
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
    category: str = "Iné"


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
    print("✅ Používam PostgreSQL")
else:
    import sqlite3

    USE_POSTGRES = False
    DB_PATH = "process_catalog.db"
    print("⚠️ DATABASE_URL nie je v .env. Používam lokálne SQLite.")

# Pomocné premenné na riešenie rozdielov v syntaxi (Postgres %s, SQLite ?)
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
            category VARCHAR(255) DEFAULT 'Iné',
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
            category TEXT DEFAULT 'Iné',
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """)
        try:
            cursor.execute("ALTER TABLE processes ADD COLUMN category TEXT DEFAULT 'Iné'")
            print("✅ Migrácia: stĺpec 'category' pridaný")
        except sqlite3.OperationalError:
            pass

    conn.commit()
    cursor.close()
    conn.close()
    print("✅ Databáza inicializovaná")


from contextlib import contextmanager

@contextmanager
def get_db():
    if DB_URL:  # ← DB_URL, nie DATABASE_URL
        conn = psycopg2.connect(DB_URL)  # ← DB_URL
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
        return conn.cursor(cursor_factory=RealDictCursor)  # ← RealDictCursor musí byť tu
    else:
        return conn.cursor()


# ─── AUTH POMOCNÉ FUNKCIE ─────────────────────────────────────
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
        detail="Neplatný token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        username: str = payload.get("username")
        if user_id is None or username is None:
            raise credentials_exception
    except jwt.PyJWTError as e:
        print(f"Chyba dekódovania tokenu: {e}")
        raise credentials_exception
    return {"user_id": user_id, "username": username}


# ─── GROQ ─────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"


def generate_diagram_from_text(description: str, min_nodes: int, max_nodes: int,
                               include_kpi: bool = False) -> ProcessModel:
    print(f"🎯 PROMPT: {description[:50]}... | Uzlov: {min_nodes} - {max_nodes}")

    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Nastav GROQ_API_KEY v .env")

    kpi_instruction = """6. Každý uzol typu task MUSÍ obsahovať polia:
       - duration_minutes (celé číslo, odhadovaný čas v MINÚTACH)
         Príklady: 30 = 30 minút, 480 = 1 pracovný deň, 2400 = 1 týždeň, 10080 = 1 mesiac
       - cost_euros (desatinné číslo, odhadované náklady v EUR)""" if include_kpi else ""

    # Model najprv vypíše všetky činnosti zo zadania ("activities") a každý krok uvedie, ktoré pokrýva
    # ("covers"). Backend potom overí, že sa žiadna činnosť nestratila (viď _missing_activities).
    prompt = f"""
Vytvor JSON model business procesu. Tvojou JEDINOU úlohou je vrátiť syntakticky správny a validný JSON a ABSOLÚTNE ŽIADEN INÝ TEXT.

Štruktúra, ktorú musíš striktne dodržať:
{{
  "activities": [
    {{"n": 1, "text": "Činnosť zo zadania", "actor": "Rola"}},
    {{"n": 2, "text": "Ďalšia činnosť", "actor": "Rola"}}
  ],
  "nodes": [
    {{"id": "start", "type": "startEvent", "label": "Začiatok procesu"}},
    {{"id": "t1", "type": "task", "label": "Názov úlohy", "actor": "Rola", "covers": [1]}},
    {{"id": "gw1", "type": "gateway", "label": "Rozhodnutie?", "actor": "Rola"}},
    {{"id": "t2", "type": "task", "label": "Názov úlohy", "actor": "Rola", "covers": [2]}},
    {{"id": "end", "type": "endEvent", "label": "Koniec procesu"}}
  ],
  "edges": [
    {{"id": "e1", "source": "start", "target": "t1"}},
    {{"id": "e2", "source": "t1", "target": "gw1"}},
    {{"id": "e3", "source": "gw1", "target": "t2", "label": "Áno"}},
    {{"id": "e4", "source": "gw1", "target": "t1", "label": "Nie"}},
    {{"id": "e5", "source": "t2", "target": "end"}}
  ]
}}

POSTUP:
A. Do "activities" vypíš VŠETKY činnosti zo zadania v poradí, v akom idú. Každá činnosť samostatne – aj keď je ich viac v jednej vete
   (napr. „narežie drevo, zlepí a obrúsi dosku“ = 3 činnosti). Nič nevynechaj a nevymýšľaj. Rozhodnutia („schváli alebo zamietne“, „ak…“) sú tiež činnosti.
B. Potom vytvor uzly. KAŽDÁ činnosť z "activities" musí byť pokrytá uzlom typu "task" (pole "covers" = čísla činností "n").
   - Ak niekto podľa zadania aktívne rozhoduje („manažér schváli alebo zamietne“), je to "task" (rozhodovanie) a za ním "gateway" s vetvami.
   - Ak ide iba o podmienku („ak tovar nie je na sklade…“), daj "gateway" hneď za krok, ktorý podmienku zisťuje – NEPRIDÁVAJ ďalší task typu „rozhodnutie“.
   - "label" gateway je konkrétna otázka z kontextu (napr. „Je tovar na sklade?“), nikdy len „Rozhodnutie?“.
C. Počet uzlov typu "task" MUSÍ byť v rozsahu {min_nodes} až {max_nodes} (používateľ si ho nastavil):
   - Ak je činností viac ako {max_nodes}, zlúč činnosti, ktoré robí TÁ ISTÁ rola bezprostredne po sebe (názov uzla musí obsahovať obe, napr. „Príprava a zverejnenie inzerátu“).
     Ani pri zlučovaní žiadnu činnosť nevynechaj. Činnosti rôznych rolí NIKDY nezlučuj – každý uzol má práve jednu rolu (žiadne „Právnik/IT“).
     Iba ak sa do {max_nodes} nedá zmestiť bez zlúčenia rôznych rolí, prekroč maximum o čo najmenej uzlov.
   - Ak je činností menej ako {min_nodes}, rozdeľ činnosti na ich prirodzené podkroky, ktoré priamo vyplývajú z textu
     (napr. „pripraví a odošle zmluvu“ → 2 kroky). NEVYMÝŠĽAJ nové činnosti, ktoré zadanie nespomína – radšej vytvor menej uzlov.

PRESNOSŤ (najdôležitejšie):
- Diagram musí verne zodpovedať zadaniu: rovnaké činnosti, rovnaké poradie, rovnaké podmienky rozhodnutí. Nič nepridávaj ani neuberaj.
- Názvy krokov formuluj zo slov zadania (to isté sloveso a predmet), stručne ako pomenovanie činnosti s veľkým začiatočným
  písmenom (napr. „Kontrola dostupnosti tovaru“, „Odoslanie tovaru zákazníkovi“). Nemeň ich význam. Píš so slovenskou diakritikou.
- "actor" smie byť IBA rola, ktorá je v zadaní výslovne uvedená (alebo jednoznačne vyplýva z vety, napr. podmet predchádzajúcej vety).
  NIKDY nevymýšľaj nové roly ani oddelenia. Ak zadanie nehovorí, kto činnosť robí, nastav "actor": null.
- Gateway má rolu toho, kto podľa zadania rozhoduje; ak to zadanie neuvádza, "actor": null.
- Vetvy rozhodnutí podľa zadania. Ak zadanie neuvádza, čo sa stane v niektorej vetve, napoj ju na koncový uzol – nevymýšľaj ďalšie kroky.
- Riadky začínajúce „Upresnenie:“ sú odpovede používateľa na otázky – majú prednosť pred zvyškom textu.

PRAVIDLÁ:
1. MUSÍ to byť len JSON objekt.
2. Každý uzol typu "gateway" MUSÍ mať aspoň 2 odchádzajúce hrany.
3. KAŽDÁ hrana vychádzajúca z uzla typu "gateway" MUSÍ mať vyplnené pole "label" s konkrétnou podmienkou zodpovedajúcou kontextu procesu (napr. "Áno"/"Nie", "Schválené"/"Zamietnuté"). Nikdy nepoužívaj generické "Možnosť 1" / "Možnosť 2".
4. Hrany medzi bežnými "task" uzlami label nepotrebujú. Zachovaj poradie činností zo zadania.
5. Posledný element v zoznamoch (nodes, edges) NESMIE mať za sebou čiarku!
{kpi_instruction}

Zadanie procesu:
{description}
"""

    try:
        resp = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a JSON generator. You output only valid JSON."},
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

        choices = data.get("choices", [])
        if not choices:
            raise ValueError("Groq nevrátil žiadne choices")

        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message", {})
            content = message.get("content", "") if isinstance(message, dict) else str(message)
        else:
            content = str(first)

        content = content.strip()

        if content.startswith("```"):
            lines = content.split('\n')
            if lines.startswith("```"):  # OPRAVENÉ Z lines.startswith
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            content = '\n'.join(lines).strip()

        try:
            diagram = json.loads(content)
        except json.JSONDecodeError as e:
            start_idx = content.find('{')
            end_idx = content.rfind('}') + 1
            if start_idx != -1 and end_idx != 0 and start_idx < end_idx:
                content = content[start_idx:end_idx]
                diagram = json.loads(content)
            else:
                raise e

        if isinstance(diagram, list):
            if len(diagram) > 0 and isinstance(diagram[0], dict):
                diagram = diagram[0]
            else:
                raise ValueError("AI vrátilo list namiesto JSON objektu")

        if not isinstance(diagram, dict):
            raise ValueError(f"Neočakávaný typ odpovede: {type(diagram)}")

        nodes = []
        node_ids = set()
        raw_nodes = diagram.get("nodes", [])
        if not isinstance(raw_nodes, list):
            raw_nodes = list(raw_nodes.values()) if isinstance(raw_nodes, dict) else []

        for n in raw_nodes:
            if not isinstance(n, dict): continue
            node_id = str(n.get("id", f"node_{len(nodes)}"))
            nodes.append(Node(
                id=node_id,
                type=str(n.get("type", "task")),
                label=str(n.get("label", "Neznáma úloha")),
                actor=n.get("actor"),
                duration_minutes=n.get("durationminutes") or n.get("duration_minutes"),
                cost_euros=n.get("costeuros") or n.get("cost_euros"),
            ))
            node_ids.add(node_id)

        edges = []
        raw_edges = diagram.get("edges", [])
        if not isinstance(raw_edges, list):
            raw_edges = list(raw_edges.values()) if isinstance(raw_edges, dict) else []

        for e in raw_edges:
            if not isinstance(e, dict): continue
            source = str(e.get("source", ""))
            target = str(e.get("target", ""))
            if source in node_ids and target in node_ids:
                edges.append(Edge(
                    id=str(e.get("id", f"edge_{len(edges)}")),
                    source=source,
                    target=target,
                    label=e.get("label")
                ))

        model = ProcessModel(nodes=nodes, edges=edges)
        missing, multi_role = _coverage_problems(diagram, raw_nodes)
        if missing or multi_role:
            # Jeden pokus o doplnenie cez editor diagramu; ak zlyhá, vrátime pôvodný model
            print(f"🔁 Doplnenie diagramu: chýba {len(missing)} činností, {len(multi_role)} uzlov s viacerými rolami")
            instruction = _repair_instruction(diagram, missing, multi_role, include_kpi)
            current = model.model_dump() if hasattr(model, "model_dump") else model.dict()
            repaired = edit_diagram_with_ai(instruction, current)
            if not any(n.label == "Chyba AI" for n in repaired.nodes) and len(repaired.nodes) >= len(model.nodes):
                model = repaired
        return _ground_actors(model, description)

    except Exception as exc:
        print(f"💥 CHYBA: {exc}")
        return dummy_model(f"Chyba: {str(exc)[:40]}")


def _actor_in_text(actor: str, text_ascii: str) -> bool:
    """Rola je v zadaní, ak sa v texte nájde začiatok (5 znakov) každého jej slova – zvládne aj skloňovanie."""
    words = [w for w in re.findall(r"[a-z0-9]+", _ascii(actor)) if len(w) >= 2]
    return bool(words) and all(re.search(r"\b" + re.escape(w[:5]), text_ascii) for w in words)


def _ground_actors(model: ProcessModel, description: str) -> ProcessModel:
    """AI nesmie vymýšľať roly: rolu, ktorá v zadaní nie je, odstránime (krok pôjde do dráhy „Bez roly“)."""
    text_ascii = _ascii(description)
    invented = sorted({n.actor for n in model.nodes if n.actor and not _actor_in_text(n.actor, text_ascii)})
    if invented:
        print(f"🧹 Odstránené vymyslené roly: {', '.join(invented)}")
    nodes = [n.copy(update={"actor": None}) if n.actor in invented else n for n in model.nodes]
    return ProcessModel(nodes=nodes, edges=model.edges)


def _coverage_problems(diagram: dict, raw_nodes: list):
    """Činnosti zo zadania, ktoré žiadny krok nepokrýva, a kroky zlúčené pre viac rolí naraz."""
    activities = [a for a in (diagram.get("activities") or []) if isinstance(a, dict) and str(a.get("text", "")).strip()]
    tasks = [n for n in raw_nodes if isinstance(n, dict) and n.get("type", "task") == "task"]
    covered = set()
    reporting = 0
    for n in tasks:
        values = n.get("covers") if isinstance(n.get("covers"), list) else []
        reporting += bool(values)
        for value in values:
            try:
                covered.add(int(value))
            except (TypeError, ValueError):
                pass
    missing = []
    # Bez spoľahlivého "covers" (aspoň polovica krokov) nevieme pokrytie posúdiť – radšej nič nedopĺňame
    if activities and tasks and reporting * 2 >= len(tasks):
        for index, activity in enumerate(activities, start=1):
            try:
                number = int(activity.get("n", index))
            except (TypeError, ValueError):
                number = index
            if number not in covered:
                missing.append(activity)
    multi_role = [n for n in tasks if re.search(r"[/,;]", str(n.get("actor") or ""))]
    return missing, multi_role


def _repair_instruction(diagram: dict, missing: list, multi_role: list, include_kpi: bool) -> str:
    activities = [a for a in (diagram.get("activities") or []) if isinstance(a, dict)]
    order = "\n".join(f'{a.get("n", i)}. {a.get("text")} (rola: {a.get("actor") or "neuvedená"})'
                      for i, a in enumerate(activities, start=1))
    parts = []
    if missing:
        listed = "\n".join(f'- „{a.get("text")}“ (rola: {a.get("actor") or "neuvedená"})' for a in missing)
        parts.append("Diagram nepokrýva tieto činnosti zo zadania. Doplň KAŽDÚ ako samostatný krok (task) so zadanou rolou "
                     "a zaraď ju na správne miesto v toku podľa poradia v zadaní (prepoj s predchádzajúcim aj nasledujúcim krokom):\n"
                     + listed)
    if multi_role:
        listed = "\n".join(f'- „{n.get("label")}“ (role: {n.get("actor")})' for n in multi_role)
        parts.append("Tieto kroky majú viac rolí naraz. Rozdeľ každý na samostatné po sebe idúce kroky, jeden pre každú rolu, "
                     "a zachovaj ich napojenie v toku:\n" + listed)
    if include_kpi:
        parts.append("Pri všetkých nových krokoch odhadni duration_minutes aj cost_euros.")
    parts.append("Ostatné kroky, rozhodnutia a prepojenia zachovaj. Poradie činností v zadaní je:\n" + order)
    return "\n\n".join(parts)


def dummy_model(msg: str) -> ProcessModel:
    return ProcessModel(
        nodes=[
            Node(id="start", type="startEvent", label="Chyba AI", actor=None),
            Node(id="end", type="endEvent", label=msg, actor=None),
        ],
        edges=[Edge(id="e1", source="start", target="end")],
    )


# ─── STARTUP ──────────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    init_db()


# ─── ENDPOINTY ────────────────────────────────────────────────
@app.get("/categories")
def get_categories():
    return {"categories": PREDEFINED_CATEGORIES}


@app.get("/")
def read_root():
    return {"message": "API beží"}


@app.post("/register")
def register_user(user: UserRegister):
    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(
            f"SELECT id FROM users WHERE username = {PARAM_MARKER}",
            (user.username,)
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Používateľské meno už existuje")
        hashed_pw = get_password_hash(user.password)
        cursor.execute(
            f"INSERT INTO users (username, hashed_password, created_at) VALUES ({PARAM_MARKER}, {PARAM_MARKER}, {PARAM_MARKER})",
            (user.username, hashed_pw, datetime.now(timezone.utc).isoformat())
        )
        # ← NEvolaj conn.commit() tu, get_db() ho volá automaticky
    return {"success": True, "message": "Účet vytvorený. Môžeš sa prihlásiť."}


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
            raise HTTPException(status_code=401, detail="Nesprávne meno alebo heslo")
        access_token = create_access_token(data={"sub": str(row["id"]), "username": row["username"]})
    return {"access_token": access_token, "token_type": "bearer", "username": row["username"]}

@app.post("/generate-model", response_model=ProcessModel)
def generate_model(input: TextInput) -> ProcessModel:
    return generate_diagram_from_text(input.description, input.min_nodes, input.max_nodes, input.include_kpi)


def groq_json(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.0,
              reasoning_effort: str = "medium") -> dict:
    """Zavolá Groq s JSON výstupom a vráti rozparsovaný objekt (chyby mapuje na HTTPException).
    Pri krátkom limite Groq (429 s čakaním do 12 s) počká a skúsi to ešte raz."""
    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        raise HTTPException(status_code=503, detail="Nastav GROQ_API_KEY v .env.")
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
            raise ValueError("Groq nevrátil žiadnu odpoveď")
        result = json.loads(choices[0].get("message", {}).get("content", ""))
        if not isinstance(result, dict):
            raise ValueError("Groq nevrátil JSON objekt")
        return result
    except requests.exceptions.RequestException as exc:
        if exc.response is not None and exc.response.status_code == 429:
            wait = re.search(r"try again in ([\d.]+)s", exc.response.text)
            hint = f" Skús to znova o {round(float(wait.group(1))) + 1} s." if wait else " Skús to znova o chvíľu."
            raise HTTPException(status_code=429, detail="AI je práve vyťažená (limit Groq API)." + hint) from exc
        detail = exc.response.text[:400] if exc.response is not None else str(exc)[:160]
        raise HTTPException(status_code=503, detail=f"Groq API nie je dostupné: {detail}") from exc
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail=f"Groq vrátil neplatnú odpoveď: {str(exc)[:200]}") from exc


EVENT_NODE_TYPES = {"startEvent", "endEvent"}


def describe_process_model(model: dict) -> str:
    """Deterministický textový opis diagramu: kroky v poradí toku, roly a vetvy s podmienkami."""
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
            return "ZAČIATOK"
        if node_type == "endEvent":
            return "KONIEC"
        return f'krok {numbers[nid]} „{by_id[nid].get("label", "")}“'

    lines = []
    for nid in order:
        node = by_id[nid]
        node_type = node.get("type") or "task"
        if node_type == "endEvent":
            continue
        if node_type == "startEvent":
            head = "ZAČIATOK"
        else:
            kind = "Rozhodnutie" if node_type == "gateway" or len(outgoing[nid]) > 1 else "Krok"
            head = f'{kind} {numbers[nid]}: „{node.get("label", "")}“ (rola: {node.get("actor") or "neuvedená"})'
        targets = [name(target) + (f" [podmienka: {label}]" if label else "") for target, label in outgoing[nid]]
        lines.append(f"{head} → " + ("; ".join(targets) if targets else "(nepokračuje)"))
    return "\n".join(lines) or "(prázdny diagram)"


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().strip().lower()


ACCURACY_STATUS_SCORE = {"splnene": 1.0, "ciastocne": 0.5, "chyba": 0.0}
ACCURACY_CATEGORIES = {"krok", "akter", "rozhodnutie", "poradie", "vysledok"}


@app.post("/evaluate-model", response_model=DiagramAccuracyResponse)
def evaluate_generated_model(input: DiagramAccuracyRequest) -> DiagramAccuracyResponse:
    """Rozloží zadanie na požiadavky, AI posúdi každú zvlášť a skóre sa dopočíta deterministicky."""
    diagram_text = describe_process_model(input.model)
    evaluation_prompt = f"""Porovnávaš PÔVODNÉ ZADANIE používateľa s OBSAHOM PROCESNÉHO DIAGRAMU.

Postup:
1. Rozlož pôvodné zadanie na 4 až 20 atomických požiadaviek. Každá je jedna overiteľná vec, ktorú zadanie VÝSLOVNE uvádza. Kategórie:
   - "krok": činnosť, ktorá sa má v procese vykonať,
   - "akter": kto konkrétnu činnosť vykonáva (len ak to zadanie uvádza),
   - "rozhodnutie": rozhodovanie/vetvenie a jeho vetvy alebo podmienky,
   - "poradie": dôležitá postupnosť (X nasleduje po Y),
   - "vysledok": ako proces končí.
   Nevymýšľaj požiadavky. Nezaraďuj samozrejmosti (začiatok a koniec procesu, čas, náklady, KPI, grafické rozloženie).
2. importance: 3 = jadro procesu, 2 = dôležitý detail, 1 = drobnosť.
3. Pre každú požiadavku urči status podľa diagramu:
   - "splnene": diagram ju obsahuje (iná formulácia či synonymá sú v poriadku; jeden krok môže pokryť viac požiadaviek a naopak),
   - "ciastocne": len čiastočne (krok je, ale vykonáva ho iná rola; vetva existuje, ale bez podmienky; poradie je mierne iné),
   - "chyba": v diagrame nie je.
   Ak rozhodnutie nemá rolu, ale bezprostredne predchádzajúci krok vykonáva požadovaná rola, ber rolu ako splnenú.
   evidence: krátko uveď krok diagramu, ktorý to dokladá, alebo prečo to chýba.
4. extra: najviac 5 krokov diagramu, ktoré zadanie nežiada a nie sú ani rozumným rozpísaním požadovaného kroku. Skóre neznižujú.
5. summary: 1–2 vety – čo diagram vystihol a čo podstatné chýba.

Odpovedaj po slovensky a vráť iba JSON:
{{
  "requirements": [{{"text": "...", "category": "krok", "importance": 3, "status": "splnene", "evidence": "..."}}],
  "extra": ["..."],
  "summary": "..."
}}

PÔVODNÉ ZADANIE:
{input.description}

DIAGRAM (kroky v poradí toku):
{diagram_text}
"""
    result = groq_json("You evaluate process diagrams against requirements and return only valid JSON.",
                       evaluation_prompt, max_tokens=3000)

    requirements = []
    for raw in result.get("requirements") or []:
        if not isinstance(raw, dict) or not str(raw.get("text", "")).strip():
            continue
        status_value = _ascii(raw.get("status"))
        status_value = status_value if status_value in ACCURACY_STATUS_SCORE else "chyba"
        category = _ascii(raw.get("category"))
        try:
            importance = min(3, max(1, int(raw.get("importance", 2))))
        except (TypeError, ValueError):
            importance = 2
        requirements.append(AccuracyRequirement(
            text=str(raw["text"]).strip(),
            category=category if category in ACCURACY_CATEGORIES else "krok",
            importance=importance,
            status=status_value,
            evidence=str(raw.get("evidence") or "").strip(),
        ))
    if not requirements:
        raise HTTPException(status_code=502, detail="AI nevrátila žiadne požiadavky na porovnanie.")

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
        matches=[r.text for r in requirements if r.status == "splnene"],
        missing=[r.text + (" (čiastočne)" if r.status == "ciastocne" else "") for r in requirements if r.status != "splnene"],
        extra=[str(x).strip() for x in (result.get("extra") or []) if str(x).strip()][:5],
        requirements=requirements,
        category_scores=category_scores,
    )


TOOL_KINDS = ["stroj", "zariadenie", "nástroj", "softvér", "materiál"]


@app.post("/process-resources", response_model=ProcessResourcesResponse)
def process_resources(input: ProcessResourcesRequest) -> ProcessResourcesResponse:
    """Odhad potrebných špecialistov a strojov/nástrojov pre kroky procesu."""
    diagram_text = describe_process_model(input.model)
    roles = sorted({str(n.get("actor")).strip() for n in (input.model.get("nodes") or [])
                    if isinstance(n, dict) and n.get("actor") and n.get("type") not in EVENT_NODE_TYPES})
    resources_prompt = f"""Analyzuj business proces a urči zdroje, ktoré potrebuje.

1. specialists: pre KAŽDÚ rolu z diagramu ({", ".join(roles) or "roly nie sú uvedené – odvoď ich z krokov"}) uveď:
   - "role": názov roly PRESNE ako v diagrame,
   - "qualification": potrebná kvalifikácia, odbornosť alebo zručnosti (1 veta),
   - "responsibilities": 1–3 hlavné zodpovednosti v tomto procese,
   - "steps": názvy krokov diagramu, ktoré rola vykonáva.
2. tools: stroje, zariadenia, nástroje, softvér a materiál, ktoré sa pri krokoch používajú alebo sú na ne realisticky potrebné (najviac 12). Pre každý:
   - "name" (po slovensky, napr. „Účtovný softvér“, nie anglicky), "kind" (jedno z: {", ".join(TOOL_KINDS)}), "purpose" (na čo slúži, 1 veta), "steps" (kroky diagramu).
   Počítač ako všeobecné vybavenie uveď najviac raz.
   Ak nástroj nie je v zadaní výslovne, odhadni bežné vybavenie pre danú činnosť, ale nevymýšľaj nesúvisiace veci.
3. summary: 1–2 vety o tom, aké ľudské a technické zdroje proces najviac zaťažuje.

Odpovedaj po slovensky a vráť iba JSON:
{{"summary": "...", "specialists": [{{"role": "...", "qualification": "...", "responsibilities": ["..."], "steps": ["..."]}}], "tools": [{{"name": "...", "kind": "softvér", "purpose": "...", "steps": ["..."]}}]}}

ZADANIE PROCESU:
{input.description or "(neuvedené)"}

DIAGRAM (kroky v poradí toku):
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
        kind = next((k for k in TOOL_KINDS if _ascii(k) == _ascii(t.get("kind"))), "nástroj")
        tools.append(ToolInfo(name=str(t["name"]).strip(), kind=kind, purpose=str(t.get("purpose") or "").strip(),
                              steps=str_list(t.get("steps"))))
    return ProcessResourcesResponse(summary=str(result.get("summary") or "").strip(),
                                    specialists=specialists, tools=tools[:12])


@app.post("/review-prompt", response_model=PromptReviewResponse)
def review_prompt(input: PromptReviewRequest) -> PromptReviewResponse:
    prompt = input.prompt.strip()
    if len(prompt) < 30:
        raise HTTPException(status_code=400, detail="Napíšte aspoň 30 znakov procesu, aby ho AI vedela skontrolovať.")

    # TODO: Add the remaining prompt quality checks when their requirements are defined.
    review_instructions = """Skontroluj zadanie business procesu a vráť iba jeden JSON objekt s poľami:
{
  "overall_review": "krátke celkové zhodnotenie po slovensky",
  "structure_ok": true,
  "overview_present": true,
  "steps_ordered": true,
  "actors_listed": true,
  "structure_feedback": "či je jasný prehľad procesu a zrozumiteľné poradie krokov",
  "actor_assignments_clear": false,
  "unclear_tasks": ["konkrétny krok, pri ktorom nie je jasný vykonávateľ"],
  "suggestions": ["konkrétne odporúčanie na doplnenie zadania"],
  "activity_count": 0,
  "questions": [
    {"question": "Kto schvaľuje faktúru?", "options": [
      {"label": "Manažér", "clarification": "Faktúru schvaľuje manažér."},
      {"label": "Účtovník", "clarification": "Faktúru schvaľuje účtovník."}
    ]}
  ]
}

Pravidlá kontroly:
1. Posúď, či zadanie obsahuje všeobecný prehľad problému alebo procesu.
2. Posúď, či sú činnosti očíslované alebo inak jasne zoradené.
3. Posúď, či sú uvedení aktéri (napríklad v časti Aktéri).
4. Pri každej činnosti over, či je z textu jednoznačné, kto ju vykonáva. Zoznam unclear_tasks musí obsahovať len konkrétne nejasné činnosti citované alebo stručne pomenované zo zadania. Nevymýšľaj aktérov.
5. Ak je zadanie krátke alebo sa ešte píše, formuluj kontrolu ako priebežnú a navrhni najdôležitejšie doplnenia. Buď vecný, stručný a povzbudivý.
6. Odpovedaj po slovensky, zachovaj mená osôb a nehodnoť gramatiku.
7. activity_count: počet samostatných činností v zadaní (aj viac činností v jednej vete počítaj zvlášť; rozhodnutie je tiež činnosť).
8. questions: najviac 3 otázky, ktoré by diagram najviac spresnili – iba ak je v zadaní skutočná nejasnosť
   (kto vykonáva činnosť, čo sa stane v nepopísanej vetve rozhodnutia, nejasné poradie). Ak je zadanie jasné, vráť prázdny zoznam.
   Ku každej otázke daj 2–3 možnosti; "clarification" je celá veta, ktorá sa doplní do zadania. Možnosti ber prednostne z rolí a činností,
   ktoré zadanie už obsahuje. Nepýtaj sa na čas, náklady ani na veci, ktoré už riadok „Upresnenie:“ zodpovedal."""

    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        raise HTTPException(status_code=503, detail="Nastav GROQ_API_KEY v .env.")

    try:
        response = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": review_instructions},
                    {"role": "user", "content": prompt},
                ],
                "max_completion_tokens": 1800,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "reasoning_format": "hidden",
            },
            timeout=90,
        )
        response.raise_for_status()
        choices = response.json().get("choices", [])
        if not choices:
            raise ValueError("Groq API nevrátil žiadnu odpoveď.")
        content = choices[0].get("message", {}).get("content", "")
        review = json.loads(content)
        # Otázky sú doplnok – neplatné položky radšej vynecháme, než aby padla celá kontrola
        questions = []
        for q in review.get("questions") or []:
            if not isinstance(q, dict) or not str(q.get("question") or "").strip():
                continue
            options = [ReviewOption(label=str(o["label"]).strip(), clarification=str(o.get("clarification") or o["label"]).strip())
                       for o in (q.get("options") or []) if isinstance(o, dict) and str(o.get("label") or "").strip()]
            questions.append(ReviewQuestion(question=str(q["question"]).strip(), options=options[:3]))
        review["questions"] = questions[:3]
        try:
            review["activity_count"] = max(0, int(review.get("activity_count") or 0))
        except (TypeError, ValueError):
            review["activity_count"] = 0
        return PromptReviewResponse.parse_obj(review)
    except requests.exceptions.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Groq API nie je dostupné: {exc.response.text[:400] if exc.response is not None else str(exc)[:160]}",
        ) from exc
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Groq API vrátilo neplatnú odpoveď: {str(exc)[:160]}",
        ) from exc


@app.post("/assistant-chat", response_model=AssistantChatResponse)
def assistant_chat(input: AssistantChatRequest) -> AssistantChatResponse:
    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        raise HTTPException(status_code=503, detail="Nastav GROQ_API_KEY v .env.")

    diagram_context = "Žiadny diagram ešte nie je otvorený."
    if input.current_model:
        diagram_context = json.dumps(input.current_model, ensure_ascii=False)[:16000]

    system_prompt = f"""Si doplnkový AI asistent v aplikácii Prompt2Flow na tvorbu business procesov.
Pomáhaj používateľovi premýšľať nad krokmi, rolami, rozhodnutiami, rizikami a zrozumiteľným opisom procesu. Odpovedaj prirodzene v jazyku používateľa, stručne a vecne. Ak je požiadavka nejasná, polož jednu konkrétnu otázku. Nehovor, že si zmenil alebo uložil diagram — iba radíš v tomto chate.

Opis procesu v editore:
{input.process_description or "(zatiaľ prázdny)"}

Aktuálny diagram:
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
            raise ValueError("Groq API nevrátilo žiadnu odpoveď.")
        reply = choices[0].get("message", {}).get("content", "").strip()
        if not reply:
            raise ValueError("Groq API vrátilo prázdnu odpoveď.")
        return AssistantChatResponse(reply=reply)
    except requests.exceptions.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Groq API nie je dostupné: {exc.response.text[:400] if exc.response is not None else str(exc)[:160]}") from exc
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail=f"Asistent vrátil neplatnú odpoveď: {str(exc)[:160]}") from exc


@app.post("/catalog", response_model=dict)
def save_to_catalog(payload: CatalogSaveRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    category = payload.category if payload.category in PREDEFINED_CATEGORIES else "Iné"

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
def list_catalog(q: str = Query(None, description="Fulltext hľadanie"),
                 category: str = Query(None, description="Filter podľa kategórie"),
                 current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    admin_env = os.getenv("ADMIN_USER")  # OPRAVENÉ NA ENV PREMENNÚ
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

        if category and category not in ["", "Všetky"]:
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
                r["category"] = "Iné"

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
            raise HTTPException(status_code=404, detail=f"Proces {process_id} neexistuje")

        if not is_admin and row["user_id"] != user_id and not row["is_public"]:
            raise HTTPException(status_code=403, detail="Nemáš prístup k tomuto diagramu")

        result = dict(row)
        result["model_json"] = json.loads(result["model_json"])
        result["owner"] = result["username"]

        if not result.get("category"):
            result["category"] = "Iné"

    return result


@app.delete("/catalog/{process_id}", response_model=dict)
def delete_process(process_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    with get_db() as conn:
        cursor = get_cursor(conn)
        cursor.execute(f"SELECT user_id FROM processes WHERE id = {PARAM_MARKER}", (process_id,))
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Proces #{process_id} neexistuje")

        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Môžeš zmazať len svoje vlastné diagramy")

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
            raise HTTPException(status_code=404, detail="Proces neexistuje")

        if not is_admin and row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Môžeš upravovať len svoje diagramy")

        is_pub = payload.is_public if USE_POSTGRES else (1 if payload.is_public else 0)

        cursor.execute(f"UPDATE processes SET is_public = {PARAM_MARKER} WHERE id = {PARAM_MARKER}",
                       (is_pub, process_id))
        conn.commit()

    return {"success": True, "is_public": payload.is_public}


def edit_diagram_with_ai(instruction: str, current_model: dict) -> ProcessModel:
    if not GROQ_API_KEY or len(GROQ_API_KEY) < 10:
        return dummy_model("Nastav GROQ_API_KEY v .env")

    current_json = json.dumps(current_model, ensure_ascii=False, indent=2)

    prompt = f"""Mas existujuci JSON diagram business procesu. Pouzivatel chce urobit zmenu.
Tvojou JEDINOU ulohou je vratit upraveny JSON a ABSOLUTNE ZIADEN INY TEXT.

EXISTUJUCI DIAGRAM:
{current_json}

POZIADAVKA POUZIVATELA:
{instruction}

PRAVIDLA (MUSI STRIKTNE DODRZIA):
1. Vrat KOMPLETNY JSON objekt v ROVNAKOM formate ako vstup (kluce: "nodes" a "edges").
2. ZACHOVAJ vsetky povodne ID uzlov a hran, ktore sa NEMENIA.
3. ZACHOVAJ vsetky povodne hodnoty: duration_minutes, cost_euros, actor - ak ich explicitne nemenies.
4. Pridavaj/uprav/maz IBA to, co pouzivatel ziada.
5. Nove uzly dostavaju ID s prefixom "n" (napr. nt1, nt2) a nove hrany "ne1", "ne2" atd.
6. Kazdy gateway musi mat aspon 2 odchadzajuce hrany s vyplnenym label.
7. Posledny element v zoznamoch NESMIE mat ciarku!
8. Vrat LEN validny JSON bez akehokolvek textu pred alebo za nim.

PRAVIDLA PRE PRESNE VYKONANIE POZIADAVKY:
9. Najprv urci cielovy uzol podla jeho nazvu (label); nemen iny uzol len preto, ze ma podobny nazov.
10. Pri poziadavke "po/za uzlom X pridaj Y" vloz novy uzol Y bezprostredne za X: odstran povodnu hranu X -> N a vytvor X -> Y a Y -> N. Zachovaj povodny uzol N aj jeho dalsie napojenia.
11. Ak pouzivatel povie "pripoj k dalsiemu kroku v existujucom procese", pripoj novy uzol do povodneho toku na spravnom mieste; nevytvaraj novu odpojenú vetvu ani novy koncovy uzol.
12. Pri pridani uzla prenes presne zadany nazov, rolu/aktora, trvanie a naklady. Trvanie zapis do duration_minutes ako cislo v minutach (napr. 1 minute = 1); naklady zapis do cost_euros ako cislo v EUR (napr. €0.50 = 0.5).
13. Ak je cielovy uzol alebo napojenie nejednoznacne, zachovaj diagram a nerob nepodlozene zmeny.
14. Skontroluj, ze vsetky povodne uzly a ich povodne spojenia ostali zachovane okrem hran, ktore bolo potrebne prepojit kvoli poziadovanej zmene.
15. Pri kazdom uzle typu task bez vyplnenej ceny (vratane novych uzlov) odhadni cost_euros. Pouzi realisticky priblizny odhad v EUR podla cinnosti a roly; ak cinnost nema priame naklady, nastav 0.0. Existujuce cost_euros vzdy zachovaj, pokial pouzivatel vyslovene neziada ich zmenu.
"""

    try:
        resp = requests.post(
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

        # ── ROBUSTNÉ parsovanie odpovede (rovnaké ako v generate_diagram_from_text) ──
        choices = data.get("choices", [])
        if not choices:
            raise ValueError("Groq nevrátil žiadne choices")

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
                raise ValueError("Groq vratil neplatny JSON")

        if isinstance(diagram, list):
            diagram = diagram[0] if len(diagram) > 0 and isinstance(diagram[0], dict) else {}

        if not isinstance(diagram, dict):
            raise ValueError(f"Neočakávaný typ odpovede: {type(diagram)}")

        # ── Mapa pôvodných uzlov (iba dict položky) ──
        original_nodes_map = {
            n["id"]: n
            for n in current_model.get("nodes", [])
            if isinstance(n, dict) and "id" in n
        }

        # ── Spracovanie uzlov (nodes môžu prísť aj ako dict namiesto listu) ──
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
                label=str(n.get("label", "Neznáma úloha")),
                actor=n.get("actor") or orig.get("actor"),
                duration_minutes=n.get("duration_minutes") if n.get("duration_minutes") is not None else orig.get(
                    "duration_minutes"),
                cost_euros=n.get("cost_euros") if n.get("cost_euros") is not None else orig.get("cost_euros"),
            ))
            node_ids.add(nid)

        # ── Spracovanie hrán (edges môžu prísť aj ako dict namiesto listu) ──
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
        print(f"Copilot chyba: {exc}")
        return dummy_model(f"Copilot chyba: {str(exc)[:40]}")


@app.post("/edit-model", response_model=ProcessModel)
def edit_model(input: EditModelRequest) -> ProcessModel:
    return edit_diagram_with_ai(input.instruction, input.current_model)


@app.get("/public-catalog", response_model=List[dict])
def list_public_catalog(
        q: str = Query("", description="Fulltext hľadanie"),
        category: str = Query("", description="Filter podľa kategórie"),
):
    with get_db() as conn:
        cursor = get_cursor(conn)

        # Pre postgres používame booleany, pre sqlite 1/0
        is_pub_cond = "p.is_public = TRUE" if USE_POSTGRES else "p.is_public = 1"
        conditions = [is_pub_cond]
        params = []

        if q:
            like = f"%{q}%"
            conditions.append(
                f"(p.title LIKE {PARAM_MARKER} OR p.prompt LIKE {PARAM_MARKER} OR p.model_json LIKE {PARAM_MARKER})")
            params.extend([like, like, like])

        if category and category not in ("", "Všetky"):
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
                r["category"] = "Iné"
            if isinstance(r.get("model_json"), str):
                try:
                    r["model_json"] = json.loads(r["model_json"])
                except Exception:
                    r["model_json"] = {"nodes": [], "edges": []}
            result.append(r)

        return result
