// Imports:
const ORM = require('../data/general-orm-1.0.0');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');
const regionModel = require('../model/region');
const pagePool = require('./pagepool');


// XPath selectors:
const TARGET_WEBSITE = 'https://www.jobindex.dk';

// Puppeteer
let PAGE_POOL = undefined;

// Constants:

let current_requests = 0;

let PAGE_LIMIT;
const PAGE_TIMEOUT = 30000;
const ADVERTS_PER_PAGE = 20;
const REGION_NAMES = ['faeroeerne', 'region-midtjylland', 'storkoebenhavn', 'nordsjaelland', 'region-sjaelland', 'fyn', 'region-nordjylland',
    'sydjylland', 'bornholm', 'skaane', 'groenland', 'udlandet'];
const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'PaidJob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'PaidJob',
        TITLE_XPATH_ATTRIBUTES: '/a/*[1]'
    },
    {
        URL_XPATH_CLASS: 'jix_robotjob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'jix_robotjob',
        TITLE_XPATH_ATTRIBUTES: '/a/strong'
    }
];

// Counters:
let successTotalCounter = 0, existingTotalCounter = 0, errorTotalCounter = 0;
let currentRegionObject = 0;
let currentRegionID;

/**
 * Entry-point method used by main-method for access to the scraper.
 * @param {Object} page - Represents a tab in Chromium browser.
 * @param {Object} browser - The Chromium browser.
 * @param {int} pageLimit - User provided safeguard for parallel run.
 * @returns {Promise<void>}
 */
async function beginScraping(page, browser, pageLimit) {
    PAGE_LIMIT = pageLimit;
    PAGE_POOL = new pagePool(browser);

    try {
        for (let i = 0; i < REGION_NAMES.length; i++) {
            currentRegionObject = await ORM.FindRegionID(REGION_NAMES[i]);
            currentRegionID = currentRegionObject[0].region_id;

            console.log(`BEGINNING SCRAPING IN REGION: ${REGION_NAMES[i]}`);
            const REGION_PAGE_SELECTOR = `${TARGET_WEBSITE}/jobsoegning/${REGION_NAMES[i]}`;


            await page.goto(REGION_PAGE_SELECTOR, {
                timeout: PAGE_TIMEOUT
            })
                .catch((value) => {
                    throw new Error("Error at beginScraping → page.goto(): " + value);
                });

            const NUM_PAGES = await getNumPages(page, ADVERTS_PER_PAGE);

            for (let pageNumber = 0; pageNumber < NUM_PAGES; pageNumber += PAGE_LIMIT) {
                await scrapeRegion(page, browser, REGION_PAGE_SELECTOR, pageNumber, pageNumber + PAGE_LIMIT);
            }
        }
    } catch (error) {
        console.log("Error at beginScraping → " + error);
    }
}

/**
 * Scrapes the region provided by REGION_PAGE_SELECTOR argument.
 * @param {Object} page                      - Page tab created in browser.
 * @param {Object} browser                   - Browser created in main.
 * @param {String} REGION_PAGE_SELECTOR      - Generic XPath to website handle that contains all advertisement lists.
 * @param {int}    fromPage                  - Current page number.
 * @param {int}    toPage                    - Upper limit for parallel scraper.
 * @returns {Promise<String>}                - A string to indicate if any errors have been thrown.
 */
async function scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage) {
    return new Promise((resolve, reject) => {
        let resolveCounter = 0, rejectCounter = 0;
        let result = '';

        // Helpermethod: To limit the amount of simultaneous running pages.
        let settlePromise = () => {
            if (resolveCounter + rejectCounter === (toPage - fromPage))
                if (rejectCounter > 0)
                    reject(result);
                else
                    resolve();
        };

        for (let index = fromPage; index < toPage; index++) {
            console.log('BEGINNING SCRAPING ON PAGE: ' + index);
            const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`?page=${index}`);

            getCurrentPageURLTitles(page, PAGE_SELECTOR)
                .then((pageURLsAndTitles) => {
                    return scrapePageList(browser, pageURLsAndTitles, index)
                })
                .then(() => {
                    resolveCounter++;
                    settlePromise();
                }, (error) => {
                    rejectCounter++;
                    result += "Error at scrapeRegion → scrapePageList: " + error + '\n';
                    settlePromise();
                })
                .catch((error) => {
                    rejectCounter++;
                    result += "Error at scrapeRegion → getCurrentPageURLTitles: " + error + '\n';
                    settlePromise();
                })
                .finally(() => {

                });
        }
    });
}

