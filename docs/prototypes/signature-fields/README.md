# PROTOTYPE: signature fields (#397). Never merge this branch.

Question: how do Boise State's blue, Coastal Carolina's teal and Eastern Michigan's gray turf,
and LSU's numbers every 5 yards, look on the live field card at 360px, light and dark?

- Published page: https://claude.ai/artifact/XH2iDuiEMxaUeE4eiVVgoq (private)
- `signature-fields.template.html` is the page source; `__LOGOS__` was replaced with the
  `public/logos/espn/*.png` files as data URIs before publishing.
- The field copies `src/app/(member)/live/field-card.tsx` plus design A end zones from #395.
- Verdict: recorded on #397 when it closes.
