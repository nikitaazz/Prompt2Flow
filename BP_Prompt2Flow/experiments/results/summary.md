| Case | Variant | Evaluator | Runs | Score mean ± SD | Score min–max | Requirements mean ± SD |
|---|---|---|---|---|---|---|
| feature_deployment | full | nvidia | 5 | 94.4 ± 3.0 | 91–98 | 14.6 ± 1.9 |
| feature_deployment | full | gemini | 5 | 96 ± 0.0 | 96–96 | 9 ± 0.0 |
| feature_deployment | minus_step | nvidia | 5 | 61.8 ± 3.3 | 58–67 | 12.6 ± 1.1 |
| feature_deployment | minus_step | gemini | 5 | 59 ± 4.5 | 57–67 | 9.2 ± 0.4 |
| apricot_pies | full | nvidia | 4 | 80 ± 13.4 | 68–94 | 18.2 ± 1.7 |
| apricot_pies | full | gemini | 4 | 77 ± 0.0 | 77–77 | 10 ± 0.0 |
| apricot_pies | minus_step | nvidia | 5 | 66 ± 2.0 | 64–68 | 19 ± 1.6 |
| apricot_pies | minus_step | gemini | 4 | 85.2 ± 1.5 | 84–87 | 11 ± 0.8 |
| trench_digging | full | nvidia | 5 | 72.8 ± 7.1 | 66–84 | 12.6 ± 0.9 |
| trench_digging | minus_step | nvidia | 5 | 63 ± 5.8 | 58–71 | 11.2 ± 0.8 |
| egg_frying | full | nvidia | 5 | 95 ± 1.2 | 93–96 | 14.4 ± 1.5 |
| egg_frying | minus_step | nvidia | 5 | 87.4 ± 4.0 | 82–92 | 16 ± 2.5 |

Score drop after removing one step (full mean − minus_step mean):

- feature_deployment / nvidia: 32.6 points (removed step: "Merge branch, deploy to production, remove branch, notify client")
- feature_deployment / gemini: 37 points (removed step: "Merge branch, deploy to production, remove branch, notify client")
- apricot_pies / nvidia: 14 points (removed step: "Let dough rise")
- apricot_pies / gemini: -8.2 points (removed step: "Let dough rise")
- trench_digging / nvidia: 9.8 points (removed step: "Check digging")
- egg_frying / nvidia: 7.6 points (removed step: "Add plenty of oil")
