/**
 * @file jobindexArchieveScraper.js
 * @description Scraper class for extracting archived job listings from Jobindex.dk.
 * This class extends the ScraperInterface and implements methods specific to scraping the archive section of Jobindex.
 * It allows custom search criteria with custom region names/IDs and handles the differences in the archive's structure compared to the standard view.
 */

let ScraperInterface = require("../scrapers/scraperInterface"); // Import the base ScraperInterface class

// The base URL of the target website to scrape
const TARGET_WEBSITE = "https://www.jobindex.dk";

// A map of region names to their corresponding URL paths on Jobindex archive
const REGION_NAMES = new Map([
  /*[
    "ESG",
    "/jobsoegning?maxdate=20240630&mindate=20240101&jobage=archive&q=ESG",
  ],
  [
    "ESG2",
    "/jobsoegning?maxdate=20191120&mindate=20180101&jobage=archive&q=ESG",
  ],*/
  ["nordsjaelland", "/jobsoegning/nordsjaelland?jobage=6"],
  ["region-sjaelland", "/jobsoegning/region-sjaelland?jobage=6"],
  ["fyn", "/jobsoegning/fyn?jobage=6"],
  ["region-nordjylland", "/jobsoegning/region-nordjylland?jobage=6"],
  ["sydjylland", "/jobsoegning/sydjylland?jobage=6"],
  ["bornholm", "/jobsoegning/bornholm?jobage=6"],
  ["skaane", "/jobsoegning/skaane?jobage=6"],
  ["groenland", "/jobsoegning/groenland?jobage=6"],
  ["udlandet", "/jobsoegning/udlandet?jobage=6"],
  ["faeroeerne", "/jobsoegning/faeroeerne?jobage=6"],
  ["region-midtjylland", "/jobsoegning/region-midtjylland?jobage=6"],
  ["storkoebenhavn", "/jobsoegning/storkoebenhavn?jobage=6"],
  // Any regions below this are Temporary search criteria
  // Aim is to have extended functionality in future that allows for custom search criteria
  //['cyber', '/jobsoegning?maxdate=20240731&mindate=20240101&jobage=archive&q=it-sikkerhed+%27cyber+security%27'],
  //['ESG', 'https://www.jobindex.dk/jobsoegning?maxdate=20240630&mindate=20240101&jobage=archive&q=ESG'],
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
 * JobindexArchiveScraper class extends the ScraperInterface to implement scraping logic specific to Jobindex.dk archive.
 */
class JobindexArchiveScraper extends ScraperInterface {
  /**
   * Constructor initializes the scraper with specific configurations for Jobindex.dk archive.
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
   * Overrides the getPageExtension method to return the correct page number parameter for Jobindex archive pagination.
   *
   * @param {number} pageNo - The current page number (zero-based index).
   * @returns {string} - The page extension adjusted for Jobindex's pagination (one-based index).
   */
  getPageExtension(pageNo) {
    // Jobindex pages start from 1, so we increment the zero-based pageNo
    return `&page=${pageNo + 1}`;
  }

  /**
   * Determines the total number of pages to scrape for a given region in the archive.
   * Parses the total number of job listings and calculates the number of pages based on listings per page.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @returns {Promise<number>} - The total number of pages to scrape.
   * @throws Will throw an error if it fails to determine the number of pages.
   */
  async getNumPages(page) {
    let numPages;
    const baseUrl = page.url(); // Get the base URL

    await page.goto(baseUrl, { waitUntil: "networkidle2" }); // Navigate to the base URL and wait until the network is idle
    try {
      console.log(
        "Attempting to find the total number of pages using CSS selector..."
      );
      // Evaluate the page to extract the total number of jobs
      const pageRefs = await page.evaluate(() => {
        const element = document.querySelector(
          "h1.jobsearch-header.color-current.mb-0.h2"
        );

        if (element) {
          const text = element.textContent.trim();

          const match = text.match(/[\d.]+/);
          if (match) {
            const numberString = match[0].replace(/\./g, "");
            const number = parseInt(numberString, 10);
            console.log('Total jobs: ', number);
            const resultsPerPage = 20;
            const pages = Math.ceil(number / resultsPerPage);
            console.log('Total pages: ', pages);
            return pages;
          } else {
            console.log("No number found in the text.");
          }
        } else {
          console.log("Element not found.");
        }
        console.log(pageRefs);
        return null;
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
   * Scrapes a single job listing page from the archive and inserts the data into the database.
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
   * @param {string} scraperName - The name of the scraper ("JobindexArchiveScraper").
   * @returns {Promise<void>}
   */
  async scrapePage(page, title, url, companyURL, index, pageNum, scraperName) {
    let errorResult = undefined;
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
          break; // Exit loop for other types of errors
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

// Export the JobindexArchiveScraper class for use in other modules
module.exports = JobindexArchiveScraper;
