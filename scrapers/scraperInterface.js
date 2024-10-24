/**
 * @file scraperInterface.js
 * @description Provides a base class `JocscraperTemplate` that serves as an interface for all scrapers.
 * It defines common methods and properties used by scraper subclasses to scrape different websites.
 * Includes methods for database interactions, page scraping, error handling, and resource management.
 */

const ORM = require("../database/databaseConnector"); // ORM for database operations
const sha1 = require("sha1"); // Library for generating SHA-1 hashes
const annonceModel = require("../model/annonce"); // Model for 'annonce' table entries
const regionModel = require("../model/region"); // Model for 'region' table entries

const ADVERTS_PER_PAGE = 20; // Default number of adverts per page
const regionCache = new Map(); // Cache to store region IDs for quick access

let currentRegionObject = 0; // Placeholder for current region object (unused)
let currentRegionID; // Variable to hold the current region ID
let current_requests = 0; // Counter for current requests (unused)

/**
 * Class `JocscraperTemplate` serves as an interface that all scrapers inherit from.
 * It provides common methods and properties needed for scraping job listings from various websites.
 */
class JocscraperTemplate {

  /**
   * Constructor initializes the scraper with specific configurations.
   *
   * @param {string} targetWebsite - The base URL of the target website to scrape.
   * @param {Map} regionNames - A map of region names to their corresponding URL paths.
   * @param {Array} xPathVariations - An array of objects defining different path variations for scraping.
   * @param {string} xPathTotalAdverts - XPath selector for the total number of adverts.
   * @param {RegExp} numberRegex - Regular expression to extract numbers from text.
   * @param {number} pageTimeout - Timeout value for page loading in milliseconds.
   */
  constructor(
    targetWebsite,
    regionNames,
    xPathVariations,
    xPathTotalAdverts,
    numberRegex,
    pageTimeout
  ) {
    this.TARGET_WEBSITE = targetWebsite; // Base URL of the target website
    this.REGION_NAMES = regionNames; // Map of region names and their URL paths
    this.PATH_VARIATIONS = xPathVariations; // Array of path variations for scraping
    this.PAGE_NUMBER_XPATH = xPathTotalAdverts; // XPath selector for total adverts
    this.PAGE_NUMBER_TEXT_REGEX = numberRegex; // Regex to extract numbers
    this.PAGE_TIMEOUT = pageTimeout; // Page load timeout
    this.PAGE_POOL = undefined; // Pool of pages for concurrent scraping
    this.PAGE_LIMIT = undefined; // Limit on number of pages to scrape
    this.successTotalCounter = 0; // Counter for successful inserts
    this.existingTotalCounter = 0; // Counter for existing entries
    this.errorTotalCounter = 0; // Counter for errors
  }

  /**
   * Establishes a connection to the database.
   *
   * @returns {Promise} - Resolves when the connection is established.
   */
  async connectDatabase() {
    return ORM.connectDatabase();
  }

  /**
   * Closes the database connection.
   *
   * @returns {Promise} - Resolves when the connection is closed.
   */
  async disconnectDatabase() {
    return ORM.disconnectDatabase();
  }

  /**
   * Begins the scraping process by iterating over regions and pages.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @param {object} browser - The Puppeteer browser instance.
   * @param {number} pageLimit - The maximum number of pages to scrape per region.
   * @param {number} poolLimit - The maximum number of concurrent page requests.
   * @param {string} scraperName - The name of the scraper.
   * @returns {Promise<void>}
   */
  async beginScraping(page, browser, pageLimit, poolLimit, scraperName) {
    this.PAGE_LIMIT = pageLimit; // Set the page limit
    this.PAGE_POOL = new Pagepool(browser, poolLimit); // Initialize the page pool

    // Iterate over each region in the REGION_NAMES map
    for (let [regionName, regionPath] of this.REGION_NAMES) {
      try {
        // Check if region ID is cached; if not, fetch and cache it
        if (!regionCache.has(regionName)) {
          const regionObject = await ORM.FindRegionID(regionName.toString());
          if (!regionObject || regionObject.length === 0) {
            console.log(`Region '${regionName}' not found in the database.`);
            continue; // Skip to next region if not found
          }
          regionCache.set(regionName, regionObject[0].region_id);
        }

        currentRegionID = regionCache.get(regionName); // Set the current region ID
        console.log(`BEGINNING SCRAPING IN REGION: ${regionName}`);

        const regionUrl = `${this.TARGET_WEBSITE}${regionPath}`; // Construct the region URL
        await page.goto(regionUrl, { timeout: this.PAGE_TIMEOUT }); // Navigate to the region URL

        // Determine the number of pages to scrape in the region
        const numPages = await this.getNumPages(page, ADVERTS_PER_PAGE);
        if (numPages === 0) {
          console.log(
            `No pages found for region ${regionName}. Skipping to next region.`
          );
          continue; // Skip to next region if no pages found
        }

        // Scrape pages in chunks defined by PAGE_LIMIT
        for (
          let pageNumber = 0;
          pageNumber < numPages;
          pageNumber += this.PAGE_LIMIT
        ) {
          await this.scrapeRegion(
            page,
            browser,
            regionUrl,
            pageNumber,
            pageNumber + this.PAGE_LIMIT,
            scraperName
          );
        }
      } catch (error) {
        console.log(`Error in region ${regionName}: ${error.message}`);
      }
    }
  }

  /**
   * Abstract method to get the page extension for pagination.
   * Must be implemented in subclasses.
   *
   * @param {number} pageNo - The current page number.
   * @throws Will throw an error if not implemented.
   */
  getPageExtension(pageNo) {
    throw new Error("Missing getPageExtension implementation");
  }

  /**
   * Scrapes a range of pages within a region.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @param {object} browser - The Puppeteer browser instance.
   * @param {string} REGION_PAGE_SELECTOR - The base URL of the region page.
   * @param {number} fromPage - The starting page number.
   * @param {number} toPage - The ending page number.
   * @param {string} scraperName - The name of the scraper.
   * @returns {Promise<string>} - Resolves when scraping is completed.
   */
  async scrapeRegion(
    page,
    browser,
    REGION_PAGE_SELECTOR,
    fromPage,
    toPage,
    scraperName
  ) {
    try {
      // Loop through the specified range of pages
      for (let index = fromPage; index < toPage; index++) {
        // Construct the page URL with pagination
        const PAGE_SELECTOR = `${REGION_PAGE_SELECTOR}${this.getPageExtension(
          index
        )}`;
        console.log(`Scraping page: ${index + 1}, URL: ${PAGE_SELECTOR}`);

        // Navigate to the page
        await page.goto(PAGE_SELECTOR, { timeout: this.PAGE_TIMEOUT });

        try {
          // Retrieve the titles and URLs from the current page
          const pageURLsAndTitles = await this.getCurrentPageURLTitles(
            page,
            PAGE_SELECTOR
          );

          // Scrape each listing on the page
          await this.scrapePageList(
            browser,
            pageURLsAndTitles,
            index,
            scraperName
          );
        } catch (error) {
          console.error(`Error processing page ${index + 1}: ${error}`);
        }
      }
      return "Scraping completed successfully.";
    } catch (error) {
      console.error(`Error in scrapeRegion: ${error}`);
      return `Error in scrapeRegion: ${error}`;
    }
  }