/**
 * Gets a list of title/url pairs.
 * @param {Object} page - Current page to extract titles and urls from.
 * @param {String} PAGE_SELECTOR - Formatted url to the page conataining the advertisement list.
 * @returns {Promise<{PAGE_TITLES: Array, PAGE_URLS: Array}>} - Lists with titles and urls.
 */
async function getCurrentPageURLTitles(page, PAGE_SELECTOR) {
    try {
        await page.goto(PAGE_SELECTOR, {
            timeout: PAGE_TIMEOUT
        })
            .catch((value) => {
                throw new Error("page.goto() → " + value);
            });

        let counter = 0;
        let titles = [], urls = [];

        while (titles.length === 0 && counter < PATH_VARIATIONS.length) {
            let currentObject = PATH_VARIATIONS[counter];
            let candidateObj = await tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS,
                currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES);
            titles = candidateObj.titleList;
            urls = candidateObj.urlList;
            counter++;
        }

        return {PAGE_TITLES: titles, PAGE_URLS: urls}; // TODO Håndter object i scrapePageListV3
    } catch (error) {
        console.log("Error at getCurrentPageURLTitles() → " + error)
    }
}

/**
 * Tries the path variations defined in PATH_VARIATIONS on the current page.
 * @param {Object} page             - The current page the scraper has reached.
 * @param {String} titleClass       - XPath to the general element in which we are searching.
 * @param {String} titleAttributes  - XPath to the specific children og titleClass XPath.
 * @param {String} urlClass         - XPath to the element where the text representation of url is kept.
 * @param {String} urlAttributes    - XPath to the specific child which keeps the text
 * @returns {Promise<{titleList: Array, urlList: Array}>}
 */
async function tryPathVariationOnPage(page, titleClass, titleAttributes, urlClass, urlAttributes) {
    let titles = [], urls = [];
    let titleUrlMap = new Map();
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


            // Extracting the text values out from gathered elements.
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
                titleUrlMap.set(titleText, urlText);
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
 * @param {Object} browser - Browser to access creating new pages.
 * @param {Object} PageTitlesAndURLObject - Object containing titles and urls.
 * @param {int} pageNum - Current page number which we are searching.
 * @returns {Promise<void>}
 */
function scrapePageList(browser, PageTitlesAndURLObject, pageNum) {
    return new Promise((resolve, reject) => {
        let titleUrlList = PageTitlesAndURLObject;
        let length = titleUrlList.PAGE_TITLES.length;
        let resolveCounter = 0, rejectCounter = 0;
        let result = "";

        // utility method to limit the amount of simultaneous running pages.
        let settlePromise = (index) => {
            PAGE_POOL.releasePage(titleUrlList.PAGE_URLS[index]);
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
                    if (returnedChecksum) {
                        existingTotalCounter++;
                        resolveCounter++;
                        settlePromise(index);
                    }
                    else {
                        PAGE_POOL.reservePage(titleUrlList.PAGE_URLS[index])
                            .then((page) => {
                                // Go to linked site and scrape it:
                                return scrapePage(page, titleUrlList.PAGE_TITLES[index], titleUrlList.PAGE_URLS[index],
                                    (index + 1), pageNum)
                            })
                            .then(() => {
                                // Update resolves
                                resolveCounter++;
                            })
                            .catch((error) => {
                                // Update rejects and throw error
                                rejectCounter++;
                                throw new Error("Error at scrapePageList() → " + error);
                            })
                            .finally(() => {
                                // Free resources
                                current_requests--;
                                settlePromise(index);
                            });

                    }

                })
        }
    })
}

/**
 * Scrapes the provided page and invokes database call.
 * @param {Object} page             - browser tab from pagePool.
 * @param {String} title            - Title of the linked page.
 * @param {String} url              - Url of linked page.
 * @param {int} index               - Indicator of advertisement position in the list.
 * @param {int} pageNum             - Indicator of advertisement list page number in region.
 * @returns {Promise<void>}
 */
