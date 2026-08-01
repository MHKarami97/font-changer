/**
 * content.js
 * ------------------------------------------------------------------
 * نقطه ورود Content Script.
 *
 *   - GoogleFontLoader   : بارگذاری فونت از Google Fonts
 *   - IconFontDetector   : تشخیص المان‌های آیکونی، هم روی خود المان و هم
 *                          روی Pseudo-element های ::before/::after (که محل
 *                          واقعی رندر آیکون در بسیاری از سیستم‌ها مثل
 *                          Google Symbols/Material Symbols است)، در سراسر
 *                          Light DOM و Shadow DOM
 *   - FontApplier        : اعمال فونت روی <html> با CSS Injection
 *   - DirectionApplier   : اجباری‌کردن جهت صفحه به RTL (ویژگی مستقل)
 *   - FontChangerController / DirectionController : Orchestrator (Facade)
 *
 * === چرا نسخه‌های قبلی آیکون Google Maps را درست نکردند؟ ===
 *
 * ریشه واقعی مشکل «حساسیت به حروف بزرگ/کوچک» نبود (آن از قبل با
 * toLowerCase() رفع شده بود). ریشه مشکل این بود که بسیاری از سیستم‌های
 * آیکون گوگل (از جمله Google Symbols در Google Maps) گلیف آیکون را با
 * `content` روی Pseudo-element (`::before` یا `::after`) رندر می‌کنند،
 * نه مستقیماً با متن داخل خود المان.
 *
 * جاوااسکریپت به‌هیچ‌وجه نمی‌تواند `element.style` را برای یک Pseudo-element
 * تنظیم کند (چون ::before/::after بخشی از DOM واقعی نیستند و Node مستقلی
 * محسوب نمی‌شوند)؛ بنابراین قفل inline که روی خودِ المان اعمال می‌شد، هیچ
 * تاثیری روی فونت گلیف داخل ::before نداشت و آیکون همچنان مربعی می‌ماند.
 *
 * === راه‌حل ===
 * تنها روش معتبر برای override کردن فونت یک Pseudo-element، تزریق یک
 * قانون CSS واقعی با selector مخصوص آن Pseudo-element است (نه inline
 * style). پس این‌جا برای هر المانی که آیکونش (خودش یا ::before/::after آن)
 * از فونت آیکونی استفاده می‌کند، یک شناسه یکتا (data-fc-icon-id) تخصیص
 * داده و یک قانون CSS اختصاصی برای آن id + آن pseudo-element، با
 * specificity بالاتر از قانون سراسری فونت، در همان <style> تزریق می‌شود.
 */

class GoogleFontLoader {
  static #LINK_ID = "__font-changer-google-font-link__";

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

/**
 * ShadowDomWalker
 * پیمایش بازگشتی درخت DOM به‌همراه تمام Shadow Root های "open" داخل آن.
 */
class ShadowDomWalker {
  static walk(root, visit) {
    if (!root) return;
    const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    elements.forEach((el) => {
      visit(el);
      if (el.shadowRoot) {
        ShadowDomWalker.walk(el.shadowRoot, visit);
      }
    });
  }

  static collectShadowRoots(root) {
    const roots = [];
    ShadowDomWalker.walk(root, (el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    });
    return roots;
  }
}

/**
 * IconFontDetector
 * ------------------------------------------------------------------
 * تشخیص المان‌های آیکونی (هم روی خود المان، هم روی ::before/::after آن)
 * در سراسر Light DOM و Shadow DOM، و تولید قوانین CSS اختصاصی برای
 * قفل‌کردن فونت اصلی آن‌ها.
 */
class IconFontDetector {
  static #ID_ATTRIBUTE = "data-fc-icon-id";

  static #ICON_FONT_KEYWORDS = [
    "material icons",
    "material symbols",
    "google symbols",
    "google material icons",
    "font awesome",
    "fontawesome",
    "glyphicons",
    "ionicons",
    "octicons",
    "feather",
    "bootstrap-icons",
    "iconfont",
    "dx-icons",
    "remixicon"
  ];

  #observers = [];
  #debounceTimer = null;
  #nextId = 1;
  #onRulesChanged;

  /** @param {(rules: string[]) => void} onRulesChanged هر بار قانون جدید تولید شود صدا زده می‌شود */
  constructor(onRulesChanged) {
    this.#onRulesChanged = onRulesChanged;
    this.rules = [];
  }

