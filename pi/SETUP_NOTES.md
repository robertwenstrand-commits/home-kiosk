# Orange Pi Zero 2W Kiosk — Setup Notes

Board: Orange Pi Zero 2W (Allwinner H618)  
OS: Armbian Minimal (Debian 12 Bookworm)  
Purpose: Headless kiosk displaying home dashboard via Chromium at http://192.168.1.41:2004

---

## Overview

The Pi has no keyboard/monitor during setup. All configuration is done headlessly via SSH over WiFi. The setup requires several non-obvious fixes due to the H618 SoC, the Unisoc WiFi chip, the USB-C-only port, and Armbian's minimal image defaults.

---

## Pre-Boot SD Card Preparation

Before first power-on, the SD card must be prepared from Windows using WSL (see SD card mount procedure in memory).

### 1. Delete the first-run wizard block file
**File:** `/root/.not_logged_in_yet`  
**Action:** Delete it  
**Reason:** Armbian's interactive first-run wizard blocks headless boot. Deleting this file skips it.

### 2. Set a known root password
**File:** `/etc/shadow`  
**Action:** Replace root's password hash with a known value (e.g. `1234`)  
**Reason:** Allows SSH login on first boot without a serial console.

### 3. Write WiFi credentials before first boot
**File:** `/etc/netplan/20-wifi.yaml`
```yaml
network:
  version: 2
  renderer: networkd
  wifis:
    wlan0:
      dhcp4: yes
      dhcp6: yes
      access-points:
        "It Burns When IP":
          password: "cassie2000"
          bssid: 2a:70:4e:31:7b:da
```
**Reason:** The Pi has no Ethernet port. WiFi credentials must be present before first boot or the device is unreachable. The `bssid:` must be pinned to the **2.4GHz** radio MAC of whichever AP is physically closest to the Pi. Do not pin to the 5GHz BSSID — the Unisoc `sprdwl_ng` driver crashes on 5GHz. Do not leave `bssid:` unset — band steering on a multi-AP network will connect to 5GHz. Each AP has a separate 2.4GHz and 5GHz BSSID; find the correct one from your router's wireless client list. The BSSIDs are stable hardware addresses and will not change.

### 4. Delete armbian_first_run.txt if present
**File:** `/armbian_first_run.txt` (root of the filesystem)  
**Action:** Delete it  
**Reason:** If this file exists, Armbian runs a first-boot network configuration process on every boot. It conflicts with the netplan/networkd WiFi setup and leaves the device unreachable. It should be deleted before or immediately after first boot.

---

## Boot Configuration

### 5. Fix armbianEnv.txt
**File:** `/boot/armbianEnv.txt`
```
verbosity=1
bootlogo=false
console=both
disp_mode=1024x600p60
overlay_prefix=sun50i-h618
overlays=usb-otg-host ph-uart5
rootdev=UUID=<your-uuid>
rootfstype=ext4
extraargs=reboot=hard
```
**Changes from stock and reasons:**
- `overlay_prefix=sun50i-h618` — Stock Armbian uses `sun50i-h616` which is wrong for the H618 SoC. Overlays won't load without this fix.
- `overlays=usb-otg-host ph-uart5` — `usb-otg-host` enables USB-C OTG host mode (see overlay below). `ph-uart5` enables UART5 on pins 11/13 for the UPS monitor.
- `extraargs=reboot=hard` — Without this, `reboot` does a warm reset that leaves the Unisoc WiFi chip and HDMI subsystem in a broken state, requiring a power cycle. This forces a full hardware reset.
- `disp_mode=1024x600p60` — Must match the display's native resolution. Stock Armbian defaults to `1920x1080p60`, which the 1024×600 panel cannot sync to. The display will be blank from power-on until X starts if this is wrong. Setting it correctly ensures output is visible during U-Boot and early boot as well.

### 6. USB-C OTG Host Mode Overlay
**File:** `/boot/dtb/allwinner/overlay/sun50i-h618-usb-otg-host.dtbo`  
**Compiled from:**
```dts
/dts-v1/;
/plugin/;
&usbotg { dr_mode = "host"; };
&ehci0 { status = "okay"; };
&ohci0 { status = "okay"; };
```
**Reason:** The Zero 2W has no USB-A ports — USB-C is the only port. It defaults to peripheral (device) mode. This overlay switches it to host mode so USB peripherals (touchscreen, keyboard) work. Compile with `dtc -@ -I dts -O dtb`.

---

## System Configuration (via SSH)

### 7. Create the kiosk user
```bash
useradd -m -s /bin/bash orangepi
echo orangepi:orangepi | chpasswd
echo "orangepi ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/orangepi
chown orangepi:orangepi /home/orangepi
groupadd -rf autologin
gpasswd -a orangepi autologin
```
**Reason:** Armbian minimal only has root. Chromium won't run as root. `chown` is required because `useradd` leaves the home directory owned by root, which prevents Openbox from creating its cache directory. The `autologin` group is required by LightDM on Debian for passwordless autologin.

