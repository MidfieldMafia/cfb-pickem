import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const ROOT = new URL(".", import.meta.url).pathname;
const teams = JSON.parse(readFileSync("/Users/jonahmabry/workspace/cfb-pickem/src/lib/logos.json", "utf8"));

const FLAG_BLOB = {
"04":"9f23f743806663b61349284812005af7","05":"136551ca4cb64cc5990a88384b79afe7","06":"d6acb45dd72486c6b031fbf45c96ef1d",
"07":"bdfbcfae5884ede215510c9bbaeb61a2","13":"03b0402dd6a62d12b3a459019850fb8d","14":"b9cbd7497a2ac8e87ffbe398efc88b99",
"15":"67b1225445a6b386e2754e12184dd3da","16":"8a87f7615d4d02b721bea68bad9fbfe9","17":"f1d9ff5ecbed2d1b70f127ce6c84073f",
"18":"1c7fd7fb865bf509921dddec0695bd62","19":"03ca2e7274a05d5555076e1d0633af7a","20":"30f0cd2f6a68b610688c1c2abd7bb891",
};

// The 150px marks (`public/logos/<slug>.png`) — what the app's own logoSrc()
// serves. The 32px `espn/` set above is too small for a 72px disc on a 3x phone.
const SLUG = {
"alabama":"a51bab6bb47efc0606d6a226136cdbe8","arkansas":"63dcdb437203669389ba7a9a489f89dc","auburn":"3ba2cf22324af776e50ff8a5d915af84",
"florida":"5cf7f368b20ab8337ea759a59d5708f5","georgia":"f2bf202b40956b8ce68f0354ad374041","kentucky":"dd93f8bffc4c11d697ae2b8559232233",
"lsu":"0dc11e47b388ef9909c708131dbbea11","mississippi-state":"60bb3109bc8dad09aadfd4e36d7894ca","missouri":"24c7ab06fd40118ac71506e876750ac8",
"oklahoma":"b79533502407548d6cbca401311d9dd0","ole-miss":"0bc8d71453f443ef7cd47d1632a6a55b","south-carolina":"a4127cb3d3fbeeb8ec39b74b5e667941",
"tennessee":"6d30d1e03c341add2dc1cf499b152ccd","texas":"59294d54c7fa4f3a32adfcdb06e6eb19","texas-aandm":"72e25fbc3cf37f47a875d774be55d436",
"vanderbilt":"9fb0322b6e6a52ebc6df8a33f49a4338","illinois":"b60210c71d18e330cb01c55ea8a3309d","indiana":"23efc4a05868fb21b78588fcf994c682",
"iowa":"51c982567b044f5b962d4ac64ae3397f","maryland":"edfec768e65b632810c7aa44b4906469","michigan":"d91fd1a753e7c16c88848d97b65b42ed",
"michigan-state":"175ea84870446d1c16a729e84968155b","minnesota":"63b1d194b08576c998e8b69d7d9e6fd1","nebraska":"94ec814dbdd194f49c3ba3b63b004de4",
"northwestern":"0084e29d57e4720e3b416888837ab051","ohio-state":"acfbc7df7fcb003fbde2050257e5cf69","oregon":"1937e41cbf542462d9bade9314ad208e",
"penn-state":"2c486051ddf8eeb8c8b0abe6ad1df76f","purdue":"a3bcb44caf62e82ebbef5644dd35e044","rutgers":"2eccc4c049e27a30840cf081025eb7ef",
"ucla":"6e98cfffd5f46aa72b61459bd03d3b23","usc":"aaac1fc44a14491e71b50b1f8e6f9ff8","washington":"0731cc707c8c7953696654bb7cbedc91",
"wisconsin":"123079bd9a0b17fa4b8f9cb2cbe8d248","arizona":"425d352e8c7875a48b74415fa810be1c","arizona-state":"247cb9756b53cbfc1fbdc04c78431f54",
"baylor":"c66088be726ec27c714b741ec6573bcf","byu":"04f71cba1e39d24b229ba66655e2e95e","cincinnati":"cdaeae4a0b2433614a8159457e14aaa2",
"colorado":"f2e4e5b301a95d5535795f81dbeca06d","houston":"03e318f5ee61327bd054ee50571e84a5","iowa-state":"c3e17a0839a6c23be6a8ab514b40aaa1",
"kansas":"b7cfb07c8b917ca9f40d7f8efa0d508c","kansas-state":"3a15ee0650c65dc03bcb7122dc41944a","oklahoma-state":"146e7c4dff32435267601e2ce4eb1d9a",
"tcu":"ebb0e7561a1b7e18aed78808463dbd2a","texas-tech":"6eed7200d8d362c95931981b72686ff6","ucf":"abd58b6f301805c8a54a35cff1a652d3",
"utah":"be0071659310b9a271764bb4b6eff180","west-virginia":"a698437504cd034b7bc54cadfb35903f","boston-college":"3d644ac5ff9f5d9ae683707f553887e5",
"california":"c8d933a6ad88b5df133eff91534a8239","clemson":"79901d30271ac56b639b2dd3ae539e30","duke":"ff20b83d1b0315979d5c510e8d286c98",
"florida-state":"e35b3e71003667a9445f0fdbf4b6d126","georgia-tech":"d39a74fd4d4180520d9e2e11ba8c1ac5","louisville":"25035c422dcdce11294672abc03faffe",
"miami":"fe03e328917bf15a0c5218db0a3fecef","north-carolina":"e958ae3eb02eba774aa35aead86ee049","nc-state":"9244994a5cf639b509a6d848e67fce9f",
"pittsburgh":"f0284fce9987c3358d45b2350be4d2e4","smu":"5c6311a80420ee96c3039bae53827c8e","stanford":"8d4550cbee1b0eeae31f0fddbbfa9cdb",
"syracuse":"9582afefcdf5bfd09f7c19b2fad844ce","virginia":"d593b2360f4dd2f6c937902b16d21345","virginia-tech":"3bc5ac7ab5346f2fd3ed86bc489b3103",
"wake-forest":"02d80861665bb8933896d6a635d2b8c6","notre-dame":"8c35271a1286dd3a569b97e309fb269d","uconn":"d49fbc624d3aff9859a98bbcd1f4ce6b",
"army":"586d17f7816956cb76c5b54920893a7c","charlotte":"c92e89a29aede77c315eda7ce88b64a3","east-carolina":"c487188d86b03fcb19c8017e52657773",
"florida-atlantic":"f2e1b19bd1f88443b21d3ce8264177e6","memphis":"2fb9101e0e5967a0a2d8a7f28d3cba93","navy":"115977ddc6048f7e1bee6a7435df77e0",
"north-texas":"b4849420043475924386d66a9b3e7eb5","rice":"8901bba927b14674323a054bf4304541","south-florida":"7934c5ec922f4e63dc3bb0ac150a9809",
"temple":"f9fa412412a05c37c26da9c6b37a1a28","tulane":"d2489570c2f8bb97e637dbe1ce07f2b0","tulsa":"c9b0f0b1d24c902521f301f229bffed5",
"uab":"eb4296a232c96a07e03e8b57f4a3d0b8","utsa":"588f65983f0f5dafa8ef105c2d43319e","air-force":"a52bd1290de381c255f3f4fb37255d51",
"boise-state":"aca134afc0f338c02c3882c898706e0d","colorado-state":"1f99681fe640e2bb8da942e04092d028","fresno-state":"9edf921486c2e0251c393600f923eef9",
"hawaii":"2c40151f6e93b8cbcfc766e42dade0b3","nevada":"acb7d7a0277ea5a6d58d2ce20fec8719","new-mexico":"a1b3f0d93f5f5a979121c79e05d4e4b3",
"san-diego-state":"a722a84083574cfc49b99f41697a37ad","san-jose-state":"6a43601dc154a651dbf446dd8a6b05f6","unlv":"07864db8ea657b0d3e161c271b9424b8",
"utah-state":"1d59cbc955037cd0f77017756aa8c172","wyoming":"2e56f5701f873b0f40687e1df1ca6bfd","oregon-state":"15804decd47b1b49405b56a7b13f0386",
"washington-state":"dea5410905585c783e49d687181873b8","appalachian-state":"af91bde22e1d17c16d3b716bb672acaa","arkansas-state":"30a6e35db33b4927780ee930c9efe014",
"coastal-carolina":"1f4a7548d0aa5e211f6cd1a6ee384eae","georgia-southern":"0dde72b304645222b831bd6edd8a468a","georgia-state":"00b27abf99878dac796fdc025516971b",
"james-madison":"8bb281d13995a671ab407f2596fa1d28","louisiana":"55f6864bddd84f1fa79f9732b9752681","ul-monroe":"273f0f260e986aaef17ea8f72c684663",
"marshall":"d58d0423ccf7d594845bad6e0ec87852","old-dominion":"a2e2bed43694916b439c8af6ebbcd095","south-alabama":"ee6ce930a70230d1cdbc166b3aed12d7",
"southern-miss":"c6e871252bc27c830c12804090b99143","texas-state":"a45a642f7e8f75f51887e472177a7c07","troy":"67dad7e3fe4591aea611ada2abf1ceab",
"akron":"baec03f599c00c4179b9c56e2e5cb880","ball-state":"361e293ba194fbe1c2396393b682d61a","bowling-green":"1539061cf26b733eff838ad9723fb4a1",
"buffalo":"fe9c5d907b6c4a99eeae45606fda67fc","central-michigan":"867efa157562e25bcc785e42fbfe681f","eastern-michigan":"6f4c388b851b4d16e6ea320c552674ca",
"kent-state":"f5fd3045b6084c1f296887f18e1aa76a","umass":"b7b1bdba44961c43dc1527ae85e7d52c","miami-oh":"38bdd6ea2038c5787a97550b6343184e",
"northern-illinois":"d2e515220a93f53a4a5403e64f9c4a7e","ohio":"854a919c87c796ecab41f6dc43d52467","toledo":"45f35b30004d7c0f52641e358c547d35",
"western-michigan":"23255b48d346c862f90408d904018e93","delaware":"390bcbd7f50baac130c6209a79d38f90","fiu":"113099ec01b8bf26b716464a9171ceed",
"jacksonville-state":"ded49bfbdb7e4d4c01aac6fc541d3ca1","kennesaw-state":"404ff960a039485f944d94a75a96c250","liberty":"b6bdce6a8ec0ef50ff84fe8fba49ed6d",
"louisiana-tech":"195456521947cec17a35f8a9db822b2e","middle-tennessee":"67d6aef14ba882e26d295f86f48dec41","missouri-state":"aa720f0313bb9d0fe2fe6f25b5f9457d",
"new-mexico-state":"6f75c722725e166a0daed31269fb95d1","sam-houston":"50cd985615c087e6ed4694787b57ea69","utep":"77b39f7629d68be72946ce4cc8832752",
"western-kentucky":"7ad328ed08013c2d9845dc883d8ee131",
};