  scan(root = document.body) {
    if (!root) return;
    let hasNewRule = false;
    ShadowDomWalker.walk(root, (el) => {
      if (this.#processElement(el)) hasNewRule = true;
    });
    if (hasNewRule) this.#onRulesChanged?.(this.rules);
  }

  observe(root = document.documentElement) {
    this.disconnect();

    const attach = (targetRoot) => {
      const observer = new MutationObserver(() => this.#scheduleRescan(root));
      observer.observe(targetRoot, { childList: true, subtree: true });
      this.#observers.push(observer);
    };

    attach(root);
    ShadowDomWalker.collectShadowRoots(root).forEach(attach);
  }

  disconnect() {
    this.#observers.forEach((observer) => observer.disconnect());
    this.#observers = [];
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }

  reset() {
    this.disconnect();
    this.rules = [];
    this.#nextId = 1;
  }

  #scheduleRescan(root) {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => {
      this.scan(root);
      this.observe(root);
    }, 200);
  }

  /**
   * @returns {boolean} true اگر قانون جدیدی برای این المان اضافه شد
   */
  #processElement(element) {
    if (!(element instanceof Element)) return false;

    const win = element.ownerDocument?.defaultView;
    if (!win) return false;

    let addedRule = false;

    // 1) بررسی خود المان
    const ownFamily = win.getComputedStyle(element).fontFamily?.toLowerCase() || "";
    if (this.#isIconFont(ownFamily)) {
      const id = this.#ensureId(element);
      const fullFamily = win.getComputedStyle(element).fontFamily;
      this.rules.push(`[${IconFontDetector.#ID_ATTRIBUTE}="${id}"] { font-family: ${fullFamily} !important; }`);
      addedRule = true;
    }

    // 2) بررسی ::before و ::after (محل رایج رندر گلیف آیکون در بسیاری از
    // سیستم‌های آیکون مثل Google Symbols)
    for (const pseudo of ["::before", "::after"]) {
      const pseudoStyle = win.getComputedStyle(element, pseudo);
      const content = pseudoStyle.content;
      // اگر content واقعاً چیزی رندر می‌کند (نه "none")، پس این pseudo فعال است
      if (!content || content === "none" || content === '""') continue;

      const pseudoFamily = pseudoStyle.fontFamily?.toLowerCase() || "";
      if (this.#isIconFont(pseudoFamily)) {
        const id = this.#ensureId(element);
        const fullFamily = pseudoStyle.fontFamily;
        this.rules.push(
          `[${IconFontDetector.#ID_ATTRIBUTE}="${id}"]${pseudo} { font-family: ${fullFamily} !important; }`
        );
        addedRule = true;
      }
    }

    return addedRule;
  }

  #isIconFont(lowerCaseFamily) {
    return IconFontDetector.#ICON_FONT_KEYWORDS.some((keyword) =>
      lowerCaseFamily.includes(keyword)
    );
  }

  #ensureId(element) {
    let id = element.getAttribute(IconFontDetector.#ID_ATTRIBUTE);
    if (!id) {
      id = String(this.#nextId++);
      element.setAttribute(IconFontDetector.#ID_ATTRIBUTE, id);
    }
    return id;
  }
}

class FontApplier {
  static #STYLE_ID = "__font-changer-style__";
  static #ICON_STYLE_ID = "__font-changer-icon-protection-style__";

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

  /**
   * قوانین محافظتی آیکون را در یک <style> جداگانه، بعد از قانون سراسری
   * فونت، تزریق می‌کند تا specificity بالاتر (attribute selector) آن‌ها
   * قطعاً برنده شود.
   * @param {string[]} rules
   */
  applyIconProtection(rules) {
    let styleTag = document.getElementById(FontApplier.#ICON_STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = FontApplier.#ICON_STYLE_ID;
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = rules.join("\n");
  }

  remove() {
    const styleTag = document.getElementById(FontApplier.#STYLE_ID);
    if (styleTag) styleTag.remove();
    const iconStyleTag = document.getElementById(FontApplier.#ICON_STYLE_ID);
    if (iconStyleTag) iconStyleTag.remove();
  }
}

class DirectionApplier {
  static #STYLE_ID = "__font-changer-rtl-style__";
  static #ORIGINAL_DIR_ATTR = "data-fc-original-dir";
  static #NONE_MARKER = "__none__";

  apply() {
    const html = document.documentElement;

    if (!html.hasAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR)) {
      const originalDir = html.getAttribute("dir") || DirectionApplier.#NONE_MARKER;
      html.setAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR, originalDir);
    }

    html.setAttribute("dir", "rtl");

    let styleTag = document.getElementById(DirectionApplier.#STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = DirectionApplier.#STYLE_ID;
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = `
      html, body {
        direction: rtl !important;
      }
    `;
  }

  remove() {
    const html = document.documentElement;

    if (html.hasAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR)) {
      const originalDir = html.getAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR);
      if (originalDir === DirectionApplier.#NONE_MARKER) {
        html.removeAttribute("dir");
      } else {
        html.setAttribute("dir", originalDir);
      }
      html.removeAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR);
    }

    const styleTag = document.getElementById(DirectionApplier.#STYLE_ID);
    if (styleTag) styleTag.remove();
  }
}

class FontChangerController {
  #settingsRepository;
  #fontLoader;
  #fontApplier;
  #iconDetector;

  constructor(settingsRepository, fontLoader, fontApplier) {
    this.#settingsRepository = settingsRepository;
    this.#fontLoader = fontLoader;
    this.#fontApplier = fontApplier;
    this.#iconDetector = new IconFontDetector((rules) => {
      this.#fontApplier.applyIconProtection(rules);
    });
  }

  async run() {
    const settings = await this.#settingsRepository.getSettings();
    const hostname = window.location.hostname;

    const perSiteOverride = settings.perSiteOverrides[hostname];
    const strategy = ScopeStrategyFactory.create(settings.scope, "customSites");

    let shouldApply;
    if (typeof perSiteOverride === "boolean") {
      shouldApply = perSiteOverride;
    } else {
      shouldApply =
        settings.isGloballyEnabled &&
        strategy.isApplicable(hostname, document, settings);
    }

    if (shouldApply) {
      // ترتیب اجرا حیاتی است: ابتدا باید آیکون‌ها را قبل از اعمال فونت
      // جدید اسکن کنیم، چون تشخیص بر اساس Computed Style *اصلیِ* صفحه
      // (فونت آیکونی که خود سایت تعریف کرده) انجام می‌شود. اگر فونت جدید
      // زودتر اعمال شود، Computed Style همان فونت جدید (مثلاً Vazirmatn)
      // را برمی‌گرداند و هیچ‌کدام از کلیدواژه‌های آیکون تشخیص داده نمی‌شود.
      this.#iconDetector.reset();
      this.#iconDetector.scan(document.body);

      this.#fontLoader.load(settings.selectedFont, settings.fontWeight);
      this.#fontApplier.apply(settings.selectedFont);

      // بعد از اعمال فونت، رصد تغییرات DOM را فعال می‌کنیم تا المان‌های
      // آیکونیِ جدید (که بعداً توسط اپلیکیشن‌های SPA مثل Google Maps
      // رندر می‌شوند) هم با فونت اصلی‌شان محافظت شوند.
      this.#iconDetector.observe(document.documentElement);
    } else {
      this.#iconDetector.reset();
      this.#fontLoader.remove();
      this.#fontApplier.remove();
    }
  }
}

