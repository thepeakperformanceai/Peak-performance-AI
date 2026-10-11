"""PeakPerformance OVR scoring engine (Football Scoring Spec v1).

Deterministic: same inputs + same config always give the same scores.
Gemini never calls this; it only receives the payload this produces.

Input (one testing session):
{
  "athlete": {"id": "PP-0142", "age": 19, "sex": "M", "position": "MID"},
  "timing_method": "hand" | "electronic",
  "tests": {
    "sprint_30m":  {"status": "completed", "value": 4.21},
    "beep_test":   {"status": "completed", "level": 11, "shuttle": 4},
    "knee_extension": {"status": "completed", "left": 612, "right": 533,
                       "cutoffs": [200, 300, 450, 600]},   # VALD band cut-offs
    "overhead_squat": {"status": "completed", "value": 70, "band": "within_normal"},
    ...
  }
}
Statuses: completed, not_done, injured, equipment_fault, invalid.
VALD tests take "cutoffs" (4 ascending values) for precise scoring, or only
"band" / "band_left" / "band_right" labels as a fallback (scored at the band
midpoint and marked partial). Add "higher_is_better": false if a VALD metric
is better when lower.
"""

import json
from pathlib import Path

STATUSES = {"completed", "not_done", "injured", "equipment_fault", "invalid"}


def load_config(path=None):
    path = path or Path(__file__).with_name("football_v1.json")
    with open(path) as f:
        return json.load(f)


# ---------- core maths ----------

def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def _piecewise(x, xs, ss, floor, cap):
    """Straight-line interpolation through (xs, ss); xs ascending.
    Outside the range, extends the nearest segment's slope, then clamps."""
    if x <= xs[0]:
        slope = (ss[1] - ss[0]) / (xs[1] - xs[0])
        s = ss[0] + slope * (x - xs[0])
    elif x >= xs[-1]:
        slope = (ss[-1] - ss[-2]) / (xs[-1] - xs[-2])
        s = ss[-1] + slope * (x - xs[-1])
    else:
        for i in range(len(xs) - 1):
            if xs[i] <= x <= xs[i + 1]:
                s = ss[i] + (ss[i + 1] - ss[i]) * (x - xs[i]) / (xs[i + 1] - xs[i])
                break
    return _clamp(s, floor, cap)


def score_from_anchors(value, anchors, floor=25, cap=99):
    """Manual tests. anchors = [[raw_value, card_score], ...].
    Works for lower-is-better and higher-is-better automatically."""
    pts = sorted(anchors, key=lambda p: p[1])
    higher_better = pts[-1][0] > pts[0][0]
    sign = 1 if higher_better else -1
    xs = [sign * p[0] for p in pts]
    ss = [p[1] for p in pts]
    return _piecewise(sign * value, xs, ss, floor, cap)


def vald_band_edges(cutoffs):
    """4 VALD cut-offs -> 6 edges; open-ended outer bands take the width
    of their neighbouring band."""
    c = cutoffs
    return [c[0] - (c[1] - c[0]), c[0], c[1], c[2], c[3], c[3] + (c[3] - c[2])]


def score_from_vald(value, cutoffs, cfg, higher_is_better=True):
    """VALD tests: position within the band between its cut-offs."""
    if len(cutoffs) != 4 or sorted(cutoffs) != list(cutoffs):
        raise ValueError("cutoffs must be 4 ascending values")
    edges = vald_band_edges(cutoffs)
    if not higher_is_better:
        edges = [-e for e in reversed(edges)]
        value = -value
    return _piecewise(value, edges, cfg["vald_band_edge_scores"],
                      cfg["score_floor"], cfg["score_cap"])


def vald_band_index(value, cutoffs, higher_is_better=True):
    """0 = well_below ... 4 = well_above."""
    idx = sum(1 for c in cutoffs if value > c) if higher_is_better \
        else sum(1 for c in cutoffs if value < c)
    return idx


def beep_decimal(level, shuttle, cfg):
    per_level = cfg["beep_shuttles_per_level"].get(str(int(level)))
    if per_level is None:
        raise ValueError(f"unknown beep level {level}")
    return level + shuttle / per_level


