/**
 * @file jobindexScraper.js
 * @description Scraper class for extracting job listings from Jobindex.dk.
 * This class extends the ScraperInterface and implements methods specific to scraping Jobindex.
 * It handles pagination, error retries, data extraction, and CVR number retrieval from company pages.
 */

let ScraperInterface = require("./scraperInterface"); // Import the base ScraperInterface class

// The base URL of the target website to scrape
const TARGET_WEBSITE = "https://www.jobindex.dk";

// A map of region names to their corresponding URL paths on Jobindex
const REGION_NAMES = new Map([
  ["nordsjaelland", "/jobsoegning/nordsjaelland?jobage=1"],
  ["region-sjaelland", "/jobsoegning/region-sjaelland?jobage=1"],
  ["fyn", "/jobsoegning/fyn?jobage=1"],
  ["region-nordjylland", "/jobsoegning/region-nordjylland?jobage=1"],
  ["sydjylland", "/jobsoegning/sydjylland?jobage=1"],
  ["bornholm", "/jobsoegning/bornholm?jobage=1"],
  ["skaane", "/jobsoegning/skaane?jobage=1"],
  ["groenland", "/jobsoegning/groenland?jobage=1"],
  ["udlandet", "/jobsoegning/udlandet?jobage=1"],
  ["faeroeerne", "/jobsoegning/faeroeerne?jobage=1"],
  ["region-midtjylland", "/jobsoegning/region-midtjylland?jobage=1"],
  ["storkoebenhavn", "/jobsoegning/storkoebenhavn?jobage=1"],
]);

// Configuration for different path variations used in scraping
const PATH_VARIATIONS = [
  {
    URL_XPATH_CLASS: "PaidJob-inner", // CSS class for paid job listings
    URL_XPATH_ATTRIBUTES: "h4 a[href]", // CSS selector for job URLs
    TITLE_XPATH_CLASS: "PaidJob-inner", // CSS class for job titles
    TITLE_XPATH_ATTRIBUTES: "h4 a", // CSS selector for job titles
    COMPANY_XPATH_CLASS: "jix-toolbar-top__company", // CSS class for company links
    COMPANY_XPATH_ATTRIBUTES: "a[href]", // CSS selector for company URLs
  },
  {
    URL_XPATH_CLASS: "jix_robotjob-inner", // CSS class for robot job listings
    URL_XPATH_ATTRIBUTES: "h4 a[href]", // CSS selector for job URLs
    TITLE_XPATH_CLASS: "jix_robotjob-inner", // CSS class for job titles
    TITLE_XPATH_ATTRIBUTES: "h4 a", // CSS selector for job titles
    COMPANY_XPATH_CLASS: "jix_robotjob-inner", // CSS class for company links
    COMPANY_XPATH_ATTRIBUTES: "h4 a[href]", // CSS selector for company URLs
  },
];

// Selector and regex pattern to extract the total number of adverts
const TOTAL_ADVERTS_SELECTOR =
  '//*[@class="results"]/div/div/div/div[1]/h2/text()'; // XPath selector for total adverts
const TOTAL_ADVERTS_REGEX = /(\d*\.?\d*)/g; // Regex to extract numbers

// Timeout settings for page navigation and requests
const PAGE_TIMEOUT = 60000; // Timeout for page loading in milliseconds

/**
 * JobindexScraper class extends the ScraperInterface to implement scraping logic specific to Jobindex.dk.
 */
class JobindexScraper extends ScraperInterface {
  /**
   * Constructor initializes the scraper with specific configurations for Jobindex.dk.
   * It calls the parent class constructor with the appropriate parameters.
   */
  constructor() {
    super(
      TARGET_WEBSITE,
      REGION_NAMES,
      PATH_VARIATIONS,
      TOTAL_ADVERTS_SELECTOR,
      TOTAL_ADVERTS_REGEX,
      PAGE_TIMEOUT
    );
  }

