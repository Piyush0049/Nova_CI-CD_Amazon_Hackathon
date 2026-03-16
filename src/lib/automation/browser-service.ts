import { chromium, Browser, Page } from "playwright";
import { BrowserAction, AutomationResult } from "@/types";
import { delay } from "../utils";

export class BrowserAutomationService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isDemo: boolean;

  constructor(demoMode: boolean = true) {
    this.isDemo = demoMode;
  }

  async initialize(): Promise<void> {
    if (this.isDemo) {
      console.log("[DEMO MODE] Browser automation simulated");
      return;
    }

    try {
      // Try to use system Chrome first (no download needed)
      try {
        this.browser = await chromium.launch({
          channel: 'chrome', // Use system Chrome
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        console.log("✓ Using system Chrome browser");
      } catch {
        console.log("System Chrome not found, trying msedge...");
        // Fallback to Edge
        try {
          this.browser = await chromium.launch({
            channel: 'msedge', // Use system Edge
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          console.log("✓ Using system Edge browser");
        } catch {
          console.log("No system browser found, using Playwright chromium...");
          // Final fallback to downloaded chromium
          this.browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          console.log("✓ Using Playwright chromium");
        }
      }

      this.page = await this.browser.newPage();
      await this.page.setViewportSize({ width: 1920, height: 1080 });
    } catch (error) {
      console.error("Error initializing browser:", error);
      throw error;
    }
  }

  async executeAction(action: BrowserAction): Promise<AutomationResult> {
    if (this.isDemo) {
      return this.simulateAction(action);
    }

    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    try {
      switch (action.type) {
        case "navigate":
          if (action.url) {
            await this.page.goto(action.url, {
              waitUntil: "networkidle",
              timeout: 30000
            });
            await delay(2000); // Wait for dynamic content
            return { success: true, data: { url: action.url } };
          }
          break;

        case "click":
          if (action.selector) {
            await this.page.waitForSelector(action.selector, { timeout: 10000 });
            await this.page.click(action.selector);
            await delay(2000); // Wait for any page changes
            return { success: true, data: { clicked: action.selector } };
          }
          break;

        case "type":
          if (action.selector && action.value) {
            await this.page.waitForSelector(action.selector, { timeout: 10000 });
            await this.page.fill(action.selector, action.value);
            await delay(1000);
            return { success: true, data: { typed: action.value } };
          }
          break;

        case "extract":
          return await this.extractStructuredData(action);

        case "wait":
          await delay(action.waitFor || 1000);
          return { success: true, data: { waited: action.waitFor } };

        case "scroll":
          await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await delay(1000);
          return { success: true, data: { scrolled: true } };

        default:
          return { success: false, error: "Unknown action type" };
      }

      return { success: false, error: "Action could not be executed" };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async extractStructuredData(action: BrowserAction): Promise<AutomationResult> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    try {
      const currentUrl = this.page.url();
      const selector = action.selector || "";

      // Detect what type of data to extract based on URL and context
      if (this.isFlightSearchUrl(currentUrl) || selector.includes("flight")) {
        return await this.extractFlightData();
      } else if (this.isJobSearchUrl(currentUrl) || selector.includes("job")) {
        return await this.extractJobData();
      } else if (this.isProductSearchUrl(currentUrl) || selector.includes("product")) {
        return await this.extractProductData();
      } else if (selector) {
        // Generic extraction with specified selector
        return await this.extractGenericData(selector);
      }

      // Fallback: try to detect content type automatically
      return await this.extractGenericData("body");
    } catch (error: any) {
      console.error("Extraction error:", error);
      return { success: false, error: error.message };
    }
  }

  private isFlightSearchUrl(url: string): boolean {
    return url.includes("google.com/flights") ||
      url.includes("makemytrip.com") ||
      url.includes("goibibo.com") ||
      url.includes("cleartrip.com") ||
      url.includes("skyscanner");
  }

  private isJobSearchUrl(url: string): boolean {
    return url.includes("linkedin.com/jobs") ||
      url.includes("naukri.com") ||
      url.includes("indeed.com") ||
      url.includes("indeed.co") ||
      url.includes("monster.com") ||
      url.includes("glassdoor.com");
  }

  private isProductSearchUrl(url: string): boolean {
    return url.includes("amazon.in") ||
      url.includes("amazon.com") ||
      url.includes("flipkart.com") ||
      url.includes("snapdeal.com") ||
      url.includes("myntra.com");
  }

  private async extractFlightData(): Promise<AutomationResult> {
    if (!this.page) throw new Error("Browser not initialized");

    const flights = await this.page.evaluate(() => {
      const results: any[] = [];

      // Try multiple common flight result selectors
      const selectors = [
        '.gws-flights-results__result-item',
        '[data-test-id="flight-card"]',
        '.flight-card',
        '.flights-result',
        'li.flight'
      ];

      let elements: NodeListOf<Element> | null = null;
      for (const selector of selectors) {
        elements = document.querySelectorAll(selector);
        if (elements && elements.length > 0) break;
      }

      if (!elements || elements.length === 0) {
        // Try generic extraction
        const containers = document.querySelectorAll('[class*="flight"], [class*="result"]');
        elements = containers;
      }

      elements?.forEach((element, index) => {
        if (index >= 15) return; // Limit to 15 results

        const getText = (sel: string) => {
          const el = element.querySelector(sel);
          return el?.textContent?.trim() || '';
        };

        const getMultiple = (selectors: string[]) => {
          for (const sel of selectors) {
            const text = getText(sel);
            if (text) return text;
          }
          return '';
        };

        // Extract structured flight data
        const flightData: any = {
          airline: getMultiple([
            '[class*="airline"]',
            '[class*="carrier"]',
            '[data-test-id*="airline"]'
          ]),
          price: getMultiple([
            '[class*="price"]',
            '[class*="fare"]',
            '[class*="cost"]',
            'span[class*="₹"]'
          ]),
          departure: getMultiple([
            '[class*="departure"]',
            '[class*="depart"]',
            'time[class*="start"]'
          ]),
          arrival: getMultiple([
            '[class*="arrival"]',
            '[class*="arrive"]',
            'time[class*="end"]'
          ]),
          duration: getMultiple([
            '[class*="duration"]',
            '[class*="time"]'
          ]),
          stops: getMultiple([
            '[class*="stop"]',
            '[class*="layover"]',
            '[class*="direct"]'
          ])
        };

        // Only add if we have at least price or airline
        if (flightData.price || flightData.airline) {
          results.push(flightData);
        }
      });

      return results;
    });

    return {
      success: true,
      data: flights.length > 0 ? flights : await this.getFallbackFlightData()
    };
  }

  private async extractJobData(): Promise<AutomationResult> {
    if (!this.page) throw new Error("Browser not initialized");

    console.log("🔍 Extracting job data from:", this.page.url());

    // Wait a bit more for Indeed to load
    await delay(3000);

    const jobs = await this.page.evaluate(() => {
      const results: any[] = [];

      // Indeed-specific selectors (updated for 2024/2025)
      const selectors = [
        'div.job_seen_beacon',           // Indeed main job card
        'div.jobsearch-SerpJobCard',     // Indeed classic
        'div[data-jk]',                  // Indeed jobs with job key
        'td.resultContent',              // Indeed table format
        'div.slider_container div.job_seen_beacon',  // Indeed slider
        'li[data-jk]',                   // Indeed list items
        'a.jcs-JobTitle',                // Indeed job title links
        '.job-card-container',           // Generic
        '[data-test="job-tile"]',        // Generic
        'article.job'                    // Generic
      ];

      let elements: NodeListOf<Element> | null = null;

      // Try each selector
      for (const selector of selectors) {
        elements = document.querySelectorAll(selector);
        console.log(`Trying selector "${selector}": found ${elements.length} elements`);
        if (elements && elements.length > 5) {  // Need at least 5 results
          console.log(`✓ Using selector: ${selector}`);
          break;
        }
      }

      // If still nothing, try broad search but filter out navigation
      if (!elements || elements.length < 5) {
        console.log("⚠ No good selectors found, trying broad search...");
        const allDivs = document.querySelectorAll('div[class*="job"]');
        const filtered: Element[] = [];

        allDivs.forEach(div => {
          const text = div.textContent?.toLowerCase() || '';
          const hasJobKeywords = text.includes('salary') || text.includes('ago') ||
                                 text.includes('posted') || text.includes('employer');
          const isNotNav = !text.includes('skip to') && !text.includes('user agreement') &&
                          !text.includes('return home') && text.length > 50;

          if (hasJobKeywords && isNotNav) {
            filtered.push(div);
          }
        });

        elements = filtered as any;
        console.log(`Filtered to ${elements.length} potential job cards`);
      }

      if (!elements || elements.length === 0) {
        console.log("❌ No job elements found!");
        return results;
      }

      elements.forEach((element, index) => {
        if (index >= 15) return;

        const getText = (sel: string) => {
          const el = element.querySelector(sel);
          return el?.textContent?.trim() || '';
        };

        const getMultiple = (selectors: string[]) => {
          for (const sel of selectors) {
            const text = getText(sel);
            if (text) return text;
          }
          return '';
        };

        // Indeed-specific extraction
        const jobData: any = {
          title: getMultiple([
            'h2.jobTitle span',           // Indeed job title
            'a.jcs-JobTitle span',        // Indeed title link
            'h2 a span',                  // Indeed nested
            '[class*="jobTitle"]',
            '[class*="title"]',
            'h3',
            'h2'
          ]),
          company: getMultiple([
            'span[data-testid="company-name"]',  // Indeed company
            '[class*="companyName"]',
            '[class*="company"]',
            '[class*="employer"]',
            'span.companyName'
          ]),
          location: getMultiple([
            '[data-testid="text-location"]',  // Indeed location
            '[class*="companyLocation"]',
            '[class*="location"]',
            'div.companyLocation'
          ]),
          type: getMultiple([
            '[class*="metadata"]',
            '[class*="type"]',
            '[class*="employment"]'
          ]),
          salary: getMultiple([
            '[class*="salary-snippet"]',     // Indeed salary
            '[class*="salary"]',
            '[class*="compensation"]',
            'div.salary-snippet-container'
          ]),
          posted: getMultiple([
            'span.date',
            '[class*="date"]',
            '[class*="posted"]',
            'time'
          ])
        };

        // Only add if we have actual job data (not navigation links)
        const hasValidData = jobData.title &&
                           jobData.title.length > 5 &&
                           jobData.title.length < 150 &&
                           !jobData.title.toLowerCase().includes('skip to') &&
                           !jobData.title.toLowerCase().includes('sign in') &&
                           !jobData.title.toLowerCase().includes('user agreement');

        if (hasValidData) {
          results.push(jobData);
        }
      });

      return results;
    });

    console.log(`✓ Extracted ${jobs.length} job listings`);

    return {
      success: true,
      data: jobs.length > 0 ? jobs : await this.getFallbackJobData()
    };
  }

  private async extractProductData(): Promise<AutomationResult> {
    if (!this.page) throw new Error("Browser not initialized");

    console.log("🔍 Extracting product data from:", this.page.url());

    const products = await this.page.evaluate(() => {
      const results: any[] = [];

      const selectors = [
        '[data-component-type="s-search-result"]',  // Amazon main
        '.s-result-item',  // Amazon
        'div[data-asin]:not([data-asin=""])',  // Amazon with ASIN
        '[data-test="product-card"]',
        '.product-card',
        'article.product',
        'div[class*="product"]'
      ];

      let elements: NodeListOf<Element> | null = null;
      for (const selector of selectors) {
        elements = document.querySelectorAll(selector);
        if (elements && elements.length > 0) break;
      }

      if (!elements || elements.length === 0) {
        elements = document.querySelectorAll('[class*="product"]');
      }

      elements?.forEach((element, index) => {
        if (index >= 15) return;

        const getText = (sel: string) => {
          const el = element.querySelector(sel);
          return el?.textContent?.trim() || '';
        };

        const getMultiple = (selectors: string[]) => {
          for (const sel of selectors) {
            const text = getText(sel);
            if (text) return text;
          }
          return '';
        };

        const productData: any = {
          name: getMultiple([
            'h2',
            '[class*="title"]',
            '[class*="name"]',
            '[class*="product-title"]',
            'a span'
          ]),
          price: getMultiple([
            '[class*="price"]',
            '[class*="cost"]',
            'span.a-price-whole',
            '[class*="₹"]'
          ]),
          rating: getMultiple([
            '[class*="rating"]',
            '[class*="star"]',
            '[class*="review-score"]'
          ]),
          reviews: getMultiple([
            '[class*="review-count"]',
            '[class*="ratings-count"]',
            '[class*="num-reviews"]'
          ]),
          seller: getMultiple([
            '[class*="seller"]',
            '[class*="merchant"]',
            '[class*="store"]'
          ]),
          availability: getMultiple([
            '[class*="availability"]',
            '[class*="stock"]',
            '[class*="delivery"]'
          ])
        };

        if (productData.name || productData.price) {
          results.push(productData);
        }
      });

      return results;
    });

    console.log(`✓ Extracted ${products.length} products`);

    return {
      success: true,
      data: products.length > 0 ? products : await this.getFallbackProductData()
    };
  }

  private async extractGenericData(selector: string): Promise<AutomationResult> {
    if (!this.page) throw new Error("Browser not initialized");

    const elements = await this.page.$$(selector);
    const data = await Promise.all(
      elements.slice(0, 20).map(async (el) => {
        const text = await el.textContent();

        // Try to extract links and images too
        const links = await el.$$('a');
        const images = await el.$$('img');

        const urls = await Promise.all(
          links.slice(0, 3).map(async (link) => {
            return await link.getAttribute('href');
          })
        );

        const imgSrcs = await Promise.all(
          images.slice(0, 3).map(async (img) => {
            return await img.getAttribute('src');
          })
        );

        return {
          text: text?.trim(),
          links: urls.filter(Boolean),
          images: imgSrcs.filter(Boolean)
        };
      })
    );

    return { success: true, data: data.filter(item => item.text) };
  }

  private async getFallbackFlightData(): Promise<any[]> {
    // Try scraping visible text and extracting flight-like patterns
    if (!this.page) return [];

    try {
      const textContent = await this.page.evaluate(() => {
        return document.body.innerText;
      });

      // Look for price patterns (₹, Rs, $)
      const priceRegex = /[₹$][\d,]+/g;
      const prices = textContent.match(priceRegex) || [];

      // Create basic results from found prices
      return prices.slice(0, 10).map((price, index) => ({
        airline: `Flight Option ${index + 1}`,
        price: price,
        departure: "Available",
        arrival: "Check details",
        duration: "N/A",
        stops: "Check details"
      }));
    } catch {
      return [];
    }
  }

  private async getFallbackJobData(): Promise<any[]> {
    if (!this.page) return [];

    console.log("⚠ Using fallback job extraction...");

    try {
      // Try to extract job-like content from the page
      const jobData = await this.page.evaluate(() => {
        const results: any[] = [];

        // Look for h2 or h3 tags that might be job titles
        const headings = document.querySelectorAll('h2, h3, h4');

        headings.forEach((heading, index) => {
          if (index >= 20) return;

          const text = heading.textContent?.trim() || '';

          // Filter out navigation and footer links
          const isValidJob = text.length > 10 &&
                           text.length < 150 &&
                           !text.toLowerCase().includes('skip to') &&
                           !text.toLowerCase().includes('sign in') &&
                           !text.toLowerCase().includes('user agreement') &&
                           !text.toLowerCase().includes('return home') &&
                           !text.toLowerCase().includes('help center') &&
                           !text.toLowerCase().includes('browse jobs') &&
                           !text.toLowerCase().includes('post your resume');

          if (isValidJob) {
            // Try to find nearby company/location info
            const parent = heading.closest('div, li, article, section');
            let company = '';
            let location = '';
            let salary = '';

            if (parent) {
              const parentText = parent.textContent || '';

              // Look for company name
              const companySpan = parent.querySelector('[class*="company"]');
              if (companySpan) {
                company = companySpan.textContent?.trim() || '';
              }

              // Look for location
              const locationSpan = parent.querySelector('[class*="location"]');
              if (locationSpan) {
                location = locationSpan.textContent?.trim() || '';
              }

              // Look for salary
              if (parentText.includes('$') || parentText.includes('₹')) {
                const salaryMatch = parentText.match(/[\$₹][\d,]+(?:\s*-\s*[\$₹][\d,]+)?/);
                if (salaryMatch) {
                  salary = salaryMatch[0];
                }
              }
            }

            results.push({
              title: text,
              company: company || 'Company not specified',
              location: location || 'Location not specified',
              type: 'See details',
              salary: salary || 'Not disclosed',
              posted: 'Recently'
            });
          }
        });

        return results;
      });

      console.log(`Fallback extracted ${jobData.length} potential jobs`);
      return jobData;
    } catch (error) {
      console.error("Fallback extraction error:", error);
      return [];
    }
  }

  private async getFallbackProductData(): Promise<any[]> {
    if (!this.page) return [];

    try {
      const textContent = await this.page.evaluate(() => {
        return document.body.innerText;
      });

      const priceRegex = /[₹$][\d,]+/g;
      const prices = textContent.match(priceRegex) || [];

      return prices.slice(0, 10).map((price, index) => ({
        name: `Product ${index + 1}`,
        price: price,
        rating: "N/A",
        reviews: "N/A",
        seller: "See details",
        availability: "Check listing"
      }));
    } catch {
      return [];
    }
  }

  private async scrollToLoadContent(): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight || totalHeight >= 3000) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      await delay(2000); // Wait for lazy-loaded content
    } catch (error) {
      console.error("Error scrolling:", error);
    }
  }

  async smartExtract(query: string): Promise<AutomationResult> {
    // Intelligent extraction based on query context
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    try {
      // Scroll to load all dynamic content
      await this.scrollToLoadContent();

      // Determine extraction type from query
      const lowerQuery = query.toLowerCase();

      if (lowerQuery.includes("flight") || lowerQuery.includes("ticket")) {
        return await this.extractFlightData();
      } else if (lowerQuery.includes("job") || lowerQuery.includes("hiring") || lowerQuery.includes("career")) {
        return await this.extractJobData();
      } else if (lowerQuery.includes("product") || lowerQuery.includes("buy") || lowerQuery.includes("price")) {
        return await this.extractProductData();
      } else {
        // Generic extraction
        return await this.extractGenericData("article, .card, .result, li");
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async simulateAction(action: BrowserAction): Promise<AutomationResult> {
    await delay(800 + Math.random() * 400);

    switch (action.type) {
      case "navigate":
        return {
          success: true,
          data: {
            url: action.url,
            title: "Sample Page Title",
          },
        };

      case "click":
        return {
          success: true,
          data: { clicked: action.selector, timestamp: new Date() },
        };

      case "type":
        return {
          success: true,
          data: { typed: action.value, field: action.selector },
        };

      case "extract":
        return {
          success: true,
          data: this.getMockData(action),
        };

      case "wait":
        return {
          success: true,
          data: { waited: action.waitFor || 1000 },
        };

      default:
        return { success: true, data: {} };
    }
  }

  private getMockData(action: BrowserAction): any {
    const selector = action.selector || "";

    if (selector.includes("flight") || selector.includes("result")) {
      return [
        {
          airline: "Air India",
          price: "₹8,450",
          departure: "10:30 AM",
          arrival: "1:45 PM",
          duration: "3h 15m",
          stops: "Non-stop",
        },
        {
          airline: "IndiGo",
          price: "₹7,890",
          departure: "2:15 PM",
          arrival: "5:30 PM",
          duration: "3h 15m",
          stops: "Non-stop",
        },
        {
          airline: "Emirates",
          price: "₹12,340",
          departure: "11:00 PM",
          arrival: "2:15 AM",
          duration: "3h 15m",
          stops: "Non-stop",
        },
      ];
    }

    if (selector.includes("job") || selector.includes("card")) {
      return [
        {
          title: "Senior React Developer",
          company: "Tech Mahindra",
          location: "Delhi, India",
          type: "Full-time",
          salary: "₹12-18 LPA",
          posted: "2 days ago",
        },
        {
          title: "React.js Developer",
          company: "Infosys",
          location: "Gurugram, Delhi NCR",
          type: "Full-time",
          salary: "₹10-15 LPA",
          posted: "1 week ago",
        },
        {
          title: "Frontend Developer (React)",
          company: "Wipro",
          location: "Noida, Delhi NCR",
          type: "Full-time",
          salary: "₹8-12 LPA",
          posted: "3 days ago",
        },
      ];
    }

    if (selector.includes("product") || selector.includes("item") || selector.includes("s-result")) {
      return [
        {
          name: "Apple iPhone 15 (128GB) - Black",
          price: "₹69,900",
          rating: "4.5",
          reviews: "2,847",
          seller: "Amazon.in",
          availability: "In Stock",
        },
        {
          name: "Apple iPhone 15 (256GB) - Blue",
          price: "₹79,900",
          rating: "4.6",
          reviews: "1,923",
          seller: "Appario Retail",
          availability: "In Stock",
        },
        {
          name: "Apple iPhone 15 (128GB) - Pink",
          price: "₹68,999",
          rating: "4.5",
          reviews: "1,456",
          seller: "Cloudtail India",
          availability: "Limited Stock",
        },
      ];
    }

    return [
      { result: "Sample data 1", relevance: "High" },
      { result: "Sample data 2", relevance: "Medium" },
      { result: "Sample data 3", relevance: "High" },
    ];
  }

  async takeScreenshot(): Promise<string | undefined> {
    if (this.isDemo) {
      return undefined;
    }

    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    try {
      const screenshot = await this.page.screenshot();
      return `data:image/png;base64,${screenshot.toString("base64")}`;
    } catch (error) {
      console.error("Error taking screenshot:", error);
      return undefined;
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
