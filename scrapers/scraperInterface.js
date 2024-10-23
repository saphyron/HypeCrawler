const ORM = require("../database/databaseConnector");
//const ORM = require('../data/general-orm-1.0.1-pool');
const sha1 = require("sha1");
const annonceModel = require("../model/annonce");
const regionModel = require("../model/region");

// Constants:
const ADVERTS_PER_PAGE = 20;
const regionCache = new Map();

// Counters:

let currentRegionObject = 0;
let currentRegionID;
let current_requests = 0;

// TODO: Document the file. Add comments to the code.

/**
 * Class representing a generic jobscraper algorithm.
 * @interface
 */
class JocscraperTemplate {
  /**
   * Constructor for JobscraperTemplate.
   *
   * @since       1.0.0
   * @access      public
   * @constructor JobscraperTemplate
   *
   * @param {String}              targetWebsite           Website to be scraped.(format: https://www.xyz.ab)
   * @param {Map<key, value>}     regionNames             Map object to conform paths to database standard.
   * @param {String}              regionNames.key         Name of database entry.
   * @param {String}              regionNames.value       String containing site specific path to corresponding region.
   * @param {Object}              xPathVariations         Object containing HTML classes and paths to advertisements.
   * @param {String}              xPathTotalAdverts       XPath to node containing total adverts for region.
   * @param {RegExp}              numberRegex             Regex to filter the text containing the number of pages.
   * @param {int}                 pageTimeout             Integer setting timeout-time for page visits.
   */
  constructor(
    targetWebsite,
    regionNames,
    xPathVariations,
    xPathTotalAdverts,
    numberRegex,
    pageTimeout
  ) {
    this.TARGET_WEBSITE = targetWebsite;
    this.REGION_NAMES = regionNames;
    this.PATH_VARIATIONS = xPathVariations;
    this.PAGE_NUMBER_XPATH = xPathTotalAdverts;
    this.PAGE_NUMBER_TEXT_REGEX = numberRegex;
    this.PAGE_TIMEOUT = pageTimeout;
    this.PAGE_POOL = undefined;
    this.PAGE_LIMIT = undefined;
    this.successTotalCounter = 0;
    this.existingTotalCounter = 0;
    this.errorTotalCounter = 0;
  }

  async connectDatabase() {
    return ORM.connectDatabase();
  }

  async disconnectDatabase() {
    return ORM.disconnectDatabase();
  }

