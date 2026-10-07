// test_settings.js: Comprehensive integration test suite for Helm's Native Settings App

// Let the engine lay out and evaluate startup scripts
flush();
for (let i = 0; i < 10; ++i) {
  advanceTime(16);
  flush();
}

// 1. Verify Shell and Settings Controller initialization
assert(typeof window.helm === 'object' && window.helm !== null, 'window.helm exists');
assert(typeof window.helm.settings === 'object' && window.helm.settings !== null, 'window.helm.settings controller exists');

const settingsModalEl = document.getElementById('settings-modal');
assert(settingsModalEl !== null, 'settings-modal DOM element rendered');
assert(settingsModalEl.classList.contains('hidden'), 'settings modal initially hidden');
assert(window.helm.settings.isOpen === false, 'settings.isOpen initially false');

// 2. Test Opening Settings Modal
window.helm.settings.open();
assert(window.helm.settings.isOpen === true, 'settings opened via open()');
assert(!settingsModalEl.classList.contains('hidden'), 'settings-modal is visible in DOM');

// 3. Test Sidebar Categories
const sidebarEl = document.getElementById('settings-sidebar-list');
assert(sidebarEl !== null, 'settings-sidebar-list rendered');
const navItems = sidebarEl.querySelectorAll('.settings-nav-item');
assert(navItems.length === 7, `7 category navigation items rendered (got ${navItems.length})`);

// 4. Test Audio View
window.helm.settings.showCategory('audio');
assert(window.helm.settings.activeCategory === 'audio', 'active category switched to audio');

const audioViewEl = document.querySelector('.settings-view-audio');
assert(audioViewEl !== null, 'audio view rendered');

// Verify output devices
const outputCard = audioViewEl.querySelector('.audio-outputs-card');
assert(outputCard !== null, 'audio outputs card rendered');
const outputDevices = outputCard.querySelectorAll('.audio-device-item');
assert(outputDevices.length > 0, 'output devices list has items');

// Verify master volume slider and mute
const volSlider = outputCard.querySelector('.volume-slider');
assert(volSlider !== null, 'volume slider rendered in output card');
const muteBtn = outputCard.querySelector('.btn');
assert(muteBtn !== null, 'mute button rendered');

// Verify live audio level meter
const meterBox = audioViewEl.querySelector('.audio-meter-box');
assert(meterBox !== null, 'audio level VU meter rendered');
const meterBar = document.getElementById('audio-meter-bar');
assert(meterBar !== null, 'audio meter bar element rendered');

// Verify application audio streams
const streamCard = audioViewEl.querySelector('.audio-streams-card');
assert(streamCard !== null, 'audio application streams card rendered');
const streamItems = streamCard.querySelectorAll('.app-stream-item');
assert(streamItems.length > 0, 'application audio streams rendered');
const sinkSelect = streamCard.querySelector('.select-sink-input');
assert(sinkSelect !== null, 'application target sink dropdown rendered');

// 5. Test Displays & Monitors View
window.helm.settings.showCategory('display');
assert(window.helm.settings.activeCategory === 'display', 'active category switched to display');

const displayViewEl = document.querySelector('.settings-view-display');
assert(displayViewEl !== null, 'display view rendered');

// Verify arrangement canvas
const canvasEl = document.getElementById('display-arrangement-canvas');
assert(canvasEl !== null, 'display arrangement canvas rendered');
const monitorBoxes = canvasEl.querySelectorAll('.display-monitor-box');
assert(monitorBoxes.length > 0, 'monitor boxes rendered on canvas');

// Verify display configuration controls
const detailsCard = displayViewEl.querySelector('.display-details-card');
assert(detailsCard !== null, 'display details card rendered');
const selectInputs = detailsCard.querySelectorAll('.select-input');
assert(selectInputs.length >= 4, 'resolution, refresh rate, scale, orientation dropdowns rendered');

