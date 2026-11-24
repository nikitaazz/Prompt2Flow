| Case | Variant | Evaluator | Runs | Score mean ± SD | Score min–max | Requirements mean ± SD |
|---|---|---|---|---|---|---|
| feature_deployment | full | nvidia | 3 | 76 ± 0.0 | 76–76 | 15 ± 0.0 |
| feature_deployment | minus_step | nvidia | 3 | 55 ± 4.0 | 51–59 | 15 ± 0.0 |
| shuffled_order | full | nvidia | 3 | 91 ± 0.0 | 91–91 | 12 ± 0.0 |
| shuffled_order | minus_step | nvidia | 3 | 86 ± 0.0 | 86–86 | 12 ± 0.0 |
| apricot_pies | full | nvidia | 3 | 88 ± 0.0 | 88–88 | 19 ± 0.0 |
| apricot_pies | minus_step | nvidia | 3 | 81.3 ± 2.5 | 79–84 | 19 ± 0.0 |
| trench_digging | full | nvidia | 3 | 68.3 ± 4.5 | 64–73 | 12 ± 0.0 |
| trench_digging | minus_step | nvidia | 3 | 50 ± 0.0 | 50–50 | 12 ± 0.0 |
| egg_frying | full | nvidia | 3 | 97 ± 0.0 | 97–97 | 12 ± 0.0 |
| egg_frying | minus_step | nvidia | 3 | 87 ± 0.0 | 87–87 | 12 ± 0.0 |
| feature_deployment | full | gemini | 3 | 90.3 ± 8.1 | 81–95 | 8 ± 0.0 |
| feature_deployment | minus_step | gemini | 3 | 62 ± 0.0 | 62–62 | 8 ± 0.0 |
| apricot_pies | full | gemini | 2 | 66 ± 0.0 | 66–66 | 12 ± 0.0 |
| apricot_pies | minus_step | gemini | 1 | 56 ± 0.0 | 56–56 | 12 ± 0.0 |
| trench_digging | full | gemini | 2 | 85 ± 0.0 | 85–85 | 8 ± 0.0 |
| trench_digging | minus_step | gemini | 2 | 70 ± 0.0 | 70–70 | 8 ± 0.0 |
| egg_frying | full | gemini | 0 |  ±  | – |  ±  |
| egg_frying | minus_step | gemini | 2 | 100 ± 0.0 | 100–100 | 8 ± 0.0 |
| shuffled_order | full | gemini | 2 | 100 ± 0.0 | 100–100 | 11 ± 0.0 |
| shuffled_order | minus_step | gemini | 0 |  ±  | – |  ±  |

Score drop after removing one step (full mean − minus_step mean):

- feature_deployment / nvidia: 21 points (removed step: "Merge branch, deploy to production, remove branch, notify client")
- shuffled_order / nvidia: 5 points (removed step: "Print shipping label")
- apricot_pies / nvidia: 6.7 points (removed step: "Let dough rise")
- trench_digging / nvidia: 18.3 points (removed step: "Check digging")
- egg_frying / nvidia: 10 points (removed step: "Add plenty of oil")
- feature_deployment / gemini: 28.3 points (removed step: "Merge branch, deploy to production, remove branch, notify client")
- apricot_pies / gemini: 10 points (removed step: "Let dough rise")
- trench_digging / gemini: 15 points (removed step: "Check digging")
