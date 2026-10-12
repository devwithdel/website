#!/usr/bin/env node
/**
 * Static audit for this static site.
 *
 * Catches the classes of bug that are invisible in a screenshot but break the
 * page: selectors that match nothing, CSS rules nothing can ever toggle,
 * markup styled by rules that were deleted, unbalanced blocks, malformed
 * values, missing local assets, and accessibility traps (hover-only content,
 * aria-hidden on focusable elements, nameless buttons).
 *
 * Zero dependencies. Run: npm run audit
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* Root defaults to the site directory, but can be pointed elsewhere for
   self-testing the auditor: `node scripts/audit.mjs --root <dir>`. */
const rootArgIndex = process.argv.indexOf("--root");
const ROOT = path.resolve(
  rootArgIndex !== -1 && process.argv[rootArgIndex + 1]
    ? process.argv[rootArgIndex + 1]
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
);
const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel", "dist", "build"]);

const findings = [];
const counts = { error: 0, warn: 0, info: 0 };

function report(severity, file, message, hint) {
  findings.push({ severity, file, message, hint });
  counts[severity]++;
}

/* ------------------------------------------------------------------ utils */

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, "/");
/** Render a class as `.name` without embedding a backtick in a template literal. */
const dot = (cls) => "." + cls;

const SELF = fileURLToPath(import.meta.url);
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const cssFiles = files.filter((f) => f.endsWith(".css"));
// Exclude this auditor: it embeds a deliberately broken fixture for its
// self-test, which must not be reported as if it were site code.
const jsFiles = files.filter(
  (f) => (f.endsWith(".js") || f.endsWith(".mjs")) && path.resolve(f) !== path.resolve(SELF)
);

/* Strip comments while respecting strings, so commented-out CSS/JS is not
   mistaken for live code. */
function stripComments(src, kind) {
  if (kind === "css") return src.replace(/\/\*[\s\S]*?\*\//g, "");
  // JS/CSS-in-HTML: remove block and line comments without touching strings.
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (two === "//") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const q = src[i];
      out += src[i++];
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + src[i + 1];
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += src[i++];
  }
  return out;
}

/* ---------------------------------------------------------------- CSS AST */

/** Flat list of {prelude, body} blocks, recursing through at-rules. */
function parseBlocks(css) {
  const out = [];
  const stack = [];
  let buf = "";
  let i = 0;

  while (i < css.length) {
    const ch = css[i];

    if (ch === '"' || ch === "'") {
      const q = ch;
      buf += ch;
      i++;
      while (i < css.length) {
        if (css[i] === "\\") {
          buf += css[i] + css[i + 1];
          i += 2;
          continue;
        }
        buf += css[i];
        if (css[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === "{") {
      stack.push({ prelude: buf.trim(), bodyStart: i + 1 });
      buf = "";
      i++;
      continue;
    }

    if (ch === "}") {
      const frame = stack.pop();
      if (frame) out.push({ prelude: frame.prelude, body: css.slice(frame.bodyStart, i) });
      else report("error", "style.css", "Unmatched closing brace `}`", "One extra `}` — everything after it is discarded by the browser.");
      buf = "";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  if (stack.length) {
    report(
      "error",
      "style.css",
      `${stack.length} unclosed block(s): ${stack.map((s) => s.prelude).join(", ")}`,
      "Everything after an unclosed `{` is swallowed, which silently kills every rule that follows."
    );
  }
  return out;
}

function splitDeclarations(body) {
  const decls = [];
  let buf = "";
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      if (buf.trim()) decls.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) decls.push(buf.trim());
  return decls;
}

/* --------------------------------------------------------------- analyze */

const cssText = cssFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
const cssStripped = stripComments(cssText, "css");
const cssRules = [];      // top-level + at-rule children
const cssSelectors = [];  // every real selector string seen
const definedVars = new Set();
const usedVars = new Map(); // var name -> selector

(function collect(blocks) {
  for (const block of blocks) {
    if (block.prelude === undefined) continue;
    if (block.prelude.startsWith("@")) {
      if (block.prelude.startsWith("@keyframes")) continue;
      const inner = parseBlocks(block.body);
      collect(inner);
      continue;
    }
    const selectors = block.prelude.split(",").map((s) => s.trim()).filter(Boolean);
    cssRules.push({ selectors, body: block.body });
    for (const sel of selectors) cssSelectors.push(sel);

    for (const decl of splitDeclarations(block.body)) {
      const idx = decl.indexOf(":");
      if (idx === -1) {
        report("error", "style.css", `Malformed declaration in \`${block.prelude}\`: \`${decl}\``);
        continue;
      }
      const prop = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();

      if (prop.startsWith("--")) definedVars.add(prop);
      for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!usedVars.has(m[1])) usedVars.set(m[1], block.prelude);
      }
      validateValue(block.prelude, prop, value);
    }
  }
})(parseBlocks(cssStripped));

function validateValue(sel, prop, value) {
  const parens = (value.match(/\(/g) || []).length - (value.match(/\)/g) || []).length;
  if (parens !== 0) {
    report("error", "style.css", `Unbalanced parentheses in \`${sel}\`: ${prop}: ${value}`);
  }
  for (const m of value.matchAll(/#([0-9a-fA-F]+)/g)) {
    const n = m[1].length;
    if (![3, 4, 6, 8].includes(n)) {
      report("error", "style.css", `Invalid hex colour \`#${m[1]}\` in \`${sel}\` (${prop})`, "Valid lengths are 3, 4, 6 or 8.");
    }
  }
  const rgbFn = value.match(/\b(rgba?)\(([^)]*)\)/);
  if (rgbFn) {
    const expected = rgbFn[1] === "rgba" ? [3, 4] : [3];
    const given = rgbFn[2].trim().split(/[\s,/]+/).filter(Boolean).length;
    if (!expected.includes(given)) {
      report("error", "style.css", `${rgbFn[1]}() needs 3${rgbFn[1] === "rgba" ? " or 4" : ""} components in \`${sel}\`: ${prop}: ${value}`);
    }
  }
  if (/:\s*$/.test(value)) {
    report("error", "style.css", `Empty value in \`${sel}\`: ${prop}:`);
  }
}

/* ------------------------------------------------------------------- HTML */

const htmlFilesText = htmlFiles.map((f) => ({ file: f, src: fs.readFileSync(f, "utf8") }));
const allHtml = htmlFilesText.map((h) => h.src).join("\n");

const ids = new Map();          // id -> count
const idFiles = new Map();
const htmlClasses = new Set();
const htmlTags = [];

for (const { file, src } of htmlFilesText) {
  const stripped = stripComments(src, "html");

  for (const m of stripped.matchAll(/\sid="([^"]+)"/g)) {
    ids.set(m[1], (ids.get(m[1]) || 0) + 1);
    if (!idFiles.has(m[1])) idFiles.set(m[1], rel(file));
  }
  for (const m of stripped.matchAll(/\sclass="([^"]+)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => htmlClasses.add(c));
  }
  for (const m of stripped.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    htmlTags.push({ tag: m[1].toLowerCase(), attrs: m[2] || "", file: rel(file) });
  }
}

for (const [id, count] of ids) {
  if (count > 1) {
    report("error", idFiles.get(id), `Duplicate id \`#${id}\` (${count}×)`, "getElementById/label targets resolve to only the first match.");
  }
}

/* Structural sanity: block elements must balance. Tags are tokenised
   character-by-character so `<` inside an attribute value or text node cannot
   desynchronise the parser. */
const VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const OPTIONAL_CLOSE = new Set(["li","dt","dd","p","tr","td","th","thead","tbody","tfoot","option"]);

