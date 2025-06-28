const puppeteer = require("puppeteer");

async function scrapeFlipkartPrice(productName) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(productName)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Dismiss login popup
    try {
      await page.waitForSelector('button._2KpZ6l._2doB4z', { timeout: 5000 });
      await page.click('button._2KpZ6l._2doB4z');
    } catch (_) {
      // No login popup
    }

    // Wait for product container (not class-based)
    await page.waitForSelector("a[href*='/p/']", { timeout: 15000 });

    const product = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href*='/p/']")).filter(a =>
        a.textContent?.trim()?.length > 10
      );

      const first = anchors[0];
      if (!first) return null;

      const title = first.innerText?.trim();
      const link = "https://www.flipkart.com" + first.getAttribute("href");
      const priceElement = first.parentElement?.querySelector("div._30jeq3");
      const price = priceElement?.innerText?.trim() || "₹N/A";

      return { title, link, price };
    });

    return product || null;
  } catch (err) {
    console.error("🛑 Flipkart scrape error:", err.message);
    await page.screenshot({ path: "flipkart_error.png", fullPage: true });
    return null;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeFlipkartPrice };
