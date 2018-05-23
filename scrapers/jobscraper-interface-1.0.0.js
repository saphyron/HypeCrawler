const ORM = require('../data/general-orm-1.0.0');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');
const regionModel = require('../model/region');


// Constants:
const ADVERTS_PER_PAGE = 20;

// Counters:

let currentRegionObject = 0;
let currentRegionID;
let current_requests = 0;


/**
 * Class representing a generic jobscraper algorithm.
 * @interface
 */
class JocscraperTemplate {
    /**
     * Constructor for JobscraperTemplate.
     * @constructor JobscraperTemplate
     *
     * @param {String}              targetWebsite           Website to be scraped. (format: https://www.xyz.ab)
     * @param {Map<key, value>}     regionNames             Map object to conform paths to database standard.
     * @param {String}              regionNames.key         Name of database entry.
     * @param {String}              regionNames.value       String containing site specific path to corresponding region.
     * @param {Object}              xPathVariations         Object containing HTML classes and paths to advertisements.
     * @param {String}              xPathTotalAdverts       XPath to node containing total adverts for region.
     * @param {RegExp}              numberRegex             Regex to filter the text containing the number of pages.
     * @param {int}                 pageTimeout             Integer setting timeout-time for page visits.
     */
    constructor(targetWebsite, regionNames, xPathVariations, xPathTotalAdverts, numberRegex, pageTimeout) {
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
    async beginScraping(page, browser, pageLimit, poolLimit) {
        this.PAGE_LIMIT = pageLimit;
        this.PAGE_POOL = new Pagepool(browser, poolLimit);
        try {
            for (let [key, value] of this.REGION_NAMES) {
                console.log(key.toString());
                currentRegionObject = await ORM.FindRegionID(key.toString());
                currentRegionID = currentRegionObject[0].region_id;

                console.log(`BEGINNING SCRAPING IN REGION: ${key}`);
                const REGION_PAGE_SELECTOR = `${this.TARGET_WEBSITE}${value}`;


                await page.goto(REGION_PAGE_SELECTOR, {
                    timeout: this.PAGE_TIMEOUT
                })
                    .catch((error) => {
                        throw new Error("Error at beginScraping → page.goto(): " + error);
                    });

                const NUM_PAGES = await this.getNumPages(page, ADVERTS_PER_PAGE);

                for (let pageNumber = 0; pageNumber < NUM_PAGES; pageNumber += this.PAGE_LIMIT) {
                    await this.scrapeRegion(page, browser, REGION_PAGE_SELECTOR, pageNumber, pageNumber
                        + this.PAGE_LIMIT);
                }
            }
        } catch (error) {
            console.log("Error at beginScraping → " + error);
        }
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
    async scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage) {
        return new Promise((resolve, reject) => {
            let resolveCounter = 0, rejectCounter = 0;
            let result = '';

            // Utility method to limit the amount of simultaneous running pages.
            let settlePromise = () => {
                if (resolveCounter + rejectCounter === (toPage - fromPage))
                    if (rejectCounter > 0)
                        reject(result);
                    else
                        resolve();
            };

            for (let index = fromPage; index < toPage; index++) {
                console.log('BEGINNING SCRAPING ON PAGE: ' + (index + 1));
                const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`?page=${index}`);

                this.getCurrentPageURLTitles(page, PAGE_SELECTOR)
                    .then((pageURLsAndTitles) => {
                        return this.scrapePageList(browser, pageURLsAndTitles, index)
                            .catch((error) => {
                                rejectCounter++;
                                result += "Error at scrapeRegion → scrapePageList: " + error + '\n';
                            })
                    })
                    .then(() => {
                        resolveCounter++;
                        settlePromise();
                    })
                    .catch((error) => {
                        rejectCounter++;
                        result += "Error at scrapeRegion → getCurrentPageURLTitles: " + error + '\n';
                        settlePromise();
                    });
            }
        });
    }

