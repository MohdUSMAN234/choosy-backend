const puppeteer = require("puppeteer");

async function scrapeFlipkart(query) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

  // Close login popup if appears
  try {
    await page.waitForSelector("button._2KpZ6l._2doB4z", { timeout: 3000 });
    await page.click("button._2KpZ6l._2doB4z");
  } catch (err) {
    // Popup not found, continue
  }

  // Scrape product title and price of first result
  const data = await page.evaluate(() => {
    const title = document.querySelector("._4rR01T")?.innerText;
    const price = document.querySelector("._30jeq3._1_WHN1")?.innerText;
    return { title, price };
  });

  await browser.close();
  return data;
}

module.exports = scrapeFlipkart;