### 8. Install required packages
```bash
apt-get install -y \
  xserver-xorg-core xserver-xorg-input-evdev xserver-xorg-input-libinput \
  xinit xinput openbox lightdm chromium \
  x11-xserver-utils xdotool unclutter xprintidle \
  fonts-liberation fonts-noto-color-emoji fonts-roboto \
  dbus-x11 python3-serial
```
**Key packages and reasons:**
- `dbus-x11` — LightDM's Xsession requires `dbus-launch`. Without it the session exits with code 1 immediately.
- `xserver-xorg-input-libinput` — Required for touchscreen to send XInput2 touch events instead of mouse events. Without it, the touchscreen moves a cursor instead of behaving like a tablet.
- `fonts-noto-color-emoji` — Without this, emoji icons used in the dashboard UI render as boxes.
- `python3-serial` — Required for the UPS monitor UART daemon.
- `xprintidle` — Reports X server idle time in milliseconds. Required for the display dimmer.

### 9. Enable LightDM
```bash
systemctl enable lightdm
```
**Reason:** Not enabled by default on Armbian minimal.

### 10. Configure LightDM autologin
**File:** `/etc/lightdm/lightdm.conf.d/50-kiosk.conf`
```ini
[Seat:*]
autologin-user=orangepi
autologin-user-timeout=0
user-session=openbox
```
**Reason:** LightDM requires explicit configuration to autologin without a password prompt.

### 12. Disable X screen blanking
**File:** `/etc/X11/xorg.conf.d/10-blanking.conf`
```
Section "ServerFlags"
  Option "BlankTime"   "0"
  Option "StandbyTime" "0"
  Option "SuspendTime" "0"
  Option "OffTime"     "0"
EndSection
```
**Reason:** Prevents the display from blanking after idle.

### 13. Configure touchscreen driver
**File:** `/etc/X11/xorg.conf.d/40-touchscreen.conf`
```
Section "InputClass"
    Identifier "touchscreen"
    MatchIsTouchscreen "on"
    Driver "libinput"
    Option "Tapping" "on"
EndSection
```
**Reason:** Forces libinput driver for the touchscreen (wch.cn USB2IIC_CTP_CONTROL). Without this, evdev handles it as a mouse, sending cursor-move events instead of touch events to Chromium.

### 14. Cap networkd wait-online timeout
**File:** `/etc/systemd/system/systemd-networkd-wait-online.service.d/timeout.conf`
```ini
[Service]
ExecStart=
ExecStart=/usr/lib/systemd/systemd-networkd-wait-online --timeout=45 --interface=wlan0
```
**Reason:** The default wait-online service blocks boot for up to 2 minutes if WiFi is slow to connect. This caps it at 30 seconds on wlan0 only.

### 15. Set timezone
```bash
timedatectl set-timezone America/Los_Angeles
```

---

## UPS Monitor

### 16. Install UPS monitor daemon

#### Wiring — RPi UPSPack Standard V3P → Orange Pi Zero 2W

Connect the V3P communication header to the Pi's 40-pin GPIO header as follows:

| V3P Pin | → | Pi Physical Pin | Pi Function         | Notes                           |
|---------|---|-----------------|---------------------|---------------------------------|
| GND     | → | **Pin 6**       | Ground              |                                 |
| TX      | → | **Pin 13**      | UART5 RX (PH3)      | Crossed: V3P TX → Pi RX         |
| RX      | → | **Pin 11**      | UART5 TX (PH2)      | Crossed: V3P RX → Pi TX         |
| STA     | → | **Pin 10**      | GPIO PH1 (GPIO 225) | Power-loss signal (active low)  |

UART5 is enabled via the `ph-uart5` overlay in `armbianEnv.txt` (see step 5) and appears as `/dev/ttyS5`. Do not use UART0 (pins 8/10 TX/RX) — it is reserved as the kernel debug console.

The STA pin goes low when external power fails. It is not currently read by the software daemon but is wired for future use or hardware watchdog integration.

**File:** `/usr/local/bin/ups-monitor.py`  
Reads the RPi UPSPack Standard V3P battery data from `/dev/ttyS5` at 9600 baud. Data format: `$ <model>,Vin <GOOD/BAD>,BATCAP <pct>,Vout <mv> )`. Exposes JSON at `http://localhost:7070/ups`. Also exposes `/reboot` endpoint to trigger a system reboot. Update the device path in the script from `/dev/ttyS0` to `/dev/ttyS5`.

**Critical:** The regex for parsing must be `([^,]+)` for the model name field, not `(\S+)`, because the model name "SmartUPS V3.2P" contains a space.

**File:** `/etc/systemd/system/ups-monitor.service`
```ini
[Unit]
Description=UPS Monitor (RPi UPSPack V3P)
After=network.target

[Service]
ExecStart=/usr/bin/python3 /usr/local/bin/ups-monitor.py
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```
```bash
systemctl enable --now ups-monitor.service
```

---

## Display / Kiosk

### 17. Openbox autostart
**File:** `/home/orangepi/.config/openbox/autostart`
```bash
xset s off &
xset s noblank &
xset -dpms &
unclutter -idle 0.1 -root &

until xset q &>/dev/null; do sleep 0.5; done

# Force HDMI output mode (fixes display after warm reboot)
xrandr --output HDMI-1 --mode 1024x600 &

```
**Key flags and reasons:**
- `--disable-gpu` — Hardware GPU causes Chromium to crash on this SoC.
- `--touch-events=enabled` — Required for Chromium to process touchscreen events.
- `--enable-pinch --overscroll-history-navigation=0` — Enables pinch-to-zoom, disables swipe-back gesture (would navigate away from the kiosk page).
- `xrandr --output HDMI-1 --mode 1024x600` — Forces the display mode on every X startup. Required because after a warm reboot the H618's HDMI PHY doesn't reinitialize cleanly and the display shows nothing without this.
- Restart loop — Chromium occasionally crashes; the loop restarts it automatically.
- Display dimmer — uses `xprintidle` to track X idle time. `xrandr --brightness` applies a software gamma adjustment (not true backlight control, but effective). Polls every 5 seconds; 5-second lag on restore is acceptable for a kiosk. Requires `xprintidle` package.


---

## Known Issues / Quirks

- **WiFi driver (Unisoc sprdwl_ng):** Do NOT set `band: 5GHz` in netplan — causes driver crash. Do NOT leave `bssid:` unset on a multi-AP network — band steering will connect to 5GHz. Pin to the 2.4GHz BSSID of the closest AP.
- **WiFi after warm reboot:** Even with `reboot=hard`, the WiFi driver occasionally needs 30–60 seconds to reassociate after reboot. This is normal.
- **HDMI after warm reboot:** The H618 HDMI PHY doesn't fully reinitialize on warm reboot. Fixed by `xrandr --output HDMI-1 --mode 1024x600` in autostart. A systemd `hdmi-hotplug.service` was also created (`echo detect > /sys/class/drm/card0-HDMI-A-1/status`) but was later disabled as it caused boot hangs on cold start.
- **`armbian_first_run.txt`:** If this file exists on the root filesystem it runs on every boot and hijacks networking, overwriting the netplan config with a NetworkManager setup. Always delete it before or immediately after first boot.
- **Pi boots from SD card:** The rootdev UUID points to the SD card, not the eMMC. Do not remove the SD card while the Pi is running.
- **Activity LED is software-driven:** The blue activity LED only lights after U-Boot/kernel start — it is not driven by the BROM. A blank screen with red power LED but no activity LED does not mean the SD card is unreadable; it means the SPL or U-Boot hasn't run yet. Use serial console or a fresh image test to distinguish hardware from software failures.
- **SD card quality matters:** The H618 BROM is picky. Low-quality or failing SD cards can pass a write verification but silently fail to boot. If the Pi shows red power light with no activity on a freshly written card, try a different (known-good) card before diagnosing further. The Armbian Imager is a reliable way to confirm a card is readable.
- **eMMC may interfere with boot:** The Pi ships with eMMC storage. If Armbian's auto-install-to-eMMC feature runs (accidentally or otherwise), a partial install on the eMMC can confuse the boot sequence. If the Pi stops booting for no obvious reason, the eMMC may need to be blanked (write zeros to the first 4MB of `/dev/mmcblk1`).

---

## Backup and Restore

- **Backup command** (run on Pi via SSH, streams to NAS):
  ```bash
  dd if=/dev/mmcblk0 bs=4M status=progress | gzip | ssh user@nas 'cat > /path/kiosk-backup.img.gz'
  ```
- **Restore to new SD card** (run in WSL with card at `/dev/sdf`):
  ```bash
  sshpass -p 'PASSWORD' ssh user@nas 'gzip -dc /path/kiosk-backup.img.gz' | dd of=/dev/sdf bs=4M status=progress
  sync
  ```
  **Important:** Do NOT use `conv=fsync` with dd when writing to a USB SD card reader. USB mass storage devices buffer writes; if `fsync` triggers an I/O error, the kernel discards the entire write buffer and the card ends up as zeros despite dd reporting success. Use `sync` as a separate command after dd exits instead.
- **After restore, before booting:** Mount the card and apply these fixes:
  1. Delete `/armbian_first_run.txt` if present
  2. Verify `/boot/armbianEnv.txt` has `disp_mode=1024x600p60`
  3. Verify `/etc/netplan/20-wifi.yaml` has the correct 2.4GHz BSSID
  4. Confirm `hdmi-hotplug.service` symlink is NOT present in `/etc/systemd/system/multi-user.target.wants/`
- **Verify SPL after flash:** Before inserting the card, confirm the write completed:
  ```bash
  # Check boot signature
  dd if=/dev/sdf bs=512 count=1 2>/dev/null | xxd | grep '55 aa'
  # Check SPL magic at sector 16
  dd if=/dev/sdf bs=512 skip=16 count=1 2>/dev/null | strings | head -3
  # Should show: eGON.BT0 and sun50i-h618-orangepi-zero2w
  ```
