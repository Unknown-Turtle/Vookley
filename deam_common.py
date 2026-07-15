"""
Shared DEAM dataset helpers (used by both the TRIBE batch runner and the
validation analysis). Only depends on numpy + pandas, so it imports cleanly
in either venv.

DEAM (MediaEval) layout varies by mirror, so everything here auto-detects:
  - audio:       any *.mp3 under data/DEAM/ whose stem is a numeric song id
  - annotations: any CSV matching *static_annotations_averaged* (often split
                 into two files, e.g. songs_1_2000 and songs_2000_2058)
DEAM's annotation CSVs are notorious for leading spaces in column names
(' valence_mean'), so we strip them.
"""
from pathlib import Path

import pandas as pd

DEAM_ROOT = Path("data/DEAM")


def find_audio_files(root: Path = DEAM_ROOT) -> dict:
    """Return {song_id (int): Path} for every numeric-stem mp3 under root."""
    out = {}
    for p in root.rglob("*.mp3"):
        try:
            out[int(p.stem)] = p
        except ValueError:
            continue  # skip non-numeric filenames
    return dict(sorted(out.items()))


def load_static_annotations(root: Path = DEAM_ROOT) -> pd.DataFrame:
    """Per-song valence/arousal means. Returns columns: id, arousal, valence."""
    csvs = list(root.rglob("*static_annotations_averaged*.csv"))
    if not csvs:
        raise SystemExit(
            f"No DEAM static-annotation CSV found under {root}. "
            "Expected a file like 'static_annotations_averaged_songs_1_2000.csv'."
        )
    frames = []
    for c in csvs:
        df = pd.read_csv(c)
        df.columns = [str(col).strip() for col in df.columns]  # kill leading spaces
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)

    # Column names vary slightly across mirrors; resolve defensively.
    id_col = _pick(df, ["song_id", "songid", "id"])
    ar_col = _pick(df, ["arousal_mean", "arousal"])
    va_col = _pick(df, ["valence_mean", "valence"])
    out = pd.DataFrame({
        "id": df[id_col].astype(int),
        "arousal": pd.to_numeric(df[ar_col], errors="coerce"),
        "valence": pd.to_numeric(df[va_col], errors="coerce"),
    }).dropna().drop_duplicates("id").reset_index(drop=True)
    return out


def _pick(df: pd.DataFrame, candidates) -> str:
    lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand in lower:
            return lower[cand]
    raise SystemExit(
        f"Could not find any of {candidates} in DEAM columns: {list(df.columns)}"
    )


if __name__ == "__main__":
    # Quick standalone inspection of what's on disk.
    audio = find_audio_files()
    print(f"audio files found: {len(audio)}")
    if audio:
        ids = list(audio)
        print(f"  id range: {ids[0]}..{ids[-1]}   e.g. {audio[ids[0]]}")
    try:
        ann = load_static_annotations()
        print(f"annotations: {len(ann)} songs")
        print(ann.describe()[["arousal", "valence"]])
    except SystemExit as e:
        print(e)
