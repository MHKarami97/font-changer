/**
 * SettingsRepository
 * ------------------------------------------------------------------
 * Design Pattern: Repository Pattern - Abstraction روی chrome.storage.sync
 * تا اگر روزی storage به IndexedDB تغییر کند، فقط این کلاس تغییر می‌کند
 * (Single Responsibility, Open/Closed).
 */
class SettingsRepository {
  static #STORAGE_KEY = "fontChangerSettings";

  static #DEFAULT_SETTINGS = Object.freeze({
    // --- تنظیمات فونت ---
    isGloballyEnabled: false,
    scope: "off", // "off" | "all" | "rtl" | "custom"
    selectedFont: "Vazirmatn",
    fontWeight: "400",
    customSites: [], // ["example.com", ...]
    perSiteOverrides: {}, // { "example.com": true/false }
    recentFonts: ["Vazirmatn", "Roboto", "Tahoma"],

    // --- تنظیمات جهت صفحه (RTL Forcer) - کاملاً مستقل از تنظیمات فونت ---
    rtlScope: "off", // "off" | "all" | "custom"
    rtlCustomSites: [], // ["example.com", ...]
    rtlPerSiteOverrides: {}, // { "example.com": true/false }

    // --- مسیرهای مستثنا - بالاترین اولویت روی همه‌ی تنظیمات بالا ---
    excludedPaths: [], // ["google.com/maps", ...]

    // --- قالب (ظاهر) خود افزونه (Popup/Options) - مستقل از تنظیمات سایت ---
    theme: "dark", // "dark" | "light" - پیش‌فرض همیشه تاریک است
  });

  /**
   * @returns {Promise<object>}
   */
  async getSettings() {
    const stored = await chrome.storage.sync.get(
      SettingsRepository.#STORAGE_KEY,
    );
    const saved = stored[SettingsRepository.#STORAGE_KEY];
    return { ...SettingsRepository.#DEFAULT_SETTINGS, ...saved };
  }

  /**
   * @param {object} partialSettings
   * @returns {Promise<object>} تنظیمات کامل پس از merge
   */
  async updateSettings(partialSettings) {
    const current = await this.getSettings();
    const merged = { ...current, ...partialSettings };
    await chrome.storage.sync.set({
      [SettingsRepository.#STORAGE_KEY]: merged,
    });
    return merged;
  }

  /**
   * @param {string} hostname
   * @param {boolean} isEnabled
   */
  async setPerSiteOverride(hostname, isEnabled) {
    const current = await this.getSettings();
    const perSiteOverrides = {
      ...current.perSiteOverrides,
      [hostname]: isEnabled,
    };
    return this.updateSettings({ perSiteOverrides });
  }

  /**
   * اورراید دستی حالت RTL برای یک دامنه خاص، مستقل از تنظیمات فونت.
   * @param {string} hostname
   * @param {boolean} isEnabled
   */
  async setRtlPerSiteOverride(hostname, isEnabled) {
    const current = await this.getSettings();
    const rtlPerSiteOverrides = {
      ...current.rtlPerSiteOverrides,
      [hostname]: isEnabled,
    };
    return this.updateSettings({ rtlPerSiteOverrides });
  }

  /**
   * @param {(newSettings: object) => void} callback
   */
  onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[SettingsRepository.#STORAGE_KEY]) {
        callback(changes[SettingsRepository.#STORAGE_KEY].newValue);
      }
    });
  }
}

// Expose در هر دو context: content-script window و service-worker self
if (typeof globalThis !== "undefined") {
  globalThis.SettingsRepository = SettingsRepository;
}
