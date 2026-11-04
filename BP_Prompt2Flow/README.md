# Prompt2Flow

**Prompt2Flow** je webová aplikácia na generovanie a editáciu business procesných diagramov pomocou umelej inteligencie. Stačí popísať proces textom – AI ho okamžite premení na interaktívny diagram s dráhami (swimlanes), prehľadnou štruktúrou a možnosťou exportu do štandardných formátov.

---

## Ukážka

> Zadaj: *"Schvaľovanie faktúry: účtovník podá faktúru, manažér ju schváli alebo zamietne, ak schváli, ide do platby"*
>
> → Prompt2Flow vygeneruje kompletný diagram s dráhami, uzlami, rozhodovacím bránou a šípkami.

---

## Funkcie

- 🧠 **Generovanie z textu** – opíš proces, Groq API vytvorí diagram
- ✏️ **AI Copilot** – úprava existujúceho diagramu prirodzeným jazykom
- 🏊 **Swimlane layout** – automatické rozdelenie podľa rolí/aktérov (Dagre)
- 📊 **KPI uzlov** – trvanie (min) a náklady (EUR) pre každý krok
- 🔍 **Linter** – automatická kontrola logiky diagramu (slepé uličky, chýbajúce vstupy)
- ↩️ **Undo/Redo** – história zmien (Ctrl+Z / Ctrl+Y)
- 💾 **Archív (katalóg)** – ukladanie, zdieľanie a vyhľadávanie diagramov
- 🏷️ **Kategórie** – HR, IT, Financie, Marketing, Školstvo a ďalšie
- 👁️ **Verejné/súkromné diagramy** – zdieľanie s ostatnými používateľmi
- 📤 **Export** – PNG, JPG, BPMN 2.0 XML, UML XMI, UXF (UMLet)
- 🔐 **Autentifikácia** – registrácia, prihlásenie (JWT)

---

## Technológie

| Vrstva | Technológia |
|--------|-------------|
| Frontend | React 18, React Flow, Dagre, html-to-image, Vite |
| Backend | FastAPI, Python 3.11+ |
| Databáza | PostgreSQL |
| AI | [Groq API](https://groq.com) – model `openai/gpt-oss-120b` |
| Autentifikácia | JWT (PyJWT, bcrypt) |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Export formátov

| Formát | Popis | Kompatibilita |
|--------|-------|---------------|
| **PNG / JPG** | Rastrový obrazok diagramu | Univerzálne |
| **BPMN 2.0 XML** | Štandardný formát pre business procesy | Camunda, Bizagi, Signavio |
| **UML XMI 2.1** | UML Activity Diagram | Eclipse, Enterprise Architect |
| **UXF** | UMLet diagram | [UMLet](https://www.umlet.com/) |

> Pred stiahnutím akéhokoľvek formátu musí byť diagram uložený v archíve.

---

## Použitie

### Kontrola zadania počas písania

Po krátkej pauze v písaní Groq API skontroluje, či zadanie obsahuje prehľad procesu, zoradené činnosti a zoznam aktérov. Vypíše aj konkrétne kroky, pri ktorých nie je jasné, kto ich vykonáva. Všetky AI funkcie používajú Groq API; nastav `GROQ_API_KEY` v `.env`.

### Generovanie diagramu

1. Do textového poľa *AI Generovanie* napíš popis procesu
2. Nastav rozsah uzlov (Min/Max)
3. Voliteľne zapni **KPI** pre odhad trvania a nákladov
4. Klikni na **Generovať model**

### Úprava pomocou Copilota

1. Otvor existujúci diagram (alebo vygeneruj nový)
2. Do poľa *AI Copilot – Úprava* napíš pokyn v prirodzenom jazyku
   - Príklad: *"Pridaj krok schválenia manažérom medzi 'Kontrola' a 'Platba'"*
3. Klikni na **Upraviť diagram AI**

### Manuálne úpravy

- **Pridaj uzol** – tlačidlo *Pridať* v sekcii Úprava uzlov
- **Premenuj** – vyber uzol → klikni *Uzol*
- **Zmeň rolu** – vyber uzol → klikni *Rola*
- **Prepoj uzly** – potiahni z pravého portu jedného uzla na ľavý port druhého
- **Vymaž** – vyber prvok → červené tlačidlo *Uzol* alebo *Hranu*
- **Zarovnaj** – automaticky preusporiadaj layout

---

## Autor

Vytvoril Timotej Jakubov https://github.com/Timotej04
