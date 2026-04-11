import paramiko
import base64

host = '192.168.1.41'
user = 'claude'
password = '{6uQ4;od'

local_token = r'E:\ClaudeWorking\Calendar Site\server\data\token.pickle'
remote_token = '/volume1/docker/home-kiosk/data/token.pickle'

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
    real_err = '\n'.join(l for l in err.splitlines() if 'chdir' not in l)
    return out, real_err

# Ensure data directory exists
run('mkdir -p /volume1/docker/home-kiosk/data')

# Upload token.pickle via base64
with open(local_token, 'rb') as fh:
    data = fh.read()
b64 = base64.b64encode(data)
out, err = run(f'base64 -d > "{remote_token}"', b64)
if err:
    print(f'ERROR: {err}')
else:
    print(f'OK: uploaded token.pickle')

# Verify it's there
out, err = run(f'ls -lh {remote_token}')
print(f'Remote file: {out.strip()}')

ssh.close()
print('Done!')
