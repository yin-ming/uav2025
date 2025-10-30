/**
 * Environment Detection
 * Detects whether app is running in Tauri or browser
 */

let isTauriEnv = null;

/**
 * Check if running in Tauri environment
 */
export async function isTauri() {
  if (isTauriEnv !== null) {
    return isTauriEnv;
  }

  try {
    // Try to import Tauri API
    const { isTauri: checkTauri } = await import('@tauri-apps/api/core');
    isTauriEnv = checkTauri();
    return isTauriEnv;
  } catch (error) {
    // If import fails, we're definitely not in Tauri
    isTauriEnv = false;
    return false;
  }
}

/**
 * Get environment name
 */
export async function getEnvironment() {
  const inTauri = await isTauri();
  return inTauri ? 'tauri' : 'browser';
}

/**
 * Show environment warning in browser
 */
export async function showEnvironmentInfo() {
  const env = await getEnvironment();

  if (env === 'browser') {
    console.warn(
      '%c⚠️ Browser Mode',
      'background: #ff9800; color: white; padding: 4px 8px; border-radius: 3px; font-weight: bold;',
      '\nRunning in browser with limited functionality.\nFor full features, use the desktop app.'
    );
  } else {
    console.log(
      '%c✅ Tauri Mode',
      'background: #4caf50; color: white; padding: 4px 8px; border-radius: 3px; font-weight: bold;',
      '\nRunning in Tauri desktop app with full functionality.'
    );
  }
}

export default {
  isTauri,
  getEnvironment,
  showEnvironmentInfo
};
