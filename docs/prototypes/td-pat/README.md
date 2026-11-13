# Touchdown then PAT prototype (#501) — throwaway, never merge

Canvas: https://claude.ai/artifact/3Utj1iHVB756fBoh3Sn7F2

- `plays.json`: `describePlays` + `timeline` output for Liberty at Coastal play …153 (58-yard TD), with the try as recorded (kick good), swapped for a two-point try (composed: no two-point play is recorded), and swapped for the recorded wording of a blocked kick.
- `template.html`: three copies of the field on one clock. A = today, B = the kick wipes the touchdown's line, C = 0.9 s hold, wipe, 0.4 s set, then the try.
- `python3 -I build.py out.html` inlines the plays and logos.
