/**
 * ThemeManager
 * ------------------------------------------------------------------
 * Single Responsibility: خواندن، نوشتن و اعمال تنظیم قالب (dark/light) روی
 * صفحات UI خود افزونه (Popup و Options). کاملاً مستقل از تنظیمات فونت و RTL؛
 * فقط ظاهر خود افزونه را تغییر می‌دهد، نه سایت‌های هدف.
 * پیش‌فرض این افزونه همیشه "dark" است (هم در SettingsRepository و هم در
 * markup اولیه‌ی HTML، تا هیچ فلش رنگی هنگام باز شدن رخ ندهد).
 */
class ThemeManager {
  static DARK = "dark";
  static LIGHT = "light";

  /**
   * @param {SettingsRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} theme
   * @returns {string} "dark" | "light" (مقدار نامعتبر همیشه به dark می‌افتد)
   */
  static normalize(theme) {
    return theme === ThemeManager.LIGHT
      ? ThemeManager.LIGHT
      : ThemeManager.DARK;
  }

  /**
   * @param {string} theme
   */
  static applyToDocument(theme) {
    document.documentElement.setAttribute(
      "data-theme",
      ThemeManager.normalize(theme),
    );
  }

  /**
   * تنظیم فعلی را از storage می‌خواند و بلافاصله روی سند جاری اعمال می‌کند.
   * @returns {Promise<string>} تمی که اعمال شد
   */
  async applyStoredTheme() {
    var settings = await this.repository.getSettings();
    var theme = ThemeManager.normalize(settings.theme);
    ThemeManager.applyToDocument(theme);
    return theme;
  }

  /**
   * ذخیره‌ی تم جدید در storage و اعمال فوری آن روی صفحه فعلی.
   * @param {string} theme "dark" | "light"
   * @returns {Promise<string>} تمی که ذخیره و اعمال شد
   */
  async setTheme(theme) {
    var normalized = ThemeManager.normalize(theme);
    await this.repository.updateSettings({ theme: normalized });
    ThemeManager.applyToDocument(normalized);
    return normalized;
  }
}

if (typeof globalThis !== "undefined") {
  globalThis.ThemeManager = ThemeManager;
}
