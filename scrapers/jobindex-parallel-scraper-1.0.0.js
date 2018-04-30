// Imports:
const ORM = require('../data/general-orm-1.0.0');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');
const regionModel = require('../model/region');

// XPath selectors:
const TARGET_WEBSITE = 'https://www.jobindex.dk';

// Constants:
let PAGE_LIMIT;
const ADVERTS_PER_PAGE = 20;
const AREA_NAMES = ['storkoebenhavn', 'nordsjaelland', 'region-sjaelland', 'fyn', 'region-nordjylland',
    'region-midtjylland', 'sydjylland', 'bornholm', 'skaane', 'groenland', 'faeroeerne', 'udlandet'];
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
let successCounter = 0, existingCounter = 0, errorCounter = 0;
let currentRegionObject = 0;
let currentRegionID;

/**
 * Entry-point method used by main-method for access to the scraper.
 * @param {Object} page - Represents a tab in Chromium browser.
 * @param {Object} browser - The Chromium browser.
 * @param {Integer} pageLimit - User provided safeguard for parallel run.
 * @returns {Promise<void>}
 */
async function beginScraping(page, browser, pageLimit) {
    PAGE_LIMIT = pageLimit;
    try {
        for (let i = 0; i < AREA_NAMES.length; i++) {
            currentRegionObject = await ORM.FindRegionID(AREA_NAMES[i]);

            currentRegionID = currentRegionObject[0].region_id;

            console.log(`BEGINNING SCRAPING IN REGION: ${AREA_NAMES[i]}`);
            const REGION_PAGE_SELECTOR = `${TARGET_WEBSITE}/jobsoegning/${AREA_NAMES[i]}`;


            await page.goto(REGION_PAGE_SELECTOR)
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

async function scrapeRegion(page, browser, REGION_PAGE_SELECTOR, from, to) {
    return new Promise((resolve, reject) => {
        let resolveCounter = 0, rejectCounter = 0;
        let result = '';

        // Helpermethod: To limit the amount of simultaneous running pages.
        let returnIfNeeded = () => {
            if (resolveCounter + rejectCounter === (to - from))
                if (rejectCounter > 0)
                    reject(result);
                else
                    resolve(result);
        };

        for (let index = from; index < to; index++) {
            console.log('BEGINNING SCRAPING ON PAGE: ' + index);
            const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`?page=${index}`);

            getCurrentPageURLTitles(page, PAGE_SELECTOR)
                .then((pageURLsAndTitles) => {
                    scrapePageList(page, browser, pageURLsAndTitles, index)
                        .then(() => {
                            resolveCounter++;
                            returnIfNeeded();
                        })
                        .catch((value) => {
                            resolveCounter++;
                            returnIfNeeded();
                            result += "Error at scrapeRegion → scrapePageList: " + value + '\n';
                        });
                })
                .catch((value) => {
                    result += "Error at scrapeRegion → getCurrentPageURLTitles: " + value + '\n';
                })
        }
    });
}

async function scrapePage(browser, title, url, index, pageNum) {
    try {
        console.time("runTime page number " + pageNum + " annonce " + index);

        let newPage = await browser.newPage()
            .catch((value) => {
                throw new Error("browser.newPage(): " + value)
            });

        await newPage.goto(url, {
            timeout: 600000
        })
            .catch((value) => {
                throw new Error("page.goto(): " + value);
            });


        const LINKED_SITE_BODY = await newPage.$x('/html/body/*[not(self::script)]')
            .catch((value) => {
                throw new Error("newpage.$x(): " + value)
            });

        let rawBodyText = await newPage.evaluate(element => element.textContent, LINKED_SITE_BODY[0])
            .catch((value) => {
                throw new Error("browser.newPage(): " + value)
            });

        // Insert or update annonce to database:
        await insertAnnonce(title, rawBodyText, url);

        await newPage.close();
        console.timeEnd("runTime page number " + pageNum + " annonce " + index);
    } catch (e) {
        console.log("Error at scrapePage() → " + e);
    }
}


async function scrapePageList(page, browser, PageTitlesAndURLObject, pageNum) {
    let cur = PageTitlesAndURLObject;
    try {
        for (let index = 0; index < cur.PAGE_TITLES.length; index++) {
            console.log('Run ' + (index + 1) + ': begun');


            // Goto linked site and scrape it:
            scrapePage(browser, cur.PAGE_TITLES[index], cur.PAGE_URLS[index], (index + 1), pageNum)
                .catch((value) => {
                    console.log(value);
                    errorCounter++;
                });
        }
    } catch (e) {
        console.log("Error at scrapePageList() → " + e)

    }
}

async function getPageTitlesAndUrls(page, titleClass, titleAttributes, urlClass, urlAttributes) {
    try {
        let xpathTitleData = await page.$x(`//div[@class="${titleClass}"]${titleAttributes}`)
            .catch(() => {
                throw new Error("page.$x(): " + value);
            });
        let xpathUrlData = await page.$x(`//div[@class="${urlClass}"]${urlAttributes}`)
            .catch(() => {
                throw new Error("page.$x(): " + value);
            });

        let titles = [], urls = [];
        for (let i = 0; i < xpathTitleData.length; i++) {
            let xpathTitleTextContent = await xpathTitleData[i].getProperty('textContent');
            let xpathUrlTextContent = await xpathUrlData[i].getProperty('textContent');

            let titleText = await xpathTitleTextContent.jsonValue();
            let urlText = await xpathUrlTextContent.jsonValue();

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

async function getCurrentPageURLTitles(page, PAGE_SELECTOR) {
    try {
        await page.goto(PAGE_SELECTOR)
            .catch((value) => {
                throw new Error("page.goto() → " + value);
            });

        let counter = 0;
        let titles = [], urls = [];

        while (titles.length === 0 && counter < PATH_VARIATIONS.length) {
            let currentObject = PATH_VARIATIONS[counter];
            let candidateObj = await getPageTitlesAndUrls(page, currentObject.TITLE_XPATH_CLASS,
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


//<editor-fold desc="HelperMethods">

function printDatabaseResult() {
    let totalEntries = successCounter + existingCounter + errorCounter;

    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log('\t\t\tJOBINDEX.DK SCRAPER STATISTIK');
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[32m" + '\t\t\t' + successCounter + ' OUT OF ' + totalEntries
        + ` (${(successCounter / totalEntries) * 100} %) --- INSERTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');

    console.log("\x1b[33m" + '\t\t\t' + existingCounter + ' OUT OF ' + totalEntries
        + ` (${(existingCounter / totalEntries) * 100} %) --- EXISTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[31m" + '\t\t\t' + errorCounter + ' OUT OF ' + totalEntries
        + ` (${(errorCounter / totalEntries) * 100} %) --- ERRORS`);

    console.log("\x1b[0m", '----------------------------------------------------------');
}

async function getNumPages(page, listLength) {
    try {
        const TEXT_FILTER_REGEX = /[^0-9]/g;
        const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';
        const ADVERTS_PER_PAGE = listLength;

        let advertContent = await page.$x(TOTAL_ADVERTS_SELECTOR)                               // Collecting the part.
            .catch((value) => {
                throw new Error("page.$x → " + value);
            });
        let rawText = await page.evaluate(element => element.textContent, advertContent[0])    // Extracting info.
            .catch((value) => {
                throw new Error("page.evaluate → " + value);
            });
        let filteredText = rawText.replace(TEXT_FILTER_REGEX, '');                      // Filtering number from text.

        let numPages = Math.ceil(filteredText / ADVERTS_PER_PAGE);                      // Calculating page numbers.
        return numPages;
    } catch (error) {
        console.log("Error at getNumPages() → " + error);
    }
}

async function insertAnnonce(annonceTitle, rawBodyText, annonceURL) {
    try {
        if (annonceTitle === '') return;
        let sha1Checksum = sha1(`${annonceTitle}${annonceURL}`);
        let callResult = await ORM.FindChecksum(sha1Checksum);

        if (callResult.length === 0) {
            let newAnnonceModel = await createAnnonceModel(annonceTitle, rawBodyText, currentRegionID, sha1Checksum
                , annonceURL);
            await ORM.InsertAnnonce(newAnnonceModel);
            successCounter++;
        }
        else {
            //console.log('ALREADY IN DATABASE!')// Do nothing - TODO create update method.
            existingCounter++;
        }
    } catch (error) {
        console.log("Error at insertAnnonce() → " + error);
    }


}

async function createAnnonceModel(title, body, regionId = null, checksum, url) {
    return new Promise((resolve) => {
        // Format Timestamp:
        let newDate = new Date();
        let timestampFormat = newDate.getFullYear() + '-' + (newDate.getMonth() < 9 ? '0' : '') +
            (newDate.getMonth() + 1) + '-' + (newDate.getDate() < 9 ? '0' : '') + (newDate.getDate()) +
            ' ' + newDate.getHours() + ':' + newDate.getMinutes() + ':' + newDate.getSeconds();

        // model data into Annonce class:
        resolve(new annonceModel(title, body, regionId, timestampFormat, checksum.toString(), url));
    });
}

async function initializeDatabase() {
    try {
        await ORM.CreateRegionTable();
        await ORM.CreateAnnonceTable();

        // Insert the regions:
        for (let element of AREA_NAMES) {
            await ORM.InsertRegion(new regionModel(element));
        }
    } catch (error) {
        console.log("Error at initializeDatabase() → " + error);
    }
}

//</editor-fold>


module.exports = {
    beginScraping: beginScraping,
    initializeDatabase: initializeDatabase
};