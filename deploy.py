import paramiko
import os
import base64
import sys

host = '192.168.1.41'
user = 'claude'
password = '{6uQ4;od'

local_base = r'E:\ClaudeWorking\Calendar Site\server'
remote_base = '/volume1/docker/home-kiosk'

# Read .env content from local file
env_file = r'E:\ClaudeWorking\Calendar Site\.env'
with open(env_file, 'r') as fh:
    env_content = fh.read()

files_to_upload = []
for root, dirs, files in os.walk(local_base):
    dirs[:] = [d for d in dirs if d not in ('__pycache__', 'data')]
    for f in files:
        local_path = os.path.join(root, f)
        rel = os.path.relpath(local_path, local_base)
        # normalize to forward slashes
        rel = rel.replace(os.sep, '/')
        remote_path = remote_base + '/' + rel
        files_to_upload.append((local_path, remote_path))

print(f"Files to upload: {len(files_to_upload)}")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

def run(cmd, input_data=None):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    if input_data is not None:
        if isinstance(input_data, str):
            input_data = input_data.encode()
        stdin.write(input_data)
        stdin.channel.shutdown_write()
    out = stdout.read().decode()
    err = stderr.read().decode()
    # filter the home dir chdir noise
    real_err = '\n'.join(l for l in err.splitlines() if 'chdir' not in l)
    return out, real_err

# Create all needed directories
dirs_needed = set()
for _, remote_path in files_to_upload:
    parts = remote_path.split('/')
    for i in range(2, len(parts)):
        dirs_needed.add('/'.join(parts[:i]))

for d in sorted(dirs_needed):
    out, err = run(f'mkdir -p "{d}"')
    if err:
        print(f'mkdir error {d}: {err}')

print("Directories created.")

# Upload each file
for local_path, remote_path in files_to_upload:
    with open(local_path, 'rb') as fh:
        data = fh.read()
    b64 = base64.b64encode(data)
    out, err = run(f'base64 -d > "{remote_path}"', b64)
    if err:
        print(f'ERROR uploading {remote_path}: {err}')
    else:
        print(f'OK: {remote_path}')

# Write .env file
out, err = run(f'cat > "{remote_base}/.env"', env_content)
if err:
    print(f'ERROR writing .env: {err}')
else:
    print(f'OK: {remote_base}/.env')

# Verify
out, err = run(f'find {remote_base} -not -path "*/data/*" -type f | sort')
print("\nFiles on server:")
print(out)

# Build the image with a fixed tag, then bring up the container
print("\nBuilding Docker image home-kiosk:latest ...")
out, err = run(f'echo "{password}" | sudo -S /usr/local/bin/docker build -t home-kiosk:latest {remote_base} 2>&1')
print(out[-3000:] if len(out) > 3000 else out)
if err.strip() and err.strip() != 'Password:':
    print("Build ERR:", err)

print("\nRunning docker compose up -d ...")
out, err = run(f'echo "{password}" | sudo -S sh -c "cd {remote_base} && /usr/local/bin/docker-compose up -d 2>&1"')
print(out)
if err.strip() and err.strip() != 'Password:':
    print("Compose ERR:", err)

ssh.close()
print("Done!")
