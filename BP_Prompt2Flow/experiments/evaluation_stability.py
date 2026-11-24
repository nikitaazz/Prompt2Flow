"""Stability experiment for "Match with description" (/evaluate-model).

For every case in cases.json the script
  1. generates a diagram once with /generate-model (cached in results/diagrams/, so reruns use the same diagram),
  2. builds a "minus_step" variant by removing one task from the middle of the flow (a known defect),
  3. evaluates each variant REPEATS times with every chosen evaluator.

Outputs in results/:
  runs.csv      one row per evaluation (score, requirement count, total weight, per-category scores)
  runs.jsonl    the full responses (requirements with status and evidence)
  summary.csv   per case/variant/evaluator: mean, standard deviation, min, max of the score and of the requirement count
  summary.md    the same as a Markdown table, plus the score drop caused by the removed step

The backend must be running (python -m uvicorn main:app --host 127.0.0.1 --port 8000).
Example: python experiments/evaluation_stability.py --repeats 5 --evaluators nvidia,gemini
"""
import argparse
import csv
import json
import statistics
import sys
import time
from collections import defaultdict, deque
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
CONTROL_TYPES = {"startEvent", "endEvent", "fork", "join"}
CATEGORIES = ["step", "actor", "decision", "order", "outcome"]


def post(api: str, path: str, payload: dict, timeout: int = 300) -> dict:
    response = requests.post(f"{api}{path}", json=payload, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(f"{path} returned {response.status_code}: {response.text[:300]}")
    return response.json()


def flow_order(model: dict) -> list:
    """Node ids in breadth-first order from the start nodes (nodes without incoming edges)."""
    incoming = {e["target"] for e in model["edges"]}
    outgoing = defaultdict(list)
    for e in model["edges"]:
        outgoing[e["source"]].append(e["target"])
    queue = deque(n["id"] for n in model["nodes"] if n["id"] not in incoming)
    seen, order = set(), []
    while queue:
        node_id = queue.popleft()
        if node_id in seen:
            continue
        seen.add(node_id)
        order.append(node_id)
        queue.extend(outgoing[node_id])
    order.extend(n["id"] for n in model["nodes"] if n["id"] not in seen)
    return order


def remove_middle_step(model: dict) -> tuple:
    """Removes the middle task of the flow and connects its predecessors directly to its successors."""
    types = {n["id"]: n.get("type") for n in model["nodes"]}
    out_degree = defaultdict(int)
    for e in model["edges"]:
        out_degree[e["source"]] += 1
    # Only plain tasks with one outgoing edge, so that no decision is lost together with the step.
    tasks = [i for i in flow_order(model) if types.get(i) not in CONTROL_TYPES and types.get(i) != "gateway"
             and out_degree[i] == 1]
    if not tasks:
        return None, None
    victim = tasks[len(tasks) // 2]
    preds = [e for e in model["edges"] if e["target"] == victim]
    succs = [e["target"] for e in model["edges"] if e["source"] == victim]
    edges = [e for e in model["edges"] if victim not in (e["source"], e["target"])]
    existing = {(e["source"], e["target"]) for e in edges}
    for p in preds:
        for s in succs:
            if (p["source"], s) not in existing and p["source"] != s:
                edges.append({"id": f"bypass_{p['source']}_{s}", "source": p["source"], "target": s,
                              "label": p.get("label")})
                existing.add((p["source"], s))
    nodes = [n for n in model["nodes"] if n["id"] != victim]
    label = next(n["label"] for n in model["nodes"] if n["id"] == victim)
    return {"nodes": nodes, "edges": edges}, label


def load_diagram(api: str, case: dict, min_nodes: int, max_nodes: int, regenerate: bool) -> dict:
    path = HERE / "results" / "diagrams" / f"{case['id']}.json"
    if path.exists() and not regenerate:
        return json.loads(path.read_text(encoding="utf-8"))
    model = post(api, "/generate-model", {"description": case["description"],
                                          "min_nodes": min_nodes, "max_nodes": max_nodes})
    if any("AI error" in str(n.get("label", "")) for n in model.get("nodes", [])):
        raise RuntimeError(f"Generation failed for {case['id']} (placeholder diagram returned).")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
    return model


def describe(values: list) -> dict:
    if not values:
        return {"n": 0, "mean": "", "sd": "", "min": "", "max": ""}
    return {"n": len(values), "mean": round(statistics.mean(values), 1),
            "sd": round(statistics.stdev(values), 1) if len(values) > 1 else 0.0,
            "min": min(values), "max": max(values)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--cases", default=str(HERE / "cases.json"))
    parser.add_argument("--only", default="", help="comma-separated case ids (default: all)")
    parser.add_argument("--evaluators", default="nvidia,gemini", help="comma-separated: nvidia, gemini")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--delay", type=float, default=2.0, help="seconds between calls (rate limits)")
    parser.add_argument("--min-nodes", type=int, default=4)
    parser.add_argument("--max-nodes", type=int, default=14)
    parser.add_argument("--regenerate", action="store_true", help="generate the diagrams again")
    parser.add_argument("--no-variant", action="store_true", help="skip the minus_step variant")
    parser.add_argument("--out", default="results",
                        help="folder (next to this script) for runs and summaries; the diagrams are always cached in results/diagrams")
    parser.add_argument("--fresh-requirements", action="store_true",
                        help="extract the requirements again on every evaluation instead of reusing the cached list")
    parser.add_argument("--append", action="store_true",
                        help="keep earlier runs in runs.jsonl (e.g. to finish an interrupted experiment); "
                             "the summaries are always built from the whole runs.jsonl")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # the Windows console is not UTF-8 by default

    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    evaluators = [e.strip() for e in args.evaluators.split(",") if e.strip()]
    out = HERE / args.out
    out.mkdir(exist_ok=True)

    with open(out / "runs.jsonl", "a" if args.append else "w", encoding="utf-8") as raw_log:
        for case in cases:
            print(f"[{case['id']}] generating / loading diagram")
            full = load_diagram(args.api, case, args.min_nodes, args.max_nodes, args.regenerate)
            variants, removed_label = {"full": full}, ""
            if not args.no_variant:
                reduced, label = remove_middle_step(full)
                if reduced:
                    variants["minus_step"] = reduced
                    removed_label = label
            for variant, model in variants.items():
                for evaluator in evaluators:
                    for run in range(1, args.repeats + 1):
                        time.sleep(args.delay)
                        row = {"case": case["id"], "variant": variant, "requested_evaluator": evaluator, "run": run,
                               "removed_step": removed_label if variant == "minus_step" else ""}
                        try:
                            result = post(args.api, "/evaluate-model", {"description": case["description"],
                                                                         "model": model, "evaluator": evaluator,
                                                                         "fixed_requirements": not args.fresh_requirements}, timeout=900)
                        except Exception as exc:  # keep going: one failed call must not stop the experiment
                            row["error"] = str(exc)[:300]
                            raw_log.write(json.dumps(row, ensure_ascii=False) + "\n")
                            raw_log.flush()
                            print(f"  {variant:10} {evaluator:7} run {run}: ERROR {row['error'][:120]}")
                            continue
                        reqs = result.get("requirements", [])
                        row.update({
                            "evaluator": result.get("evaluator", ""),
                            "score": result["accuracy_percent"],
                            "requirements": len(reqs),
                            "total_weight": sum(r["importance"] for r in reqs),
                            "met": sum(r["status"] == "met" for r in reqs),
                            "partial": sum(r["status"] == "partial" for r in reqs),
                            "missing": sum(r["status"] == "missing" for r in reqs),
                            **{f"cat_{c}": result.get("category_scores", {}).get(c, "") for c in CATEGORIES},
                        })
                        raw_log.write(json.dumps({**row, "response": result}, ensure_ascii=False) + "\n")
                        raw_log.flush()
                        print(f"  {variant:10} {evaluator:7} run {run}: score {row['score']:3}  "
                              f"requirements {row['requirements']}")

    rows, removed_labels = [], {}
    for line in (out / "runs.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            row.pop("response", None)
            rows.append(row)
            if row.get("removed_step"):
                removed_labels[row["case"]] = row["removed_step"]

    fields = ["case", "variant", "requested_evaluator", "evaluator", "run", "score", "requirements", "total_weight",
              "met", "partial", "missing", *[f"cat_{c}" for c in CATEGORIES], "error"]
    with open(out / "runs.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    groups = defaultdict(list)
    for row in rows:
        groups[(row["case"], row["variant"], row["requested_evaluator"])].append(row)
    summary = []
    for (case_id, variant, evaluator), items in groups.items():
        ok = [r for r in items if "score" in r]
        score, count = describe([r["score"] for r in ok]), describe([r["requirements"] for r in ok])
        summary.append({"case": case_id, "variant": variant, "evaluator": evaluator,
                        "runs": len(ok), "failed": len(items) - len(ok),
                        **{f"score_{k}": v for k, v in score.items() if k != "n"},
                        **{f"req_{k}": v for k, v in count.items() if k != "n"}})
    with open(out / "summary.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(summary[0].keys()) if summary else ["case"])
        writer.writeheader()
        writer.writerows(summary)

    lines = ["| Case | Variant | Evaluator | Runs | Score mean ± SD | Score min–max | Requirements mean ± SD |",
             "|---|---|---|---|---|---|---|"]
    for s in summary:
        lines.append(f"| {s['case']} | {s['variant']} | {s['evaluator']} | {s['runs']} | "
                     f"{s['score_mean']} ± {s['score_sd']} | {s['score_min']}–{s['score_max']} | "
                     f"{s['req_mean']} ± {s['req_sd']} |")
    by_key = {(s["case"], s["variant"], s["evaluator"]): s for s in summary}
    drops = ["", "Score drop after removing one step (full mean − minus_step mean):", ""]
    for (case_id, variant, evaluator), s in by_key.items():
        reduced = by_key.get((case_id, "minus_step", evaluator))
        if variant == "full" and reduced and s["score_mean"] != "" and reduced["score_mean"] != "":
            drops.append(f"- {case_id} / {evaluator}: {round(s['score_mean'] - reduced['score_mean'], 1)} points "
                         f"(removed step: \"{removed_labels.get(case_id, '?')}\")")
    (out / "summary.md").write_text("\n".join(lines + drops) + "\n", encoding="utf-8")
    print("\n" + "\n".join(lines + drops))
    print(f"\nResults written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