    /**
     * Gets a list of title/url pairs.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {Object}              page                    Current page to extract titles and urls from.
     * @param {String}              PAGE_SELECTOR           Formatted url to the page conataining the advertisement list.
     *
     * @returns {Promise<{PAGE_TITLES: Array, PAGE_URLS: Array}>} - Lists with titles and urls.
     */
    async getCurrentPageURLTitles(page, PAGE_SELECTOR) {
        try {
            await page.goto(PAGE_SELECTOR, {
                timeout: this.PAGE_TIMEOUT
            })
                .catch((value) => {
                    throw new Error("page.goto() → " + value);
                });

            let counter = 0;
            let titles = [], urls = [];

            while (titles.length === 0 && counter < this.PATH_VARIATIONS.length) {
                let currentObject = this.PATH_VARIATIONS[counter];
                let candidateObj = await this.tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS,
                    currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES);
                titles = candidateObj.titleList;
                urls = candidateObj.urlList;
                counter++;
            }

            if (titles.length === 0) {
                throw new Error("No valid path found!");
            }

            return {PAGE_TITLES: titles, PAGE_URLS: urls};
        } catch (error) {
            console.log("Error at getCurrentPageURLTitles() → " + error)
        }
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
    async tryPathVariationOnPage(page, titleClass, titleAttributes, urlClass, urlAttributes) {
        let titles = [], urls = [];
        try {
            // Sets the XPath to the elements.
            let xpathTitleData = await page.$x(`//div[@class="${titleClass}"]${titleAttributes}`)
                .catch((error) => {
                    throw new Error("page.$x(): " + error);
                });
            let xpathUrlData = await page.$x(`//div[@class="${urlClass}"]${urlAttributes}`)
                .catch((error) => {
                    throw new Error("page.$x(): " + error);
                });


            // Runs through all advertisements with XPath on current page.
            for (let i = 0; i < xpathTitleData.length; i++) {
                // Retrieving elements from specific advertisement.
                let xpathTitleTextContent = await xpathTitleData[i].getProperty('textContent')
                    .catch((error) => {
                        throw new Error("xpathTitleData.getProperty(): " + error);
                    });
                let xpathUrlTextContent = await xpathUrlData[i].getProperty('textContent')
                    .catch((error) => {
                        throw new Error("xpathUrlData.getProperty(): " + error);
                    });


                // Extracting the text values from gathered elements.
                let titleText = await xpathTitleTextContent.jsonValue()
                    .catch((error) => {
                        throw new Error("xpathTitleTextContent.getProperty(): " + error);
                    });
                let urlText = await xpathUrlTextContent.jsonValue()
                    .catch((error) => {
                        throw new Error("xpathUrlTextContent.getProperty(): " + error);
                    });


                // If one property is empty, the advertisement is invalid.
                if (titleText.length !== 0 && urlText !== 0) {
                    titles.push(titleText);
                    urls.push(urlText);
                }
            }
            return {titleList: titles, urlList: urls};
        } catch (error) {
            console.log("Error at getPageTitlesAndUrls() → " + error)
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
    scrapePageList(browser, PageTitlesAndURLObject, pageNum) {
        return new Promise((resolve, reject) => {
            let titleUrlList = PageTitlesAndURLObject;
            let length = titleUrlList.PAGE_TITLES.length;
            let resolveCounter = 0, rejectCounter = 0;
            let result = "";

            // utility method to limit the amount of simultaneous running pages.
            let settlePromise = (index) => {
                this.PAGE_POOL.releasePage(titleUrlList.PAGE_URLS[index]);
                if (resolveCounter + rejectCounter === length)
                    if (rejectCounter > 0)
                        reject(new Error(result));
                    else
                        resolve();
            };


            for (let index = 0; index < length; index++) {
                console.log('Run ' + (index + 1) + ': begun');
                let url = titleUrlList.PAGE_URLS[index];

                // Ignore pdf annoncer
                if (url && url.endsWith(".pdf")) {
                    resolveCounter++;
                    settlePromise(index);
                    continue;
                }

                // Do not scrape if already in database
                let sha1Checksum = sha1(`${url}`);

                ORM.FindChecksum(sha1Checksum)
                    .then((returnedChecksum) => {
                        if (returnedChecksum) { // advertisement exists
                            this.existingTotalCounter++;
                            resolveCounter++;
                            settlePromise(index);
                        }
                        else {
                            this.PAGE_POOL.reservePage(titleUrlList.PAGE_URLS[index])
                                .then((page) => {
                                    // Go to linked site and scrape it:
                                    return this.scrapePage(page, titleUrlList.PAGE_TITLES[index],
                                        titleUrlList.PAGE_URLS[index], (index + 1), pageNum)
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
                                    settlePromise(index);
                                    throw new Error("Error at scrapePageList() → " + error);
                                });
                        }
                    })
            }
        })
    }

    /**
     * Scrapes the provided page and invokes database call.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {Object}              page                    Browser tab from pagePool.
     * @param {String}              title                   Title of the linked page.
     * @param {String}              url                     Url of linked page.
     * @param {int}                 index                   Indicator of advertisement position in the list.
     * @param {int}                 pageNum                 Indicator of advertisement list page number in region.
     *
     * @returns {Promise<void>}
     */
    async scrapePage(page, title, url, index, pageNum) {
        //let newPage = undefined;
        let errorResult = undefined;
        console.time("runTime page number " + pageNum + " annonce " + index);

        try {
            await page.goto(url, {
                timeout: this.PAGE_TIMEOUT
            })
                .catch((error) => {
                    throw new Error("page.goto(): " + error);
                });

            // Filter the object and extract body as raw text.
            let bodyHTML = await page.evaluate(() => document.body.outerHTML)
                .catch((error) => {
                    throw new Error("newPage.evaluate(): " + error)
                });

            // Insert or update annonce to database:
            await this.insertAnnonce(title, bodyHTML, url)
                .catch((error) => {
                    throw new Error("insertAnnonce(" + url + "): " + error)
                });

        } catch (error) {
            errorResult = error;
        }

        if (errorResult) {
            this.errorTotalCounter++;
            console.log("Error at scrapePage(" + url + ") → " + errorResult);
        }

        console.timeEnd("runTime page number " + pageNum + " annonce " + index);
    }


//<editor-fold desc="HelperMethods">
    /**
     * Prints the statistics of the scrapers run.
     *
     * @since       1.0.0
     * @access      private
     */
    printDatabaseResult() {
        let totalEntries = this.successTotalCounter + this.existingTotalCounter + this.errorTotalCounter;

        console.log("\x1b[0m", '----------------------------------------------------------');
        console.log(`\t\t\t${this.TARGET_WEBSITE} SCRAPER STATISTIK`);
        console.log("\x1b[0m", '----------------------------------------------------------');
        console.log("\x1b[32m" + '\t\t\t' + this.successTotalCounter + ' OUT OF ' + totalEntries
            + ` (${Math.round(this.successTotalCounter / totalEntries) * 100} %) --- INSERTS`);
        console.log("\x1b[0m", '----------------------------------------------------------');

        console.log("\x1b[33m" + '\t\t\t' + this.existingTotalCounter + ' OUT OF ' + totalEntries
            + ` (${Math.round(this.existingTotalCounter / totalEntries) * 100} %) --- EXISTS`);
        console.log("\x1b[0m", '----------------------------------------------------------');
        console.log("\x1b[31m" + '\t\t\t' + this.errorTotalCounter + ' OUT OF ' + totalEntries
            + ` (${Math.round(this.errorTotalCounter / totalEntries) * 100} %) --- ERRORS`);

        console.log("\x1b[0m", '----------------------------------------------------------');
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
        try {
            const ADVERTS_PER_PAGE = listLength;

            // Collecting value string:
            let advertContent = await page.$x(this.PAGE_NUMBER_XPATH)
                .catch((error) => {
                    throw new Error("page.$x() → " + error);
                });


            // Extracting info.
            let rawText = await page.evaluate(element => element.textContent, advertContent[0])
                .catch((error) => {
                    throw new Error("page.evaluate() → " + error);
                });


            // Filtering number from text.
            let match = this.PAGE_NUMBER_TEXT_REGEX.exec(rawText); // Extract the captured group.
            let capturedNumberGroup = match[1].replace(".", "");


            // Calculating page numbers.
            let numPages = Math.ceil(capturedNumberGroup / ADVERTS_PER_PAGE);
            return numPages;
        } catch (error) {
            console.log("Error at getNumPages() → " + error);
        }
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
    insertAnnonce(annonceTitle, rawHTMLText, annonceURL) {
        return new Promise((resolve, reject) => {
            let sha1Checksum = sha1(`${annonceURL}`);

            ORM.FindChecksum(sha1Checksum)
                .then((result) => {
                    if (!result)
                        return this.createAnnonceModel(annonceTitle, rawHTMLText, currentRegionID, sha1Checksum, annonceURL)
                            .catch((error) => {
                                throw new Error("Already in database!" + error);
                            });
                    this.existingTotalCounter++;
                    resolve();
                })
                .then((newAnnonceModel) => {
                    if (newAnnonceModel)
                        return ORM.InsertAnnonce(newAnnonceModel)
                            .catch((error) => {
                                throw new Error("annonceModel failed" + error);
                            });

                })
                .then((result) => {
                    this.successTotalCounter++;
                    resolve(result);
                })
                .catch((error) => {
                    this.errorTotalCounter++;
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
    async createAnnonceModel(title, body, regionId = undefined, checksum, url) {
        return new Promise((resolve, reject) => {
            try {
                // Format Timestamp:
                let newDate = new Date();
                let timestampFormat = newDate.getFullYear() + '-' + (newDate.getMonth() < 9 ? '0' : '') +
                    (newDate.getMonth() + 1) + '-' + (newDate.getDate() < 9 ? '0' : '') + (newDate.getDate()) +
                    ' ' + newDate.getHours() + ':' + newDate.getMinutes() + ':' + newDate.getSeconds();


                // Model data into Annonce class:
                resolve(new annonceModel(title, body, regionId, timestampFormat, checksum.toString(), url));
            } catch (error) {
                reject("Error at createAnnonceModel() → " + error);
            }
        });
    }

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
 */
class Pagepool {

    constructor(browser, maxRequests) {
        this.browser = browser;
        this.MAX_REQUESTS = maxRequests;
        this.PAGE_POOL = [];
        this.REQUEST_QUEUE = [];
    }

    reservePage(url) {
        return new Promise((resolve, reject) => {
            if (this.PAGE_POOL.length < this.MAX_REQUESTS) {        // Check if there is room for another page
                let position = this.PAGE_POOL.length;
                this.PAGE_POOL[position] = {page: null, url: url};  // Reserve pool slot synchronously.
                this.browser.newPage()
                    .then((newPageObject) => {
                        this.PAGE_POOL[position] = {page: newPageObject, url: url};
                        resolve(newPageObject);
                    })
            }
            else {
                for (let page of this.PAGE_POOL) {                  // If pool is full, find empty page.
                    if (page.url === undefined) {
                        page.url = url;
                        resolve(page.page);
                        return;
                    }
                }
                // No empty page found, add to queue.
                this.REQUEST_QUEUE.push({url: url, resolve: resolve, reject: reject})
            }
        })
    }

    /**
     * Releases a page from the page pool.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {String}              url                     url to be released
     */
    releasePage(url) {
        for (let page of this.PAGE_POOL) {
            if (page.url === url) {                                 // Release the page object handling the given url
                page.url = undefined;
                if (this.REQUEST_QUEUE.length > 0) {                // Add a page from queue to pagepool
                    let object = this.REQUEST_QUEUE.shift();        // FIFO
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