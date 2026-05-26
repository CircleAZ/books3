#!/usr/bin/env python3
import os
import sys
import json
import base64
import urllib.request
import subprocess
import sqlite3
import fnmatch
import time
import argparse
import hashlib
from pathlib import Path

# Reconfigure stdout/stderr to UTF-8 to prevent CP1252 encoding crashes on Windows console
if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        # Fallback for older python versions
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Paths — dynamically resolved to avoid hardcoded machine-specific values
WORKSPACE_ROOT = str(Path(__file__).resolve().parent.parent)
_ide_name = "Antigravity IDE"  # Change if IDE branding differs
_appdata = os.path.expandvars(r"%APPDATA%") if os.name == 'nt' else os.path.expanduser("~/Library/Application Support")
GLOBAL_STORAGE_DIR = os.path.join(_appdata, _ide_name, "User", "globalStorage", "google.securecoder")
WORKSPACE_STORAGE_ROOT = os.path.join(_appdata, _ide_name, "User", "workspaceStorage")
TOKEN_URL = "https://storage.googleapis.com/codemender-public/ext/3c81f0a72e/d"
CACHE_DIR = os.path.join(WORKSPACE_ROOT, ".securecoder")
TOKEN_CACHE_FILE = os.path.join(CACHE_DIR, "token.cache")
VERSION_CONTROLLED_IGNORE_FILE = os.path.join(CACHE_DIR, "ignored_findings.json")

# In-memory cache for file lines to optimize scan performance
_file_lines_cache = {}

def get_file_lines(filepath):
    """Read and cache file lines in memory."""
    if filepath not in _file_lines_cache:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                _file_lines_cache[filepath] = f.readlines()
        except Exception:
            _file_lines_cache[filepath] = []
    return _file_lines_cache[filepath]

