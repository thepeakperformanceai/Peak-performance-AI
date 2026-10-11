# PeakPerformance Football Scoring Engine (v1)

Implements the Football OVR Scoring Spec v1. Turns one testing session into
test scores, six stats and an OVR, plus flags, as a JSON payload for Gemini.

## Files
- `football_v1.json` - all benchmarks, weights and thresholds. Change numbers here, not in code.
- `scoring.py` - the engine. `score_session(session)` returns the Gemini payload.
- `test_scoring.py` - 14 checks against the spec. Run: `python test_scoring.py`
- `sample_session.json` / `sample_output.json` - example input and output.

## Try it
    python scoring.py sample_session.json

## Not included yet
- VALD API sync: it only needs to produce the same input format (values, sides, cut-offs).
- Gemini prompt and output check: see the spec's Gemini handoff section.
- Benchmarks are interim (manual tests approximate; VALD cut-offs in the sample are made up).
