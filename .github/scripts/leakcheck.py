#!/usr/bin/env python3
"""Leak check for public sartorproj repositories.

Scans what a pull request or push adds to the repository: added diff lines,
commit messages and identities, changed and renamed paths, the branch name,
and the pull request title and body. It reports two kinds of findings:

* denylist: entries from .leakcheck-denylist (one fixed string per line,
  matched case-insensitively). Findings name the entry by number only; the
  matched text is never printed.
* generic: private IPv4 addresses (10.0.0.0/8, 172.16.0.0/12,
  192.168.0.0/16, 100.64.0.0/10) and private DNS hostnames.

Every text is also scanned after URL, escape, hex and base64 decoding,
Unicode NFKC normalization and removal of zero-width characters. See
docs/leakcheck.md for usage and limits.

Exit status: 0 clean, 1 findings, 2 usage or git error.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import fnmatch
import html
import ipaddress
import json
import os
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from typing import Callable, Iterable, Iterator
from urllib.parse import unquote

EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
DEFAULT_DENYLIST = ".leakcheck-denylist"
DEFAULT_ALLOWLIST = ".leakcheck-allow"

# Shorter squashed terms would match across unrelated words too often.
MIN_SQUASHED_TERM = 6
# A denylist entry split over at most this many consecutive lines is caught.
SPLIT_WINDOW = 3
MAX_DECODE_DEPTH = 2
MAX_VARIANTS = 64

PRIVATE_NETS = tuple(
    ipaddress.ip_network(n)
    for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10")
)

# Four dotted decimal octets that are not part of a longer dotted number, so
# a version such as 1.10.2.3.4 yields no candidate at all.
IPV4_RE = re.compile(r"(?<![0-9.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![0-9]|\.[0-9])")

# Code points keep the suffix text itself out of this public repository.
PRIVATE_HOST_SUFFIXES = tuple(
    "".join(map(chr, points)) for points in (
        (46, 116, 115, 46, 110, 101, 116),
    )
)
PRIVATE_HOST_RE = re.compile(
    r"(?<![a-z0-9-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:"
    + "|".join(re.escape(s.lstrip(".")) for s in PRIVATE_HOST_SUFFIXES)
    + r")(?![a-z0-9-])\.?"
)
SQUASH_RE = re.compile(r"[^0-9a-z]+")
URL_ESCAPE_RE = re.compile(r"%[0-9a-fA-F]{2}")
ESCAPE_RE = re.compile(
    r"\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})|\\([0-7]{1,3})|\\(.)",
    re.S,
)
HEX_RE = re.compile(r"(?:[0-9a-fA-F]{2}){8,}")
BASE64_RE = re.compile(r"[A-Za-z0-9+/_-]{16,}={0,2}")
PRINTABLE_RUN_RE = re.compile(r"[^\x00-\x08\x0b-\x1f\x7f\ufffd]{4,}")


def clean(text: str) -> str:
    """NFKC-normalize and drop NUL and format (zero-width) characters."""
    if text.isascii():
        return text.replace("\x00", "")
    text = unicodedata.normalize("NFKC", text)
    drop = {ord(ch): None for ch in set(text) if ch == "\x00" or unicodedata.category(ch) == "Cf"}
    return text.translate(drop) if drop else text


def squash(text: str) -> str:
    return SQUASH_RE.sub("", text)


def printable_runs(data: bytes) -> Iterator[str]:
    text = data.replace(b"\x00", b"").decode("utf-8", "replace")
    yield from PRINTABLE_RUN_RE.findall(text)


def decode_url(text: str) -> Iterator[str]:
    if URL_ESCAPE_RE.search(text):
        yield unquote(text, errors="replace")


def decode_escapes(text: str) -> Iterator[str]:
    if "\\" not in text and "&" not in text:
        return

    def replace(m: re.Match) -> str:
        code = m.group(1) or m.group(2) or m.group(3)
        if code:
            try:
                return chr(int(code, 16))
            except (ValueError, OverflowError):
                return ""
        if m.group(4):
            return chr(int(m.group(4), 8))
        return m.group(5)

    decoded = html.unescape(ESCAPE_RE.sub(replace, text))
    if decoded != text:
        yield decoded


def decode_hex(text: str) -> Iterator[str]:
    for m in HEX_RE.finditer(text):
        yield from printable_runs(bytes.fromhex(m.group()))


def decode_base64(text: str) -> Iterator[str]:
    for m in BASE64_RE.finditer(text):
        token = m.group().rstrip("=").replace("-", "+").replace("_", "/")
        # The encoded value may be glued to other base64-alphabet characters;
        # one of four offsets realigns it.
        for offset in range(4):
            chunk = token[offset:]
            if len(chunk) % 4 == 1:
                chunk = chunk[:-1]
            if len(chunk) < 12:
                continue
            try:
                data = base64.b64decode(chunk + "=" * (-len(chunk) % 4), validate=True)
            except (binascii.Error, ValueError):
                continue
            yield from printable_runs(data)


DECODERS: tuple[tuple[str, Callable[[str], Iterable[str]]], ...] = (
    ("url-decoded", decode_url),
    ("unescaped", decode_escapes),
    ("hex-decoded", decode_hex),
    ("base64-decoded", decode_base64),
)


def variants(text: str) -> list[tuple[str, str]]:
    """Return (how, casefolded text) for text and its decodings."""
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    stack = [("", clean(text), 0)]
    while stack and len(out) < MAX_VARIANTS:
        how, value, depth = stack.pop()
        folded = value.casefold()
        if folded in seen:
            continue
        seen.add(folded)
        out.append((how, folded))
        if depth >= MAX_DECODE_DEPTH:
            continue
        for name, decoder in DECODERS:
            for decoded in decoder(value):
                stack.append((f"{how}, {name}" if how else name, clean(decoded), depth + 1))
    return out


@dataclass(frozen=True)
class Term:
    number: int
    folded: str
    squashed: str


def load_terms(lines: Iterable[str]) -> list[Term]:
    terms = []
    for raw in lines:
        entry = raw.strip()
        if not entry or entry.startswith("#"):
            continue
        folded = clean(entry).casefold()
        terms.append(Term(len(terms) + 1, folded, squash(folded)))
    return terms


@dataclass(frozen=True)
class Allowlist:
    globs: tuple[str, ...] = ()
    strings: frozenset[str] = frozenset()

    @classmethod
    def parse(cls, lines: Iterable[str]) -> "Allowlist":
        globs, strings = [], set()
        for raw in lines:
            entry = raw.strip()
            if not entry or entry.startswith("#"):
                continue
            if entry.startswith("path:"):
                globs.append(entry[len("path:"):].strip())
            else:
                strings.add(entry.casefold())
        return cls(tuple(globs), frozenset(strings))

    def allows(self, path: str | None, token: str) -> bool:
        if token.casefold() in self.strings:
            return True
        return path is not None and any(fnmatch.fnmatchcase(path, g) for g in self.globs)


def term_in(term: Term, folded: str, squashed: str) -> str | None:
    if term.folded and term.folded in folded:
        return ""
    if len(term.squashed) >= MIN_SQUASHED_TERM and term.squashed in squashed:
        return "separators ignored"
    return None


def generic_matches(folded: str) -> Iterator[tuple[str, str]]:
    for m in IPV4_RE.finditer(folded):
        octets = [int(g) for g in m.groups()]
        if any(o > 255 for o in octets):
            continue
        addr = ipaddress.IPv4Address(".".join(map(str, octets)))
        for net in PRIVATE_NETS:
            if addr in net:
                yield m.group(), f"private IPv4 address {m.group()} (in {net})"
                break
    if any(s.lstrip(".") in folded for s in PRIVATE_HOST_SUFFIXES):
        for m in PRIVATE_HOST_RE.finditer(folded):
            yield m.group(), f"private DNS hostname {m.group()}"


@dataclass(frozen=True)
class Finding:
    where: str
    detail: str
    path: str | None = None
    line: int | None = None


class Scanner:
    def __init__(self, terms: list[Term], allow: Allowlist):
        self.terms = terms
        self.allow = allow
        self.findings: list[Finding] = []
        self._seen: set[tuple] = set()

    def denylisted(self, text: str) -> bool:
        for _, folded in variants(text):
            squashed = squash(folded)
            if any(term_in(t, folded, squashed) is not None for t in self.terms):
                return True
        return False

    def safe(self, text: str) -> str:
        return "[redacted]" if self.denylisted(text) else text

    def _add(self, key: tuple, finding: Finding) -> None:
        if key not in self._seen:
            self._seen.add(key)
            self.findings.append(finding)

    def _line_terms(self, text: str, report: Callable[[str, str], None]) -> set[int]:
        hit: set[int] = set()
        for how, folded in variants(text):
            squashed = squash(folded)
            for term in self.terms:
                if term.number in hit:
                    continue
                extra = term_in(term, folded, squashed)
                if extra is None:
                    continue
                hit.add(term.number)
                note = ", ".join(x for x in (how, extra) if x)
                report(f"denylist entry {term.number}", note)
            for token, detail in generic_matches(folded):
                report(detail, how, token=self.safe(token))
        return hit

    def scan(
        self,
        source: str,
        lines: list[tuple[int, str]],
        where: Callable[[int, int], str],
        path: str | None = None,
    ) -> None:
        """Scan numbered lines; where(first, last) names a line range."""
        safe_path = self.safe(path) if path is not None else None
        file_path = safe_path if safe_path != "[redacted]" else None
        hits: dict[int, set[int]] = {}
        for lineno, text in lines:

            def report(detail: str, how: str, token: str | None = None, lineno=lineno) -> None:
                if token is not None and self.allow.allows(path, token):
                    return
                if token == "[redacted]":
                    detail = "generic match containing a denylist entry"
                full = f"{detail} ({how})" if how else detail
                self._add(
                    (source, path, lineno, detail),
                    Finding(where(lineno, lineno), full, file_path, lineno),
                )

            hits[lineno] = self._line_terms(text, report)

        if not self.terms:
            return
        folded = [clean(text).casefold() for _, text in lines]

        def joined_has(term: Term, start: int, end: int) -> bool:
            text = "".join(folded[start:end])
            return term_in(term, text, squash(text)) is not None

        for i in range(len(lines)):
            for k in range(2, SPLIT_WINDOW + 1):
                window = lines[i:i + k]
                if len(window) < k or window[-1][0] - window[0][0] != k - 1:
                    break
                text = "".join(folded[i:i + k])
                squashed = squash(text)
                for term in self.terms:
                    if term_in(term, text, squashed) is None:
                        continue
                    if any(term.number in hits[n] for n, _ in window):
                        continue
                    if k > 2 and (joined_has(term, i + 1, i + k) or joined_has(term, i, i + k - 1)):
                        continue
                    first, last = window[0][0], window[-1][0]
                    self._add(
                        (source, path, first, term.number),
                        Finding(
                            where(first, last),
                            f"denylist entry {term.number} (split across lines)",
                            file_path,
                            first,
                        ),
                    )


class GitError(Exception):
    pass


def git(*args: str) -> bytes:
    proc = subprocess.run(
        ["git", "-c", "core.quotePath=false", *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise GitError(f"git {' '.join(args)}: {proc.stderr.decode(errors='replace').strip()}")
    return proc.stdout


def commit_exists(rev: str) -> bool:
    try:
        git("cat-file", "-e", f"{rev}^{{commit}}")
        return True
    except GitError:
        return False


def resolve_range(base: str | None, head: str) -> tuple[str, str, list[str], str | None]:
    """Return (diff spec start, diff operator, commits to scan, warning)."""
    if base == EMPTY_TREE:
        return EMPTY_TREE, "..", git("rev-list", head).decode().split(), None
    if base and set(base) != {"0"} and commit_exists(base):
        commits = git("rev-list", f"{base}..{head}").decode().split()
        return base, "...", commits, None
    parents = git("rev-list", "--parents", "-n", "1", head).decode().split()
    start = parents[1] if len(parents) > 1 else EMPTY_TREE
    warning = None
    if base and set(base) != {"0"}:
        warning = f"base {base} is not available; scanning only {head}"
    return start, "..", [parents[0]], warning


def unquote_git_path(path: str) -> str:
    if not (path.startswith('"') and path.endswith('"')):
        return path
    raw = path[1:-1].encode("latin-1", "backslashreplace").decode("unicode_escape")
    return raw.encode("latin-1", "replace").decode("utf-8", "replace")


def added_lines(start: str, op: str, head: str) -> dict[str, list[tuple[int, str]]]:
    out = git(
        "diff", "--no-color", "--no-ext-diff", "--text", "--unified=0", "-M",
        f"{start}{op}{head}",
    )
    files: dict[str, list[tuple[int, str]]] = {}
    current: list[tuple[int, str]] | None = None
    lineno = 0
    in_header = False
    for raw in out.split(b"\n"):
        line = raw.decode("utf-8", "replace")
        if line.startswith("diff --git "):
            in_header, current = True, None
        elif in_header and line.startswith("+++ "):
            target = unquote_git_path(line[4:])
            if target != "/dev/null":
                current = files.setdefault(target[2:] if target.startswith("b/") else target, [])
        elif line.startswith("@@"):
            in_header = False
            m = re.match(r"@@ -\S+ \+(\d+)", line)
            lineno = int(m.group(1)) if m else 0
        elif not in_header and current is not None and line.startswith("+"):
            current.append((lineno, line[1:]))
            lineno += 1
    return files


def changed_paths(start: str, op: str, head: str) -> list[tuple[str, str]]:
    """(status, path) for every path that exists at head; renames give the new path."""
    out = git("diff", "--name-status", "-z", "-M", f"{start}{op}{head}")
    fields = out.decode("utf-8", "replace").split("\0")
    paths = []
    i = 0
    while i < len(fields) and fields[i]:
        status = fields[i]
        count = 2 if status[0] in "RC" else 1
        if status[0] != "D":
            paths.append((status, fields[i + count]))
        i += 1 + count
    return paths


def commit_texts(sha: str) -> tuple[str, str]:
    out = git("show", "-s", "--format=%an <%ae>%n%cn <%ce>%x00%B", sha).decode("utf-8", "replace")
    idents, _, message = out.partition("\0")
    return idents, message


def numbered(text: str) -> list[tuple[int, str]]:
    return list(enumerate(text.splitlines(), start=1))


def escape_data(value: str) -> str:
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def escape_property(value: str) -> str:
    return escape_data(value).replace(":", "%3A").replace(",", "%2C")


def read_lines(path: str) -> list[str] | None:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read().splitlines()
    except FileNotFoundError:
        return None


def github_context() -> dict:
    """Base, head, branch, title and body from the GitHub event payload."""
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as f:
        payload = json.load(f)
    if event.startswith("pull_request"):
        pr = payload["pull_request"]
        return {
            "base": pr["base"]["sha"],
            "head": pr["head"]["sha"],
            "branch": pr["head"].get("ref") or "",
            "title": pr.get("title") or "",
            "body": pr.get("body") or "",
        }
    if event == "push":
        ref = payload.get("ref") or ""
        return {
            "base": payload.get("before") or "",
            "head": payload.get("after") or "HEAD",
            "branch": ref.removeprefix("refs/heads/"),
            "title": "",
            "body": "",
        }
    raise GitError(f"unsupported event {event!r}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", help="base revision (default origin/main, or the GitHub event)")
    parser.add_argument("--head", help="head revision (default HEAD, or the GitHub event)")
    parser.add_argument("--denylist", help=f"denylist file (default <repo>/{DEFAULT_DENYLIST})")
    parser.add_argument("--allowlist", help=f"allowlist file (default {DEFAULT_ALLOWLIST} at head)")
    parser.add_argument("--pr-title", help="pull request title to scan")
    parser.add_argument("--pr-body-file", help="file holding the pull request body to scan")
    parser.add_argument("--branch", help="branch name to scan (default: the current branch)")
    args = parser.parse_args(argv)

    gha = os.environ.get("GITHUB_ACTIONS") == "true"
    try:
        root = git("rev-parse", "--show-toplevel").decode().strip()
        os.chdir(root)
        if gha and os.environ.get("GITHUB_EVENT_PATH") and not args.base:
            ctx = github_context()
        else:
            ctx = {"base": args.base or "origin/main", "head": args.head or "HEAD"}
            ctx["branch"] = args.branch
            if ctx["branch"] is None:
                ctx["branch"] = git("rev-parse", "--abbrev-ref", "HEAD").decode().strip()
            ctx["title"] = args.pr_title or ""
            ctx["body"] = ""
            if args.pr_body_file:
                ctx["body"] = "\n".join(read_lines(args.pr_body_file) or [])
        head = ctx["head"]

        deny_lines = read_lines(args.denylist or os.path.join(root, DEFAULT_DENYLIST))
        terms = load_terms(deny_lines or [])
        if gha:
            for term in terms:
                for value in {term.folded, term.folded.upper()}:
                    print(f"::add-mask::{escape_data(value)}")
            for raw in deny_lines or []:
                if raw.strip() and not raw.strip().startswith("#"):
                    print(f"::add-mask::{escape_data(raw.strip())}")
            sys.stdout.flush()

        if args.allowlist:
            allow_lines = read_lines(args.allowlist) or []
        else:
            try:
                allow_lines = git("show", f"{head}:{DEFAULT_ALLOWLIST}").decode("utf-8", "replace").splitlines()
            except GitError:
                allow_lines = []
        allow = Allowlist.parse(allow_lines)

        start, op, commits, range_warning = resolve_range(ctx["base"], head)
        files = added_lines(start, op, head)
        paths = changed_paths(start, op, head)
    except (GitError, OSError, KeyError, ValueError) as e:
        print(f"leakcheck: {e}", file=sys.stderr)
        return 2

    def warn(msg: str) -> None:
        print(f"::warning title=leakcheck::{escape_data(msg)}" if gha else f"leakcheck: warning: {msg}")

    if not terms:
        warn("no denylist configured (LEAKCHECK_DENYLIST is unset or empty, as on fork pull requests); "
             "only the generic checks ran")
    if range_warning:
        warn(range_warning)
    if any(p == DEFAULT_ALLOWLIST for _, p in paths):
        warn(f"this change edits {DEFAULT_ALLOWLIST}; review the new allowlist entries")

    scanner = Scanner(terms, allow)
    for path, lines in files.items():
        shown = scanner.safe(path)
        scanner.scan(
            "diff", lines,
            lambda a, b, shown=shown: f"{shown}:{a}" if a == b else f"{shown}:{a}-{b}",
            path=path,
        )
    for n, (status, path) in enumerate(paths, start=1):
        scanner.scan("path", [(1, path)], lambda a, b, n=n, s=status: f"changed path {n} ({s})", path=path)
    for sha in commits:
        idents, message = commit_texts(sha)
        short = sha[:12]
        scanner.scan("ident", numbered(idents), lambda a, b, s=short: f"commit {s} author/committer")
        scanner.scan(
            f"msg {sha}", numbered(message),
            lambda a, b, s=short: f"commit {s} message line {a}" + (f"-{b}" if b != a else ""),
        )
    if ctx.get("branch"):
        scanner.scan("branch", [(1, ctx["branch"])], lambda a, b: "branch name")
    if ctx.get("title"):
        scanner.scan("title", [(1, ctx["title"])], lambda a, b: "PR title")
    if ctx.get("body"):
        scanner.scan(
            "body", numbered(ctx["body"]),
            lambda a, b: f"PR body line {a}" + (f"-{b}" if b != a else ""),
        )

    for f in scanner.findings:
        if gha:
            props = "title=leakcheck"
            if f.path is not None:
                props = f"file={escape_property(f.path)},line={f.line},{props}"
            print(f"::error {props}::{escape_data(f'{f.where}: {f.detail}')}")
        else:
            print(f"{f.where}: {f.detail}")

    scanned = sum(len(v) for v in files.values())
    summary = (
        f"{scanned} added lines in {len(files)} files, {len(paths)} paths, {len(commits)} commits, "
        f"{len(terms)} denylist entries"
    )
    if scanner.findings:
        print(f"leakcheck: {len(scanner.findings)} finding(s) ({summary})")
        return 1
    print(f"leakcheck: clean ({summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