for (const { file, src } of htmlFilesText) {
  const stack = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;

    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }
    if (src.startsWith("<!", lt) || src.startsWith("<?", lt)) {
      const end = src.indexOf(">", lt);
      i = end === -1 ? len : end + 1;
      continue;
    }

    const closing = src[lt + 1] === "/";
    const nameStart = lt + (closing ? 2 : 1);
    const nameMatch = /^[a-zA-Z][\w:-]*/.exec(src.slice(nameStart));
    if (!nameMatch) {
      i = lt + 1;
      continue;
    }
    const tag = nameMatch[0].toLowerCase();

    // Walk to the end of the tag, respecting quoted attribute values.
    let j = nameStart + tag.length;
    let quote = null;
    while (j < len) {
      const ch = src[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j++;
    }
    if (j >= len) {
      report("error", file, `Unterminated <${tag}> tag near offset ${lt}`);
      break;
    }
    const attrs = src.slice(nameStart + tag.length, j);
    const selfClosing = /\/\s*$/.test(attrs);
    i = j + 1;

    if (VOID.has(tag) || selfClosing) continue;

    // script/style hold raw text: HTML parsing does not treat `<div>` inside
    // them as a tag, so the walker must not either.
    if (tag === "script" || tag === "style") {
      const closeTag = `</${tag}`;
      const end = src.toLowerCase().indexOf(closeTag, i);
      if (end === -1) {
        report("error", file, `Unclosed <${tag}> element`);
        break;
      }
      // Skip past the closing tag itself so it is never matched against
      // whatever element happens to be on the stack.
      const gt = src.indexOf(">", end);
      i = gt === -1 ? len : gt + 1;
      continue;
    }

    if (closing) {
      let idx = stack.length - 1;
      // Implicit closes: </li> may legitimately close a nested <p> or <li>.
      while (idx >= 0 && stack[idx].tag !== tag && !OPTIONAL_CLOSE.has(stack[idx].tag)) idx--;
      if (idx === -1) {
        report("error", file, `Stray closing </${tag}> with no matching open tag`);
        continue;
      }
      for (const skipped of stack.slice(idx + 1)) {
        if (OPTIONAL_CLOSE.has(skipped.tag)) {
          report("warn", file, `Implicitly closed <${skipped.tag}> by </${tag}> near offset ${lt}`);
        } else {
          report("error", file, `Closing </${tag}> does not match open <${skipped.tag}> (opened at offset ${skipped.at})`);
        }
      }
      stack.length = idx;
    } else {
      stack.push({ tag, at: lt });
    }
  }

  for (const unclosed of stack) {
    report("error", file, `Unclosed <${unclosed.tag}> opened at offset ${unclosed.at}`);
  }
}

/* Local asset references must exist on disk. */
const localRefs = new Map();
for (const { file, src } of htmlFilesText) {
  for (const m of stripComments(src, "html").matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|#|data:|\/\/)/.test(url)) continue;
    const clean = url.split(/[?#]/)[0];
    if (!clean) continue;
    if (!localRefs.has(clean)) localRefs.set(clean, rel(file));
  }
}
for (const [url, file] of localRefs) {
  if (!fs.existsSync(path.resolve(ROOT, decodeURIComponent(url)))) {
    report("error", file, `Missing local asset: \`${url}\``);
  }
}

/* Accessibility traps. */
for (const tag of htmlTags) {
  const { tag: name, attrs, file } = tag;
  const attr = (n) => (attrs.match(new RegExp(`\\s${n}="([^"]*)"`)) || [])[1];

  if (name === "img" && attr("alt") === undefined) {
    report("warn", file, `<img> without alt: \`${(attr("src") || "?").slice(0, 60)}\``);
  }
  if (name === "input" && !attr("aria-label") && !attr("placeholder") && !attr("id")) {
    report("warn", file, `<input> with no label`);
  }
  if (attr("tabindex") && Number(attr("tabindex")) > 0) {
    report("warn", file, `Positive tabindex="${attr("tabindex")}" on <${name}>`, "Breaks natural focus order.");
  }
  if (attr("aria-hidden") === "true" && /\stabindex="0"/.test(attrs)) {
    report("error", file, `<${name}> is aria-hidden but focusable`, "Keyboard users can focus something screen readers cannot announce.");
  }
  for (const ref of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
    const val = attr(ref);
    if (!val) continue;
    for (const target of val.split(/\s+/).filter(Boolean)) {
      if (!ids.has(target)) {
        report("error", file, `${ref}="${target}" points at a non-existent id`);
      }
    }
  }
  if (name === "a" && attr("href")?.startsWith("#") && attr("href") !== "#") {
    const target = attr("href").slice(1);
    if (!ids.has(target)) report("error", file, `Anchor href="#${target}" has no target`);
  }
}

/* Interactive elements need an accessible name from text, aria-label,
   aria-labelledby, or a title. */
for (const { file, src } of htmlFilesText) {
  const cleaned = stripComments(src, "html");
  for (const m of cleaned.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, name, attrs, inner] = m;
    const hasText = stripTags(inner).trim().length > 0;
    const labelled =
      /aria-label\s*=\s*"[^"]+"/.test(attrs) ||
      /title\s*=\s*"[^"]+"/.test(attrs) ||
      /aria-labelledby\s*=\s*"[^"]+"/.test(attrs);
    if (!hasText && !labelled) {
      report("warn", file, `<${name}> at offset ${m.index} has no accessible name`, "Add text content or aria-label.");
    }
  }
  for (const m of cleaned.matchAll(/<button\b([^>]*)\/>/g)) {
    if (!/aria-label\s*=\s*"[^"]+"/.test(m[1]) && !/title\s*=\s*"[^"]+"/.test(m[1])) {
      report("warn", file, `Self-closing <button> at offset ${m.index} has no accessible name`);
    }
  }
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ");
}