const flags = JSON.parse(readFileSync("/Users/jonahmabry/workspace/cfb-pickem/public/avatars/avatars.json", "utf8"))
  .map((a) => ({ id: a.id, n: a.name, c: a.color, u: "/_blob/" + FLAG_BLOB[a.file.match(/(\d+)\.svg$/)[1]] }));

// Conference runs, derived from logos.json's file order. The data itself carries
// no conference field — that gap is a finding for the ticket, not a fact here.
const RUNS = [
  ["SEC", 16], ["Big Ten", 18], ["Big 12", 16], ["ACC", 17], ["Independent", 2],
  ["American", 14], ["Mountain West", 12], ["Pac-12", 2], ["Sun Belt", 14], ["MAC", 13], ["Conference USA", 12],
];

let at = 0;
const conferences = RUNS.map(([name, n]) => {
  const slice = teams.slice(at, at + n).map((t) => {
    if (!SLUG[t.slug]) throw new Error("no 150px asset uploaded for slug: " + t.slug);
    return { n: t.school, c: t.colors.primary, u: "/_blob/" + SLUG[t.slug], cf: name };
  });
  at += n;
  return { name, teams: slice };
});
if (at !== teams.length) throw new Error("conference runs do not cover " + teams.length + " teams, got " + at);
const flat = conferences.flatMap((c) => c.teams);