def _plausible(value, rng):
    return rng is None or (rng[0] <= value <= rng[1])


# ---------- per-test scoring ----------

def _score_vald_side(value, test_in, side_band_key, cfg):
    """Returns (score, partial, band_index) for one value/side."""
    hib = test_in.get("higher_is_better", True)
    cutoffs = test_in.get("cutoffs")
    if cutoffs:
        return score_from_vald(value, cutoffs, cfg, hib), False, vald_band_index(value, cutoffs, hib)
    label = test_in.get(side_band_key) or test_in.get("band")
    if label is None:
        return None, False, None
    i = cfg["vald_band_labels"].index(label)
    return float(cfg["vald_band_midpoints"][i]), True, i


def score_test(name, test_in, tdef, cfg, timing_method):
    out = {"name": name, "status": test_in.get("status", "not_done"),
           "score": None, "partial": False, "benchmark": None}
    if out["status"] not in STATUSES:
        raise ValueError(f"{name}: unknown status {out['status']}")
    if out["status"] != "completed":
        return out

    rng = tdef.get("plausible")

    if tdef["source"] == "manual":
        out["benchmark"] = "research"
        if name == "beep_test":
            raw = beep_decimal(test_in["level"], test_in["shuttle"], cfg)
            out["raw"] = f'{test_in["level"]}.{test_in["shuttle"]}'
        else:
            raw = test_in["value"]
            out["raw"] = raw
        if not _plausible(raw, rng):
            out["status"] = "invalid"
            return out
        value = raw
        if name.startswith("sprint_") and timing_method == "hand":
            value = raw + cfg["hand_timing_offset_s"]
            out["timing"] = "hand"
        out["score"] = round(score_from_anchors(value, cfg["manual_anchors"][name],
                                                cfg["score_floor"], cfg["score_cap"]), 1)
        return out

    # VALD tests
    out["benchmark"] = "vald_age_sex"
    if tdef.get("bilateral"):
        left, right = test_in.get("left"), test_in.get("right")
        out["raw_left"], out["raw_right"] = left, right
        sides = [(v, k) for v, k in ((left, "band_left"), (right, "band_right")) if v is not None]
        if not sides:
            out["status"] = "invalid"
            return out
        if any(not _plausible(v, rng) for v, _ in sides):
            out["status"] = "invalid"
            return out
        scores, bands = [], []
        for v, key in sides:
            s, partial, b = _score_vald_side(v, test_in, key, cfg)
            if s is None:
                out["status"] = "invalid"
                return out
            scores.append(s)
            bands.append(b)
            out["partial"] = out["partial"] or partial
        out["score"] = round(sum(scores) / len(scores), 1)
        out["bands"] = bands
        out["one_side_only"] = len(sides) == 1
        if left is not None and right is not None and max(left, right) > 0:
            out["lsi"] = round(min(left, right) / max(left, right) * 100, 1)
    else:
        v = test_in.get("value")
        out["raw"] = v
        if v is None or not _plausible(v, rng):
            out["status"] = "invalid"
            return out
        s, partial, b = _score_vald_side(v, test_in, "band", cfg)
        if s is None:
            out["status"] = "invalid"
            return out
        out["score"], out["partial"], out["bands"] = round(s, 1), partial, [b]
    return out


# ---------- flags ----------

