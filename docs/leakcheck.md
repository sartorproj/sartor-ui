# Leak check

This repository is public. The `Leak Check` workflow (`.github/workflows/leakcheck.yml`) fails a pull request or a push to `main` that adds internal names or private network details. It runs `.github/scripts/leakcheck.py`, a Python 3 script with no dependencies.

## What it checks

It scans only what the change adds:

- added lines in the diff (merge base to head for a pull request, `before` to `after` for a push), including binary files, read as text
- the messages of all commits in the range (subject, body and trailers) and their author and committer names and emails
- the paths of added, modified, renamed and copied files (the new path of a rename)
- the branch name, and the pull request title and body. The workflow reads these from the event payload file, not from inline expressions in shell. It also runs again when the title or body is edited.

It reports two kinds of findings:

- **Denylist entries.** These are fixed strings from `.leakcheck-denylist`, one per line, matched case-insensitively. Blank lines and lines starting with `#` are skipped. A finding names the entry only by number (`denylist entry 3` is the third entry), plus the file and line. The matched text is never printed. Paths and generic matches that contain an entry are shown as `[redacted]`. In CI, every entry is also registered with `::add-mask::` before any other output.
- **Generic patterns.** These checks always run: IPv4 addresses in 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 and 100.64.0.0/10 (CGNAT), and private DNS hostnames in any case, with or without a trailing dot. The private DNS suffixes are listed as code points in `PRIVATE_HOST_SUFFIXES` in the script.

Each text is also checked after URL decoding, `\x`, `\u` and octal escapes, HTML entities, hex decoding and base64 decoding of tokens of 16 or more characters (standard or URL-safe, padded or not, and up to two nested decodings). It is also checked after NFKC normalization, which folds fullwidth letters, and with NUL and zero-width characters removed. Denylist entries are also matched with every separator removed (`secret_cluster.xyz` matches `secret-cluster-xyz`) when the entry has at least 6 letters and digits. An entry split over up to 3 consecutive lines is reported as `split across lines`.

### IPv4 matching

An address counts only when its four dotted numbers are not part of a longer dotted number, and every octet is 255 or less. A five-part version such as `1.10.2.3.4` therefore matches nothing, and a three-part version never matches. A four-part version whose numbers happen to form an address in a private range is flagged. This is accepted because a real address can't be told apart from a version by its shape, so add the exact value to the allowlist if it comes up.

### What it catches and misses

The tests in `.github/scripts/test_leakcheck.py` cover every row of this table.

| Attempt | Result |
|---|---|
| Entry in a file, commit subject, body, trailer, author email, branch name, PR title or PR body | caught |
| Different case, fullwidth letters, zero-width characters | caught |
| base64 (also glued to other text, URL-safe, unpadded, or encoded twice) | caught |
| URL encoding, `\x` / `\u` / octal escapes, HTML entities, plain hex | caught |
| Other separators or none (`secret_cluster.xyz`, `secretclusterxyz`) | caught |
| Split over 2 or 3 consecutive lines, including string concatenation | caught |
| In a new or renamed file path | caught |
| Plain or UTF-16 text inside a binary file | caught |
| Address in 100.64.0.0/10, 172.16.0.0/12, 192.168.0.0/16, 10.0.0.0/8, inside a CIDR, a URL, or base64 | caught |
| Private DNS hostname in upper case, with a trailing dot, or URL-encoded | caught |
| Removed line, or removed file path (already public in the base) | not flagged, by design |
| Compressed or encrypted content (gzip, zip, images) | missed |
| Homoglyphs from other scripts (Cyrillic `е`), leetspeak, reversed text | missed |
| Split over 4 or more lines, or a base64 value split across lines | missed |
| IPv6 private addresses (fc00::/7), integer or hex IPv4 forms | missed |
| PR comments, review comments, issues, release notes, tags | not scanned |
| Pull requests from forks | generic checks only (no secrets) |

A push whose `before` commit is unknown (a force push) or all zeros (a new branch) scans only the head commit and logs a warning.

## Allowlist

`.leakcheck-allow` silences generic findings that are legitimate, such as documentation examples. It never silences denylist entries. Each line is either `path:<glob>`, which ignores generic findings in matching paths (`fnmatch`, where `*` also matches `/`), or an exact matched value such as `10.0.0.0`, compared case-insensitively. It is read from the head commit, so a pull request can add entries. The check warns when a change edits the file, so reviewers should look at new entries closely.

## Configure the denylist (maintainers)

1. In the repository settings, open **Secrets and variables → Actions** and create the repository secret `LEAKCHECK_DENYLIST`. Put one term per line. Use specific terms: short ones also match inside ordinary words and identifiers.
2. An Actions *variable* with the same name is used only when the secret is missing. Prefer the secret, because variables are not masked in logs.
3. To make the check block merges, require the `Leak Check` and `Leak Check Tests` status checks in the branch protection rule (or ruleset) for `main`.

The scan runs the script and workflow from the pull request itself, so a pull request can change both. Review changes under `.github/` (a CODEOWNERS entry helps).

## Run it locally

Put the terms in `.leakcheck-denylist` at the repository root. The file is in `.gitignore`. Then run:

```bash
python3 .github/scripts/leakcheck.py                       # origin/main...HEAD
python3 .github/scripts/leakcheck.py --base origin/main --head HEAD \
  --pr-title "feat: my change" --pr-body-file /tmp/body.md
```

The exit status is 0 when clean, 1 when there are findings, and 2 on a usage or git error. `--denylist FILE` reads terms from another file. `--base 4b825dc642cb6eb9a060e54bf8d69288fbee4904` (the empty tree) scans the whole tree and history.

Run the tests with:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
```
