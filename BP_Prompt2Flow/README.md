# Prompt2Flow

**Prompt2Flow** is a web application for generating and editing business process diagrams with artificial intelligence. Describe a process in plain text and the AI turns it into an interactive diagram with swimlanes, a clear structure and export to standard formats.

---

## Example

> Input: *"Invoice approval: the accountant submits an invoice, the manager approves or rejects it, approved invoices go to payment"*
>
> → Prompt2Flow generates a complete diagram with swimlanes, nodes, a decision gateway and arrows.

---

## Features

- 🧠 **Text → diagram** – describe a process and the Groq API creates the diagram
- 💬 **Description review while typing** – the AI checks the overview, step order and actors, and asks clarifying questions
- ✏️ **AI Copilot** – edit an existing diagram with natural-language instructions
- 🏊 **Swimlane layout** – automatic grouping by roles/actors (Dagre)
- 📊 **Node KPIs** – duration (min) and cost (EUR) for every step
- 🎯 **Match with description** – the AI splits the description into requirements and computes how well the diagram covers them
- 📈 **Process statistics** – cost and time, actors and resources, bottleneck analysis and AI recommendations
- 🔍 **Linter** – automatic check of the diagram logic (dead ends, missing inputs)
- ↩️ **Undo/Redo** – change history (Ctrl+Z / Ctrl+Y)
- 💾 **Catalog** – save, share and search diagrams
- 🏷️ **Categories** – HR, IT, Finance, Marketing, Education and more
- 👁️ **Public/private diagrams** – share with other users
- 📤 **Export** – PNG, JPG, BPMN 2.0 XML, UML XMI, UXF (UMLet)
- 🔐 **Authentication** – sign-up and sign-in (JWT)

---

## Technologies

| Layer | Technology |
|--------|-------------|
| Frontend | React 18, React Flow, Dagre, html-to-image, Vite |
| Backend | FastAPI, Python 3.11+ |
| Database | PostgreSQL (SQLite for local development) |
| AI | [Groq API](https://groq.com) – model `openai/gpt-oss-120b` |
| Authentication | JWT (PyJWT, bcrypt) |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Export formats

| Format | Description | Compatibility |
|--------|-------|---------------|
| **PNG / JPG** | Raster image of the diagram | Universal |
| **BPMN 2.0 XML** | Standard format for business processes | Camunda, Bizagi, Signavio |
| **UML XMI 2.1** | UML Activity Diagram | Eclipse, Enterprise Architect |
| **UXF** | UMLet diagram | [UMLet](https://www.umlet.com/) |

> A diagram must be saved in the catalog before it can be downloaded in any format.

---

## Usage

### Description review while typing

After a short pause in typing, the Groq API checks whether the description contains a process overview, ordered activities and a list of actors. It also lists the specific steps where it is unclear who performs them, and may ask up to three clarifying questions; the chosen answer is appended to the description as a `Clarification:` line. All AI features use the Groq API; set `GROQ_API_KEY` in `.env`.

The user interface and the generated diagrams are in English, even when the process is described in another language (e.g. Slovak).

### Generating a diagram

1. On the **Create process** tab, describe the process in the text field at the bottom
2. Set the step range (min–max)
3. Optionally keep **Estimate time and cost** on for KPI estimates
4. Click **Create diagram** (or press Ctrl+Enter)

### Editing with the Copilot

1. Open an existing diagram (or generate a new one)
2. Switch to the **Manage diagram** tab and write an instruction in natural language
   - Example: *"Add a manager approval step between 'Check' and 'Payment'"*
3. Click **Apply changes**

### Manual editing

- **Add node** – *Add* button in the toolbar above the canvas
- **Rename** – select a node → click *Rename*
- **Change role** – select a node → click *Role*, or click a lane header to rename the whole lane
- **Connect nodes** – drag from the right port of one node to the left port of another
- **Delete** – select an element → red *Delete* button in the *Node* or *Edge* group
- **Align** – automatically rearrange the layout

---

## Author

Original version by Timotej Jakubov https://github.com/Timotej04
