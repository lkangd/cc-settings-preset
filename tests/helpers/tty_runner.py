import json
import os
import pty
import re
import select
import subprocess
import sys
import time


def normalize_terminal_output(value: str) -> str:
    value = re.sub(r'\x1b\[[0-9;?]*[ -/]*[@-~]', '', value)
    value = re.sub(r'\x1b[@-_]', '', value)
    value = re.sub(r'[\x00-\x1f\x7f]', ' ', value)
    value = re.sub(r'\s+', ' ', value)
    return value.strip()


def read_for(master: int, seconds: float) -> str:
    chunks: list[bytes] = []
    end = time.time() + seconds

    while time.time() < end:
        readable, _, _ = select.select([master], [], [], 0.05)
        if master not in readable:
            continue

        try:
            chunk = os.read(master, 4096)
        except OSError:
            break

        if not chunk:
            break

        chunks.append(chunk)

    return b''.join(chunks).decode('utf-8', 'replace')


def main() -> None:
    request = json.loads(sys.argv[1])
    command = request['command']
    cwd = request['cwd']
    env = {**os.environ, **request.get('env', {})}
    steps = request['steps']

    master, slave = pty.openpty()
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
    )
    os.close(slave)

    output = ''

    try:
        for step in steps:
            if step['type'] == 'write':
                os.write(master, step['data'].encode('utf-8'))
                continue

            if step['type'] == 'read':
                output += read_for(master, step['ms'] / 1000)
                continue

            raise ValueError(f"Unknown step type: {step['type']}")
    finally:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
        try:
            os.close(master)
        except OSError:
            pass

    frames = [normalize_terminal_output(part) for part in re.split(r'\x1b\[2J\x1b\[3J\x1b\[H', output) if part]
    normalized_output = normalize_terminal_output(output)
    final_frame = frames[-1] if frames else normalized_output

    print(json.dumps({
        'rawOutput': output,
        'normalizedOutput': normalized_output,
        'frames': frames,
        'finalFrame': final_frame,
    }))


if __name__ == '__main__':
    main()
