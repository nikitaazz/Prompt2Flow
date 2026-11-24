| Case | Checklist raw → guided | Clarifications | Raw score | Guided score | Change |
|---|---|---|---|---|---|
| feature_deployment | 4/5 → 4/5 | 0 | 94.5 ± 2.6 | 95.8 ± 1.0 | +1.2 |
| apricot_pies | 2/5 → 5/5 | 3 | 89.0 ± 6.7 | 96.3 ± 1.2 | +7.3 |
| trench_digging | 2/5 → 5/5 | 3 | 99.2 ± 1.5 | 85.2 ± 3.9 | -14.0 |
| egg_frying | 2/5 → 5/5 | 4 | 96.0 ± 1.6 | 93.5 ± 4.8 | -2.5 |

Scores: mean ± SD over 2 generated diagrams × 2 evaluations (nvidia), each diagram judged against its own description.

Common reference (both diagrams judged against the guided description, NVIDIA, 1 evaluation per raw diagram):

| Case | Raw diagrams | Guided diagrams (from the table above) |
|---|---|---|
| apricot_pies | 86, 91 (88.5) | 96.3 |
| trench_digging | 87, 85 (86.0) | 85.2 |
| egg_frying | 98, 84 (91.0) | 93.5 |

Structure of the generated diagrams (code, no LLM), raw → guided:

| Case | Steps with a role | Lanes | Decisions (labelled branches) |
|---|---|---|---|
| feature_deployment | 100% → 80–100% | 2 → 2 | 1 → 1 |
| apricot_pies | 0% → 100% | 0 → 1 | 0 → 0 |
| trench_digging | 100% → 100% | 1 → 1 | 0 → 1 (rework loop) |
| egg_frying | 0% → 100% | 0 → 1 | 2 → 1 |

Caveat: the script answers each review question with its first option; in egg_frying that answer ("if the pan is not cast iron, no oil is added") contradicts the original text.
