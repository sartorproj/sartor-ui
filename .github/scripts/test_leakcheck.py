"""Tests for leakcheck.py. Uses only synthetic denylist terms.

Run: python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
"""
from __future__ import annotations

import base64
import gzip
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import leakcheck  # noqa: E402

SCRIPT = Path(__file__).resolve().parent / "leakcheck.py"
TERM = "secret-cluster-xyz"
OTHER = "other-term-abc"
DENYLIST = f"# synthetic test entries\n\n{TERM}\n{OTHER}\n"
SUFFIX = leakcheck.PRIVATE_HOST_SUFFIXES[0]
BARE_SUFFIX = SUFFIX.lstrip(".")


def b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


class Repo:
    """A throwaway git repository with a main branch and a feature branch."""

    def __init__(self, root: Path):
        self.root = root
        self.env = {
            k: v for k, v in os.environ.items()
            if not k.startswith(("GITHUB_", "GIT_")) and k != "RUNNER_TEMP"
        }
        self.env.update({
            "GIT_AUTHOR_NAME": "Test Author",
            "GIT_AUTHOR_EMAIL": "author@example.com",
            "GIT_COMMITTER_NAME": "Test Committer",
            "GIT_COMMITTER_EMAIL": "committer@example.com",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
        })
        self.git("init", "-q", "-b", "main")
        self.write("README.md", "hello\n")
        self.commit("initial commit")
        self.git("checkout", "-q", "-b", "feature")

    def git(self, *args: str, env: dict | None = None) -> str:
        return subprocess.run(
            ["git", "-c", "commit.gpgsign=false", *args],
            cwd=self.root, env={**self.env, **(env or {})},
            check=True, capture_output=True, text=True,
        ).stdout

    def write(self, path: str, content: str | bytes) -> None:
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            p.write_bytes(content)
        else:
            p.write_text(content, encoding="utf-8")

    def commit(self, message: str, env: dict | None = None) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message, env=env)

    def run(self, *args: str, denylist: str | None = DENYLIST, env: dict | None = None) -> tuple[int, str]:
        cmd = [sys.executable, str(SCRIPT)]
        if not any(a.startswith("--base") for a in args) and not (env and "GITHUB_EVENT_PATH" in env):
            cmd += ["--base", "main", "--head", "HEAD"]
        if denylist is not None:
            deny = self.root.parent / "denylist.txt"
            deny.write_text(denylist, encoding="utf-8")
            cmd += ["--denylist", str(deny)]
        else:
            cmd += ["--denylist", str(self.root.parent / "missing-denylist")]
        proc = subprocess.run(
            cmd + list(args), cwd=self.root, env={**self.env, **(env or {})},
            capture_output=True, text=True,
        )
        return proc.returncode, proc.stdout + proc.stderr


def add_file(path: str, content: str | bytes, message: str = "add file"):
    def setup(repo: Repo) -> list[str]:
        repo.write(path, content)
        repo.commit(message)
        return []
    return setup


def setup_commit_message(repo: Repo) -> list[str]:
    repo.write("ok.txt", "fine\n")
    repo.commit(f"fix: talk to {TERM}")
    return []


def setup_commit_trailer(repo: Repo) -> list[str]:
    repo.write("ok.txt", "fine\n")
    repo.commit(f"fix: something\n\nbody text\n\nReviewed-by: Someone <someone@{TERM}.example>")
    return []


def setup_author_email(repo: Repo) -> list[str]:
    repo.write("ok.txt", "fine\n")
    repo.commit("fix: something", env={"GIT_AUTHOR_EMAIL": f"dev@{TERM}.example"})
    return []


def setup_pr_body(repo: Repo) -> list[str]:
    repo.write("ok.txt", "fine\n")
    repo.commit("fix: something")
    body = repo.root.parent / "body.md"
    body.write_text(f"## Description\n\nDeploys to {TERM.upper()} first.\n", encoding="utf-8")
    return ["--pr-body-file", str(body)]


