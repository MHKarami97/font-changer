/**
 * Strategy Pattern for determining WHETHER a site should get the custom font.
 * هر Strategy یک کلاس مجزا با متد isApplicable(hostname, document) است.
 * اضافه کردن یک حالت جدید (مثلاً "فقط سایت‌های فارسی") فقط نیاز به یک
 * کلاس جدید دارد، بدون تغییر کد موجود => Open/Closed Principle.
 */

class ScopeStrategy {
  /* eslint-disable-next-line no-unused-vars */
  isApplicable(hostname, doc, settings) {
    throw new Error("isApplicable() must be implemented by subclass");
  }
}

class AllSitesStrategy extends ScopeStrategy {
  isApplicable() {
    return true;
  }
}

class RtlOnlyStrategy extends ScopeStrategy {
  isApplicable(hostname, doc) {
    const htmlDir = doc.documentElement.getAttribute("dir");
    const bodyDir = doc.body ? doc.body.getAttribute("dir") : null;
    const computedDir = doc.defaultView
      ? doc.defaultView.getComputedStyle(doc.documentElement).direction
      : null;
    return (
      htmlDir === "rtl" || bodyDir === "rtl" || computedDir === "rtl"
    );
  }
}

class CustomSitesStrategy extends ScopeStrategy {
  isApplicable(hostname, doc, settings) {
    const list = settings.customSites || [];
    return list.some((entry) => hostname.endsWith(entry.trim().toLowerCase()));
  }
}

class OffStrategy extends ScopeStrategy {
  isApplicable() {
    return false;
  }
}

/**
 * Factory Pattern: بر اساس مقدار scope، Strategy مناسب را می‌سازد.
 */
class ScopeStrategyFactory {
  static create(scope) {
    switch (scope) {
      case "all":
        return new AllSitesStrategy();
      case "rtl":
        return new RtlOnlyStrategy();
      case "custom":
        return new CustomSitesStrategy();
      default:
        return new OffStrategy();
    }
  }
}

if (typeof globalThis !== "undefined") {
  globalThis.ScopeStrategyFactory = ScopeStrategyFactory;
}
