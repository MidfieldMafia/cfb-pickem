// Decides whether a Bash command pushes, for the push gate (preflight.sh), and
// finds the directory the push runs in.
//
//   PAYLOAD=<hook JSON> node decide-target.cjs   prints that directory, or SKIP
//
// It asks whether a segment of the command *invokes* `git push`, rather than
// whether the words "git" and "push" both appear. Matching the raw string got this
// wrong in both directions: it blocked read-only commands that merely named this
// repo's own `chore/push-gate-and-worktree-skills` branch, and it let a real
// `git -C <path> push` through, because the subcommand is not adjacent to `git`.
//
// Splitting the command into segments knows about quotes and heredocs, so text
// that only talks about pushing (an issue body in a heredoc, a commit message in
// quotes) is not read as a push: a `gh issue create` whose body mentioned the
// command was gated, built the main checkout and never got filed (#517). Command
// substitutions, `$(...)` and backticks, are read as commands, inside double
// quotes too, since they run.
//
// It throws on what it cannot read (an unterminated quote), and preflight.sh
// then falls back to a coarse match that errs toward gating. Required by
// src/push-gate.test.ts, which is where its cases live.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS, so the hook runs it with plain node
const path = require("node:path");

// git's own options that swallow the following token, so we do not read their
// value as the subcommand.
const OPTS_WITH_VALUE = new Set([
  "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
  "--super-prefix", "--config-env",
]);
// Wrappers that can precede the real command word.
const PREFIXES = /^(?:sudo|command|time|env|nohup|exec|builtin)$/;
// Not written into a regex or a string escape: an escaped backslash does not
// survive every way this file gets written, and if an expression using one
// throws, the hook falls back to its coarse match.
const BACKSLASH = String.fromCharCode(92);

const unquote = (t) => t.replace(/^["\x27]|["\x27]$/g, "");

function tokensOf(segment) {
  // Command substitution and grouping punctuation are not part of the command word.
  const seg = segment.replace(/^[\s({]+/, "");
  return seg.trim().match(/(?:[^\s"\x27]+|"[^"]*"|\x27[^\x27]*\x27)+/g) || [];
}

// The directory a `cd` segment moves to, or null for any other segment.
function cdTarget(segment) {
  const tokens = tokensOf(segment).map(unquote);
  if (tokens[0] !== "cd" || !tokens[1] || tokens[1] === "-") return null;
  return tokens[1].replace(/^~(?=\/|$)/, process.env.HOME || "~");
}

// null when the segment is not a `git push`; otherwise the `git -C` directory
// it names, or "" for none.
function pushDir(segment) {
  const tokens = tokensOf(segment);
  let i = 0;
  while (i < tokens.length &&
         (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || PREFIXES.test(unquote(tokens[i])))) {
    i++;
  }
  if (i >= tokens.length) return null;
  const cmdWord = unquote(tokens[i]).replace(/\.exe$/i, "");
  // Basename, on either path separator.
  const sep = Math.max(cmdWord.lastIndexOf("/"), cmdWord.lastIndexOf(BACKSLASH));
  if ((sep < 0 ? cmdWord : cmdWord.slice(sep + 1)) !== "git") return null;
  let dir = "";
  for (i++; i < tokens.length; i++) {
    const t = unquote(tokens[i]);
    if (t === "push") return dir;
    if (!t.startsWith("-")) return null;       // some other subcommand
    if (t === "-C" && tokens[i + 1]) {
      const to = unquote(tokens[i + 1]);
      dir = path.isAbsolute(to) ? to : path.join(dir, to);  // relative to the caller's directory
    }
    if (OPTS_WITH_VALUE.has(t)) i++;           // skip its value too
  }
  return null;
}

// The simple commands in `cmd`, in the order they run, each as its own text.
// Operators (newline, &&, ||, ;, |, &) end one; `(`, `$(` and backticks open a
// nested run of commands, and their closing bracket ends it. A quoted string
// stays inside its segment whole, and a heredoc's body is dropped.
function segmentsOf(cmd) {
  const segments = [];
  const n = cmd.length;
  let i = 0;

  // A double-quoted string from cmd[i], returned as it reads in its segment,
  // with each command substitution in it read as commands and left as `$()`.
  function doubleQuoted() {
    let text = cmd[i++];
    while (i < n && cmd[i] !== '"') {
      if (cmd[i] === BACKSLASH) { text += cmd.slice(i, i + 2); i += 2; continue; }
      if (cmd[i] === "$" && cmd[i + 1] === "(") { i += 2; commands(")"); text += "$()"; continue; }
      if (cmd[i] === "`") { i++; commands("`"); text += "$()"; continue; }
      text += cmd[i++];
    }
    if (i >= n) throw new Error("unterminated double quote");
    i++;
    return text + '"';
  }

  // The delimiter of a heredoc whose `<<` is just behind cmd[i].
  function heredocDelimiter() {
    const stripTabs = cmd[i] === "-";
    if (stripTabs) i++;
    while (cmd[i] === " " || cmd[i] === "\t") i++;
    let word = "";
    while (i < n && !/[\s;&|<>()]/.test(cmd[i])) {
      const q = cmd[i];
      if (q === "'" || q === '"') {
        const end = cmd.indexOf(q, i + 1);
        if (end < 0) throw new Error("unterminated heredoc delimiter");
        word += cmd.slice(i + 1, end);
        i = end + 1;
      } else if (q === BACKSLASH) {
        word += cmd[i + 1] || "";
        i += 2;
      } else {
        word += cmd[i++];
      }
    }
    if (!word) throw new Error("heredoc with no delimiter");
    return { word, stripTabs };
  }

  // Moves i past the body of each heredoc opened on the line just ended. A body
  // with no closing line runs to the end, as bash reads it.
  function skipBodies(heredocs) {
    for (const { word, stripTabs } of heredocs) {
      while (i < n) {
        let end = cmd.indexOf("\n", i);
        if (end < 0) end = n;
        let line = cmd.slice(i, end).replace(/\r$/, "");
        if (stripTabs) line = line.replace(/^\t+/, "");
        i = end + 1;
        if (line === word) break;
      }
    }
    heredocs.length = 0;
  }

  // Reads commands until `close` (")" or "`") or the end, adding each segment.
  function commands(close) {
    let cur = "";
    const heredocs = [];
    const end = () => { segments.push(cur); cur = ""; };
    while (i < n) {
      const c = cmd[i];
      const two = cmd.slice(i, i + 2);
      if (c === close) { i++; break; }
      if (c === BACKSLASH) {
        // A line continuation joins the lines; any other escape is a literal.
        cur += cmd[i + 1] === "\n" ? " " : two;
        i += 2;
      } else if (c === "'") {
        const closing = cmd.indexOf("'", i + 1);
        if (closing < 0) throw new Error("unterminated single quote");
        cur += cmd.slice(i, closing + 1);
        i = closing + 1;
      } else if (c === '"') {
        cur += doubleQuoted();
      } else if (c === "#" && (cur === "" || /[\s(]$/.test(cur))) {
        while (i < n && cmd[i] !== "\n") i++;       // a comment, up to the newline
      } else if (cmd.startsWith("<<<", i)) {
        cur += "<<<";                                 // a here-string, not a heredoc
        i += 3;
      } else if (two === "<<") {
        i += 2;
        heredocs.push(heredocDelimiter());
        cur += " ";
      } else if (c === "\n") {
        i++;
        end();
        skipBodies(heredocs);
      } else if (two === "&&" || two === "||") {
        i += 2;
        end();
      } else if (two === "$(") {
        i += 2;
        end();
        commands(")");
      } else if (c === "(" || c === "`") {
        i++;
        end();
        commands(c === "(" ? ")" : "`");
      } else if (";|&)}".includes(c)) {
        i++;
        end();
      } else {
        cur += c;
        i++;
      }
    }
    end();
  }

  commands(null);
  return segments.filter((s) => s.trim() !== "");
}

// The directory a push in `cmd` runs in, or null when it does not push.
//
// Check the tree the push leaves from, not the session's own directory. A
// session in the main checkout that ran `cd <worktree> && git push` used to
// check main, miss the worktree's stamp, build the wrong tree in full and let
// the pushed diff through unchecked. Each `cd` moves the directory for the
// segments after it; `git -C` moves it once more.
function decideTarget(cmd, cwd) {
  let dir = cwd;
  for (const segment of segmentsOf(cmd)) {
    const cd = cdTarget(segment);
    if (cd !== null) { dir = path.resolve(dir, cd); continue; }
    const pushed = pushDir(segment);
    if (pushed !== null) return path.resolve(dir, pushed);
  }
  return null;
}

module.exports = { decideTarget };

if (require.main === module) {
  let p = {};
  try { p = JSON.parse(process.env.PAYLOAD || "{}"); } catch { p = {}; }
  const cmd = (p.tool_input && p.tool_input.command) || "";
  const target = decideTarget(cmd, p.cwd || process.cwd());
  console.log(target === null ? "SKIP" : target);
}