/* Heading order must not skip levels. */
for (const { file, src } of htmlFilesText) {
  let prev = 0;
  for (const m of stripComments(src, "html").matchAll(/<h([1-6])\b/g)) {
    const level = Number(m[1]);
    if (prev && level > prev + 1) {
      report("warn", file, `Heading jumps h${prev} → h${level}`, "Screen reader users lose section structure.");
    }
    prev = level;
  }
}

/* --------------------------------------------------------------------- JS */

const jsSources = jsFiles.map((f) => ({ file: f, src: fs.readFileSync(f, "utf8") }));
const allJs = jsSources.map((j) => j.src).join("\n");
const jsStripped = stripComments(allJs, "js");

/* `node --check` understands both CommonJS and ES modules, which vm.Script
   does not — it rejects a bare `import`. */
function checkJsSyntax(label, source) {
  const tmp = path.join(os.tmpdir(), `audit-syntax-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  try {
    fs.writeFileSync(tmp, source);
    const res = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
    if (res.status !== 0) {
      const msg = (res.stderr || "").split("\n").filter((l) => /Error|error/.test(l))[0] || "syntax error";
      report("error", label, `Syntax error: ${msg.replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), label)}`);
    }
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

for (const { file, src } of jsSources) checkJsSyntax(rel(file), src);

/* Inline <script> blocks must parse too, and their selectors must resolve. */
let inlineOffset = 0;
const inlineScripts = [];
for (const { file, src } of htmlFilesText) {
  for (const m of stripComments(src, "html").matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    inlineOffset++;
    inlineScripts.push(m[1]);
    checkJsSyntax(`${rel(file)} (inline script #${inlineOffset})`, m[1]);
  }
}

/* Selectors JS queries must match something in the DOM. Covers both external
   scripts and inline blocks. */
