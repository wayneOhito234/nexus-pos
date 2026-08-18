const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exec } = require('node:child_process');

// ESC p m t1 t2 -- the standard ESC/POS drawer kick.
//   27, 112 = ESC p
//   0       = pin 2 (1 for pin 5, on drawers wired that way)
//   25, 250 = on and off pulse timings
const KICK_PIN_2 = Buffer.from([27, 112, 0, 25, 250]);
const KICK_PIN_5 = Buffer.from([27, 112, 1, 25, 250]);

// The drawer hangs off the printer's DK port rather than the PC, so opening
// it means sending raw bytes to the printer. Copying a file to the printer's
// share is the only route that works without a native module, which this
// project deliberately avoids.
function openDrawer({ shareName = 'POS80C', pin = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const bytes = pin === 5 ? KICK_PIN_5 : KICK_PIN_2;
    const tmpFile = path.join(os.tmpdir(), `nexus-drawer-${Date.now()}.bin`);

    try {
      fs.writeFileSync(tmpFile, bytes);
    } catch (err) {
      return reject(new Error(`Could not write the drawer command: ${err.message}`));
    }

    exec(
      `copy /b "${tmpFile}" \\\\localhost\\${shareName}`,
      { shell: 'cmd.exe', timeout: 5000 },
      (err, stdout, stderr) => {
        fs.unlink(tmpFile, () => {});

        if (err) {
          return reject(
            new Error(
              `The drawer did not open. Check the printer is shared as "${shareName}". ${stderr || err.message}`
            )
          );
        }
        resolve({ ok: true });
      }
    );
  });
}

module.exports = { openDrawer };