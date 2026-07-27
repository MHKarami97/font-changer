/**
 * content.js
 * ------------------------------------------------------------------
 * نقطه ورود Content Script. مسئولیت‌ها بر اساس SRP بین چند کلاس تقسیم شده‌اند:
 *   - GoogleFontLoader : بارگذاری فونت از Google Fonts (Single Responsibility)
 *   - FontApplier       : اعمال فونت روی <html> با CSS Injection (نه inline style
 *                          روی هر المان، تا Performance بهتر باشد و Repaint کمتر شود)
 *   - FontChangerController : Orchestrator که Strategy + Repository + Loader +
 *                          Applier را به هم متصل می‌کند (Facade Pattern)
 *
 * نکته Performance:
 * به‌جای querySelectorAll('*') و ست کردن style روی هزاران node (که باعث
 * Layout Thrashing می‌شود)، یک تگ <style id="__font-changer-style__"> با
 * قانون `* { font-family: ... !important }` تزریق می‌کنیم. این یک واحد
 * CSSOM است و مرورگر خودش به صورت بهینه آن را روی صفحه اعمال می‌کند.
 */

class GoogleFontLoader {
  static #LINK_ID = "__font-changer-google-font-link__";

  /**
   * @param {string} fontFamily
   * @param {string} weight
   */
  load(fontFamily, weight = "400") {
    const existing = document.getElementById(GoogleFontLoader.#LINK_ID);
    if (existing) existing.remove();

    const link = document.createElement("link");
    link.id = GoogleFontLoader.#LINK_ID;
    link.rel = "stylesheet";
    const encodedFamily = fontFamily.trim().replace(/\s+/g, "+");
    link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weight}&display=swap`;
    (document.head || document.documentElement).appendChild(link);
  }

  remove() {
    const existing = document.getElementById(GoogleFontLoader.#LINK_ID);
    if (existing) existing.remove();
  }
}

class FontApplier {
  static #STYLE_ID = "__font-changer-style__";

  apply(fontFamily) {
    let styleTag = document.getElementById(FontApplier.#STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = FontApplier.#STYLE_ID;
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = `
      html, body, * {
        font-family: "${fontFamily}", "Vazirmatn", "Tahoma", sans-serif !important;
      }
    `;
  }

  remove() {
    const styleTag = document.getElementById(FontApplier.#STYLE_ID);
    if (styleTag) styleTag.remove();
  }
}

class FontChangerController {
  #settingsRepository;
  #fontLoader;
  #fontApplier;

  constructor(settingsRepository, fontLoader, fontApplier) {
    this.#settingsRepository = settingsRepository;
    this.#fontLoader = fontLoader;
    this.#fontApplier = fontApplier;
  }

  async run() {
    const settings = await this.#settingsRepository.getSettings();
    const hostname = window.location.hostname;

    const perSiteOverride = settings.perSiteOverrides[hostname];
    const strategy = ScopeStrategyFactory.create(settings.scope);

    let shouldApply;
    if (typeof perSiteOverride === "boolean") {
      // اگر کاربر برای این سایت خاص دستی فعال/غیرفعال کرده باشد، اولویت با اوست
      shouldApply = perSiteOverride;
    } else {
      shouldApply =
        settings.isGloballyEnabled &&
        strategy.isApplicable(hostname, document, settings);
    }

    if (shouldApply) {
      this.#fontLoader.load(settings.selectedFont, settings.fontWeight);
      this.#fontApplier.apply(settings.selectedFont);
    } else {
      this.#fontLoader.remove();
      this.#fontApplier.remove();
    }
  }

  listenForRuntimeMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "TOGGLE_CURRENT_SITE") {
        this.#settingsRepository
          .setPerSiteOverride(window.location.hostname, message.payload.isEnabled)
          .then(() => this.run())
          .then(() => sendResponse({ ok: true }));
        return true; // async response
      }
      if (message?.type === "SETTINGS_UPDATED") {
        this.run();
      }
    });
  }
}

(function bootstrap() {
  const controller = new FontChangerController(
    new SettingsRepository(),
    new GoogleFontLoader(),
    new FontApplier()
  );

  const start = () => {
    controller.run();
    controller.listenForRuntimeMessages();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