const allScriptCode = [jsStripped, ...inlineScripts].join("\n");
const queriedIds = new Set();
for (const m of allScriptCode.matchAll(/querySelector(?:All)?\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
  const sel = m[1];
  for (const hash of sel.matchAll(/#([A-Za-z_][\w-]*)/g)) queriedIds.add(hash[1]);
}
for (const m of allScriptCode.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
  queriedIds.add(m[1]);
}
for (const id of queriedIds) {
  if (!ids.has(id)) {
    report("error", "index.html", `JS queries \`#${id}\` but no element has that id`, "querySelector returns null and the feature silently dies.");
  }
}

/* Classes JS toggles should have a CSS rule, and CSS classes gated on a state
   class should be toggled by JS — otherwise the styling can never apply. */
const jsToggled = new Set();
for (const m of jsStripped.matchAll(/classList\.(?:add|remove|toggle)\(\s*["'`]([A-Za-z_][\w-]*)["'`]/g)) {
  jsToggled.add(m[1]);
}
for (const m of jsStripped.matchAll(/(?:className\s*=\s*|classList\.(?:add|remove|toggle)\()["'`][^"'`]*\b(is|has)-([a-z][\w-]*)/g)) {
  jsToggled.add(m[2]);
}

const cssClasses = new Set();
for (const sel of cssSelectors) {
  for (const m of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) cssClasses.add(m[1]);
}

/* Classes provided by third-party CSS (icon fonts etc.) are not our concern. */
const EXTERNAL_CLASS = /^(fa[srlbd]?-|lucide|toastify|gl-|sr-only$|visually-hidden$)/;

for (const cls of cssClasses) {
  if (EXTERNAL_CLASS.test(cls)) continue;
  if (htmlClasses.has(cls) || jsToggled.has(cls)) continue;
  report("warn", "style.css", dot(cls) + " matches no markup and is never toggled", "Dead rule — it can never apply.");
}
for (const cls of htmlClasses) {
  if (cssClasses.has(cls) || EXTERNAL_CLASS.test(cls)) continue;
  report("info", "index.html", "Class " + dot(cls) + " has no CSS rule", "Unused hook, or a rule that was deleted.");
}

/* Hover-only reveal: an element that is transparent in its base rule and only
   becomes opaque on :hover is invisible to keyboard and touch users.
   Deliberately conservative — only a bare single-class selector counts, so
   `.card.is-left { opacity: .58 }` is not mistaken for a reveal. */
const isBareClass = (s) => /^\.[A-Za-z_][\w-]*$/.test(s.trim());
const baseTransparent = new Set();

for (const rule of cssRules) {
  for (const sel of rule.selectors) {
    if (/:hover|:focus/.test(sel) || !isBareClass(sel)) continue;
    const body = rule.body.replace(/\/\*[\s\S]*?\*\//g, "");
    if (!/^\s*opacity:\s*(0|0\.0+)\s*;?\s*$/m.test(body)) continue;
    // If the same block also sets a hover/focus-ish visibility, ignore.
    if (/visibility:\s*(visible|inherit)/.test(body)) continue;
    baseTransparent.add(sel.trim().slice(1));
  }
}

for (const rule of cssRules) {
  for (const sel of rule.selectors) {
    if (!/:hover/.test(sel) || !isBareClass(sel)) continue;
    const cls = sel.trim().slice(1);
    if (!baseTransparent.has(cls)) continue;
    if (!/^\s*opacity:\s*(?!0)/m.test(rule.body)) continue;
    report(
      "warn",
      "style.css",
      dot(cls) + " is transparent by default and only revealed on :hover",
      "Invisible to keyboard and touch users."
    );
  }
}

/* Custom properties that are used but never defined. */
for (const [name, sel] of usedVars) {
  if (!definedVars.has(name)) {
    report("error", "style.css", `var(${name}) used in \`${sel}\` but never defined`, "Falls back to the initial/inherited value — often invisible.");
  }
}

/* Duplicated custom property with conflicting values in the same block. */
for (const rule of cssRules) {
  const seen = new Map();
  for (const decl of splitDeclarations(rule.body)) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (seen.has(prop) && seen.get(prop) !== value) {
      report("warn", "style.css", `Conflicting \`${prop}\` in \`${rule.prelude}\``, `Last one wins: "${seen.get(prop)}" then "${value}"`);
    }
    seen.set(prop, value);
  }
}

/* Empty rules. */
for (const rule of cssRules) {
  if (rule.prelude === undefined) continue; // trailing frame from an unclosed block
  if (!splitDeclarations(rule.body).length) {
    report("warn", "style.css", `Empty rule \`${rule.prelude}\``);
  }
}

const importantCount = (cssStripped.match(/!important/g) || []).length;
if (importantCount > 0) {
  report("warn", "style.css", `${importantCount} use(s) of !important`, "Specificity wars are the usual cause.");
}

/* Cache-buster: a stylesheet URL with a version query must be bumped when the
   CSS changes, or browsers keep serving a stale copy. */
for (const { file, src } of htmlFilesText) {
  for (const m of src.matchAll(/href="(src\/css\/[^"]+\?v=([^"]+))"/g)) {
    const cssPath = path.resolve(ROOT, m[1].split("?")[0]);
    if (!fs.existsSync(cssPath)) continue;
    const stamp = m[2];
    const cssStat = fs.statSync(cssPath);
    const srcStat = fs.statSync(file);
    if (cssStat.mtimeMs > srcStat.mtimeMs) {
      report(
        "warn",
        rel(file),
        `style.css is newer than the page but the cache-buster is still v=${stamp}`,
        "Bump the ?v= query or visitors keep the old CSS."
      );
    }
  }
}

/* ------------------------------------------------------------- self-test */
/* The auditor is only useful if it actually catches things. This builds a
   deliberately broken site and asserts every expected class of bug is found,
   so a future refactor cannot silently turn the checks into no-ops. */

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-selftest-"));
  fs.mkdirSync(path.join(dir, "src", "css"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "js"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "index.html"),
    `<!DOCTYPE html><html><head><link rel="stylesheet" href="src/css/style.css?v=1"></head>
<body><main><section class="hero">
<h1>Title</h1><h3>Skipped a level</h3>
<img src="src/assets/missing.png" alt="Missing">
<button class="icon-only" type="button"></button>
<a href="#nowhere">Bad anchor</a>
<div aria-hidden="true" tabindex="0">Trap</div>
<ul><li>one</ul>
<div id="dup"></div><div id="dup"></div>
</section></main>
<script>document.querySelector("#ghostId");</script>
<script>const x = <div>;</script>
</body></html>`
  );

  fs.writeFileSync(
    path.join(dir, "src", "css", "style.css"),
    `:root { --a: 1; }
.broken { color: #12345; background: rgb(1,2,3,4,5); }
.undefined-var { color: var(--never-defined); }
.unclosed { color: red;
.dead-rule { color: blue; }
.empty-rule { }`
  );

  fs.writeFileSync(path.join(dir, "src", "js", "bad.js"), "const a = {;");

  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", dir], {
    encoding: "utf8",
  });
  const output = (res.stdout || "") + (res.stderr || "");

  const expected = [
    ["Duplicate id", "duplicate ids"],
    ["Missing local asset", "missing assets"],
    ["no accessible name", "nameless buttons"],
    ["aria-hidden but focusable", "focus traps"],
    ['href="#nowhere" has no target', "dead anchors"],
    ["Closing </section> does not match open <ul>", "unclosed tags"],
    ["Heading jumps", "heading level skips"],
    ["inline script #2", "inline script syntax"],
    ["src/js/bad.js", "external script syntax"],
    ["unclosed block", "unclosed CSS blocks"],
    ["Invalid hex colour", "bad hex colours"],
    ["rgb() needs 3 components", "bad rgb() arity"],
    ["matches no markup", "dead CSS rules"],
    ["but no element has that id", "dangling JS selectors"],
    ["var(--never-defined)", "undefined custom properties"],
  ];

  const missing = expected.filter(([needle]) => !output.includes(needle));
  fs.rmSync(dir, { recursive: true, force: true });

  if (missing.length) {
    console.error("Self-test FAILED — these bugs were not detected:");
    for (const [needle, label] of missing) console.error(`  - ${label} ("${needle}")`);
    process.exit(1);
  }
  console.log(`Self-test passed: all ${expected.length} bug classes detected.`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {

/* ----------------------------------------------------------------- report */

const order = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.message.localeCompare(b.message));

const grouped = new Map();
for (const f of findings) {
  if (!grouped.has(f.file)) grouped.set(f.file, []);
  grouped.get(f.file).push(f);
}

const icon = { error: "ERROR", warn: "WARN ", info: "info " };
for (const [file, list] of grouped) {
  console.log(`\n${file}`);
  for (const f of list) {
    console.log(`  ${icon[f.severity]}  ${f.message}`);
    if (f.hint) console.log(`          → ${f.hint}`);
  }
}

console.log(
  `\nScanned ${htmlFiles.length} HTML, ${cssFiles.length} CSS, ${jsFiles.length} JS — ` +
    `${cssRules.length} CSS rules, ${ids.size} ids, ${htmlClasses.size} classes.`
);
console.log(
  `${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} note(s).`
);

if (counts.error > 0) {
  console.log("\nFix every error before shipping.");
  process.exit(1);
}
console.log("No errors.");

}