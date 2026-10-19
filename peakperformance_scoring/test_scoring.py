"""Run: python test_scoring.py"""

from scoring import load_config, score_from_anchors, score_from_vald, score_session

cfg = load_config()
A = cfg["manual_anchors"]
FULL = {
    "athlete": {"id": "T-1", "age": 22, "sex": "M", "position": "MID"},
    "timing_method": "electronic",
    "tests": {
        "sprint_10m": {"status": "completed", "value": 1.85},
        "sprint_30m": {"status": "completed", "value": 4.30},
        "ruler_drop": {"status": "completed", "value": 11.0},
        "cod_505": {"status": "completed", "left": 2.62, "right": 2.59},
        "single_leg_stand": {"status": "completed", "left": 20, "right": 22, "cutoffs": [3, 8, 15, 25]},
        "trunk_rotation": {"status": "completed", "left": 45, "right": 47, "cutoffs": [20, 30, 40, 55]},
        "overhead_squat": {"status": "completed", "value": 70, "cutoffs": [30, 50, 65, 80]},
        "hip_extension": {"status": "completed", "left": 400, "right": 390, "cutoffs": [150, 250, 350, 500]},
        "knee_extension": {"status": "completed", "left": 500, "right": 480, "cutoffs": [200, 300, 450, 600]},
    },
}


def copy(session):
    import copy as c
    return c.deepcopy(session)


def close(a, b, tol=0.15):
    return abs(a - b) <= tol


def test_anchor_points_exact():
    assert close(score_from_anchors(4.30, A["sprint_30m"]), 70)
    assert close(score_from_anchors(11.0, A["ruler_drop"]), 85)
    assert close(score_from_anchors(2.59, A["cod_505"]), 70)


def test_anchor_interpolation_and_limits():
    assert close(score_from_anchors(4.20, A["sprint_30m"]), 77.5)   # halfway 4.30 -> 4.10
    assert score_from_anchors(3.50, A["sprint_30m"]) == 99            # capped
    assert score_from_anchors(9.00, A["sprint_30m"]) == 25            # floored


def test_hand_timing_correction():
    s = copy(FULL)
    s["timing_method"] = "hand"
    s["tests"]["sprint_30m"]["value"] = 4.08          # +0.22 = 4.30 -> 70
    out = score_session(s, cfg)
    t = next(t for t in out["tests"] if t["name"] == "sprint_30m")
    assert close(t["score"], 70)


def test_vald_shiraz_jump():
    # VALD jump bands 14.4 / 23.1 / 35.7 / 49.3 cm; 37.2 cm ~ 71 per spec
    assert close(score_from_vald(37.2, [14.4, 23.1, 35.7, 49.3], cfg), 71.7)
    assert close(score_from_vald(35.7, [14.4, 23.1, 35.7, 49.3], cfg), 70)
    assert close(score_from_vald(23.1, [14.4, 23.1, 35.7, 49.3], cfg), 55)


def test_vald_label_only_is_midpoint_and_partial():
    s = copy(FULL)
    s["tests"]["overhead_squat"] = {"status": "completed", "value": 70, "band": "within_normal"}
    out = score_session(s, cfg)
    t = next(t for t in out["tests"] if t["name"] == "overhead_squat")
    assert t["score"] == 63 and t["partial"]


def test_full_session_not_provisional_endurance_excluded():
    out = score_session(FULL, cfg)
    assert out["ovr"]["value"] is not None
    assert not out["ovr"]["provisional"]
    assert out["stats"]["endurance"]["status"] == "not_in_battery"
    assert "beep_test" not in cfg["tests"]


def test_missing_505_injured():
    s = copy(FULL)
    s["tests"]["cod_505"] = {"status": "injured"}
    out = score_session(s, cfg)
    assert out["stats"]["agility"]["status"] == "not_tested"
    assert out["ovr"]["provisional"]
    assert "cod_505: injured" in out["ovr"]["reasons"]


def test_505_best_of_both_feet():
    out = score_session(FULL, cfg)
    t = next(t for t in out["tests"] if t["name"] == "cod_505")
    assert (t["raw_left"], t["raw_right"], t["raw"]) == (2.62, 2.59, 2.59)
    assert close(t["score"], 70)
    s = copy(FULL)
    s["tests"]["cod_505"] = {"status": "completed", "right": 2.46}
    t = next(t for t in score_session(s, cfg)["tests"] if t["name"] == "cod_505")
    assert close(t["score"], 85)
    s["tests"]["cod_505"] = {"status": "completed", "left": 2.5, "right": 9.9}
    t = next(t for t in score_session(s, cfg)["tests"] if t["name"] == "cod_505")
    assert t["status"] == "invalid"


def test_one_test_missing_in_speed_is_partial():
    s = copy(FULL)
    s["tests"]["sprint_10m"] = {"status": "not_done"}
    out = score_session(s, cfg)
    assert out["stats"]["speed"]["partial"]
    assert out["stats"]["speed"]["value"] == 70        # = 30m score alone


def test_power_cap_on_red_lsi():
    s = copy(FULL)
    s["tests"]["knee_extension"] = {"status": "completed", "left": 640, "right": 500,
                                    "cutoffs": [200, 300, 450, 600]}   # LSI 78%
    s["tests"]["hip_extension"] = {"status": "completed", "left": 560, "right": 540,
                                   "cutoffs": [150, 250, 350, 500]}
    out = score_session(s, cfg)
    assert out["stats"]["power"]["value"] == 75 and out["stats"]["power"].get("capped")
    assert any(f["type"] == "LSI" and f["level"] == "red" for f in out["flags"])


def test_ovr_pending_when_too_few_stats():
    s = {"athlete": {"age": 20, "sex": "M"}, "tests": {
        "ruler_drop": {"status": "completed", "value": 15},
        "single_leg_stand": {"status": "completed", "left": 20, "right": 20, "cutoffs": [3, 8, 15, 25]},
    }}
    out = score_session(s, cfg)
    assert out["ovr"]["value"] is None and out["ovr"]["status"] == "pending"


def test_implausible_value_is_invalid():
    s = copy(FULL)
    s["tests"]["sprint_30m"]["value"] = 2.1
    out = score_session(s, cfg)
    t = next(t for t in out["tests"] if t["name"] == "sprint_30m")
    assert t["status"] == "invalid" and t["score"] is None


def test_female_and_youth_provisional():
    s = copy(FULL)
    s["athlete"]["sex"] = "F"
    assert score_session(s, cfg)["ovr"]["provisional"]
    s = copy(FULL)
    s["athlete"]["age"] = 16
    assert score_session(s, cfg)["ovr"]["provisional"]


def test_one_side_only_flag():
    s = copy(FULL)
    s["tests"]["hip_extension"] = {"status": "completed", "left": 400, "cutoffs": [150, 250, 350, 500]}
    out = score_session(s, cfg)
    assert any(f["type"] == "one_side_only" for f in out["flags"])


def test_deterministic():
    assert score_session(FULL, cfg) == score_session(FULL, cfg)


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in tests:
        t()
        print(f"PASS  {t.__name__}")
    print(f"\nAll {len(tests)} tests passed.")