def setup_pr_title(repo: Repo) -> list[str]:
    repo.commit("empty")
    return ["--pr-title", f"feat: support {TERM}"]


def setup_branch_name(repo: Repo) -> list[str]:
    repo.git("checkout", "-q", "-b", f"topic/{TERM}")
    repo.commit("empty")
    return []


def setup_renamed_path(repo: Repo) -> list[str]:
    repo.git("checkout", "-q", "main")
    repo.write("notes/a.txt", "plain content\n")
    repo.commit("add notes")
    repo.git("checkout", "-q", "-B", "feature")
    (repo.root / "notes" / TERM).mkdir(parents=True)
    repo.git("mv", "notes/a.txt", f"notes/{TERM}/a.txt")
    repo.commit("move notes")
    return []


def setup_deleted_line(repo: Repo) -> list[str]:
    repo.git("checkout", "-q", "main")
    repo.write("old.txt", f"keep\n{TERM}\n")
    repo.commit("old content")
    repo.git("checkout", "-q", "-B", "feature")
    repo.write("old.txt", "keep\n")
    repo.commit("remove line")
    return []


def setup_deleted_file_path(repo: Repo) -> list[str]:
    repo.git("checkout", "-q", "main")
    repo.write(f"{TERM}.txt", "content\n")
    repo.commit("old file")
    repo.git("checkout", "-q", "-B", "feature")
    repo.git("rm", "-q", f"{TERM}.txt")
    repo.commit("remove file")
    return []


def zero_width(text: str) -> str:
    return "\u200b".join(text)


def fullwidth(text: str) -> str:
    return "".join(chr(ord(c) + 0xFEE0) if "!" <= c <= "~" else c for c in text)