  /**
   * Entry-point method used by main-module for access to the scraper.
   *
   * @since       1.0.0
   * @access      public
   *
   * @param {Object}              page                    Represents a tab in Chromium browser.
   * @param {Object}              browser                 The Chromium browser object.
   * @param {int}                 pageLimit               Limit on how many pages is queued at a time.
   * @param {int}                 poolLimit               Size of pool for simultaneous running pages.
   *
   * @returns {Promise<void>}
   */
  async beginScraping(page, browser, pageLimit, poolLimit, scraperName) {
    this.PAGE_LIMIT = pageLimit;
    this.PAGE_POOL = new Pagepool(browser, poolLimit);

    for (let [regionName, regionPath] of this.REGION_NAMES) {
      try {
        if (!regionCache.has(regionName)) {
          const regionObject = await ORM.FindRegionID(regionName.toString());
          if (!regionObject || regionObject.length === 0) {
            console.log(`Region '${regionName}' not found in the database.`);
            continue;
          }
          regionCache.set(regionName, regionObject[0].region_id);
        }

        currentRegionID = regionCache.get(regionName);
        console.log(`BEGINNING SCRAPING IN REGION: ${regionName}`);

        const regionUrl = `${this.TARGET_WEBSITE}${regionPath}`;
        await page.goto(regionUrl, { timeout: this.PAGE_TIMEOUT });

        const numPages = await this.getNumPages(page, ADVERTS_PER_PAGE);
        if (numPages === 0) {
          console.log(
            `No pages found for region ${regionName}. Skipping to next region.`
          );
          continue;
        }

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

  getPageExtension(pageNo) {
    throw new Error("Missing getPageExtension implementation");
  }

  /**
   * Scrapes the region provided by REGION_PAGE_SELECTOR argument.
   *
   * @since       1.0.0
   * @access      private
   *
   * @param {Object}              page                    Page tab created in browser.
   * @param {Object}              browser                 Browser created in main.
   * @param {String}              REGION_PAGE_SELECTOR    Generic XPath to website handle that contains all.
   *                                                      Advertisement lists.
   * @param {int}                 fromPage                Current page number.
   * @param {int}                 toPage                  Upper limit for parallel scraper.
   *
   * @returns {Promise<String>}                           a string to indicate if any errors have been thrown.
   */
  //sequential processing version.
  async scrapeRegion(
    page,
    browser,
    REGION_PAGE_SELECTOR,
    fromPage,
    toPage,
    scraperName
  ) {
    try {
      for (let index = fromPage; index < toPage; index++) {
        const PAGE_SELECTOR = `${REGION_PAGE_SELECTOR}${this.getPageExtension(
          index
        )}`;
        console.log(`Scraping page: ${index + 1}, URL: ${PAGE_SELECTOR}`);

        // Reuse the same page for each iteration
        await page.goto(PAGE_SELECTOR, { timeout: this.PAGE_TIMEOUT });

        try {
          const pageURLsAndTitles = await this.getCurrentPageURLTitles(
            page,
            PAGE_SELECTOR
          );
          
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

  async getCurrentPageURLTitles(page, PAGE_SELECTOR) {
    const maxRetries = 3; // Maximum number of retries
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(PAGE_SELECTOR, { timeout: this.PAGE_TIMEOUT });
        break; // Exit the loop if the page loads successfully
      } catch (error) {
        console.error(`Attempt ${attempt} failed for page.goto() → ${error}`);
        if (attempt === maxRetries) {
          throw new Error(
            `page.goto() failed after ${maxRetries} attempts → ${error}`
          );
        }
      }
    }

    let titles = [],
      urls = [],
      companies = [];
    let counter = 0;

    while (counter < this.PATH_VARIATIONS.length) {
      let currentObject = this.PATH_VARIATIONS[counter];
      let candidateObj;

      try {
        if (currentObject.COMPANY_XPATH_CLASS === undefined) {
          candidateObj = await this.tryPathVariationOnPage(
            page,
            currentObject.TITLE_XPATH_CLASS,
            currentObject.TITLE_XPATH_ATTRIBUTES,
            currentObject.URL_XPATH_CLASS,
            currentObject.URL_XPATH_ATTRIBUTES
          );
        } else {
          candidateObj = await this.tryPathVariationOnPage(
            page,
            currentObject.TITLE_XPATH_CLASS,
            currentObject.TITLE_XPATH_ATTRIBUTES,
            currentObject.URL_XPATH_CLASS,
            currentObject.URL_XPATH_ATTRIBUTES,
            currentObject.COMPANY_XPATH_CLASS,
            currentObject.COMPANY_XPATH_ATTRIBUTES
          );
          companies.push(...candidateObj.companyUrls);
        }

        titles.push(...candidateObj.titleList);
        urls.push(...candidateObj.urlList);

        /*// Stop if we find valid titles and URLs
        if (titles.length > 0 && urls.length > 0) {
          break;
        }*/
      } catch (error) {
        console.error(`Error trying path variation ${counter}: `);
      }

      counter++;
    }

    if (titles.length === 0 || urls.length === 0) {
      throw new Error("No valid path found!");
    }

    return {
      PAGE_TITLES: titles,
      PAGE_URLS: urls,
      PAGE_COMPANY_URLS: companies,
    };
  }

  /**
   * Tries the path variations defined in PATH_VARIATIONS on the current page.
   *
   * @since       1.0.0
   * @access      private
   *
   * @param {Object}              page                    The current page the scraper has reached.
   * @param {String}              titleClass              XPath to the general element in which we are searching.
   * @param {String}              titleAttributes         XPath to the specific children of titleClass XPath.
   * @param {String}              urlClass                XPath to the element where the text representation of url is kept.
   * @param {String}              urlAttributes           XPath to the specific child which keeps the text
   *
   * @returns {Promise<{titleList: Array, urlList: Array}>}
   */

  async tryPathVariationOnPage(page, titleClass, titleAttributes, urlClass, urlAttributes, companyClass, companyAttributes) {
    const titleSelector = `.${titleClass} ${titleAttributes}`;
    const urlSelector = `.${urlClass} ${urlAttributes}`;
    const companySelector = `.${companyClass} ${companyAttributes}`;
  
    try {
      await page.goto(page.url(), { waitUntil: "networkidle2", timeout: this.PAGE_TIMEOUT });
  
      const [titles, urls, companies] = await Promise.all([
        page.$$eval(titleSelector, elements => elements.map(el => el.textContent.trim())),
        page.$$eval(urlSelector, elements => elements.map(el => el.href.trim())),
        companyClass ? page.$$eval(companySelector, elements => elements.map(el => el.href.trim())) : []
      ]);
  
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
   * Iterates through provided titles and urls.
   *
   * @since       1.0.0
   * @access      private
   *
   * @param {Object}              browser                 Browser to access creating new pages.
   * @param {Object}              PageTitlesAndURLObject  Object containing titles and urls.
   * @param {int}                 pageNum                 Current page number which we are searching.
   *
   * @returns {Promise<void>}
   */
  scrapePageList(browser, PageTitlesAndURLObject, pageNum, scraperName) {
    return new Promise((resolve, reject) => {
      let titleUrlList = PageTitlesAndURLObject;
      let length = titleUrlList.PAGE_TITLES.length;
      let resolveCounter = 0,
        rejectCounter = 0;
      let result = "";
      // utility method to limit the amount of simultaneous running pages.
      let settlePromise = (index) => {
        this.PAGE_POOL.releasePage(titleUrlList.PAGE_URLS[index]);
        if (resolveCounter + rejectCounter === length)
          if (rejectCounter > 0) reject(new Error(result));
          else resolve();
      };

      console.log("Scrape page " + (pageNum + 1) + " begun");
      for (let index = 0; index < length; index++) {
        let url = titleUrlList.PAGE_URLS[index];

        // Ignore pdf annoncer
        if (url && url.endsWith(".pdf")) {
          resolveCounter++;
          settlePromise(index);
          continue;
        }

        // Do not scrape if already in database
        let sha1Checksum = sha1(`${url}`);

        ORM.FindChecksum(sha1Checksum).then(
          (returnedChecksum) => {
            if (returnedChecksum) {
              // advertisement exists
              this.existingTotalCounter++;
              resolveCounter++;
              settlePromise(index);
            } else {
              this.PAGE_POOL.reservePage(titleUrlList.PAGE_URLS[index])
                .then((page) => {
                  // Go to linked site and scrape it:
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
                  // Update resolves
                  current_requests--;
                  resolveCounter++;
                  settlePromise(index);
                })
                .catch((error) => {
                  // Update rejects and throw error
                  current_requests--;
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

  async scrapePage(page, title, url, index, pageNum, scraperName, companyUrlFromAnnonce) {
    throw new Error("Missing scrapePage implementation");
  }

  //<editor-fold desc="HelperMethods">
  /**
   * Prints the statistics of the scrapers run.
   *
   * @since       1.0.0
   * @access      private
   */
  printDatabaseResult() {
    let totalEntries =
      this.successTotalCounter +
      this.existingTotalCounter +
      this.errorTotalCounter;

    console.log("----------------------------------------------------------");
    console.log(`${this.TARGET_WEBSITE} SCRAPER STATISTIK`);
    console.log("----------------------------------------------------------");
    console.log(
      `${this.successTotalCounter} OUT OF ${totalEntries} (${
        Math.round(this.successTotalCounter / totalEntries) * 100
      } %) --- INSERTS`
    );
    console.log("----------------------------------------------------------");
    console.log(
      `${this.existingTotalCounter} OUT OF ${totalEntries} (${
        Math.round(this.existingTotalCounter / totalEntries) * 100
      } %) --- EXISTS`
    );
    console.log("----------------------------------------------------------");
    console.log(
      `${this.errorTotalCounter} OUT OF ${totalEntries} (${
        Math.round(this.errorTotalCounter / totalEntries) * 100
      } %) --- ERRORS`
    );
    console.log("----------------------------------------------------------");
  }

  /**
   * Extracts the text containing the innerHTML which holds the number of pages in the region.
   *
   * @since       1.0.0
   * @access      private
   *
   * @param page
   * @param listLength
   * @returns {Promise<number>}
   */
  async getNumPages(page, listLength) {
    throw "getNumPages must be implemented for class";
  }

  /**
   * Inserts the given data into the database as a Annonce model.
   *
   * @since       1.0.0
   * @access      private
   *
   * @param {String}              annonceTitle            title of the advertisement
   * @param {String}              rawHTMLText             raw advertisement html
   * @param {String}              annonceURL              url pointing to the advertisement
   *
   * @returns {Promise<any>}
   */
  insertAnnonce(annonceTitle, rawHTMLText, annonceURL, cvr, scraperName, companyUrlFromAnnonce) {
    //console.log("Inserting Annonce:", { annonceTitle, annonceURL, cvr, scraperName, companyUrlFromAnnonce });
    return new Promise((resolve, reject) => {
      let sha1Checksum = sha1(`${annonceURL}`);
      ORM.FindChecksum(sha1Checksum)
        .then((result) => {
          //console.log("Checksum found:", result);
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
          //console.log(newAnnonceModel);
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
   * Converts raw data into Annonce model
   *
   * @since       1.0.0
   * @access      private
   *
   * @param {String}              title                   title of advertisement
   * @param {String}              body                    html body of advertisement
   * @param {int}                 regionId                region of advertisement
   * @param {String}              checksum                url converted to SHA-1 checksum
   * @param {String}              url                     url of advertisement
   *
   * @returns {Promise<any>}
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
        // Format Timestamp:
        let newDate = new Date();
        let timestampFormat =
          newDate.getFullYear() +
          "-" +
          (newDate.getMonth() < 9 ? "0" : "") +
          (newDate.getMonth() + 1) +
          "-" +
          (newDate.getDate() < 9 ? "0" : "") +
          newDate.getDate() +
          " " +
          newDate.getHours() +
          ":" +
          newDate.getMinutes() +
          ":" +
          newDate.getSeconds();

        // Model data into Annonce class:
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
   * Utility method to create and initialize relevant database tables.
   *
   * @since       1.0.0
   * @access      private
   *
   * @returns {Promise<any>}
   */
  async initializeDatabase() {
    try {
      await ORM.CreateRegionTable();
      await ORM.CreateAnnonceTable();

      // Insert regions:
      for (let [key, value] of this.REGION_NAMES) {
        await ORM.InsertRegion(new regionModel(key));
      }
    } catch (error) {
      console.log("Error at initializeDatabase() → " + error);
    }
  }

  //</editor-fold>
}

//<editor-fold desc="Utility Classes">
/**
 * Class representing a pool of pages and associated handles available to the scraper.
 * @class
 */
class Pagepool {
  constructor(browser, maxRequests) {
    this.browser = browser;
    this.MAX_REQUESTS = maxRequests;
    this.PAGE_POOL = [];
    this.REQUEST_QUEUE = [];
  }

  /**
   * Reserves a pagepool slot or queues a page for future handling.
   *
   * @since       1.0.0
   * @access      private
   *
   * @param {String}              url                     url to be released
   */
  reservePage(url) {
    return new Promise((resolve, reject) => {
      if (this.PAGE_POOL.length < this.MAX_REQUESTS) {
        // Check if there is room for creating a new page.
        let position = this.PAGE_POOL.length;
        this.PAGE_POOL[position] = { page: null, url: url }; // Reserve pool slot synchronously.
        this.browser.newPage().then((newPageObject) => {
          this.PAGE_POOL[position] = { page: newPageObject, url: url };
          newPageObject.setJavaScriptEnabled(true).then(() => {
            newPageObject
              .setExtraHTTPHeaders({
                // Handling of correct reading of danish alphabet
                "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7",
              })
              .then(() => {
                resolve(newPageObject);
              });
          });
        });
      } else {
        for (let page of this.PAGE_POOL) {
          // If a page is idle, put url in page.
          if (page.url === undefined) {
            page.url = url;
            resolve(page.page);
            return;
          }
        }
        // No idle page found, add to queue.
        this.REQUEST_QUEUE.push({ url: url, resolve: resolve, reject: reject });
      }
    });
  }

  /**
   * Releases a page from the page pool and queues a new one if page queue is not empty.
   *
   * @since       1.0.0
   * @access      private
   *
   * @param {String}              url                     url to be released
   */
  releasePage(url) {
    for (let page of this.PAGE_POOL) {
      if (page.url === url) {
        // Release the page object handling the given url
        page.url = undefined;
        if (this.REQUEST_QUEUE.length > 0) {
          // Add a page from queue to pagepool
          let object = this.REQUEST_QUEUE.shift(); // FIFO
          page.url = object.url;
          object.resolve(page.page);
        }
      }
    }
  }
}

//</editor-fold>

// Varies:

module.exports = JocscraperTemplate;