  /**
   * Overrides the getPageExtension method to return the correct page number parameter for Jobindex pagination.
   *
   * @param {number} pageNo - The current page number (zero-based index).
   * @returns {string} - The page extension adjusted for Jobindex's pagination (one-based index).
   */
  getPageExtension(pageNo) {
    // Jobindex pages start from 1, so we increment the zero-based pageNo
    return `&page=${pageNo + 1}`;
  }

  /**
   * Determines the total number of pages to scrape for a given region.
   * Parses the pagination elements and calculates the number of pages.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @returns {Promise<number>} - The total number of pages to scrape.
   * @throws Will throw an error if it fails to determine the number of pages.
   */
  async getNumPages(page) {
    let numPages;
    const baseUrl = page.url(); // Get the base URL
    //console.log("baseUrl: " + baseUrl);
    await page.goto(baseUrl, { waitUntil: "networkidle2" }); // Navigate to the base URL and wait until the network is idle
    try {
      console.log(
        "Attempting to find the total number of pages using CSS selector..."
      );
      // Evaluate the page to extract pagination information
      const pageRefs = await page.evaluate(() => {
        const selector =
          "div.jix_pagination.jix_pagination_wide ul.pagination li.page-item a"; // CSS selector for pagination links
        const elements = document.querySelectorAll(selector); // Select all pagination elements
        if (elements.length === 0) {
          return null; // No pagination found
        }
        const lastPageElement = elements[elements.length - 2]; // Second to last element is the last page number
        console.log("Last page element:", lastPageElement);
        return lastPageElement ? lastPageElement.textContent : null; // Return the text content of the last page element
      });

      if (!pageRefs) {
        console.log(
          "No pagination elements found. Assuming there is only 1 page."
        );
        numPages = 1; // Default to 1 page if no pagination is found
      } else {
        console.log("Found the pagination element:", pageRefs);
        numPages = parseInt(pageRefs, 10); // Parse the number of pages
        if (isNaN(numPages)) {
          throw new Error("Failed to parse the number of pages.");
        }
      }
    } catch (error) {
      console.error("Error while collecting num of pages element:", error);
      throw new Error("document.querySelector() → " + error);
    }

    console.log("Total number of pages:", numPages);
    return numPages; // Return the total number of pages
  }