class DirectionController {
  #settingsRepository;
  #directionApplier;

  constructor(settingsRepository, directionApplier) {
    this.#settingsRepository = settingsRepository;
    this.#directionApplier = directionApplier;
  }

  async run() {
    const settings = await this.#settingsRepository.getSettings();
    const hostname = window.location.hostname;

    const perSiteOverride = settings.rtlPerSiteOverrides[hostname];
    const strategy = ScopeStrategyFactory.create(settings.rtlScope, "rtlCustomSites");

    let shouldApply;
    if (typeof perSiteOverride === "boolean") {
      shouldApply = perSiteOverride;
    } else {
      shouldApply = strategy.isApplicable(hostname, document, settings);
    }

    if (shouldApply) {
      this.#directionApplier.apply();
    } else {
      this.#directionApplier.remove();
    }
  }
}

(function bootstrap() {
  const settingsRepository = new SettingsRepository();

  const fontController = new FontChangerController(
    settingsRepository,
    new GoogleFontLoader(),
    new FontApplier()
  );

  const directionController = new DirectionController(
    settingsRepository,
    new DirectionApplier()
  );

  const runAll = () => {
    fontController.run();
    directionController.run();
  };

  const start = () => {
    runAll();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "TOGGLE_CURRENT_SITE") {
        const { feature, isEnabled } = message.payload;
        const hostname = window.location.hostname;

        const overrideUpdate =
          feature === "rtl"
            ? settingsRepository.setRtlPerSiteOverride(hostname, isEnabled)
            : settingsRepository.setPerSiteOverride(hostname, isEnabled);

        overrideUpdate.then(runAll).then(() => sendResponse({ ok: true }));
        return true; // async response
      }

      if (message?.type === "SETTINGS_UPDATED") {
        runAll();
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
