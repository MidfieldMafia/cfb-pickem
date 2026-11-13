# Inline the plays and the two logos into template.html: python3 build.py OUT.html
import base64, json, sys, pathlib
here = pathlib.Path(__file__).parent
root = here.parents[2]
b64 = lambda p: "data:image/png;base64," + base64.b64encode((root / p).read_bytes()).decode()
html = (here / "template.html").read_text()
html = html.replace("__DATA__", json.dumps(json.loads((here / "plays.json").read_text())))
html = html.replace("__LIB__", b64("public/logos/liberty.png")).replace("__CCU__", b64("public/logos/coastal-carolina.png"))
pathlib.Path(sys.argv[1]).write_text(html)