# (name, setup, caught). Rows with caught=False are known, documented misses
# or correct negatives; they pin the behavior described in docs/leakcheck.md.
BYPASS_CASES = [
    ("plain term in file", add_file("a.txt", f"cluster: {TERM}\n"), True),
    ("term in commit subject", setup_commit_message, True),
    ("term in commit trailer", setup_commit_trailer, True),
    ("term in author email", setup_author_email, True),
    ("term in PR body (uppercase)", setup_pr_body, True),
    ("term in PR title", setup_pr_title, True),
    ("term in branch name", setup_branch_name, True),
    ("different case", add_file("a.txt", "SECRET-Cluster-XyZ\n"), True),
    ("base64-encoded", add_file("a.txt", f"value: {b64(TERM)}\n"), True),
    ("base64 inside longer text", add_file("a.txt", f"x: {b64('host=' + TERM + ' port=1')}\n"), True),
    ("base64 glued to other characters", add_file("a.txt", f"abc{b64(TERM)}\n"), True),
    ("urlsafe base64 without padding",
     add_file("a.txt", base64.urlsafe_b64encode(TERM.encode()).decode().rstrip("=") + "\n"), True),
    ("double base64", add_file("a.txt", b64(b64(TERM)) + "\n"), True),
    ("split across two lines", add_file("a.txt", "secret-clu\nster-xyz\n"), True),
    ("split via string concatenation over three lines",
     add_file("a.js", "const x = 'secret-' +\n  'cluster-' +\n  'xyz';\n"), True),
    ("different separators", add_file("a.txt", "secret_cluster.xyz\n"), True),
    ("no separators", add_file("a.txt", "secretclusterxyz\n"), True),
    ("inside a renamed file path", setup_renamed_path, True),
    ("new file named after the term", add_file(f"{TERM}.yaml", "a: b\n"), True),
    ("URL-encoded separators", add_file("a.txt", "secret%2Dcluster%2Dxyz\n"), True),
    ("fully URL-encoded", add_file("a.txt", "".join(f"%{b:02X}" for b in TERM.encode()) + "\n"), True),
    ("hex escapes", add_file("a.txt", "".join(f"\\x{b:02x}" for b in TERM.encode()) + "\n"), True),
    ("unicode escapes", add_file("a.json", '"' + "".join(f"\\u{b:04x}" for b in TERM.encode()) + '"\n'), True),
    ("HTML entities", add_file("a.html", "".join(f"&#{b};" for b in TERM.encode()) + "\n"), True),
    ("plain hex", add_file("a.txt", TERM.encode().hex() + "\n"), True),
    ("zero-width characters", add_file("a.txt", zero_width(TERM) + "\n"), True),
    ("fullwidth characters", add_file("a.txt", fullwidth(TERM) + "\n"), True),
    ("in a binary file", add_file("a.bin", b"\x89PNG\r\n\x1a\n\x00\x01" + TERM.encode() + b"\xff\x00"), True),
    ("UTF-16 text in a binary file", add_file("a.bin", TERM.encode("utf-16-le")), True),
    ("term as a host name label", add_file("a.txt", f"api.{TERM}.internal\n"), True),
    ("deleted line (already in base)", setup_deleted_line, False),
    ("deleted file path (already in base)", setup_deleted_file_path, False),
    ("gzip-compressed binary", add_file("a.gz", gzip.compress(TERM.encode())), False),
    ("Cyrillic homoglyph", add_file("a.txt", TERM.replace("e", "\u0435") + "\n"), False),
    ("leetspeak", add_file("a.txt", "s3cr3t-clust3r-xyz\n"), False),
    ("reversed", add_file("a.txt", TERM[::-1] + "\n"), False),
    ("split across five lines", add_file("a.txt", "secr\net-c\nlust\ner-x\nyz\n"), False),
    ("base64 split across lines", add_file("a.txt", b64(TERM)[:12] + "\n" + b64(TERM)[12:] + "\n"), False),
    # Generic patterns.
    ("100.64/10 address", add_file("a.txt", "host 100.64.1.2\n"), True),
    ("100.64/10 upper edge", add_file("a.txt", "host 100.127.255.254\n"), True),
    ("just outside 100.64/10", add_file("a.txt", "host 100.128.0.1\n"), False),
    ("172.31 address", add_file("a.txt", "host 172.31.255.1\n"), True),
    ("just outside 172.16/12", add_file("a.txt", "host 172.32.0.1\n"), False),
    ("192.168 address", add_file("a.txt", "host 192.168.0.10\n"), True),
    ("10/8 address", add_file("a.txt", "host 10.1.2.3\n"), True),
    ("IP inside a CIDR string", add_file("a.txt", "cidr: 10.20.0.0/16\n"), True),
    ("IP in a URL", add_file("a.txt", "url: http://192.168.1.10:8080/api\n"), True),
    ("base64-encoded IP", add_file("a.txt", b64("addr 192.168.7.7 here") + "\n"), True),
    ("IP in a commit message", lambda r: (r.commit("route via 10.9.8.7"), [])[1], True),
    ("public IP", add_file("a.txt", "dns 8.8.8.8 and 127.0.0.1\n"), False),
    ("3-part version", add_file("a.txt", "version 10.4.22\n"), False),
    ("5-part version", add_file("a.txt", "version 10.1.2.3.4\n"), False),
    ("4-part version in a private range (accepted false positive)", add_file("a.txt", "v10.2.3.4\n"), True),
    ("IPv6 ULA", add_file("a.txt", "addr fd12:3456:789a::1\n"), False),
    ("integer IPv4", add_file("a.txt", "addr 167772161\n"), False),
    ("private DNS hostname", add_file("a.txt", f"host foo{SUFFIX}\n"), True),
    ("private DNS hostname uppercase", add_file("a.txt", f"host FOO{SUFFIX.upper()}\n"), True),
    ("private DNS hostname with trailing dot", add_file("a.txt", f"host foo.Bar{SUFFIX}.\n"), True),
    ("URL-encoded private DNS hostname", add_file("a.txt", "host foo" + SUFFIX.replace(".", "%2E") + "\n"), True),
    ("bare private DNS suffix", add_file("a.txt", f"the {BARE_SUFFIX} domain\n"), False),
    ("longer TLD is not the suffix", add_file("a.txt", f"foo{SUFFIX}work\n"), False),
]


class TempRepoCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name) / "repo"
        root.mkdir()
        self.repo = Repo(root)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def assertNoTermInOutput(self, out: str) -> None:
        lowered = out.casefold()
        for term in (TERM, OTHER):
            self.assertNotIn(term, lowered)
            self.assertNotIn(leakcheck.squash(term), leakcheck.squash(lowered))


class TestBypassAttempts(unittest.TestCase):
    def test_bypass_table(self) -> None:
        for name, setup, caught in BYPASS_CASES:
            with self.subTest(name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp) / "repo"
                root.mkdir()
                repo = Repo(root)
                args = setup(repo)
                code, out = repo.run(*args)
                self.assertEqual(code, 1 if caught else 0, out)
                lowered = out.casefold()
                self.assertNotIn(TERM, lowered, "denylist text must never be printed")
                self.assertNotIn(leakcheck.squash(TERM), leakcheck.squash(lowered))


class TestGenericMatches(unittest.TestCase):
    CASES = [
        ("10.0.0.1", ["10.0.0.1"]),
        ("10.255.255.255", ["10.255.255.255"]),
        ("9.255.255.255", []),
        ("11.0.0.1", []),
        ("172.15.255.255", []),
        ("172.16.0.0", ["172.16.0.0"]),
        ("172.31.255.255", ["172.31.255.255"]),
        ("172.32.0.0", []),
        ("192.167.1.1", []),
        ("192.168.1.1", ["192.168.1.1"]),
        ("192.169.1.1", []),
        ("100.63.255.255", []),
        ("100.64.0.0", ["100.64.0.0"]),
        ("100.127.255.255", ["100.127.255.255"]),
        ("100.128.0.0", []),
        ("10.256.0.1", []),
        ("1.10.2.3", []),
        ("1.10.2.3.4", []),
        ("10.1.2.3.4", []),
        ("x10.1.2.3y", ["10.1.2.3"]),
        ("at 10.1.2.3.", ["10.1.2.3"]),
        ("10.1.2.3:443", ["10.1.2.3"]),
        ("10.1.2.0/24", ["10.1.2.0"]),
        ("[10.1.2.3]", ["10.1.2.3"]),
        ("a 10.0.0.1 and 192.168.0.1", ["10.0.0.1", "192.168.0.1"]),
        (f"foo{SUFFIX}", [f"foo{SUFFIX}"]),
        (f"a.b-c.foo{SUFFIX}", [f"a.b-c.foo{SUFFIX}"]),
        (f"foo{SUFFIX}.", [f"foo{SUFFIX}."]),
        (f"https://foo{SUFFIX}:8443/x", [f"foo{SUFFIX}"]),
        (BARE_SUFFIX, []),
        (SUFFIX, []),
        (f"foo{SUFFIX}work", []),
        (f"foo{BARE_SUFFIX}", []),
    ]

    def test_cases(self) -> None:
        for text, expected in self.CASES:
            with self.subTest(text):
                got = [token for token, _ in leakcheck.generic_matches(text.casefold())]
                self.assertEqual(got, expected)


