# Trainer materials

**Trainer only.** Keep this folder out of a participant-only copy of the repository.

| File | Contents |
| --- | --- |
| [`day1_answer_key.md`](day1_answer_key.md) | The verified expected result, the row-level breakdown, the reason each rule exists, the common mistakes and where to look when something goes wrong. |
| `../src/validation.py` | The reusable reference implementation of the pipeline. |
| `../src/rules.py` | The declared rule catalog, with the reasoning behind each rule. |
| `../notebooks/day1_pipeline.ipynb` | The trainer's readable implementation, used in the session. |

The answer key and the notebook are kept in agreement by the test suite:

```bash
python -m pytest tests/test_notebook_parity.py
```

That test executes the notebook's pipeline cells and checks that the notebook and
the module agree on every record, every reason, every warning and every finding. If
it fails, the notebook is not ready to be taught from.

The session run sheet, with timings and checkpoints, is in
`../../../docs/day1-session-plan.md`.
