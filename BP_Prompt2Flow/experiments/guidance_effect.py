"""Effect of the description guidance (/review-prompt) on the match score.

For every case in cases.json the script compares two descriptions of the same process:
  raw     the description as the user wrote it,
  guided  the same description after the live review: for up to ROUNDS rounds, every AI question is answered with its
          first option and the answer is appended as "Clarification: ..." (exactly what the UI does on a click).
For each description it records the review checklist (trigger, activities, roles, decisions, outcome, clear steps),
generates GENERATIONS diagrams and evaluates each diagram REPEATS times against its own description.

Outputs in results/guidance/: descriptions.json, runs.jsonl, summary.md.
The backend must be running. Example: python experiments/guidance_effect.py --api http://127.0.0.1:8000
"""
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

from evaluation_stability import post

HERE = Path(__file__).resolve().parent
ASPECTS = ["trigger_defined", "activities_identified", "roles_specified", "decisions_defined", "outcome_defined"]


def checklist(review: dict) -> dict:
    steps = review.get("step_checks") or []
    clear = sum(1 for s in steps if s.get("clear", True))
    return {"aspects": sum(bool(review.get(a)) for a in ASPECTS), "missing_aspects": [a for a in ASPECTS if not review.get(a)],
            "clear_steps": clear, "steps": len(steps), "questions": len(review.get("questions") or [])}


def guide(api: str, description: str, rounds: int, delay: float) -> tuple:
    """Runs the live review and answers its questions with the first option, like a user clicking it."""
    text, answers = description, []
    first = post(api, "/review-prompt", {"prompt": text})
    review = first
    for _ in range(rounds):
        questions = [q for q in review.get("questions") or [] if q.get("options")]
        if not questions:
            break
        for q in questions:
            clarification = q["options"][0]["clarification"].strip()
            answers.append({"question": q["question"], "answer": clarification})
            text = f"{text.rstrip()}\nClarification: {clarification}"
        time.sleep(delay)
        review = post(api, "/review-prompt", {"prompt": text})
    return text, answers, checklist(first), checklist(review)


def describe(values: list) -> str:
    if not values:
        return "–"
    sd = statistics.stdev(values) if len(values) > 1 else 0.0
    return f"{statistics.mean(values):.1f} ± {sd:.1f}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--cases", default=str(HERE / "cases.json"))
    parser.add_argument("--only", default="")
    parser.add_argument("--evaluator", default="nvidia")
    parser.add_argument("--rounds", type=int, default=2, help="review rounds with answered questions")
    parser.add_argument("--generations", type=int, default=2, help="diagrams generated per description")
    parser.add_argument("--repeats", type=int, default=2, help="evaluations per diagram")
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--min-nodes", type=int, default=4)
    parser.add_argument("--max-nodes", type=int, default=14)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    if args.only:
        cases = [c for c in cases if c["id"] in set(args.only.split(","))]
    out = HERE / "results" / "guidance"
    (out / "diagrams").mkdir(parents=True, exist_ok=True)

    desc_path = out / "descriptions.json"
    descriptions = json.loads(desc_path.read_text(encoding="utf-8")) if desc_path.exists() else {}
    rows = []
    with open(out / "runs.jsonl", "w", encoding="utf-8") as log:
        for case in cases:
            cid = case["id"]
            if cid not in descriptions:
                print(f"[{cid}] reviewing")
                guided, answers, before, after = guide(args.api, case["description"], args.rounds, args.delay)
                descriptions[cid] = {"raw": case["description"], "guided": guided, "answers": answers,
                                     "checklist_raw": before, "checklist_guided": after}
                desc_path.write_text(json.dumps(descriptions, ensure_ascii=False, indent=2), encoding="utf-8")
            d = descriptions[cid]
            print(f"[{cid}] checklist {d['checklist_raw']['aspects']}/5 -> {d['checklist_guided']['aspects']}/5, "
                  f"{len(d['answers'])} clarifications")
            for variant in ("raw", "guided"):
                for g in range(1, args.generations + 1):
                    path = out / "diagrams" / f"{cid}_{variant}_{g}.json"
                    if path.exists():
                        model = json.loads(path.read_text(encoding="utf-8"))
                    else:
                        time.sleep(args.delay)
                        model = post(args.api, "/generate-model", {"description": d[variant], "min_nodes": args.min_nodes,
                                                                   "max_nodes": args.max_nodes})
                        if any("AI error" in str(n.get("label", "")) for n in model.get("nodes", [])):
                            print(f"  {variant} gen {g}: generation failed")
                            continue
                        path.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
                    for r in range(1, args.repeats + 1):
                        time.sleep(args.delay)
                        row = {"case": cid, "variant": variant, "generation": g, "run": r}
                        try:
                            res = post(args.api, "/evaluate-model", {"description": d[variant], "model": model,
                                                                     "evaluator": args.evaluator})
                        except Exception as exc:
                            row["error"] = str(exc)[:300]
                            print(f"  {variant} gen {g} run {r}: ERROR {row['error'][:100]}")
                            log.write(json.dumps(row, ensure_ascii=False) + "\n")
                            continue
                        reqs = res.get("requirements", [])
                        row.update(score=res["accuracy_percent"], requirements=len(reqs),
                                   missing=sum(q["status"] == "missing" for q in reqs))
                        rows.append(row)
                        log.write(json.dumps({**row, "response": res}, ensure_ascii=False) + "\n")
                        log.flush()
                        print(f"  {variant:6} gen {g} run {r}: score {row['score']}  requirements {row['requirements']}")

    lines = ["| Case | Checklist raw → guided | Clarifications | Raw score | Guided score | Change |",
             "|---|---|---|---|---|---|"]
    for case in cases:
        cid, d = case["id"], descriptions.get(case["id"])
        if not d:
            continue
        raw = [r["score"] for r in rows if r["case"] == cid and r["variant"] == "raw"]
        gui = [r["score"] for r in rows if r["case"] == cid and r["variant"] == "guided"]
        change = f"{statistics.mean(gui) - statistics.mean(raw):+.1f}" if raw and gui else "–"
        lines.append(f"| {cid} | {d['checklist_raw']['aspects']}/5 → {d['checklist_guided']['aspects']}/5 | "
                     f"{len(d['answers'])} | {describe(raw)} | {describe(gui)} | {change} |")
    lines.append(f"\nScores: mean ± SD over {args.generations} generated diagrams × {args.repeats} evaluations "
                 f"({args.evaluator}), each diagram judged against its own description.")
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n" + "\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