async function scrapePage(page, title, url, index, pageNum) {
    //let newPage = undefined;
    let errorResult = undefined;
    console.time("runTime page number " + pageNum + " annonce " + index);

    try {
        await page.goto(url, {
            timeout: PAGE_TIMEOUT
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
        await insertAnnonce(title, bodyHTML, url)
            .catch((error) => {
                throw new Error("insertAnnonce(" + url + "): " + error)
            });

    } catch (error) {
        errorResult = error;
    }

    if (errorResult) {
        errorTotalCounter++;
        console.log("Error at scrapePage(" + url + ") → " + errorResult);
    }

    console.timeEnd("runTime page number " + pageNum + " annonce " + index);
}

//<editor-fold desc="HelperMethods">

function printDatabaseResult() {
    let totalEntries = successTotalCounter + existingTotalCounter + errorTotalCounter;

    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log('\t\t\tJOBINDEX.DK SCRAPER STATISTIK');
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[32m" + '\t\t\t' + successTotalCounter + ' OUT OF ' + totalEntries
        + ` (${Math.round(successTotalCounter / totalEntries) * 100} %) --- INSERTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');

    console.log("\x1b[33m" + '\t\t\t' + existingTotalCounter + ' OUT OF ' + totalEntries
        + ` (${Math.round(existingTotalCounter / totalEntries) * 100} %) --- EXISTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[31m" + '\t\t\t' + errorTotalCounter + ' OUT OF ' + totalEntries
        + ` (${Math.round(errorTotalCounter / totalEntries) * 100} %) --- ERRORS`);

    console.log("\x1b[0m", '----------------------------------------------------------');
}

/**
 * Extracts the text containing the innerHTML which holds the number of pages in the region.
 * @param page
 * @param listLength
 * @returns {Promise<number>}
 */
async function getNumPages(page, listLength) {
    try {
        const TEXT_FILTER_REGEX = /[^0-9]/g;
        const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';
        const ADVERTS_PER_PAGE = listLength;

        let advertContent = await page.$x(TOTAL_ADVERTS_SELECTOR)                               // Collecting the part.
            .catch((error) => {
                throw new Error("page.$x() → " + error);
            });

        let rawText = await page.evaluate(element => element.textContent, advertContent[0])    // Extracting info.
            .catch((error) => {
                throw new Error("page.evaluate() → " + error);
            });
        let filteredText = rawText.replace(TEXT_FILTER_REGEX, '');                      // Filtering number from text.

        let numPages = Math.ceil(filteredText / ADVERTS_PER_PAGE);                      // Calculating page numbers.
        return numPages;
    } catch (error) {
        console.log("Error at getNumPages() → " + error);
    }
}

function insertAnnonce(annonceTitle, rawBodyText, annonceURL) {
    return new Promise((resolve, reject) => {
        let sha1Checksum = sha1(`${annonceURL}`);

        ORM.FindChecksum(sha1Checksum)
            .then((result) => {
                if (!result)
                    return createAnnonceModel(annonceTitle, rawBodyText, currentRegionID, sha1Checksum, annonceURL)
                        .catch((error) => {
                            throw new Error("Already in database!" + error);
                        });
                existingTotalCounter++;
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
                successTotalCounter++;
                resolve(result);
            })
            .catch((error) => {
                //console.log('ALREADY IN DATABASE!')// Do nothing - TODO create update method.
                errorTotalCounter++;
                reject(new Error("Error at insertAnnonce() → " + error));
            });
    });
}

async function createAnnonceModel(title, body, regionId = null, checksum, url) {
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

async function initializeDatabase() {
    try {
        await ORM.CreateRegionTable();
        await ORM.CreateAnnonceTable();

        // Insert the regions:
        for (let element of REGION_NAMES) {
            await ORM.InsertRegion(new regionModel(element));
        }
    } catch (error) {
        console.log("Error at initializeDatabase() → " + error);
    }
}

//</editor-fold>


module.exports = {
    beginScraping: beginScraping,
    initializeDatabase: initializeDatabase,
    printDatabaseResult: printDatabaseResult
};