class TestVariants(unittest.TestCase):
    CASES = [
        ("plain", TERM, True),
        ("upper", TERM.upper(), True),
        ("base64", b64(TERM), True),
        ("url", "secret%2dcluster%2dxyz", True),
        ("hex escapes", "".join(f"\\x{b:02x}" for b in TERM.encode()), True),
        ("octal escapes", "".join(f"\\{b:03o}" for b in TERM.encode()), True),
        ("zero-width joiner", "\u200d".join(TERM), True),
        ("soft hyphen", "\u00ad".join(TERM), True),
        ("byte order mark", "\ufeff" + TERM, True),
        ("unrelated", "nothing to see here", False),
        ("random base64", "dGhpcyBpcyBmaW5lIGFuZCBjbGVhbg==", False),
    ]

    def test_cases(self) -> None:
        term = leakcheck.load_terms([TERM])[0]
        for name, text, expected in self.CASES:
            with self.subTest(name):
                found = any(
                    leakcheck.term_in(term, folded, leakcheck.squash(folded)) is not None
                    for _, folded in leakcheck.variants(text)
                )
                self.assertEqual(found, expected)


class TestParsing(unittest.TestCase):
    def test_load_terms(self) -> None:
        cases = [
            ([], []),
            (["# comment", "", "  "], []),
            (["Alpha", "# x", "beta-gamma\r"], [(1, "alpha"), (2, "beta-gamma")]),
        ]
        for lines, expected in cases:
            with self.subTest(lines):
                self.assertEqual([(t.number, t.folded) for t in leakcheck.load_terms(lines)], expected)

    def test_allowlist(self) -> None:
        allow = leakcheck.Allowlist.parse(["# c", "path:docs/*.md", "10.0.0.0", ""])
        cases = [
            ("docs/a.md", "10.9.9.9", True),
            ("src/a.ts", "10.0.0.0", True),
            ("src/a.ts", "10.9.9.9", False),
            (None, "10.9.9.9", False),
        ]
        for path, token, expected in cases:
            with self.subTest((path, token)):
                self.assertEqual(allow.allows(path, token), expected)

    def test_unquote_git_path(self) -> None:
        cases = [
            ("b/plain.txt", "b/plain.txt"),
            ('"b/caf\\303\\251.txt"', "b/café.txt"),
            ('"b/tab\\there"', "b/tab\there"),
        ]
        for raw, expected in cases:
            with self.subTest(raw):
                self.assertEqual(leakcheck.unquote_git_path(raw), expected)


class TestScanBehavior(TempRepoCase):
    def test_clean_change_passes(self) -> None:
        self.repo.write("src/app.ts", "export const answer = 42;\n")
        self.repo.commit("feat: add answer")
        code, out = self.repo.run("--pr-title", "feat: add answer")
        self.assertEqual(code, 0, out)
        self.assertIn("leakcheck: clean", out)

    def test_findings_name_entry_and_location_only(self) -> None:
        self.repo.write("src/app.ts", f"line one\nconst host = '{OTHER}';\n")
        self.repo.commit("feat: add host")
        code, out = self.repo.run()
        self.assertEqual(code, 1, out)
        self.assertIn("src/app.ts:2: denylist entry 2", out)
        self.assertNoTermInOutput(out)

    def test_path_with_term_is_redacted(self) -> None:
        self.repo.write(f"{TERM}/a.txt", "content with 10.1.1.1\n")
        self.repo.commit("add")
        code, out = self.repo.run()
        self.assertEqual(code, 1, out)
        self.assertIn("[redacted]:1: private IPv4 address 10.1.1.1", out)
        self.assertNoTermInOutput(out)

    def test_generic_match_containing_term_is_redacted(self) -> None:
        self.repo.write("a.txt", f"host node1.{TERM}{SUFFIX}\n")
        self.repo.commit("add")
        code, out = self.repo.run()
        self.assertEqual(code, 1, out)
        self.assertIn("generic match containing a denylist entry", out)
        self.assertNoTermInOutput(out)

    def test_allowlist_suppresses_generic_but_not_denylist(self) -> None:
        self.repo.write(".leakcheck-allow", "path:docs/*\n172.16.0.0\n")
        self.repo.write("docs/net.md", f"example 192.168.1.1\nand {TERM}\n")
        self.repo.write("src/a.ts", "// range 172.16.0.0/12\n")
        self.repo.commit("docs")
        code, out = self.repo.run()
        self.assertEqual(code, 1, out)
        self.assertNotIn("192.168.1.1", out)
        self.assertNotIn("172.16.0.0", out)
        self.assertIn("docs/net.md:2: denylist entry 1", out)
        self.assertIn("edits .leakcheck-allow", out)

    def test_missing_denylist_warns_and_runs_generic(self) -> None:
        self.repo.write("a.txt", f"{TERM} at 10.3.3.3\n")
        self.repo.commit("add")
        code, out = self.repo.run(denylist=None)
        self.assertEqual(code, 1, out)
        self.assertIn("no denylist configured", out)
        self.assertIn("10.3.3.3", out)

    def test_missing_denylist_clean_passes(self) -> None:
        self.repo.write("a.txt", "fine\n")
        self.repo.commit("add")
        code, out = self.repo.run(denylist=None)
        self.assertEqual(code, 0, out)
        self.assertIn("no denylist configured", out)

    def test_bad_revision_is_an_error(self) -> None:
        code, out = self.repo.run("--base", "main", "--head", "does-not-exist")
        self.assertEqual(code, 2, out)


class TestGithubEvents(TempRepoCase):
    def event_env(self, name: str, payload: dict) -> dict:
        path = self.repo.root.parent / "event.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return {"GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": name, "GITHUB_EVENT_PATH": str(path)}

    def rev(self, ref: str) -> str:
        return self.repo.git("rev-parse", ref).strip()

    def test_pull_request_payload(self) -> None:
        self.repo.write("a.txt", "fine\n")
        self.repo.commit("fine")
        cases = [
            ("clean", "feat: fine", "All good.", 0),
            ("title", f"feat: {TERM.upper()}", None, 1),
            ("body", "feat: fine", f"line\n{zero_width(OTHER)}", 1),
            ("body IP", "feat: fine", "reach 192.168.4.4", 1),
        ]
        for name, title, body, expected in cases:
            with self.subTest(name):
                env = self.event_env("pull_request", {"pull_request": {
                    "title": title, "body": body,
                    "base": {"sha": self.rev("main")},
                    "head": {"sha": self.rev("HEAD"), "ref": "feature"},
                }})
                code, out = self.repo.run(env=env)
                self.assertEqual(code, expected, out)
                lines = out.splitlines()
                masks = [line for line in lines if line.startswith("::add-mask::")]
                self.assertIn(f"::add-mask::{TERM}", masks)
                self.assertIn(f"::add-mask::{OTHER.upper()}", masks)
                self.assertEqual(lines[:len(masks)], masks, "masks must come before any other output")
                self.assertNoTermInOutput("\n".join(lines[len(masks):]))

    def test_push_payloads(self) -> None:
        self.repo.write("a.txt", "host 10.5.5.5\n")
        self.repo.commit("first")
        self.repo.write("b.txt", "fine\n")
        self.repo.commit("second")
        cases = [
            ("range", self.rev("main"), 1, None),
            ("new branch scans head commit only", "0" * 40, 0, None),
            ("unknown before scans head commit only", "1" * 40, 0, "is not available"),
        ]
        for name, before, expected, warning in cases:
            with self.subTest(name):
                env = self.event_env("push", {
                    "ref": "refs/heads/main", "before": before, "after": self.rev("HEAD"),
                })
                code, out = self.repo.run(env=env)
                self.assertEqual(code, expected, out)
                if warning:
                    self.assertIn(warning, out)

    def test_annotations(self) -> None:
        self.repo.write("src/a,b.ts", f"x\n{TERM}\n")
        self.repo.commit("add")
        env = self.event_env("push", {"ref": "refs/heads/main", "before": self.rev("main"), "after": self.rev("HEAD")})
        code, out = self.repo.run(env=env)
        self.assertEqual(code, 1, out)
        self.assertIn("::error file=src/a%2Cb.ts,line=2,title=leakcheck::src/a,b.ts:2: denylist entry 1", out)


if __name__ == "__main__":
    unittest.main()
