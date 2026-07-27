/**
 * SettingsRepository
 * ------------------------------------------------------------------
 * Design Pattern: Repository Pattern
 * مسئولیت: انتزاع (Abstraction) لایه ذخیره‌سازی (chrome.storage.sync)
 * از بقیه اپلیکیشن. اگر فردا بخواهیم storage را عوض کنیم (مثلاً IndexedDB)
 * فقط همین کلاس تغییر می‌کند (Single Responsibility + Open/Closed).
 */
class SettingsRepository {
  static #STORAGE_KEY = "fontChangerSettings";

  static #DEFAULT_SETTINGS = Object.freeze({
    isGloballyEnabled: false,
    scope: "off", // "off" | "all" | "rtl" | "custom"
    selectedFont: "Vazirmatn",
    fontWeight: "400",
    customSites: [], // ["example.com", ...]
    perSiteOverrides: {}, // { "example.com": true/false }
    recentFonts: ["Vazirmatn", "Roboto", "Tahoma"]
  });

  /**
   * @returns {Promise<object>}
   */
  async getSettings() {
    const stored = await chrome.storage.sync.get(
      SettingsRepository.#STORAGE_KEY
    );
    const saved = stored[SettingsRepository.#STORAGE_KEY] || {};
    return { ...SettingsRepository.#DEFAULT_SETTINGS, ...saved };
  }

  /**
   * @param {object} partialSettings
   */
  async updateSettings(partialSettings) {
    const current = await this.getSettings();
    const merged = { ...current, ...partialSettings };
    await chrome.storage.sync.set({
      [SettingsRepository.#STORAGE_KEY]: merged
    });
    return merged;
  }

  /**
   * @param {string} hostname
   * @param {boolean} isEnabled
   */
  async setPerSiteOverride(hostname, isEnabled) {
    const current = await this.getSettings();
    const perSiteOverrides = { ...current.perSiteOverrides, [hostname]: isEnabled };
    return this.updateSettings({ perSiteOverrides });
  }

  onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[SettingsRepository.#STORAGE_KEY]) {
        callback(changes[SettingsRepository.#STORAGE_KEY].newValue);
      }
    });
  }
}

// Expose in both content-script (window) and service-worker (self) contexts
if (typeof globalThis !== "undefined") {
  globalThis.SettingsRepository = SettingsRepository;
}
