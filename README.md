<div align="center">

# 🧠 Prompt2Flow

**Describe a business process in plain language and get an editable process diagram.**

[![Live demo](https://img.shields.io/badge/demo-live-22c55e?style=for-the-badge&logo=vercel&logoColor=white)](https://bp-t2-m-fast-api-project.vercel.app)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Groq](https://img.shields.io/badge/LLM-Groq-F55036?style=for-the-badge)

</div>

---

## ✨ What it does

Type something like:

> *"Invoice approval: the accountant submits an invoice, the manager approves or rejects it, approved invoices go to payment."*

Prompt2Flow then builds a full diagram with swimlanes per actor, tasks, decision gateways and arrows. You can keep editing it by hand or ask the AI copilot to change it.

| | Feature |
|---|---|
| 🧠 | **Text → diagram.** An LLM (Groq) turns a process description into a structured flow |
| ✏️ | **AI Copilot.** Edit an existing diagram with natural-language instructions |
| 🏊 | **Swimlanes.** Automatic layout by role or actor (Dagre) |
| 📊 | **KPIs.** Duration (min) and cost (EUR) estimates for every step |
| 🔍 | **Linter.** Detects dead ends, missing inputs and other logic issues |
| 💾 | **Catalog.** Save, search and share diagrams, either public or private, with categories |
| 📤 | **Export.** PNG, JPG, BPMN 2.0 XML, UML XMI 2.1, UXF (UMLet) |
| 🔐 | **Auth.** Registration and login with JWT |

## 🛠 Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, React Flow, Dagre, html-to-image, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL (SQLite for local dev) |
| AI | [Groq API](https://groq.com) |
| Deployment | Vercel (frontend) + Render (backend) |

## 🚀 Quick start

```bash
cd BP_Prompt2Flow

# backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # set GROQ_API_KEY and JWT_SECRET_KEY
uvicorn main:app --reload

# frontend (in a second terminal)
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

## 📚 Documentation

The full user guide is in [`BP_Prompt2Flow/README.md`](BP_Prompt2Flow/README.md).

## 👤 Author

Bachelor's project by **Timotej Jakubov** ([@Timotej04](https://github.com/Timotej04)).