// Test testConfig countdown banner
window.helm.settings.views.display.startCountdown(10);
const countdownBanner = document.querySelector('.display-revert-banner');
assert(countdownBanner !== null, 'display revert countdown banner rendered');
window.helm.settings.views.display.confirmConfig();
assert(document.querySelector('.display-revert-banner') === null, 'countdown banner removed on confirm');

// 6. Test Network & Internet View
window.helm.settings.showCategory('network');
assert(window.helm.settings.activeCategory === 'network', 'active category switched to network');

const networkViewEl = document.querySelector('.settings-view-network');
assert(networkViewEl !== null, 'network view rendered');

// Verify Wi-Fi scanner
const wifiCard = networkViewEl.querySelector('.network-wifi-card');
assert(wifiCard !== null, 'wifi card rendered');
const wifiItems = wifiCard.querySelectorAll('.wifi-network-item');
assert(wifiItems.length > 0, 'wifi networks discovered and rendered');
const scanBtn = document.getElementById('btn-scan-wifi');
assert(scanBtn !== null, 'scan wifi button rendered');

// Verify Ethernet details
const ethCard = networkViewEl.querySelector('.network-ethernet-card');
assert(ethCard !== null, 'ethernet adapter status card rendered');
const ethProps = ethCard.querySelectorAll('.network-prop-item');
assert(ethProps.length >= 4, 'ethernet IP, gateway, DNS, MAC properties rendered');

// Test Wi-Fi password prompt modal
const connectBtns = wifiCard.querySelectorAll('.btn-secondary');
if (connectBtns.length > 0) {
  window.helm.settings.views.network.promptConnect({ ssid: 'Test_Secure_Net', security: 'WPA2' });
  const submodal = document.querySelector('.settings-submodal');
  assert(submodal !== null, 'wifi password modal dialog displayed');
  const passInput = document.getElementById('wifi-password-input');
  assert(passInput !== null, 'password input rendered');
  // Close submodal
  window.helm.settings.views.network.activeDialogSSID = null;
  window.helm.settings.views.network.render(networkViewEl);
}

// 7. Test Power & Battery View
window.helm.settings.showCategory('power');
assert(window.helm.settings.activeCategory === 'power', 'active category switched to power');

const powerViewEl = document.querySelector('.settings-view-power');
assert(powerViewEl !== null, 'power view rendered');

// Battery card & gauge
const batteryCard = powerViewEl.querySelector('.power-battery-card');
assert(batteryCard !== null, 'battery status card rendered');
const batteryLevel = batteryCard.querySelector('.battery-visual-level');
assert(batteryLevel !== null, 'battery visual gauge rendered');

// Power profiles
const profilesCard = powerViewEl.querySelector('.power-profiles-card');
assert(profilesCard !== null, 'power profiles card rendered');
const profileCards = profilesCard.querySelectorAll('.power-profile-card');
assert(profileCards.length === 3, '3 power profiles (Performance, Balanced, Power Saver) rendered');

// Sleep timeouts
const sleepCard = powerViewEl.querySelector('.power-sleep-card');
assert(sleepCard !== null, 'sleep timeouts card rendered');

// 8. Test Appearance & Desktop View
window.helm.settings.showCategory('appearance');
assert(window.helm.settings.activeCategory === 'appearance', 'active category switched to appearance');

const appViewEl = document.querySelector('.settings-view-appearance');
assert(appViewEl !== null, 'appearance view rendered');

// Wallpaper gallery
const wpCard = appViewEl.querySelector('.appearance-wallpaper-card');
assert(wpCard !== null, 'wallpaper card rendered');
const wpTiles = wpCard.querySelectorAll('.wallpaper-tile');
assert(wpTiles.length >= 4, 'wallpaper gallery tiles rendered');

// Theme mode switch
const themeCard = appViewEl.querySelector('.appearance-theme-card');
assert(themeCard !== null, 'theme mode card rendered');
const themeTiles = themeCard.querySelectorAll('.theme-mode-tile');
assert(themeTiles.length === 3, 'Dark, Light, Auto theme mode tiles rendered');

// Accent colors
const accentCard = appViewEl.querySelector('.appearance-accent-card');
assert(accentCard !== null, 'accent color card rendered');
const swatches = accentCard.querySelectorAll('.accent-swatch');
assert(swatches.length >= 6, 'accent color swatches rendered');

// Test switching accent color
swatches[1].click();
const rootAccent = document.documentElement.style.getPropertyValue('--color-accent');
assert(rootAccent.length > 0, 'accent color updated CSS custom property');

// 9. Test Keyboard Shortcuts View
window.helm.settings.showCategory('shortcuts');
assert(window.helm.settings.activeCategory === 'shortcuts', 'active category switched to shortcuts');

const scViewEl = document.querySelector('.settings-view-shortcuts');
assert(scViewEl !== null, 'shortcuts view rendered');
const scRows = scViewEl.querySelectorAll('.shortcut-row');
assert(scRows.length >= 8, 'shortcut cheat-sheet rows rendered');
const kbds = scViewEl.querySelectorAll('.shortcut-kbd');
assert(kbds.length > 0, 'kbd visual key badges rendered');

// 10. Test System Information View
window.helm.settings.showCategory('system');
assert(window.helm.settings.activeCategory === 'system', 'active category switched to system');

const sysViewEl = document.querySelector('.settings-view-system');
assert(sysViewEl !== null, 'system view rendered');
const specBoxes = sysViewEl.querySelectorAll('.system-spec-box');
assert(specBoxes.length >= 6, 'hardware spec boxes rendered');
const uptimeEl = document.getElementById('system-uptime-text');
assert(uptimeEl !== null && uptimeEl.textContent.length > 0, 'system uptime counter rendered');

// 11. Test Live Search
window.helm.settings.onSearch('microphone');
assert(window.helm.settings.activeCategory === 'audio', 'searching "microphone" navigates to audio category');
window.helm.settings.onSearch('battery');
assert(window.helm.settings.activeCategory === 'power', 'searching "battery" navigates to power category');
window.helm.settings.onSearch('');

// 12. Test Hotkeys (Ctrl+, and Escape)
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert(window.helm.settings.isOpen === false, 'Escape closes settings modal');
assert(settingsModalEl.classList.contains('hidden'), 'settings modal is hidden after Escape');

window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
assert(window.helm.settings.isOpen === true, 'Ctrl+, hotkey toggles settings modal open');

window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert(window.helm.settings.isOpen === false, 'Escape closes settings modal');

// 13. Test Top Status Bar quick clicks
const volBtn = document.getElementById('btn-quick-volume');
assert(volBtn !== null, 'btn-quick-volume rendered');
volBtn.click();
assert(window.helm.settings.isOpen === true, 'clicking volume status button opens Settings');
assert(window.helm.settings.activeCategory === 'audio', 'volume status button opened Audio view');
window.helm.settings.close();

const netBtn = document.getElementById('btn-quick-net');
assert(netBtn !== null, 'btn-quick-net rendered');
netBtn.click();
assert(window.helm.settings.isOpen === true, 'clicking network status button opens Settings');
assert(window.helm.settings.activeCategory === 'network', 'network status button opened Network view');
window.helm.settings.close();

const batBtn = document.getElementById('btn-quick-battery');
assert(batBtn !== null, 'btn-quick-battery rendered');
batBtn.click();
assert(window.helm.settings.isOpen === true, 'clicking battery status button opens Settings');
assert(window.helm.settings.activeCategory === 'power', 'battery status button opened Power view');
window.helm.settings.close();

// 14. Test Launcher "settings" launch
window.helm.launcher.launchApp('settings');
assert(window.helm.settings.isOpen === true, 'launcher launchApp("settings") opens native Settings modal');
window.helm.settings.close();

// Final layout flush
advanceTime(16);
flush();

console.log('test_settings: all assertions passed!');
