import subprocess
import threading
import logging
import time

from config import WYZE_RTSP_URL

logger = logging.getLogger(__name__)

_proc = None
_lock = threading.Lock()


def is_configured():
    return bool(WYZE_RTSP_URL and WYZE_RTSP_URL.strip())


def _build_ffmpeg_cmd(rtsp_url, fps=5, width=640, height=360, quality=4):
    return [
        'ffmpeg',
        '-rtsp_transport', 'tcp',
        '-i', rtsp_url,
        '-an',                      # no audio
        '-f', 'image2pipe',
        '-vf', f'fps={fps},scale={width}:{height}',
        '-vcodec', 'mjpeg',
        '-q:v', str(quality),
        'pipe:1'
    ]


def generate_frames(rtsp_url=None):
    """Generator that yields MJPEG boundary frames for Flask streaming response."""
    url = rtsp_url or WYZE_RTSP_URL
    if not url:
        return

    cmd = _build_ffmpeg_cmd(url)
    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0
        )
        buf = b''
        while True:
            chunk = proc.stdout.read(16384)
            if not chunk:
                break
            buf += chunk
            # Extract complete JPEG frames (SOI=FFD8, EOI=FFD9)
            while True:
                start = buf.find(b'\xff\xd8')
                if start == -1:
                    buf = b''
                    break
                end = buf.find(b'\xff\xd9', start)
                if end == -1:
                    buf = buf[start:]  # keep partial frame
                    break
                frame = buf[start:end + 2]
                buf = buf[end + 2:]
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' +
                    frame +
                    b'\r\n'
                )
    except GeneratorExit:
        pass
    except Exception as e:
        logger.warning(f"Camera stream error: {e}")
    finally:
        if proc:
            try:
                proc.kill()
                proc.wait(timeout=3)
            except Exception:
                pass


def check_ffmpeg():
    """Return True if ffmpeg is available on PATH."""
    try:
        subprocess.run(
            ['ffmpeg', '-version'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
        return True
    except Exception:
        return False
