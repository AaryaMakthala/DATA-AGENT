"""Regression tests for the charts-ZIP download path (manifest-based resolution).

Root cause being pinned: `/download/charts/{file_id}` used to glob
`{file_id}_*.png`, but `build_artifact_filename` names charts from the ORIGINAL
upload name (e.g. `Titanic-Dataset_bar_chart_Sex.png`) and only appends a
file_id fragment on a collision -- so the glob matched nothing and the route
404'd for every modern run. Resolution must come from the report JSON's
`charts` manifest instead.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest

from app.services import file_service
from app.utils.config import Config


@pytest.fixture
def artifact_dirs(tmp_path, monkeypatch):
    """Point Config's charts/reports folders at a temp dir for the test."""
    charts = tmp_path / "charts"
    reports = tmp_path / "reports"
    charts.mkdir()
    reports.mkdir()
    monkeypatch.setattr(Config, "CHARTS_FOLDER", charts)
    monkeypatch.setattr(Config, "REPORTS_FOLDER", reports)
    return charts, reports


def _write_report(reports, file_id: str, chart_paths: list) -> None:
    (reports / f"{file_id}.json").write_text(
        json.dumps({"charts": chart_paths}), encoding="utf-8"
    )


def test_manifest_resolution_with_human_readable_names(artifact_dirs):
    """Charts named after the upload (no file_id anywhere) must resolve."""
    charts, reports = artifact_dirs
    file_id = "a" * 32
    names = [
        "Titanic-Dataset_bar_chart_Sex.png",
        "Titanic-Dataset_correlation_heatmap.png",
    ]
    for name in names:
        (charts / name).write_bytes(b"png")
    # Manifest stores metadata dicts with absolute paths (possibly stale roots).
    _write_report(
        reports,
        file_id,
        [{"path": f"/some/old/root/{n}", "chart_type": "bar"} for n in names],
    )

    resolved = file_service.resolve_chart_paths(file_id)
    assert sorted(p.name for p in resolved) == sorted(names)


def test_manifest_skips_missing_files_and_dedupes(artifact_dirs):
    charts, reports = artifact_dirs
    file_id = "b" * 32
    (charts / "data_histogram_Age.png").write_bytes(b"png")
    _write_report(
        reports,
        file_id,
        [
            {"path": "data_histogram_Age.png"},
            {"path": "/abs/data_histogram_Age.png"},  # duplicate basename
            {"path": "data_deleted_chart.png"},  # purged from disk
        ],
    )
    resolved = file_service.resolve_chart_paths(file_id)
    assert [p.name for p in resolved] == ["data_histogram_Age.png"]


def test_legacy_bare_string_manifest_entries(artifact_dirs):
    """Old reports stored charts as bare path strings, not metadata dicts."""
    charts, reports = artifact_dirs
    file_id = "c" * 32
    (charts / "old_scatter.png").write_bytes(b"png")
    _write_report(reports, file_id, ["/old/root/old_scatter.png"])
    resolved = file_service.resolve_chart_paths(file_id)
    assert [p.name for p in resolved] == ["old_scatter.png"]


def test_legacy_glob_fallback_when_no_report(artifact_dirs):
    """Pre-manifest runs named charts `{file_id}_*.png` and had no usable report."""
    charts, _reports = artifact_dirs
    file_id = "d" * 32
    (charts / f"{file_id}_bar_Sex.png").write_bytes(b"png")
    resolved = file_service.resolve_chart_paths(file_id)
    assert [p.name for p in resolved] == [f"{file_id}_bar_Sex.png"]


def test_empty_when_nothing_exists(artifact_dirs):
    assert file_service.resolve_chart_paths("e" * 32) == []


def test_download_endpoint_returns_zip_with_every_chart(artifact_dirs):
    """Full route: /download/charts/{file_id} -> 200, ZIP contains all PNGs."""
    from fastapi.testclient import TestClient

    from app.main import app

    charts, reports = artifact_dirs
    file_id = "f" * 32
    names = ["Titanic-Dataset_bar_chart_Sex.png", "Titanic-Dataset_histogram_Age.png"]
    for name in names:
        (charts / name).write_bytes(b"fake-png-bytes")
    _write_report(reports, file_id, [{"path": n} for n in names])

    client = TestClient(app)
    response = client.get(f"/download/charts/{file_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert sorted(archive.namelist()) == sorted(names)
        for name in names:
            assert archive.read(name) == b"fake-png-bytes"


def test_download_endpoint_404_when_no_charts(artifact_dirs):
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.get(f"/download/charts/{'9' * 32}")
    assert response.status_code == 404
