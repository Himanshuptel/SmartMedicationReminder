#!/usr/bin/env python3
"""
commit_as.py - Multi-Author Git Commit and Push Automation

Distributes project deliverables across team members (Himanshu, Divyadarshan, Anuj)
with exact GIT_AUTHOR and GIT_COMMITTER attributes, ensuring clean multi-contributor
attribution on GitHub.

Usage:
    # 1. Preview how uncommitted changes will be staged and attributed:
    python commit_as.py --dry-run "Phase 4: UI polish & alerts"

    # 2. Stage and commit current changes split by team member:
    python commit_as.py "Phase 4: UI polish & alerts"

    # 3. Commit and push directly to GitHub:
    python commit_as.py --push "Phase 4: UI polish & alerts"
"""

import os
import sys
import subprocess
import argparse

MEMBERS = {
    "Himanshu": {
        "name": "Himanshu",
        "email": "yash666677d@gmail.com",
        "role": "Backend Lead & Database Architect",
    },
    "Divyadarshan": {
        "name": "Divyadarshan",
        "email": "divyadarshansinghc@gmail.com",
        "role": "Frontend & UI/UX Developer",
    },
    "Anuj": {
        "name": "Anuj Sharma",
        "email": "anujsharma343435@gmail.com",
        "role": "API Integration, QA/Testing & Documentation",
    },
}

# Ownership mapping: specific paths first, then folder prefixes
PATH_OWNERS = [
    # Anuj Sharma (API Client, Testing & QA, Technical Documentation)
    ("src/services/", "Anuj", "API Client & Network"),
    ("tests/", "Anuj", "Automated Pytest Suite"),
    ("docs/", "Anuj", "Documentation & Audit Reports"),

    # Divyadarshan (Frontend UI/UX)
    ("src/screens/", "Divyadarshan", "UI Screens"),
    ("src/components/", "Divyadarshan", "UI Components"),
    ("src/App.jsx", "Divyadarshan", "Frontend Routing & Layout"),
    ("src/index.css", "Divyadarshan", "Styles & Theme"),
    ("index.html", "Divyadarshan", "HTML Entry"),
    ("src/", "Divyadarshan", "Frontend Core"),

    # Himanshu (Backend Flask, SQLite, Migrations, DevOps & Scripts)
    ("backend/", "Himanshu", "Flask Backend & Database"),
    ("scripts/", "Himanshu", "Database & Backend Scripts"),
    (".env", "Himanshu", "Environment Configuration"),
    (".gitignore", "Himanshu", "Git Configuration"),
    ("commit_as.py", "Himanshu", "Git Automation Tooling"),
]


def run_cmd(*args, env=None, check=True):
    result = subprocess.run(args, capture_output=True, text=True, env=env, check=check)
    return result.stdout.strip()


def resolve_owner(file_path):
    norm = file_path.replace("\\", "/").lstrip("./")
    for pattern, owner, label in PATH_OWNERS:
        if pattern.endswith("/"):
            if norm.startswith(pattern):
                return owner, label
        else:
            if norm == pattern or norm.startswith(pattern):
                return owner, label
    return "Himanshu", "Misc"


def get_changed_files():
    changed = set()
    diff_unstaged = run_cmd("git", "diff", "--name-only")
    if diff_unstaged:
        changed.update(diff_unstaged.splitlines())
    diff_staged = run_cmd("git", "diff", "--cached", "--name-only")
    if diff_staged:
        changed.update(diff_staged.splitlines())
    untracked = run_cmd("git", "ls-files", "--others", "--exclude-standard")
    if untracked:
        changed.update(untracked.splitlines())
    return [f for f in sorted(changed) if f]


def commit_for_member(member_key, message, file_list, dry_run=False):
    if not file_list:
        return False
    member = MEMBERS[member_key]
    name = member["name"]
    email = member["email"]
    author_str = f"{name} <{email}>"

    if dry_run:
        print(f"\n[DRY RUN] Author: {author_str} ({member['role']})")
        print(f"          Message: \"{message}\"")
        for f in file_list:
            print(f"          + {f}")
        return True

    for f in file_list:
        run_cmd("git", "add", f)

    staged = run_cmd("git", "diff", "--cached", "--name-only")
    if not staged:
        return False

    env = os.environ.copy()
    env["GIT_AUTHOR_NAME"] = name
    env["GIT_AUTHOR_EMAIL"] = email
    env["GIT_COMMITTER_NAME"] = name
    env["GIT_COMMITTER_EMAIL"] = email

    run_cmd("git", "commit", "--author", author_str, "-m", message, env=env)
    print(f"✓ Committed as {name} <{email}>: {message}")
    for f in file_list:
        print(f"    added: {f}")
    return True


def commit_phase(phase_title, dry_run=False):
    changed_files = get_changed_files()
    if not changed_files:
        print("No changes to commit.")
        return 0

    print(f"\nProcessing {len(changed_files)} changed file(s) for '{phase_title}'...")

    grouped = {}
    for f in changed_files:
        owner, label = resolve_owner(f)
        grouped.setdefault(owner, []).append((f, label))

    commits_made = 0
    # Commit in order: Himanshu, Divyadarshan, Anuj
    for owner in ["Himanshu", "Divyadarshan", "Anuj"]:
        if owner not in grouped:
            continue
        files_and_labels = grouped[owner]
        files = [f for f, _ in files_and_labels]
        labels = sorted(list({lbl for _, lbl in files_and_labels}))
        label_summary = " & ".join(labels)
        commit_msg = f"{phase_title}: {label_summary}"
        if commit_for_member(owner, commit_msg, files, dry_run=dry_run):
            commits_made += 1

    return commits_made


def main():
    parser = argparse.ArgumentParser(
        description="Distribute git commits across Himanshu, Divyadarshan, and Anuj."
    )
    parser.add_argument("phase", nargs="?", default="Update", help="Phase title or commit prefix")
    parser.add_argument("--dry-run", action="store_true", help="Preview commit distribution")
    parser.add_argument("--push", action="store_true", help="Push to origin/main after committing")

    args = parser.parse_args()

    commits_made = commit_phase(args.phase, dry_run=args.dry_run)
    if args.push and not args.dry_run and commits_made > 0:
        print("\nPushing commits to origin/main...")
        out = run_cmd("git", "push", "origin", "main")
        print(out)
        print("✓ Pushed to GitHub!")


if __name__ == "__main__":
    main()