def get_token():
    """Fetch token from GCS, caching it for 24 hours."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(TOKEN_CACHE_FILE):
        mtime = os.path.getmtime(TOKEN_CACHE_FILE)
        if time.time() - mtime < 24 * 3600:
            try:
                with open(TOKEN_CACHE_FILE, "r") as f:
                    return f.read().strip()
            except Exception:
                pass
    
    print("Fetching scanner token from Google Storage...")
    try:
        with urllib.request.urlopen(TOKEN_URL, timeout=10) as response:
            encoded = response.read().decode('utf-8').strip()
            token = base64.b64decode(encoded).decode('utf-8').strip()
            with open(TOKEN_CACHE_FILE, "w") as f:
                f.write(token)
            return token
    except Exception as e:
        print(f"Error fetching token: {e}", file=sys.stderr)
        return None

def find_workspace_db():
    """Locate the state.vscdb SQLite file for the books2 workspace."""
    if not os.path.exists(WORKSPACE_STORAGE_ROOT):
        return None
    for folder in os.listdir(WORKSPACE_STORAGE_ROOT):
        folder_path = os.path.join(WORKSPACE_STORAGE_ROOT, folder)
        if os.path.isdir(folder_path):
            ws_json_path = os.path.join(folder_path, "workspace.json")
            if os.path.exists(ws_json_path):
                try:
                    with open(ws_json_path, "r") as f:
                        ws_data = json.load(f)
                        if "folder" in ws_data and "z%3A/books2" in ws_data["folder"]:
                            db_path = os.path.join(folder_path, "state.vscdb")
                            if os.path.exists(db_path):
                                return db_path
                except Exception:
                    pass
    return None

def get_ignored_vulns_from_db():
    """Retrieve ignored vulnerabilities list from state.vscdb SQLite."""
    db_path = find_workspace_db()
    if not db_path:
        print("Warning: Could not locate workspace state.vscdb. Ignored list may be incomplete.", file=sys.stderr)
        return []
    
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM ItemTable WHERE key = 'Google.securecoder'")
        row = cursor.fetchone()
        conn.close()
        
        if row:
            data = json.loads(row[0])
            ignored_entries = data.get("securecoder.ignoredVulnerabilities", [])
            return ignored_entries
        return []
    except Exception as e:
        print(f"Warning: Failed to read state.vscdb: {e}", file=sys.stderr)
        return []

def load_ignore_patterns():
    """Load glob patterns from global and workspace .securecoderignore."""
    patterns = []
    # 1. Global ignore file (user home)
    global_path = os.path.join(os.path.expanduser("~"), ".securecoder", ".securecoderignore")
    # 2. Local workspace ignore file
    local_path = os.path.join(WORKSPACE_ROOT, ".securecoderignore")
    
    for path in [global_path, local_path]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            patterns.append(line)
            except Exception as e:
                print(f"Warning: Failed to read ignore file {path}: {e}", file=sys.stderr)
    return list(set(patterns))

def is_path_ignored(filepath, patterns):
    """Check if filepath matches any pattern in .securecoderignore."""
    norm_path = filepath.replace("\\", "/")
    for pattern in patterns:
        norm_pattern = pattern.replace("\\", "/")
        if not norm_pattern.strip():
            continue
        
        if "/" not in norm_pattern:
            if fnmatch.fnmatch(os.path.basename(norm_path), norm_pattern):
                return True
            if fnmatch.fnmatch(norm_path, f"**/{norm_pattern}/**"):
                return True
        else:
            full_pattern = norm_pattern
            if not norm_pattern.startswith("/") and not norm_pattern.startswith("**/"):
                full_pattern = f"**/{norm_pattern}"
            
            if fnmatch.fnmatch(norm_path, full_pattern):
                return True
    return False

def compute_hash(line_text):
    """Compute sha256 hash of trimmed line text, matching extension.js logic."""
    return hashlib.sha256(line_text.strip().encode('utf-8')).hexdigest()

def is_line_nosemgrep_ignored(filepath, line_num, check_id):
    """Check if the line or the line above contains a matching nosemgrep comment."""
    lines = get_file_lines(filepath)
    if not lines:
        return False
        
    indices_to_check = []
    if 0 <= line_num - 1 < len(lines):
        indices_to_check.append(line_num - 1)
    if 0 <= line_num - 2 < len(lines):
        indices_to_check.append(line_num - 2)
        
    for idx in indices_to_check:
        line_text = lines[idx].strip()
        if 'nosemgrep' in line_text:
            import re
            match = re.search(r'nosemgrep\s*(?::\s*([a-zA-Z0-9_\-\.]+))?', line_text)
            if match:
                spec_rule = match.group(1)
                if not spec_rule:
                    return True
                if spec_rule.lower() in check_id.lower():
                    return True
    return False

def load_version_controlled_ignores():
    """Load version controlled ignored findings from .securecoder/ignored_findings.json."""
    if not os.path.exists(VERSION_CONTROLLED_IGNORE_FILE):
        return []
    try:
        with open(VERSION_CONTROLLED_IGNORE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to read version-controlled ignores: {e}", file=sys.stderr)
        return []

def get_ignored_hashes(ignored_entries):
    """Create a set of ignored hashes for fast lookup."""
    ignored_hashes = set()
    for entry in ignored_entries:
        h = entry.get("contentHash")
        rule_id = entry.get("ruleId")
        if h and rule_id:
            ignored_hashes.add((rule_id, h))
    return ignored_hashes

def get_semgrep_binary():
    """Return the correct path to the semgrep-core-proprietary executable."""
    binary_name = "semgrep-core-proprietary.exe" if os.name == 'nt' else "semgrep-core-proprietary"
    os_folder = "win_amd64" if os.name == 'nt' else "darwin_arm64"
    global_bin = os.path.join(GLOBAL_STORAGE_DIR, "bin", os_folder, binary_name)
    if os.path.exists(global_bin):
        return global_bin
    global_bin_alt = os.path.join(GLOBAL_STORAGE_DIR, binary_name)
    if os.path.exists(global_bin_alt):
        return global_bin_alt
    return None

def get_target_scan_dirs():
    """Identify directories to scan, skipping venv, git, node_modules, etc."""
    exclude_folders = {
        "venv", ".venv", ".git", "node_modules", "dist", "build", 
        "out", "__pycache__", ".securecoder", "scratch", ".gemini",
        ".tmp.drivedownload", ".tmp.driveupload", "static", "media"
    }
    
    js_dirs = []
    py_dirs = []
    
    # Check frontend/src
    fe_src = os.path.join(WORKSPACE_ROOT, "frontend", "src")
    if os.path.exists(fe_src):
        js_dirs.append(fe_src)
        
    # Check top-level directories for Python views/serializers
    for item in os.listdir(WORKSPACE_ROOT):
        full_path = os.path.join(WORKSPACE_ROOT, item)
        if os.path.isdir(full_path) and item not in exclude_folders and item != "frontend":
            py_dirs.append(full_path)
            
    return js_dirs, py_dirs

def run_semgrep_on_dir(binary, rules, token, target_dir, lang):
    """Run semgrep binary on a directory, reading stdout as binary to prevent encoding issues."""
    env = os.environ.copy()
    env["SEMGREP_APP_TOKEN"] = token
    
    cmd = [
        binary,
        "-lang", lang,
        "-rules", rules,
        "-json",
        "-pro_inter_file",
        target_dir
    ]
    
    try:
        res = subprocess.run(cmd, env=env, capture_output=True, timeout=60)
        if res.returncode != 0 and not res.stdout:
            print(f"Warning: Scan failed for {os.path.basename(target_dir)}. Stderr: {res.stderr.decode('utf-8', errors='ignore')}", file=sys.stderr)
            return []
            
        stdout_str = res.stdout.decode('utf-8', errors='ignore')
        # Search for the expected JSON envelope to avoid parsing stray '{' from diagnostics
        marker = '{"results"'
        idx = stdout_str.find(marker)
        if idx == -1:
            # Fallback: try to find any top-level JSON object
            idx = stdout_str.find('{')
        if idx != -1:
            try:
                scan_data = json.loads(stdout_str[idx:])
                return scan_data.get("results", [])
            except json.JSONDecodeError as je:
                print(f"Warning: Failed to parse scan JSON for {os.path.basename(target_dir)}: {je}", file=sys.stderr)
                return []
        return []
    except Exception as e:
        print(f"Error scanning {target_dir}: {e}", file=sys.stderr)
        return []

def sync_vscode_db():
    """Sync the version-controlled ignore list into the local VS Code state.vscdb."""
    vc_ignores = load_version_controlled_ignores()
    if not vc_ignores:
        print("No version-controlled ignores to sync.")
        return
        
    db_path = find_workspace_db()
    if not db_path:
        print("Error: Could not locate VS Code workspace state.vscdb to write ignores.", file=sys.stderr)
        sys.exit(1)
        
    print(f"Syncing {len(vc_ignores)} version-controlled ignores to VS Code DB: {db_path}...")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Read existing Google.securecoder key
        cursor.execute("SELECT value FROM ItemTable WHERE key = 'Google.securecoder'")
        row = cursor.fetchone()
        
        db_data = {}
        if row:
            db_data = json.loads(row[0])
            
        existing_ignores = db_data.get("securecoder.ignoredVulnerabilities", [])
        
        # Build dictionary map to merge entries uniquely
        # Key: ruleId::filePath::contentHash
        ignore_map = {}
        for entry in existing_ignores:
            key = f"{entry.get('ruleId')}::{entry.get('filePath')}::{entry.get('contentHash')}"
            ignore_map[key] = entry
            
        for vc in vc_ignores:
            rel_path = vc["filePath"]
            abs_path = os.path.abspath(os.path.join(WORKSPACE_ROOT, rel_path))
            rule_id = vc["ruleId"]
            line_text = vc["lineText"]
            content_hash = compute_hash(line_text)
            
            # Formulate entry
            vuln_id = f"{abs_path}:0:{rule_id}" # line number doesn't matter since makeKey uses contentHash
            entry = {
                "vulnId": vuln_id,
                "ruleId": rule_id,
                "filePath": abs_path,
                "contentHash": content_hash,
                "reason": vc.get("reason", "Version Controlled"),
                "timestamp": int(time.time() * 1000)
            }
            key = f"{rule_id}::{abs_path}::{content_hash}"
            ignore_map[key] = entry
            
        db_data["securecoder.ignoredVulnerabilities"] = list(ignore_map.values())
        
        # Write back
        cursor.execute(
            "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('Google.securecoder', ?)",
            (json.dumps(db_data),)
        )
        conn.commit()
        conn.close()
        print("Successfully synchronized version-controlled ignores to VS Code.")
    except Exception as e:
        print(f"Error updating VS Code DB: {e}", file=sys.stderr)
        sys.exit(1)

def export_findings_to_json(findings):
    """Export raw findings into version-controlled ignored_findings.json file."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    vc_ignores = []
    
    for f in findings:
        filepath = f["filepath"]
        rel_path = os.path.relpath(filepath, WORKSPACE_ROOT).replace("\\", "/")
        line_num = f["line"]
        
        lines = get_file_lines(filepath)
        line_text = lines[line_num - 1] if 0 <= line_num - 1 < len(lines) else ""
            
        vc_ignores.append({
            "filePath": rel_path,
            "ruleId": f["check_id"],
            "lineText": line_text,
            "reason": f"False positive {f['class']} bracket lookup or string literal"
        })
        
    try:
        with open(VERSION_CONTROLLED_IGNORE_FILE, "w", encoding="utf-8") as f:
            json.dump(vc_ignores, f, indent=2)
        print(f"Successfully exported {len(vc_ignores)} findings to {VERSION_CONTROLLED_IGNORE_FILE}")
    except Exception as e:
        print(f"Error exporting findings: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="SecureCoder findings offline runner pipeline")
    parser.add_argument("--sync-vscode", action="store_true", help="Sync version-controlled ignores back to VS Code state DB")
    parser.add_argument("--export-ignores", action="store_true", help="Scan and export all current findings to ignored_findings.json")
    args = parser.parse_args()
    
    if args.sync_vscode:
        sync_vscode_db()
        return

    binary = get_semgrep_binary()
    if not binary:
        print("Error: Could not locate semgrep-core-proprietary binary.", file=sys.stderr)
        sys.exit(1)

    rules = os.path.join(GLOBAL_STORAGE_DIR, "fast.yml")
    if not os.path.exists(rules):
        print(f"Error: Could not locate rules file: {rules}", file=sys.stderr)
        sys.exit(1)

    token = get_token()
    if not token:
        print("Error: Could not get SEMGREP_APP_TOKEN.", file=sys.stderr)
        sys.exit(1)

    ignore_patterns = load_ignore_patterns()
    print(f"Loaded {len(ignore_patterns)} patterns from .securecoderignore")
    
    js_dirs, py_dirs = get_target_scan_dirs()
    print(f"Target JS directories: {[os.path.basename(d) for d in js_dirs]}")
    print(f"Target Python directories: {[os.path.basename(d) for d in py_dirs]}")

    results = []
    
    # Scan JS/JSX
    for d in js_dirs:
        print(f"Scanning JS in {os.path.basename(d)}...")
        results.extend(run_semgrep_on_dir(binary, rules, token, d, "javascript"))
        
    # Scan Python
    for d in py_dirs:
        print(f"Scanning Python in {os.path.basename(d)}...")
        results.extend(run_semgrep_on_dir(binary, rules, token, d, "python"))

    print(f"Raw findings from scan: {len(results)}")

    # Load ignores from local SQLite database
    ignored_db_entries = get_ignored_vulns_from_db()
    ignored_hashes = get_ignored_hashes(ignored_db_entries)
    print(f"Loaded {len(ignored_db_entries)} ignored items from state.vscdb")

    # Load ignores from version-controlled JSON file
    vc_ignores = load_version_controlled_ignores()
    print(f"Loaded {len(vc_ignores)} version-controlled ignored items from JSON")
    for vc in vc_ignores:
        line_text = vc["lineText"]
        h = compute_hash(line_text)
        ignored_hashes.add((vc["ruleId"], h))
        # Support matching by class name mapping
        vclass = vc["ruleId"]
        if "detect-object-injection" in vclass:
            ignored_hashes.add(("Code Injection", h))
        elif "html-in-template-string" in vclass:
            ignored_hashes.add(("Improper Encoding", h))

    # Filter findings
    filtered_findings = []
    ignored_findings_count = 0

    for r in results:
        check_id = r.get("check_id")
        filepath = r.get("path")
        line_num = r.get("start", {}).get("line")
        extra = r.get("extra", {})
        message = extra.get("message", "")
        severity = extra.get("severity", "MEDIUM")
        
        # 1. Filter out internationalization and other portability rules
        if "i18next" in check_id or "internationalized" in check_id:
            ignored_findings_count += 1
            continue
            
        # 2. Check path ignore
        if is_path_ignored(filepath, ignore_patterns):
            ignored_findings_count += 1
            continue

        # 3. Check for standard inline // nosemgrep comments
        if is_line_nosemgrep_ignored(filepath, line_num, check_id):
            ignored_findings_count += 1
            continue

        # 4. Check if line is ignored in database or JSON file
        lines = get_file_lines(filepath)
        line_idx = line_num - 1
        line_text = lines[line_idx] if lines and 0 <= line_idx < len(lines) else ""

        line_hash = compute_hash(line_text)
        
        cwe_list = extra.get("metadata", {}).get("cwe", [])
        vclass = check_id
        if "detect-object-injection" in check_id:
            vclass = "Code Injection"
        elif "html-in-template-string" in check_id:
            vclass = "Improper Encoding"

        is_suppressed = (vclass, line_hash) in ignored_hashes or (check_id, line_hash) in ignored_hashes
        
        if is_suppressed:
            ignored_findings_count += 1
            continue

        filtered_findings.append({
            "check_id": check_id,
            "filepath": filepath,
            "line": line_num,
            "message": message,
            "severity": severity,
            "cwe": ", ".join(cwe_list) if isinstance(cwe_list, list) else str(cwe_list),
            "class": vclass
        })

    print(f"Ignored/suppressed findings: {ignored_findings_count}")
    print(f"Active findings: {len(filtered_findings)}")

    if args.export_ignores:
        export_findings_to_json(filtered_findings)
        return

    if filtered_findings:
        print("\n================== ACTIVE SECURITY FINDINGS ==================")
        grouped = {}
        for f in filtered_findings:
            rel_path = os.path.relpath(f["filepath"], WORKSPACE_ROOT)
            grouped.setdefault(rel_path, []).append(f)
            
        for rel_path, items in sorted(grouped.items()):
            print(f"\nFile: [src/{rel_path}](file:///{WORKSPACE_ROOT.replace('\\', '/')}/{rel_path.replace('\\', '/')})")
            for item in sorted(items, key=lambda x: x["line"]):
                print(f"  - Line {item['line']}: [{item['severity']}] {item['class']}")
                print(f"    Message: {item['message']}")
                if item['cwe']:
                    print(f"    CWE: {item['cwe']}")
        print("\n==============================================================")
        sys.exit(1) # Fail scan if active findings are present
    else:
        print("\nNo active security findings detected! Codebase is secure.")

if __name__ == "__main__":
    main()