def build_flags(tests, cfg):
    flags = []
    lsi_cfg, fcfg = cfg["lsi"], cfg["flags"]
    for name, t in tests.items():
        if t["status"] != "completed":
            continue
        tdef = cfg["tests"][name]
        if t.get("one_side_only"):
            flags.append({"type": "one_side_only", "test": name, "level": "amber"})
        if tdef.get("dynamo") and "lsi" in t:
            if t["lsi"] < lsi_cfg["red_below"]:
                flags.append({"type": "LSI", "test": name, "value": t["lsi"], "level": "red"})
            elif t["lsi"] < lsi_cfg["amber_below"]:
                flags.append({"type": "LSI", "test": name, "value": t["lsi"], "level": "amber"})
        l, r = t.get("raw_left"), t.get("raw_right")
        if name == "single_leg_stand" and l is not None and r is not None:
            if abs(l - r) > fcfg["sls_side_diff_s"]:
                flags.append({"type": "asymmetry", "test": name, "value": abs(l - r), "level": "amber"})
        if name == "trunk_rotation":
            low = any(v is not None and v < fcfg["trunk_rotation_min_deg"] for v in (l, r))
            diff = l is not None and r is not None and abs(l - r) > fcfg["trunk_rotation_side_diff_deg"]
            if low or diff:
                flags.append({"type": "mobility", "test": name, "level": "amber"})
        if name == "overhead_squat" and t.get("bands") and t["bands"][0] is not None and t["bands"][0] < 2:
            flags.append({"type": "movement_quality", "test": name, "level": "amber"})
    return flags


# ---------- stats and OVR ----------

def score_session(session, cfg=None):
    cfg = cfg or load_config()
    timing = session.get("timing_method", "electronic")
    athlete = session.get("athlete", {})
    tests_in = session.get("tests", {})

    tests = {}
    for name, tdef in cfg["tests"].items():
        tests[name] = score_test(name, tests_in.get(name, {"status": "not_done"}),
                                 tdef, cfg, timing)

    # stats
    stats = {}
    for stat in cfg["stat_weights"]:
        if stat in cfg["stats_not_in_battery"]:
            stats[stat] = {"value": None, "status": "not_in_battery"}
            continue
        feeders = [(n, d) for n, d in cfg["tests"].items() if d.get("stat") == stat]
        got = [(tests[n]["score"], d["stat_weight"], tests[n]["partial"])
               for n, d in feeders if tests[n]["score"] is not None]
        if not got:
            stats[stat] = {"value": None, "status": "not_tested"}
            continue
        wsum = sum(w for _, w, _ in got)
        val = sum(s * w for s, w, _ in got) / wsum
        partial = len(got) < len(feeders) or any(p for _, _, p in got)
        stats[stat] = {"value": val, "partial": partial}

    # power cap for strong-side masking
    flags = build_flags(tests, cfg)
    if stats.get("power", {}).get("value") is not None:
        if any(f["type"] == "LSI" and f["level"] == "red" for f in flags):
            if stats["power"]["value"] > cfg["lsi"]["power_cap"]:
                stats["power"]["value"] = cfg["lsi"]["power_cap"]
                stats["power"]["capped"] = True

    # OVR
    total_w = sum(cfg["stat_weights"].values())
    avail = [(k, v["value"]) for k, v in stats.items() if v["value"] is not None]
    aw = sum(cfg["stat_weights"][k] for k, _ in avail)
    reasons = []
    for name, t in tests.items():
        if t["status"] != "completed":
            reasons.append(f"{name}: {t['status']}")
    if athlete.get("sex") in cfg["provisional_sexes"]:
        reasons.append("benchmarks are adult male only")
    if athlete.get("age") is not None and athlete["age"] < cfg["provisional_under_age"]:
        reasons.append("benchmarks are adult only")

    if len(avail) >= cfg["ovr_min_stats"] and aw / total_w >= cfg["ovr_min_weight_share"]:
        ovr_val = round(sum(cfg["stat_weights"][k] * v for k, v in avail) / aw)
        ovr = {"value": ovr_val, "provisional": bool(reasons), "reasons": reasons}
    else:
        ovr = {"value": None, "status": "pending", "message": "OVR pending: complete testing",
               "reasons": reasons}

    for v in stats.values():
        if v.get("value") is not None:
            v["value"] = round(v["value"])

    return {
        "athlete": athlete,
        "sport": cfg["sport"],
        "config_version": cfg["config_version"],
        "ovr": ovr,
        "stats": stats,
        "tests": list(tests.values()),
        "flags": flags,
    }


if __name__ == "__main__":
    import sys
    session = json.load(open(sys.argv[1]))
    print(json.dumps(score_session(session), indent=2))
