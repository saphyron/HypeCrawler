const ORM = require('../data/general-orm-1.0.0');
const puppeteer = require('puppeteer');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');
const regionModel = require('../model/region');


// Constants:
let PAGE_LIMIT;
const ADVERTS_PER_PAGE = 20;
let currentRegionObject, currentRegionID;

/**
 * Class representing a generic jobscraper algorithm.
 */
class JocscraperTemplate {

    /**
     * Constructor for JobscraperTemplate.
     * @class JobscraperTemplate
     *
     * @param {String}              targetWebsite           website to be scraped (ex. https://www.xyz.ab)
     * @param {Map<key, value>}     regionNames             map object to conform to database standard
     * @param {String}              regionNames.key         name of database entry
     * @param {String}              regionNames.value       string containing path to corresponding region
     * @param {Object}              xPathVariations         object containing HTML classes and paths to advertisements
     * @param {String}              numberRegex             regex to filter the text containing the number of pages
     */
    constructor(targetWebsite, regionNames, xPathVariations, numberRegex) {
        const TARGET_WEBSITE = targetWebsite;
        const REGION_NAMES = regionNames;
        const PATH_VARIATIONS = xPathVariations;
        const PAGE_NUMBER_TEXT_REGEX = numberRegex;
    }

    /**
     * Entry-point method used by main-method for access to the scraper.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {Object}              page                    Represents a tab in Chromium browser
     * @param {Object}              browser                 the Chromium browser
     * @param {int}                 pageLimit               user provided safeguard for parallel run
     * @returns {Promise<void>}
     */
    async beginScraping(page, browser, pageLimit) {
        try {
            for (let [key, value] of this.REGION_NAMES) {
                console.log(key.toString());
                currentRegionObject = await ORM.FindRegionID(key.toString());
                currentRegionID = currentRegionObject[0].region_id;

                console.log(`BEGINNING SCRAPING IN REGION: ${key}`);
                const REGION_PAGE_SELECTOR = `${this.TARGET_WEBSITE}${value}`;


                await page.goto(REGION_PAGE_SELECTOR)
                    .catch((error) => {
                        throw new Error("Error at beginScraping → page.goto(): " + error);
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
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {Object}              page                    page tab created in browser.
     * @param {Object}              browser                 browser created in main.
     * @param {String}              REGION_PAGE_SELECTOR    generic XPath to website handle that contains all
     *                                                      advertisement lists.
     * @param {int}                 fromPage                current page number.
     * @param {int}                 toPage                  upper limit for parallel scraper.
     * @returns {Promise<String>}                           a string to indicate if any errors have been thrown.
     */
    async scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage) {
        return new Promise((resolve, reject) => {
            let resolveCounter = 0, rejectCounter = 0;
            let result = '';

            // Helpermethod: To limit the amount of simultaneous running pages.
            let returnIfNeeded = () => {
                if (resolveCounter + rejectCounter === (toPage - fromPage))
                    if (rejectCounter > 0)
                        reject(result);
                    else
                        resolve(result);
            };

            for (let index = fromPage; index < toPage; index++) {
                console.log('BEGINNING SCRAPING ON PAGE: ' + index);
                let pageExtension = (index * 20) + 1;
                const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`${pageExtension}`);

                getCurrentPageURLTitles(page, PAGE_SELECTOR)
                    .then((pageURLsAndTitles) => {
                        scrapePageList(browser, pageURLsAndTitles, index)
                            .then(() => {
                                resolveCounter++;
                                returnIfNeeded();
                            })
                            .catch((value) => {
                                rejectCounter++;
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

    /**
     * Gets a list of title/url pairs.
     * @param {Object}              page                    current page to extract titles and urls from.
     * @param {String}              PAGE_SELECTOR           formatted url to the page conataining the advertisement list.
     *
     * @returns {Promise<{PAGE_TITLES: Array, PAGE_URLS: Array}>} - Lists with titles and urls.
     */
    async getCurrentPageURLTitles(page, PAGE_SELECTOR) {
        try {
            await page.goto(PAGE_SELECTOR)
                .catch((value) => {
                    throw new Error("page.goto() → " + value);
                });

            let counter = 0;
            let titles = [], urls = [];

            while (titles.length === 0 && counter < this.PATH_VARIATIONS.length) {
                let currentObject = this.PATH_VARIATIONS[counter];
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
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {Object}              page                    The current page the scraper has reached.
     * @param {String}              titleClass              XPath to the general element in which we are searching.
     * @param {String}              titleAttributes         XPath to the specific children og titleClass XPath.
     * @param {String}              urlClass                XPath to the element where the text representation of url is kept.
     * @param {String}              urlAttributes           XPath to the specific child which keeps the text
     *
     * @returns {Promise<{titleList: Array, urlList: Array}>}
     */
    async tryPathVariationOnPage(page, titleClass, titleAttributes, urlClass, urlAttributes) {
        let titles = [], urls = [];
        let titleUrlMap = new Map();
        try {
            // Sets the XPath to the elements.
            let xpathTitleData = await page.$x('//div[@class="job"]/h2/a')
                .catch((error) => {
                    throw new Error("page.$x(): " + error);
                });

            let xpathUrlData = await page.$x('//div[@class="job"]/h2/a/@href')
                .catch((error) => {
                    throw new Error("page.$x(): " + error);
                });


            // Run through all advertisements with XPath on current page.
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


                // If one property is empty, the advertisement is discarded.
                if (titleText.length !== 0 && urlText !== 0) {
                    titleUrlMap.set(titleText, (TARGET_WEBSITE + urlText));
                    titles.push(titleText);
                    urls.push(urlText);
                }
            }
            return {titleList: titles, urlList: urls};
        } catch (error) {
            console.log("Error at getPageTitlesAndUrls() → " + error)
        }
    }
}

// Varies:

