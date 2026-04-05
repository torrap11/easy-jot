import { execFile } from 'node:child_process';

/**
 * macOS: frontmost app name via AppleScript. Empty string on failure / non-macOS.
 */
export async function getActiveAppName(): Promise<string> {
  if (process.platform !== 'darwin') return '';
  return new Promise((resolve) => {
    execFile(
      'osascript',
      [
        '-e',
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ],
      { timeout: 3000 },
      (err, stdout) => {
        if (err) {
          resolve('');
          return;
        }
        resolve(String(stdout).trim());
      },
    );
  });
}