  /**
   * Scrapes a single job listing page and inserts the data into the database.
   * Implements retry logic for handling network errors and SSL issues.
   * Also attempts to extract the CVR number from the company page.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @param {string} title - The title of the job listing.
   * @param {string} url - The URL of the job listing page.
   * @param {string|null} companyURL - The URL of the company page.
   * @param {number} index - The index of the job listing on the current page.
   * @param {number} pageNum - The current page number.
   * @param {string} scraperName - The name of the scraper ("Jobindex").
   * @returns {Promise<void>}
   */
  async scrapePage(page, title, url, companyURL, index, pageNum, scraperName) {
    let errorResult = undefined; // Variable to store any errors encountered
    let retries = 3; // Number of retries allowed for HTTP/2 errors
    let http1Retries = 2; // Number of retries allowed for HTTP/1.1
    let retryDelay = 1000; // Initial delay between retries in milliseconds
    let backoffFactor = 2; // Multiplier for exponential backoff
    let useHttp1 = false; // Flag to force HTTP/1.1 if HTTP/2 fails

    // Start a timer to measure how long the scraping of this page takes
    console.time("runTime page number " + pageNum + " annonce " + index);

    // Loop to implement retry logic
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // If previous attempts failed due to HTTP/2 errors, force HTTP/1.1
        if (useHttp1 && attempt > retries) {
          console.log(
            `Retrying with HTTP/1.1, attempt ${
              attempt - retries
            } of ${http1Retries}`
          );
          await page.setExtraHTTPHeaders({
            "Upgrade-Insecure-Requests": "1",
          });
        }

        // Navigate to the job listing page with a timeout
        await page.goto(url, {
          timeout: this.PAGE_TIMEOUT,
        });

        // Extract the body text of the page or wait for the 'body' selector
        let bodyHTML = await Promise.race([
          page.evaluate(() => document.body.innerText),
          page.waitForSelector("body", { timeout: this.PAGE_TIMEOUT }),
        ]);

        // Check if the body content is a string
        if (typeof bodyHTML !== "string") {
          throw new Error("newPage.evaluate() TIMEOUT");
        }

        let companyUrlFromAnnonce = companyURL; // Store the company URL from the announcement
        let cvr = undefined; // CVR number to be extracted from the company page

        // If a company URL is provided, attempt to extract the CVR number
        if (companyURL !== undefined) {
          if (!companyURL.startsWith("http")) {
            throw new Error("Invalid Company URL: " + companyURL);
          }

          // Navigate to the company page
          await page.goto(companyURL, {
            timeout: this.PAGE_TIMEOUT,
          });

          // Extract the outer HTML of the company page
          let companyHTML = await Promise.race([
            page.evaluate(() => document.body.outerHTML),
            page.waitForSelector("body", { timeout: 60000 }),
          ]);

          // Regular expression to match the CVR number
          let cvrRegexp = /DK([0-9]{8})/g;
          let match = cvrRegexp.exec(companyHTML);
          cvr = match ? match[1] : undefined; // Extract the CVR number if found
        }

        console.log(
          `Attempting to insert with body length: ${bodyHTML.length}`
        );

        // Insert the scraped data into the database
        await this.insertAnnonce(
          title,
          bodyHTML,
          url,
          cvr,
          scraperName,
          companyUrlFromAnnonce
        );
        break; // Exit the retry loop on success
      } catch (error) {
        // Handle specific error types for retries
        if (
          error.message.includes("net::ERR_HTTP2_PROTOCOL_ERROR") ||
          error.message.includes("net::ERR_HTTP2_INADEQUATE_TRANSPORT_SECURITY")
        ) {
          console.error(`HTTP/2 error at ${url}: ${error.message}`);

          if (!useHttp1) {
            console.log("Retrying with HTTP/1.1...");
            useHttp1 = true; // Set flag to force HTTP/1.1 on next attempt
          } else if (attempt <= retries + http1Retries) {
            console.log(`Retrying in ${retryDelay / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay)); // Wait before retrying
            retryDelay *= backoffFactor; // Apply exponential backoff
          } else {
            console.error(
              `Failed after ${retries + http1Retries} attempts: ${
                error.message
              }`
            );
            errorResult = error; // Store the error to handle after loop
          }
        } else if (error.message.includes("net::ERR_CONNECTION_CLOSED")) {
          console.error(`Connection closed error at ${url}: ${error.message}`);

          if (attempt < retries + http1Retries) {
            console.log(`Retrying in ${retryDelay / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay)); // Wait before retrying
            retryDelay *= backoffFactor; // Apply exponential backoff
          } else {
            console.error(
              `Failed after ${retries + http1Retries} attempts: ${
                error.message
              }`
            );
            errorResult = error; // Store the error to handle after loop
          }
        } else if (error.message.includes("net::ERR_CERT_DATE_INVALID")) {
          console.error(`SSL certificate error at ${url}: ${error.message}`);
          console.log(
            "Inserting the record with an empty body due to SSL issue."
          );

          // Insert the record with an empty body due to SSL issue
          await this.insertAnnonce(
            title,
            "",
            url,
            null,
            scraperName,
            companyUrlFromAnnonce
          );
          break; // Exit loop after handling SSL issue
        } else {
          // For other types of errors, store the error and exit the loop
          errorResult = error;
          break;
        }
      }
    }

    // If there was an error after all retries, increment the error counter and log it
    if (errorResult) {
      this.errorTotalCounter++;
      console.log(`Error at scrapePage(${url}) → ${errorResult}`);
    }

    // End the timer and log how long the scraping of this page took
    console.timeEnd("runTime page number " + pageNum + " annonce " + index);
  }
}

// Export the JobindexScraper class for use in other modules
module.exports = JobindexScraper;
