"""Drive the deterministic pipeline (no LLM) over every edge-case CSV.

For each file: profiler -> target detection -> validator -> cleaner (with an
empty plan, since the LLM plan is separate) -> visualizer -> recommender.
Reports PASS / DEGRADE / CRASH per stage with the actual exception text and
wall-clock time, plus a peak-memory reading for the large-file case.
"""
import os, sys, time, glob, traceback, tracemalloc

sys.path.insert(0, os.path.dirname(__file__))

from app.tools.profiler import profile_csv, load_dataframe, ProfilerError
from app.tools.ml_recommender import (
    detect_target_column, detect_identifier_columns, recommend_algorithms,
)
from app.tools.validator import validate_dataset
from app.tools.cleaner import clean_csv
from app.tools.visualizer import generate_charts

EDGE = "/tmp/edge"

def run_one(path):
    fid = "test_" + os.path.splitext(os.path.basename(path))[0]
    out = {"file": os.path.basename(path)}
    t0 = time.perf_counter()
    # profiler
    try:
        prof = profile_csv(path)
        out["profile"] = f"rows={prof['shape']['rows']} cols={prof['shape']['columns']}"
    except Exception as e:
        out["profile"] = f"CRASH: {type(e).__name__}: {e}"
        out["_elapsed"] = time.perf_counter()-t0
        return out
    # target detection + identifiers
    try:
        df = load_dataframe(path)
        tcol, treason, cands = detect_target_column(df)
        ids = detect_identifier_columns(df, tcol)
        out["target"] = f"{tcol!r} ids={ids[:5]}{'...' if len(ids)>5 else ''}"
    except Exception as e:
        out["target"] = f"CRASH: {type(e).__name__}: {e}"
        tcol, treason, cands, ids = None, "", [], []
    # validator
    try:
        v = validate_dataset(df, tcol, ids)
        out["validate"] = f"valid={v['valid']} errors={v['errors'][:1]}"
    except Exception as e:
        out["validate"] = f"CRASH: {type(e).__name__}: {e}"
        v = {"valid": True}
    # cleaner (empty plan -> only identifier drop + dedup default keep).
    # Mirror the graph: an invalid dataset routes straight to END, so no
    # cleaning/visualization/recommendation runs on it.
    cleaned = None
    if not v.get("valid", True):
        out["clean"] = "SKIPPED (invalid dataset -> END)"
        out["recommend"] = "SKIPPED (invalid dataset)"
        out["_elapsed"] = time.perf_counter() - t0
        return out
    try:
        cleaned, applied, viz = clean_csv(path, {}, fid, tcol, ids)
        out["clean"] = f"ok -> {os.path.basename(cleaned)}"
    except Exception as e:
        out["clean"] = f"CRASH: {type(e).__name__}: {e}"
    # visualizer
    if cleaned:
        try:
            charts = generate_charts(viz, fid)
            out["charts"] = f"{len(charts)} chart(s)"
        except Exception as e:
            out["charts"] = f"CRASH: {type(e).__name__}: {e}"
    # recommender
    if cleaned and v.get("valid", True):
        try:
            cprof = profile_csv(cleaned)
            rec = recommend_algorithms(cleaned, cprof, tcol, treason, ids, cands)
            out["recommend"] = f"type={rec['problem_type']} top={rec['top_recommendation']} warnings={rec.get('warnings')}"
        except Exception as e:
            out["recommend"] = f"CRASH: {type(e).__name__}: {e}"
    elif not v.get("valid", True):
        out["recommend"] = "SKIPPED (invalid dataset)"
    out["_elapsed"] = time.perf_counter()-t0
    return out

def main():
    files = sorted(glob.glob(os.path.join(EDGE, "*.csv")))
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for path in files:
        if only and only not in path:
            continue
        big = "10_large" in path
        if big:
            tracemalloc.start()
        r = run_one(path)
        print("="*70)
        print(f"FILE: {r['file']}   ({r.get('_elapsed',0):.2f}s)")
        for k in ("profile","target","validate","clean","charts","recommend"):
            if k in r:
                print(f"  {k:10s}: {r[k]}")
        if big:
            cur, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            print(f"  peak_mem  : {peak/1e6:.1f} MB (python-tracked)")
    print("="*70, "\nHARNESS DONE")

if __name__ == "__main__":
    main()
