#!/bin/bash
# fetch-raw.sh — download the target library's raw source files into targets/_raw/.
# Run this on the Mac (normal internet needed): bash tools/fetch-raw.sh
# curl-only, no other dependencies. Idempotent: skips files already present.
# md5 checks where the source publishes one (archive.org metadata API).
set -uo pipefail
cd "$(dirname "$0")/../_raw" || exit 1

fail=0
have_md5() { command -v md5 >/dev/null && echo mac || echo linux; }
check_md5() { # file expected
  local got
  if [ "$(have_md5)" = mac ]; then got=$(md5 -q "$1"); else got=$(md5sum "$1" | cut -d' ' -f1); fi
  if [ "$got" = "$2" ]; then echo "  md5 OK  $1"; else echo "  md5 MISMATCH $1 (got $got, want $2)"; fail=1; fi
}
get() { # outfile url [md5]
  if [ -f "$1" ]; then echo "skip (exists): $1"; else
    echo "fetching $1"
    curl -L --fail --retry 3 -o "$1" "$2" || { echo "  FAILED: $2"; fail=1; return; }
  fi
  [ -n "${3:-}" ] && [ -f "$1" ] && check_md5 "$1" "$3"
}
get_fs() { # outfile hq_url lq_url  (Freesound previews: try HQ, fall back to LQ)
  if [ -f "$1" ]; then echo "skip (exists): $1"; return; fi
  echo "fetching $1 (HQ preview)"
  curl -L --fail --retry 2 -o "$1" "$2" || { echo "  HQ 404 — falling back to LQ"; curl -L --fail --retry 3 -o "$1" "$3" || { echo "  FAILED: $3"; fail=1; }; }
}

# — tier A —
get birdsong-thrush-nps.mp3 "https://www.nps.gov/nps-audiovideo/legacy/mp3/nri/avElement/nri-HermitThrushYOSE.mp3"
get applause-madrid.flac    "https://archive.org/download/aporee_48779_55529/STE00620200424201606.flac" "0f934254eba327adb5d2f09de0275151"
# — tier B —
get speech-female-en.mp3    "https://archive.org/download/pride_prejudice_krs_librivox/pride_and_prejudice_01_austen.mp3" "59aa81cfafdc7f8462ead8a3c2128236"
get speech-ja.mp3           "https://archive.org/download/gongitsune_um_librivox/gongitsune_01_niimi.mp3" "9c7f46fa01e8568cf0da058176d5d1e5"
get piano-goldberg.flac     "https://archive.org/download/OpenGoldbergVariations/Kimiko%20Ishizaka%20-%20J.S.%20Bach-%20-Open-%20Goldberg%20Variations%2C%20BWV%20988%20%28Piano%29%20-%2001%20Aria.flac" "ee58bd30c6276012808ece98dcdc1685"
get_fs castanets.mp3        "https://cdn.freesound.org/previews/57/57299_170972-hq.mp3" "https://cdn.freesound.org/previews/57/57299_170972-lq.mp3"
get orchestra-beethoven5.mp3 "https://archive.org/download/SymphonyNo.5/Ludwig_van_Beethoven_-_symphony_no._5_in_c_minor_op._67_-_i._allegro_con_brio.mp3" "5eb9d48434ae1a817837822f0d9edfd8"
# drumloop + whisper now use the owner's own recordings (in _raw/); downloads no longer needed
get_fs micro-flute.mp3      "https://cdn.freesound.org/previews/373/373335_2475994-hq.mp3" "https://cdn.freesound.org/previews/373/373335_2475994-lq.mp3"
get_fs micro-kick.mp3       "https://cdn.freesound.org/previews/371/371192_6399962-hq.mp3" "https://cdn.freesound.org/previews/371/371192_6399962-lq.mp3"
get_fs micro-bell.mp3       "https://cdn.freesound.org/previews/374/374273_2475994-hq.mp3" "https://cdn.freesound.org/previews/374/374273_2475994-lq.mp3"
get train-steam.flac        "https://archive.org/download/aporee_58159_66684/0011321steamtrainBranikStationedit.flac" "ff7fa7efefb781e77d17836f778bfd7f"
get stream-muirwoods.mp3    "https://www.nps.gov/nps-audiovideo/legacy/mp3/nri/avElement/nri-StreamMUWO.mp3"
get edison-1917.flac        "https://archive.org/download/edison-50443_01_5659/cusb_ed_50443_01_5659_0c.flac" "4134a386fd5415e45ef9d5731e50ac98"

echo
if [ "$fail" = 0 ]; then
  echo "All raw files present. Next: tell the Cowork session, which runs analyze + build in the VM."
else
  echo "Some downloads failed or mismatched — see above. Alternates for every slot are in manifest.json."
fi