  /**
   * Retrieves the titles and URLs of job listings on the current page.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @param {string} PAGE_SELECTOR - The URL of the current page.
   * @returns {Promise<object>} - An object containing arrays of titles, URLs, and company URLs.
   * @throws Will throw an error if no valid path is found.
   */
  async getCurrentPageURLTitles(page, PAGE_SELECTOR) {
    const maxRetries = 3; // Maximum number of retries for page navigation
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(PAGE_SELECTOR, { timeout: this.PAGE_TIMEOUT }); // Navigate to the page
        break; // Exit the loop if successful
      } catch (error) {
        console.error(`Attempt ${attempt} failed for page.goto() → ${error}`);
        if (attempt === maxRetries) {
          throw new Error(
            `page.goto() failed after ${maxRetries} attempts → ${error}`
          );
        }
      }
    }

    let titles = [], // Array to store job titles
      urls = [], // Array to store job URLs
      companies = []; // Array to store company URLs (if available)
    let counter = 0; // Counter for path variations

    // Iterate over each path variation to find valid selectors
    while (counter < this.PATH_VARIATIONS.length) {
      let currentObject = this.PATH_VARIATIONS[counter];
      let candidateObj;

      try {
        // Check if COMPANY_XPATH_CLASS is defined in the current variation
        if (currentObject.COMPANY_XPATH_CLASS === undefined) {
          // Attempt to retrieve titles and URLs without company URLs
          candidateObj = await this.tryPathVariationOnPage(
            page,
            currentObject.TITLE_XPATH_CLASS,
            currentObject.TITLE_XPATH_ATTRIBUTES,
            currentObject.URL_XPATH_CLASS,
            currentObject.URL_XPATH_ATTRIBUTES
          );
        } else {
          // Attempt to retrieve titles, URLs, and company URLs
          candidateObj = await this.tryPathVariationOnPage(
            page,
            currentObject.TITLE_XPATH_CLASS,
            currentObject.TITLE_XPATH_ATTRIBUTES,
            currentObject.URL_XPATH_CLASS,
            currentObject.URL_XPATH_ATTRIBUTES,
            currentObject.COMPANY_XPATH_CLASS,
            currentObject.COMPANY_XPATH_ATTRIBUTES
          );
          companies.push(...candidateObj.companyUrls); // Append company URLs
        }

        titles.push(...candidateObj.titleList); // Append titles
        urls.push(...candidateObj.urlList); // Append URLs

        // Uncomment the following block if you want to stop after finding valid paths
        /*
        if (titles.length > 0 && urls.length > 0) {
          break;
        }
        */
      } catch (error) {
        console.error(`Error trying path variation ${counter}: `);
      }

      counter++; // Move to the next path variation
    }

    // Throw an error if no valid titles or URLs were found
    if (titles.length === 0 || urls.length === 0) {
      throw new Error("No valid path found!");
    }

    // Return the collected data
    return {
      PAGE_TITLES: titles,
      PAGE_URLS: urls,
      PAGE_COMPANY_URLS: companies,
    };
  }

  /**
   * Attempts to extract titles, URLs, and company URLs using a specific path variation.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @param {string} titleClass - CSS class for titles.
   * @param {string} titleAttributes - CSS selector for title attributes.
   * @param {string} urlClass - CSS class for URLs.
   * @param {string} urlAttributes - CSS selector for URL attributes.
   * @param {string} [companyClass] - CSS class for company URLs (optional).
   * @param {string} [companyAttributes] - CSS selector for company URL attributes (optional).
   * @returns {Promise<object>} - An object containing arrays of titles, URLs, and company URLs.
   * @throws Will throw an error if extraction fails.
   */
  async tryPathVariationOnPage(page, titleClass, titleAttributes, urlClass, urlAttributes, companyClass, companyAttributes) {
    // Construct selectors based on provided classes and attributes
    const titleSelector = `.${titleClass} ${titleAttributes}`;
    const urlSelector = `.${urlClass} ${urlAttributes}`;
    const companySelector = `.${companyClass} ${companyAttributes}`;

    try {
      // Navigate to the current page URL
      await page.goto(page.url(), { waitUntil: "networkidle2", timeout: this.PAGE_TIMEOUT });

      // Evaluate the page to extract titles, URLs, and company URLs
      const [titles, urls, companies] = await Promise.all([
        page.$$eval(titleSelector, elements => elements.map(el => el.textContent.trim())),
        page.$$eval(urlSelector, elements => elements.map(el => el.href.trim())),
        companyClass ? page.$$eval(companySelector, elements => elements.map(el => el.href.trim())) : []
      ]);

      // Check if titles and URLs were extracted successfully
      if (titles.length && urls.length) {
        return { titleList: titles, urlList: urls, companyUrls: companies };
      } else {
        throw new Error("No valid path found!");
      }
    } catch (error) {
      console.error(`Error in tryPathVariationOnPage for ${titleClass}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Processes a list of job listings by scraping each page.
   *
   * @param {object} browser - The Puppeteer browser instance.
   * @param {object} PageTitlesAndURLObject - Object containing arrays of titles, URLs, and company URLs.
   * @param {number} pageNum - The current page number.
   * @param {string} scraperName - The name of the scraper.
   * @returns {Promise<void>}
   */
  scrapePageList(browser, PageTitlesAndURLObject, pageNum, scraperName) {
    return new Promise((resolve, reject) => {
      let titleUrlList = PageTitlesAndURLObject;
      let length = titleUrlList.PAGE_TITLES.length;
      let resolveCounter = 0,
        rejectCounter = 0;
      let result = "";

      // Utility method to manage promises and resource release
      let settlePromise = (index) => {
        this.PAGE_POOL.releasePage(titleUrlList.PAGE_URLS[index]);
        if (resolveCounter + rejectCounter === length)
          if (rejectCounter > 0) reject(new Error(result));
          else resolve();
      };

      console.log("Scrape page " + (pageNum + 1) + " begun");

      // Iterate over each listing on the page
      for (let index = 0; index < length; index++) {
        let url = titleUrlList.PAGE_URLS[index];

        // Skip PDFs as they cannot be scraped as HTML
        if (url && url.endsWith(".pdf")) {
          resolveCounter++;
          settlePromise(index);
          continue;
        }

        // Generate a checksum for the URL
        let sha1Checksum = sha1(`${url}`);

        // Check if the listing already exists in the database
        ORM.FindChecksum(sha1Checksum).then(
          (returnedChecksum) => {
            if (returnedChecksum) {
              this.existingTotalCounter++;
              resolveCounter++;
              settlePromise(index);
            } else {
              // Reserve a page from the pool to scrape the listing
              this.PAGE_POOL.reservePage(titleUrlList.PAGE_URLS[index])
                .then((page) => {
                  // Scrape the listing page
                  return this.scrapePage(
                    page,
                    titleUrlList.PAGE_TITLES[index],
                    titleUrlList.PAGE_URLS[index],
                    titleUrlList.PAGE_COMPANY_URLS[index],
                    index + 1,
                    pageNum,
                    scraperName,
                    titleUrlList.PAGE_COMPANY_URLS[index]
                  );
                })
                .then(() => {
                  current_requests--; // Decrement the current requests counter
                  resolveCounter++;
                  settlePromise(index);
                })
                .catch((error) => {
                  current_requests--; // Decrement the current requests counter
                  rejectCounter++;
                  result += "Error at scrapePageList() → " + error + ", ";
                  settlePromise(index);
                });
            }
          },
          (error) => {
            rejectCounter++;
            result += "Error at scrapePageList() → " + error + ", ";
            settlePromise(index);
          }
        );
      }
    });
  }

  /**
   * Abstract method to scrape a single job listing page.
   * Must be implemented in subclasses.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @param {string} title - The title of the job listing.
   * @param {string} url - The URL of the job listing page.
   * @param {string|null} companyURL - The URL of the company page (optional).
   * @param {number} index - The index of the listing on the page.
   * @param {number} pageNum - The current page number.
   * @param {string} scraperName - The name of the scraper.
   * @param {string|null} companyUrlFromAnnonce - Company URL from the listing (optional).
   * @throws Will throw an error if not implemented.
   */
  async scrapePage(page, title, url, index, pageNum, scraperName, companyUrlFromAnnonce) {
    throw new Error("Missing scrapePage implementation");
  }

  /**
   * Prints a summary of the scraping results to the console.
   */
  printDatabaseResult() {
    let totalEntries =
      this.successTotalCounter +
      this.existingTotalCounter +
      this.errorTotalCounter;

    console.log("----------------------------------------------------------");
    console.log(`${this.TARGET_WEBSITE} SCRAPER STATISTICS`);
    console.log("----------------------------------------------------------");
    console.log(
      `${this.successTotalCounter} OUT OF ${totalEntries} (${
        Math.round((this.successTotalCounter / totalEntries) * 100)
      }%) --- INSERTS`
    );
    console.log("----------------------------------------------------------");
    console.log(
      `${this.existingTotalCounter} OUT OF ${totalEntries} (${
        Math.round((this.existingTotalCounter / totalEntries) * 100)
      }%) --- EXISTS`
    );
    console.log("----------------------------------------------------------");
    console.log(
      `${this.errorTotalCounter} OUT OF ${totalEntries} (${
        Math.round((this.errorTotalCounter / totalEntries) * 100)
      }%) --- ERRORS`
    );
    console.log("----------------------------------------------------------");
  }

  /**
   * Abstract method to determine the number of pages to scrape.
   * Must be implemented in subclasses.
   *
   * @async
   * @param {object} page - The Puppeteer page object.
   * @param {number} listLength - The number of adverts per page.
   * @throws Will throw an error if not implemented.
   */
  async getNumPages(page, listLength) {
    throw "getNumPages must be implemented for class";
  }

  /**
   * Inserts a job listing into the database after checking for duplicates.
   *
   * @param {string} annonceTitle - The title of the job listing.
   * @param {string} rawHTMLText - The raw HTML text of the job listing.
   * @param {string} annonceURL - The URL of the job listing.
   * @param {string|null} cvr - The CVR number associated with the listing (optional).
   * @param {string} scraperName - The name of the scraper.
   * @param {string|null} companyUrlFromAnnonce - Company URL from the listing (optional).
   * @returns {Promise<void>}
   */
  insertAnnonce(annonceTitle, rawHTMLText, annonceURL, cvr, scraperName, companyUrlFromAnnonce) {

    return new Promise((resolve, reject) => {
      let sha1Checksum = sha1(`${annonceURL}`); // Generate checksum for the URL
      ORM.FindChecksum(sha1Checksum)
        .then((result) => {
          if (!result)
            return this.createAnnonceModel(
              annonceTitle,
              rawHTMLText,
              currentRegionID,
              sha1Checksum,
              annonceURL,
              cvr,
              scraperName,
              null,
              null,
              companyUrlFromAnnonce
            ).catch((error) => {
              console.error("Error creating Annonce model: " + error);
              throw new Error("Error creating Annonce model: " + error);
            });
          this.existingTotalCounter++;
          resolve();
        })
        .then((newAnnonceModel) => {
          if (newAnnonceModel)
            return ORM.InsertAnnonce(newAnnonceModel).catch((error) => {
              console.error("Error inserting Annonce into database: " + error);
              throw new Error(
                "Error inserting Annonce into database: " + error
              );
            });
        })
        .then((result) => {
          console.log("Annonce inserted successfully");
          this.successTotalCounter++;
          resolve(result);
        })
        .catch((error) => {
          this.errorTotalCounter++;
          console.error("Error at insertAnnonce() → " + error);
          reject(new Error("Error at insertAnnonce() → " + error));
        });
    });
  }

  /**
   * Creates an instance of the Annonce model with the provided data.
   *
   * @async
   * @param {string} title - The title of the job listing.
   * @param {string} body - The body content of the job listing.
   * @param {number} [regionId] - The region ID associated with the listing.
   * @param {string} checksum - The checksum of the listing URL.
   * @param {string} url - The URL of the job listing.
   * @param {string|null} cvr - The CVR number (optional).
   * @param {string} scraperName - The name of the scraper.
   * @param {boolean|null} possible_duplicate - Flag for possible duplicates (optional).
   * @param {string|null} body_hash - Hash of the body content (optional).
   * @param {string|null} body_text - Text version of the body content (optional).
   * @param {string|null} companyUrlFromAnnonce - Company URL from the listing (optional).
   * @returns {Promise<object>} - Resolves with the new Annonce model instance.
   */
  async createAnnonceModel(
    title,
    body,
    regionId = undefined,
    checksum,
    url,
    cvr,
    scraperName,
    possible_duplicate,
    body_hash,
    body_text,
    companyUrlFromAnnonce
  ) {
    return new Promise((resolve, reject) => {
      try {
        // Get the current timestamp in 'YYYY-MM-DD HH:mm:ss' format
        let newDate = new Date();
        let timestampFormat =
          newDate.getFullYear() +
          "-" +
          (newDate.getMonth() < 9 ? "0" : "") +
          (newDate.getMonth() + 1) +
          "-" +
          (newDate.getDate() < 10 ? "0" : "") +
          newDate.getDate() +
          " " +
          (newDate.getHours() < 10 ? "0" : "") +
          newDate.getHours() +
          ":" +
          (newDate.getMinutes() < 10 ? "0" : "") +
          newDate.getMinutes() +
          ":" +
          (newDate.getSeconds() < 10 ? "0" : "") +
          newDate.getSeconds();

        // Create a new instance of the Annonce model
        resolve(
          new annonceModel(
            title,
            body,
            regionId,
            timestampFormat,
            checksum.toString(),
            url,
            cvr,
            scraperName,
            possible_duplicate,
            body_hash,
            body_text,
            companyUrlFromAnnonce
          )
        );
      } catch (error) {
        reject("Error at createAnnonceModel() → " + error);
      }
    });
  }

  /**
   * Initializes the database by creating necessary tables and inserting regions.
   *
   * @async
   * @returns {Promise<void>}
   */
  async initializeDatabase() {
    try {
      await ORM.CreateRegionTable(); // Create 'region' table if it doesn't exist
      await ORM.CreateAnnonceTable(); // Create 'annonce' table if it doesn't exist

      // Insert regions into the 'region' table
      for (let [key, value] of this.REGION_NAMES) {
        await ORM.InsertRegion(new regionModel(key));
      }
    } catch (error) {
      console.log("Error at initializeDatabase() → " + error);
    }
  }
}

/**
 * Class `Pagepool` manages a pool of Puppeteer page instances to limit concurrent requests.
 */
class Pagepool {
  /**
   * Constructor initializes the page pool with a maximum number of requests.
   *
   * @param {object} browser - The Puppeteer browser instance.
   * @param {number} maxRequests - The maximum number of concurrent page requests.
   */
  constructor(browser, maxRequests) {
    this.browser = browser; // Puppeteer browser instance
    this.MAX_REQUESTS = maxRequests; // Maximum concurrent requests
    this.PAGE_POOL = []; // Array to store pages in the pool
    this.REQUEST_QUEUE = []; // Queue for pending requests
  }

  /**
   * Reserves a page from the pool for scraping.
   *
   * @param {string} url - The URL to be processed.
   * @returns {Promise<object>} - Resolves with a Puppeteer page object.
   */
  reservePage(url) {
    return new Promise((resolve, reject) => {
      if (this.PAGE_POOL.length < this.MAX_REQUESTS) {
        let position = this.PAGE_POOL.length;
        this.PAGE_POOL[position] = { page: null, url: url }; // Reserve pool slot synchronously
        this.browser.newPage().then((newPageObject) => {
          this.PAGE_POOL[position] = { page: newPageObject, url: url };
          newPageObject.setJavaScriptEnabled(true).then(() => {
            newPageObject
              .setExtraHTTPHeaders({
                // Handling of correct reading of Danish alphabet
                "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7",
              })
              .then(() => {
                resolve(newPageObject);
              });
          });
        });
      } else {
        // If the pool is full, add the request to the queue
        for (let page of this.PAGE_POOL) {
          if (page.url === undefined) {
            page.url = url;
            resolve(page.page);
            return;
          }
        }

        this.REQUEST_QUEUE.push({ url: url, resolve: resolve, reject: reject });
      }
    });
  }

  /**
   * Releases a page back to the pool after scraping is complete.
   *
   * @param {string} url - The URL that was processed.
   */
  releasePage(url) {
    for (let page of this.PAGE_POOL) {
      if (page.url === url) {
        // Release the page object handling the given URL
        page.url = undefined;
        if (this.REQUEST_QUEUE.length > 0) {
          // Assign a pending request to the now-available page
          let object = this.REQUEST_QUEUE.shift(); // FIFO
          page.url = object.url;
          object.resolve(page.page);
        }
      }
    }
  }
}

// Export the JocscraperTemplate class for use in other scraper modules
module.exports = JocscraperTemplate;
