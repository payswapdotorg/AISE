#!/usr/bin/env python3
"""station-driver.py — the AISE Android E2B station driver (PROD-032).

Runs on the Tech Lead's machine and operates the E2B development station:

    up        create a sandbox, upload the committed station scripts and run
              bootstrap.sh (full from-scratch provisioning, transcript saved)
    script    run one of the committed in-sandbox scripts
              (bootstrap | gradle-trio | emulator-probe | field-journey)
    run       run an arbitrary command inside the station (streamed, timed)
    pty       run a command through a real PTY (TTY-sensitive tooling)
    fetch     download a file from the station to the local machine
    status    show the persisted station state
    kill      kill the station sandbox

SECURITY / SECRET DISCIPLINE (binding):
    The E2B API key is read from the E2B_API_KEY environment variable ONLY
    (by the e2b SDK itself). This driver never reads, prints, logs, commits
    or transmits the key value, and no secret ever enters a transcript,
    artifact or the repository. A missing E2B_API_KEY is a hard, loud error.

REQUIREMENTS (Lead machine): python3 + `pip install e2b` (any recent 2.x).

STATE: the sandbox id persists in .aise-e2b-station.json (CWD) so later
invocations reconnect (resume) to the same station. Transcripts append into
--transcript-dir (default ./station-transcripts/).

USAGE EXAMPLES:

    export E2B_API_KEY=...   # runtime secret, never committed
    python3 station-driver.py up --repo-sha <sha>
    python3 station-driver.py script gradle-trio
    python3 station-driver.py script emulator-probe
    python3 station-driver.py script field-journey
    python3 station-driver.py fetch /workspace/station-fingerprint.txt .
    python3 station-driver.py kill
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import pathlib
import sys
import time

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]  # apps/android/scripts/e2b-station
STATION_SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent

STATION_ROOT = "/home/user/aise-station"  # $HOME is writable on every E2B sandbox
SCRIPTS = {
    "bootstrap": "bootstrap.sh",
    "gradle-trio": "gradle-trio.sh",
    "emulator-probe": "emulator-probe.sh",
    "field-journey": "field-journey.sh",
}
DEFAULT_TEMPLATE = "aise-android-station"
DEFAULT_REPO_URL = "https://github.com/payswapdotorg/AISE.git"
STATE_FILE = pathlib.Path(".aise-e2b-station.json")


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _log(msg: str) -> None:
    print(f"[driver {_now()}] {msg}", flush=True)


class Station:
    """Thin wrapper over the e2b Sandbox with transcript capture."""

    def __init__(self, transcript_dir: pathlib.Path, sandbox_id: str | None = None):
        # The key comes from E2B_API_KEY via the SDK; this process never
        # touches its value (see module docstring).
        if not os.environ.get("E2B_API_KEY"):
            sys.exit(
                "ERROR: E2B_API_KEY is not set. Export the runtime secret "
                "(never commit it) and re-run."
            )
        from e2b import Sandbox  # imported late so --help works without the SDK

        self.transcript_dir = transcript_dir
        self.transcript_dir.mkdir(parents=True, exist_ok=True)
        self._sandbox_cls = Sandbox
        self.sb = None
        self.sandbox_id = sandbox_id

    def create(self, template: str | None, timeout_minutes: int) -> None:
        t0 = time.time()
        _log(f"creating sandbox (template={template or 'e2b default'}, timeout={timeout_minutes}m)…")
        kwargs = {"timeout": timeout_minutes * 60}
        if template:
            kwargs["template"] = template
        self.sb = self._sandbox_cls.create(**kwargs)
        self.sandbox_id = self.sb.sandbox_id
        _log(f"sandbox {self.sandbox_id} ready in {time.time() - t0:.1f}s")

    def connect(self) -> None:
        if self.sandbox_id is None:
            sys.exit("ERROR: no station in state — run `up` first (or pass --sandbox-id).")
        _log(f"connecting to sandbox {self.sandbox_id}…")
        self.sb = self._sandbox_cls.connect(self.sandbox_id)
        _log("connected")

    def require(self):
        if self.sb is None:
            sys.exit("ERROR: no sandbox connected — run `up` or `script`/`run` (they connect).")
        return self.sb

    # ------------------------------------------------------------------
    def upload_scripts(self) -> None:
        sb = self.require()
        sb.commands.run(f"mkdir -p {STATION_ROOT}/station-scripts", timeout=30)
        for name in SCRIPTS.values():
            local = STATION_SCRIPTS_DIR / name
            if not local.exists():
                sys.exit(f"ERROR: committed station script missing: {local}")
            sb.files.write(f"{STATION_ROOT}/station-scripts/{name}", local.read_bytes())
        sb.commands.run(f"chmod +x {STATION_ROOT}/station-scripts/*.sh", timeout=30)
        _log("committed station scripts uploaded")

    def run(
        self,
        label: str,
        command: str,
        envs: dict[str, str] | None = None,
        timeout_seconds: float = 3600,
        cwd: str | None = None,
        pty: bool = False,
    ) -> int:
        """Run a command, streaming output live AND appending to a transcript."""
        sb = self.require()
        transcript = self.transcript_dir / f"{label}.log"
        header = (
            f"\n===== [{_now()}] {label} =====\n$ {command}\n"
            f"envs={sorted(envs.keys()) if envs else []} cwd={cwd or '~'} pty={pty}\n"
        )
        with transcript.open("a", encoding="utf-8") as sink:
            sink.write(header)
            print(header, end="", flush=True)
            t0 = time.time()

            def out(chunk: str) -> None:
                sink.write(chunk)
                sink.flush()
                sys.stdout.write(chunk)
                sys.stdout.flush()

            def err(chunk: str) -> None:
                sink.write(chunk)  # stderr into the same transcript, verbatim
                sink.flush()
                sys.stderr.write(chunk)
                sys.stderr.flush()

            if pty:
                handle = sb.pty.create(
                    size=(48, 180), cwd=cwd, envs=envs, timeout=timeout_seconds
                )
                handle.wait()
                exit_code = handle.exit_code if handle.exit_code is not None else 0
                for chunk in handle.output:
                    sink.write(chunk)
            else:
                result = sb.commands.run(
                    command,
                    envs=envs,
                    cwd=cwd,
                    timeout=timeout_seconds,
                    on_stdout=out,
                    on_stderr=err,
                )
                exit_code = result.exit_code if result.exit_code is not None else 0

            tail = f"\n===== exit={exit_code} seconds={time.time() - t0:.1f}s =====\n"
            sink.write(tail)
            print(tail, end="", flush=True)
            return exit_code

    def fetch(self, remote: str, local: str) -> None:
        sb = self.require()
        target = pathlib.Path(local)
        if target.is_dir() or target.suffix == "":
            target.mkdir(parents=True, exist_ok=True)
            target = target / pathlib.PurePosixPath(remote).name
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
        data = sb.files.read(remote, format="bytes")
        target.write_bytes(data)
        _log(f"fetched {remote} -> {target} ({len(data)} bytes)")

    def kill(self) -> None:
        sb = self.require()
        sb.kill()
        _log(f"sandbox {self.sandbox_id} killed")


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--transcript-dir", default="./station-transcripts", help="local transcript directory")
    parser.add_argument("--sandbox-id", default=None, help="explicit sandbox id (overrides state)")
    args, rest = parser.parse_known_args()

    if not rest:
        parser.print_help()
        return

    command = rest[0]
    rest = rest[1:]

    transcript_dir = pathlib.Path(args.transcript_dir)
    state = load_state()
    sandbox_id = args.sandbox_id or state.get("sandbox_id")
    station = Station(transcript_dir, sandbox_id)

    if command == "up":
        p = argparse.ArgumentParser(prog="up")
        p.add_argument("--template", default=DEFAULT_TEMPLATE,
                       help=f"E2B template (default {DEFAULT_TEMPLATE}; use --template base for the plain 512MB default)")
        p.add_argument("--timeout-minutes", type=int, default=180)
        p.add_argument("--repo-url", default=DEFAULT_REPO_URL)
        p.add_argument("--repo-sha", required=True,
                       help="the EXACT pinned commit SHA the station checks out")
        p.add_argument("--no-bootstrap", action="store_true", help="only create + upload scripts")
        opts = p.parse_args(rest)

        t0 = time.time()
        station.create(opts.template or None, opts.timeout_minutes)
        boot_s = time.time() - t0
        station.upload_scripts()
        save_state({
            "sandbox_id": station.sandbox_id,
            "created_at": _now(),
            "template": opts.template,
            "boot_seconds": round(boot_s, 1),
            "repo_url": opts.repo_url,
            "repo_sha": opts.repo_sha,
            "transcript_dir": str(transcript_dir),
        })
        if not opts.no_bootstrap:
            rc = station.run(
                "bootstrap",
                f"bash {STATION_ROOT}/station-scripts/bootstrap.sh",
                envs={
                    "AISE_REPO_URL": opts.repo_url,
                    "AISE_REPO_SHA": opts.repo_sha,
                    "AISE_STATION_ROOT": STATION_ROOT,
                },
                timeout_seconds=3600,
            )
            if rc != 0:
                sys.exit(rc)
            station.fetch(f"{STATION_ROOT}/station-fingerprint.txt", str(transcript_dir))
        _log("station is UP — next: `script gradle-trio`, `script emulator-probe`, `script field-journey`")

    elif command == "script":
        p = argparse.ArgumentParser(prog="script")
        p.add_argument("name", choices=list(SCRIPTS))
        p.add_argument("--timeout-seconds", type=float, default=5400)
        opts = p.parse_args(rest)
        if opts.name == "bootstrap":
            sha = state.get("repo_sha") or sys.exit("ERROR: no repo_sha in state — run `up --repo-sha <sha>` first")
            station.connect()
            station.upload_scripts()
            rc = station.run(
                "bootstrap",
                f"bash {STATION_ROOT}/station-scripts/bootstrap.sh",
                envs={
                    "AISE_REPO_URL": state["repo_url"],
                    "AISE_REPO_SHA": sha,
                    "AISE_STATION_ROOT": STATION_ROOT,
                },
                timeout_seconds=opts.timeout_seconds,
            )
            sys.exit(rc)
        station.connect()
        rc = station.run(
            opts.name,
            f"bash {STATION_ROOT}/station-scripts/{SCRIPTS[opts.name]}",
            envs={"AISE_STATION_ROOT": STATION_ROOT},
            timeout_seconds=opts.timeout_seconds,
        )
        if opts.name == "emulator-probe":
            station.fetch(f"{STATION_ROOT}/station-fingerprint.txt", str(transcript_dir))
        if opts.name == "field-journey":
            station.fetch(f"{STATION_ROOT}/field-journey-record.txt", str(transcript_dir))
        sys.exit(rc)

    elif command == "run":
        p = argparse.ArgumentParser(prog="run")
        p.add_argument("label")
        p.add_argument("--timeout-seconds", type=float, default=3600)
        p.add_argument("--cwd", default=None)
        p.add_argument("--pty", action="store_true")
        p.add_argument("cmd", nargs=argparse.REMAINDER)
        opts = p.parse_args(rest)
        cmd = " ".join(opts.cmd) if opts.cmd else "true"
        station.connect()
        envs = {"AISE_STATION_ROOT": STATION_ROOT}
        sys.exit(station.run(opts.label, cmd, envs=envs, cwd=opts.cwd,
                             timeout_seconds=opts.timeout_seconds, pty=opts.pty))

    elif command == "fetch":
        p = argparse.ArgumentParser(prog="fetch")
        p.add_argument("remote")
        p.add_argument("local")
        opts = p.parse_args(rest)
        station.connect()
        station.fetch(opts.remote, opts.local)

    elif command == "status":
        print(json.dumps(state, indent=2))
        if state.get("sandbox_id"):
            try:
                station.connect()
                info = station.require().get_info()
                print("sandbox info:", info)
            except Exception as exc:  # noqa: BLE001 - status is best-effort
                print(f"sandbox not reachable: {exc}")

    elif command == "kill":
        station.connect()
        station.kill()
        save_state({})

    else:
        parser.print_help()
        sys.exit(2)


if __name__ == "__main__":
    main()
