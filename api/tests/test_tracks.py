from aloft.opensky.tracks import (
    Waypoint,
    detect_gaps,
    downsample,
    great_circle,
    haversine_km,
    parse_opensky_path,
    path_distance_km,
    track_matches_route,
    track_overlaps_window,
)


def _wp(t: int, lat: float, lon: float, alt: float | None = 10000.0, ground: bool = False) -> Waypoint:
    return Waypoint(t=t, lat=lat, lon=lon, alt_m=alt, heading=None, on_ground=ground)


# ---------------------------------------------------------------------------
# parse_opensky_path
# ---------------------------------------------------------------------------

def test_parse_opensky_path_drops_nulls_and_out_of_range() -> None:
    raw = [
        [1_700_000_000, 50.1, 8.6, 10000.0, 90.0, False],     # valid
        [1_700_000_010, None, 8.6, 10000.0, 90.0, False],     # null lat
        [1_700_000_020, 95.0, 8.6, 10000.0, 90.0, False],     # lat out of range
        [1_700_000_030, 50.1, 8.6, None, None, True],         # valid (nulls allowed for alt/heading)
        None,                                                  # skip None rows
        [1_700_000_040, 50.1, 8.6, 10000.0],                  # too few fields
    ]
    parsed = parse_opensky_path(raw)
    assert [p["t"] for p in parsed] == [1_700_000_000, 1_700_000_030]
    assert parsed[1]["alt_m"] is None
    assert parsed[1]["on_ground"] is True


# ---------------------------------------------------------------------------
# downsample
# ---------------------------------------------------------------------------

def test_downsample_preserves_endpoints_and_caps_count() -> None:
    points = [_wp(t * 10, 50.0 + t * 0.001, 8.0 + t * 0.001) for t in range(2000)]
    result = downsample(points, max_points=500)
    # Stride math gives <= max_points + small slack from anchors. We allow
    # mild overshoot but it must compress.
    assert 100 < len(result) <= 600
    assert result[0] == points[0]
    assert result[-1] == points[-1]


def test_downsample_returns_input_when_under_cap() -> None:
    points = [_wp(t, 0, 0) for t in range(50)]
    assert downsample(points, max_points=500) == points


def test_downsample_keeps_ground_transitions() -> None:
    # 200 ground points, then 200 in the air. The transition (index 199→200)
    # should survive downsampling so the takeoff is visible.
    points = (
        [_wp(t, 50, 8, alt=0, ground=True) for t in range(200)]
        + [_wp(200 + t, 50.1 + t * 0.001, 8 + t * 0.001, alt=10000.0) for t in range(200)]
    )
    result = downsample(points, max_points=50)
    has_ground = any(p["on_ground"] for p in result)
    has_air = any(not p["on_ground"] for p in result)
    assert has_ground and has_air


# ---------------------------------------------------------------------------
# detect_gaps
# ---------------------------------------------------------------------------

def test_detect_gaps_marks_only_spans_above_threshold() -> None:
    points = [
        _wp(0, 50, 8),
        _wp(30, 50, 8),       # 30s gap (below threshold)
        _wp(120, 50, 8),      # 90s gap (above threshold)
        _wp(150, 50, 8),      # 30s gap (below threshold)
        _wp(900, 50, 8),      # 750s gap (huge — oceanic-style)
    ]
    gaps = detect_gaps(points, threshold_s=60)
    assert len(gaps) == 2
    assert gaps[0] == {"start": 30, "end": 120, "duration_s": 90}
    assert gaps[1]["duration_s"] == 750


def test_detect_gaps_empty_for_dense_track() -> None:
    points = [_wp(t * 5, 50, 8) for t in range(100)]
    assert detect_gaps(points, threshold_s=60) == []


# ---------------------------------------------------------------------------
# great_circle + haversine
# ---------------------------------------------------------------------------

def test_great_circle_endpoints_match() -> None:
    pts = great_circle(50.0, 8.0, 40.7, -74.0, segments=8)
    assert len(pts) == 9
    assert abs(pts[0]["lat"] - 50.0) < 1e-6
    assert abs(pts[0]["lon"] - 8.0) < 1e-6
    assert abs(pts[-1]["lat"] - 40.7) < 1e-6
    assert abs(pts[-1]["lon"] - (-74.0)) < 1e-6


def test_haversine_known_distance() -> None:
    # FRA (50.0379, 8.5622) → JFK (40.6413, -73.7781) is ~6200 km
    d = haversine_km(50.0379, 8.5622, 40.6413, -73.7781)
    assert 6100 < d < 6300


def test_path_distance_sums_segments() -> None:
    points = [_wp(0, 0, 0), _wp(60, 0, 1), _wp(120, 0, 2)]
    # Each 1° at the equator ≈ 111 km
    d = path_distance_km(points)
    assert 220 < d < 224


def test_track_overlaps_window_rejects_previous_leg() -> None:
    points = [
        _wp(1_000, 42.7, 21.7),
        _wp(1_600, 51.4, 5.3),
    ]
    assert not track_overlaps_window(points, first_seen_utc=6_000, last_seen_utc=8_000)


def test_track_matches_route_rejects_wrong_destination() -> None:
    # Looks like a previous inbound leg to EIN, not EIN -> VNO.
    points = [
        _wp(0, 42.7599, 21.767),
        _wp(60, 50.3636, 10.3121),
        _wp(120, 51.4316, 5.3538),
    ]
    assert not track_matches_route(
        points,
        dep_lat=51.4500999451,
        dep_lon=5.37452983856,
        arr_lat=54.634102,
        arr_lon=25.285801,
    )


def test_track_matches_route_accepts_sparse_valid_track() -> None:
    points = [
        _wp(0, 51.4501, 5.3745),
        _wp(60, 53.1, 15.2),
        _wp(120, 54.6341, 25.2858),
    ]
    assert track_matches_route(
        points,
        dep_lat=51.4500999451,
        dep_lon=5.37452983856,
        arr_lat=54.634102,
        arr_lon=25.285801,
    )