const T = {
  bg: "#F7F1E3", fg: "#241F1A", card: "#FBF6EC", primary: "#1F4034", primaryFg: "#FBF6EC",
  secondary: "#A94B17", muted: "#EAE0CC", mutedFg: "#6F6152", accent: "#EFE7D5", border: "#9C845F",
};

const HEAD = (title, extra = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"><\/script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo:wght@700;900&family=Manrope:wght@400;500;600;700&display=swap">
<style>
body{margin:0;background:${T.bg};font-family:Manrope,ui-sans-serif,system-ui,sans-serif;color:${T.fg};-webkit-font-smoothing:antialiased}
a{color:${T.secondary}}a:hover{color:#8E3D12}
button{font-family:inherit}
input{font-family:inherit}
*{box-sizing:border-box}
.sb::-webkit-scrollbar{width:0;height:0}
${extra}
</style>
</helmet>`;

const FOOT = (props, body) => `</x-dc>
<script type="text/x-dc" data-dc-script data-props='${props}'>
${body}
<\/script>
</body>
</html>
`;

const SEARCH_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${T.mutedFg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>`;
const CHEV = (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`;
const BACK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${T.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>`;
const CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${T.primaryFg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>`;

const label = (t) => `<div style="font-size: 12px; line-height: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${T.secondary};">${t}</div>`;

// Page chrome shared by the three pickers: the welcome form the picker sits inside.
const chromeTop = (sub) => `<div style="padding: 16px 16px 8px; flex-shrink: 0;">
<div style="font-family: Chivo, sans-serif; font-weight: 900; font-size: 28px; line-height: 32px; margin-bottom: 4px;">Welcome to the Slate</div>
<div style="font-size: 14px; line-height: 20px; color: ${T.mutedFg};">${sub}</div>
</div>`;

const saveBar = (n) => `<div style="flex-shrink: 0; padding: 12px 16px 16px; border-top: 1px solid ${T.border}33; background: ${T.bg};">
<button type="button" style="width: 100%; height: 44px; border: none; border-radius: 6px; background: ${T.primary}; color: ${T.primaryFg}; font-size: 16px; font-weight: 700; cursor: pointer;">${n}</button>
</div>`;

const dataLine = `const CONFS = ${JSON.stringify(conferences.map((c) => ({ name: c.name, teams: c.teams })))};
const FLAGS = ${JSON.stringify(flags)};
const FLAT = CONFS.flatMap(function (c) { return c.teams; });`;

// ── C ────────────────────────────────────────────────────────────────────────
const C = HEAD("Pennant picker — conference drill-down") + `
<div style="width: 390px; height: 844px; display: flex; flex-direction: column; background: ${T.bg}; overflow: hidden;">
${chromeTop("Two things and you are in: your name, and the mark that stands for you.")}
<div style="padding: 0 16px 8px; flex-shrink: 0;">
<sc-if value="{{atRoot}}" hint-placeholder-val="{{yes}}">
${label("Pick your pennant")}
</sc-if>
<sc-if value="{{showBack}}" hint-placeholder-val="{{no}}">
<button type="button" onClick="{{back}}" style="display: inline-flex; align-items: center; gap: 4px; height: 44px; padding: 0 8px 0 0; border: none; background: transparent; color: ${T.primary}; font-size: 14px; font-weight: 700; cursor: pointer;">${BACK}{{backLabel}}</button>
<div style="font-family: Chivo, sans-serif; font-weight: 700; font-size: 22px; line-height: 28px;">{{headTitle}}</div>
</sc-if>
</div>
<div class="sb" style="flex-grow: 1; overflow-y: auto; padding: 4px 16px 16px;">
<sc-if value="{{atRoot}}" hint-placeholder-val="{{yes}}">
<button type="button" onClick="{{openFlags}}" style="width: 100%; display: flex; align-items: center; gap: 14px; padding: 18px 16px; margin-bottom: 12px; border-radius: 14px; border: 1px solid ${T.border}44; background: ${T.card}; cursor: pointer; text-align: left;">
<span style="display: flex; align-items: center; flex-shrink: 0;">
<sc-for list="{{flagPeek}}" as="p" hint-placeholder-count="4">
<span style="{{p.peekStyle}}"><img src="{{p.u}}" alt="" style="width: 50px; height: 50px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"></span>
</sc-for>
</span>
<span style="flex-grow: 1; min-width: 0;"><span style="display: block; font-family: Chivo, sans-serif; font-weight: 700; font-size: 18px;">Flags</span><span style="display: block; font-size: 13px; color: ${T.mutedFg}; margin-top: 2px;">12 pennants</span></span>
${CHEV(T.mutedFg)}
</button>
<button type="button" onClick="{{openConfs}}" style="width: 100%; display: flex; align-items: center; gap: 14px; padding: 18px 16px; border-radius: 14px; border: 1px solid ${T.border}44; background: ${T.card}; cursor: pointer; text-align: left;">
<span style="display: flex; align-items: center; flex-shrink: 0;">
<sc-for list="{{teamPeek}}" as="p" hint-placeholder-count="4">
<span style="{{p.peekStyle}}"><img src="{{p.u}}" alt="" style="width: 26px; height: 26px; object-fit: contain;"></span>
</sc-for>
</span>
<span style="flex-grow: 1; min-width: 0;"><span style="display: block; font-family: Chivo, sans-serif; font-weight: 700; font-size: 18px;">Team Logos</span><span style="display: block; font-size: 13px; color: ${T.mutedFg}; margin-top: 2px;">136 teams in 11 conferences</span></span>
${CHEV(T.mutedFg)}
</button>
</sc-if>
<sc-if value="{{isFlags}}" hint-placeholder-val="{{no}}">
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">
<sc-for list="{{flagList}}" as="f" hint-placeholder-count="12">
<button type="button" onClick="{{f.pick}}" aria-label="{{f.n}}" style="{{f.style}}">
<img src="{{f.u}}" alt="" style="width: 90px; height: 90px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
</button>
</sc-for>
</div>
</sc-if>
<sc-if value="{{isConfs}}" hint-placeholder-val="{{no}}">
<sc-for list="{{confRows}}" as="c" hint-placeholder-count="6">
<button type="button" onClick="{{c.open}}" style="width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; padding: 10px 12px; margin-bottom: 8px; border-radius: 14px; border: 1px solid ${T.border}44; background: ${T.card}; cursor: pointer; text-align: left;">
<span style="flex-grow: 1; min-width: 0;"><span style="display: block; font-size: 16px; font-weight: 600;">{{c.name}}</span><span style="display: block; font-size: 12px; color: ${T.mutedFg};">{{c.count}} teams</span></span>
<span style="display: flex; align-items: center; flex-shrink: 0;">
<sc-for list="{{c.peek}}" as="p" hint-placeholder-count="3">
<img src="{{p.u}}" alt="" style="width: 26px; height: 26px; object-fit: contain; margin-left: -6px;">
</sc-for>
</span>
${CHEV(T.mutedFg)}
</button>
</sc-for>
</sc-if>
<sc-if value="{{inConf}}" hint-placeholder-val="{{no}}">
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">
<sc-for list="{{confTeams}}" as="t" hint-placeholder-count="9">
<button type="button" onClick="{{t.pick}}" style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; border-radius: 14px; cursor: pointer; {{t.cell}}">
<span style="{{t.discStyle}}"><img src="{{t.u}}" alt="" style="width: 44px; height: 44px; object-fit: contain;"></span>
<span style="font-size: 12px; line-height: 16px; text-align: center; color: ${T.fg};">{{t.n}}</span>
</button>
</sc-for>
</div>
</sc-if>
</div>
${saveBar("Save and start picking")}
</div>
` + FOOT('{"$preview":{"width":390,"height":844}}', `class Component extends DCLogic {
  constructor(props) { super(props); this.state = { view: 'root', picked: null }; }
  disc(selected, color) {
    return 'position: relative; overflow: hidden; width: 100%; aspect-ratio: 1; min-height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 999px; cursor: pointer; padding: 0; '
      + 'background: color-mix(in srgb, ' + color + ' 18%, transparent); '
      + (selected ? 'border: 2px solid ${T.primary}; box-shadow: 0 0 0 3px ${T.primary}33;' : 'border: 1px solid ${T.border}55;');
  }
  peek(color, i) {
    return 'position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 999px; flex-shrink: 0; '
      + 'box-shadow: 0 0 0 2px ${T.card}; background: color-mix(in srgb, ' + color + ' 18%, transparent); '
      + (i === 0 ? '' : 'margin-left: -10px;');
  }
  renderVals() {
    const self = this;
    const view = this.state.view;
    const known = view === 'root' || view === 'flags' || view === 'confs';
    const conf = known ? null : view;
    const teams = conf ? (CONFS.filter(function (c) { return c.name === conf; })[0] || { teams: [] }).teams : [];
    return {
      yes: true, no: false,
      atRoot: view === 'root', isFlags: view === 'flags', isConfs: view === 'confs', inConf: !!conf,
      showBack: view !== 'root',
      headTitle: view === 'flags' ? 'Flags' : (view === 'confs' ? 'Team Logos' : (conf || '')),
      backLabel: conf ? 'Team Logos' : 'Pick your pennant',
      back: function () { self.setState({ view: conf ? 'confs' : 'root' }); },
      openFlags: function () { self.setState({ view: 'flags' }); },
      openConfs: function () { self.setState({ view: 'confs' }); },
      flagPeek: FLAGS.slice(0, 4).map(function (f, i) { return { u: f.u, peekStyle: self.peek(f.c, i) }; }),
      teamPeek: FLAT.slice(0, 4).map(function (t, i) { return { u: t.u, peekStyle: self.peek(t.c, i) }; }),
      flagList: FLAGS.map(function (f) {
        return { n: f.n, u: f.u, style: self.disc(self.state.picked === f.n, f.c), pick: function () { self.setState({ picked: f.n }); } };
      }),
      confRows: CONFS.map(function (c) {
        return {
          name: c.name, count: c.teams.length,
          peek: c.teams.slice(0, 3),
          open: function () { self.setState({ view: c.name }); },
        };
      }),
      confTeams: teams.map(function (t) {
        const on = self.state.picked === t.n;
        return {
          n: t.n, u: t.u,
          cell: on ? 'background: ${T.accent}; border: 1px solid ${T.primary};' : 'background: transparent; border: 1px solid transparent;',
          discStyle: 'display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 999px; background: color-mix(in srgb, ' + t.c + ' 18%, transparent);',
          pick: function () { self.setState({ picked: t.n }); },
        };
      }),
    };
  }
}
${dataLine}`);

mkdirSync(ROOT, { recursive: true });
writeFileSync(ROOT + "/PennantPicker.dc.html", C);
console.log("teams:", flat.length, "flags:", flags.length);
console.log("conferences:", conferences.map((c) => c.name + "=" + c.teams.length).join(" "));
