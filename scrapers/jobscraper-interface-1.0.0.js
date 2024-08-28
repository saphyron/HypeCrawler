const ORM = require('../data/general-orm-1.0.0');
//const ORM = require('../data/general-orm-1.0.1-pool');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');
const regionModel = require('../model/region');


// Constants:
const ADVERTS_PER_PAGE = 20;

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
        try {
            for (let [key, value] of this.REGION_NAMES) {
                console.log(key.toString());
                currentRegionObject = await ORM.FindRegionID(key.toString());
                currentRegionID = currentRegionObject[0].region_id;

                console.log(`BEGINNING SCRAPING IN REGION: ${key}`);
                const REGION_PAGE_SELECTOR = `${this.TARGET_WEBSITE}${value}`;
                console.log("REGION_PAGE_SELECTOR: " + REGION_PAGE_SELECTOR);


                await page.goto(REGION_PAGE_SELECTOR, {
                    timeout: this.PAGE_TIMEOUT
                })
                    .catch((error) => {
                        throw new Error("Error at beginScraping → page.goto(): " + error);
                    });

                const NUM_PAGES = await this.getNumPages(page, ADVERTS_PER_PAGE);
                console.log(NUM_PAGES + " PAGES");
                if (NUM_PAGES === 0) {
                    console.log(`No pages found for region ${key}. Skipping to the next region.`);
                    continue; // Skip to the next region
                }

                for (let pageNumber = 0; pageNumber < NUM_PAGES; pageNumber += this.PAGE_LIMIT) {
                    await this.scrapeRegion(page, browser, REGION_PAGE_SELECTOR,
                        pageNumber, pageNumber + this.PAGE_LIMIT, scraperName)
                        .catch((error) => {
                            console.log("Error at scrapeRegion → " + error);
                        });
                }
            }
        } catch (error) {
            console.log("Error at beginScraping → " + error);
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
    /*async scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage) {
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
                const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`${this.getPageExtension(index)}`);
                console.log("PAGE_SELECTOR: " + PAGE_SELECTOR);

                this.getCurrentPageURLTitles(page, PAGE_SELECTOR)
                    .then((pageURLsAndTitles) => {
                        this.scrapePageList(browser, pageURLsAndTitles, index)
                            .catch((error) => {
                                rejectCounter++;
                                result += `Error at scrapeRegion → scrapePageList(${page},'${PAGE_SELECTOR}'): ${error.toString()}`;
                                settlePromise();
                            })
                            .then(() => {
                                resolveCounter++;
                                settlePromise();
                            })
                    })
                    .catch((error) => {
                        rejectCounter++;
                        result += `Error at scrapeRegion → getCurrentPageURLTitles(${page},'${PAGE_SELECTOR}'): ${error.toString()}`;
                        settlePromise();
                    });
            }
        });
    }*/
    /*async scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage) {
        try {
            const promises = [];

            for (let index = fromPage; index < toPage; index++) {
                const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`${this.getPageExtension(index)}`);
                console.log('BEGINNING SCRAPING ON PAGE: ' + (index + 1));
                console.log("PAGE_SELECTOR: " + PAGE_SELECTOR);

                promises.push(
                    (async () => {
                        const newPage = await browser.newPage();  // Open a new page for parallel processing
                        try {
                            const pageURLsAndTitles = await this.getCurrentPageURLTitles(newPage, PAGE_SELECTOR);
                            await this.scrapePageList(browser, pageURLsAndTitles, index);
                        } catch (error) {
                            throw new Error(`Error on page ${index + 1}: ${error.toString()}`);
                        } finally {
                            await newPage.close();  // Close the page after processing
                        }
                    })()
                );
            }

            await Promise.all(promises).catch(error => {
                console.error("Error during scraping in Promise.all:", error);
                throw error;
            });
            return 'Scraping completed successfully.';
        } catch (error) {
            console.error(`Error in scrapeRegion: ${error.toString()}`);
            return `Error in scrapeRegion: ${error.toString()}`;
        }
    }*/
    //Parallel processing version
    /*async scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage, scraperName) {
        try {
            const promises = [];

            for (let index = fromPage; index < toPage; index++) {
                const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`${this.getPageExtension(index)}`);
                console.log('BEGINNING SCRAPING ON PAGE: ' + (index + 1));
                console.log("PAGE_SELECTOR: " + PAGE_SELECTOR);

                promises.push(
                    (async () => {
                        const newPage = await browser.newPage();  // Open a new page for parallel processing
                        try {
                            const pageURLsAndTitles = await this.getCurrentPageURLTitles(newPage, PAGE_SELECTOR);
                            await this.scrapePageList(browser, pageURLsAndTitles, index, scraperName);
                        } catch (error) {
                            console.error(`Error on page ${index + 1}: ${error}`);
                            throw new Error(`Error on page ${index + 1}: ${error.toString()}`);
                        } finally {
                            await newPage.close();  // Close the page after processing
                        }
                    })()
                );
            }

            await Promise.all(promises).catch(error => {
                console.error("Error during scraping in Promise.all:", error);
                throw error;
            });
            return 'Scraping completed successfully.';
        } catch (error) {
            console.error(`Error in scrapeRegion: ${error.toString()}`);
            return `Error in scrapeRegion: ${error.toString()}`;
        }
    }*/
    //sequential processing version.
    async scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage, scraperName) {
        try {
            for (let index = fromPage; index < toPage; index++) {
                const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`${this.getPageExtension(index)}`);
                console.log('BEGINNING SCRAPING ON PAGE: ' + (index + 1));
                console.log("PAGE_SELECTOR: " + PAGE_SELECTOR);

                const newPage = await browser.newPage();  // Open a new page for processing
                try {
                    const pageURLsAndTitles = await this.getCurrentPageURLTitles(newPage, PAGE_SELECTOR);
                    await this.scrapePageList(browser, pageURLsAndTitles, index, scraperName);
                } catch (error) {
                    console.error(`Error on page ${index + 1}: ${error}`);
                    throw new Error(`Error on page ${index + 1}: ${error.toString()}`);
                } finally {
                    await newPage.close();  // Close the page after processing
                }
            }

            return 'Scraping completed successfully.';
        } catch (error) {
            console.error(`Error in scrapeRegion: ${error.toString()}`);
            return `Error in scrapeRegion: ${error.toString()}`;
        }
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
    /*async getCurrentPageURLTitles(page, PAGE_SELECTOR) {
        await page.goto(PAGE_SELECTOR, {
            timeout: this.PAGE_TIMEOUT
        })
            .catch((value) => {
                throw new Error("page.goto() → " + value);
            });

        let counter = 0;
        let titles = [], urls = [], companies = [];
        //Temporarily removed titles.length === 0 && to see if it will fix variation problems
        while (counter < this.PATH_VARIATIONS.length) {
            let currentObject = this.PATH_VARIATIONS[counter];
            let candidateObj;
            if (currentObject.COMPANY_XPATH_CLASS === undefined) {
                candidateObj = await this.tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS, currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES);
            } else {
                candidateObj = await this.tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS,
                    currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES, currentObject.COMPANY_XPATH_CLASS, currentObject.COMPANY_XPATH_ATTRIBUTES);
                companies = candidateObj.companyUrls
            }

            titles = candidateObj.titleList;
            urls = candidateObj.urlList;

            counter++;
        }

        if (titles.length === 0) {
            throw new Error("No valid path found!");
        }

        return { PAGE_TITLES: titles, PAGE_URLS: urls, PAGE_COMPANY_URLS: companies };
    }*/

    /*async getCurrentPageURLTitles(page, PAGE_SELECTOR) {
        await page.goto(PAGE_SELECTOR, {
            timeout: this.PAGE_TIMEOUT
        }).catch((value) => {
            throw new Error("page.goto() → " + value);
        });

        let titles = [], urls = [], companies = [];
        let counter = 0;

        while (counter < this.PATH_VARIATIONS.length) {
            let currentObject = this.PATH_VARIATIONS[counter];
            let candidateObj;

            try {
                if (currentObject.COMPANY_XPATH_CLASS === undefined) {
                    candidateObj = await this.tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS, currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES);
                } else {
                    candidateObj = await this.tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS,
                        currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES, currentObject.COMPANY_XPATH_CLASS, currentObject.COMPANY_XPATH_ATTRIBUTES);
                    companies.push(...candidateObj.companyUrls);
                }

                titles.push(...candidateObj.titleList);
                urls.push(...candidateObj.urlList);

                // Stop if we find valid titles and URLs
                if (titles.length > 0 && urls.length > 0) {
                    break;
                }
            } catch (error) {
                console.error(`Error trying path variation ${counter}: `);
            }

            counter++;
        }

        if (titles.length === 0 || urls.length === 0) {
            throw new Error("No valid path found!");
        }

        return { PAGE_TITLES: titles, PAGE_URLS: urls, PAGE_COMPANY_URLS: companies };
    }*/

    async getCurrentPageURLTitles(page, PAGE_SELECTOR) {
        const maxRetries = 3;  // Maximum number of retries
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await page.goto(PAGE_SELECTOR, { timeout: this.PAGE_TIMEOUT });
                break;  // Exit the loop if the page loads successfully
            } catch (error) {
                console.error(`Attempt ${attempt} failed for page.goto() → ${error}`);
                if (attempt === maxRetries) {
                    throw new Error(`page.goto() failed after ${maxRetries} attempts → ${error}`);
                }
            }
        }

        let titles = [], urls = [], companies = [];
        let counter = 0;

        while (counter < this.PATH_VARIATIONS.length) {
            let currentObject = this.PATH_VARIATIONS[counter];
            let candidateObj;

            try {
                if (currentObject.COMPANY_XPATH_CLASS === undefined) {
                    candidateObj = await this.tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS, currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES);
                } else {
                    candidateObj = await this.tryPathVariationOnPage(page, currentObject.TITLE_XPATH_CLASS,
                        currentObject.TITLE_XPATH_ATTRIBUTES, currentObject.URL_XPATH_CLASS, currentObject.URL_XPATH_ATTRIBUTES, currentObject.COMPANY_XPATH_CLASS, currentObject.COMPANY_XPATH_ATTRIBUTES);
                    companies.push(...candidateObj.companyUrls);
                }

                titles.push(...candidateObj.titleList);
                urls.push(...candidateObj.urlList);

                // Stop if we find valid titles and URLs
                if (titles.length > 0 && urls.length > 0) {
                    break;
                }
            } catch (error) {
                console.error(`Error trying path variation ${counter}: `);
            }

            counter++;
        }

        if (titles.length === 0 || urls.length === 0) {
            throw new Error("No valid path found!");
        }

        return { PAGE_TITLES: titles, PAGE_URLS: urls, PAGE_COMPANY_URLS: companies };
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
    /*async tryPathVariationOnPage(page, titleClass, titleAttributes, urlClass, urlAttributes, companyClass, companyAttributes) {
        try {
            // Initialize arrays to store valid titles and URLs
            let titles = [];
            let urls = [];
            let company = [];

            // Define the selectors
            let titleSelector = `.${titleClass} ${titleAttributes}`;
            let urlSelector = `.${urlClass} ${urlAttributes}`;
            let companySelector = `.${companyClass} ${companyAttributes}`;

            const baseUrl = page.url();
            console.log("baseUrl: " + baseUrl);

            await page.goto(baseUrl, {
                waitUntil: 'networkidle2',
                timeout: 200000,
            });

            /*await page.screenshot({ path: 'pre_check.png', fullPage: true });
            await page.screenshot({ path: 'post_check.png', fullPage: true });*/

    // Extract elements
    /*let titleElements = await page.$$eval(titleSelector, elements =>
        elements.map(el => el.textContent.trim()));
    let urlElements = await page.$$eval(urlSelector, elements =>
        elements.map(el => el.href.trim()));
    let companyElements = await page.$$eval(companySelector, elements =>
        elements.map(el => el.href.trim()));

    // Log the extracted elements
    /*console.log('Title Elements:', titleElements);
    console.log('URL Elements:', urlElements);
    console.log('Company Elements:', companyElements);*/

    // Check if titleElements and urlElements are empty or undefined
    /*if (!titleElements || titleElements.length === 0) {
        console.error('No Title Elements found for selector:', `.${titleClass} ${titleAttributes}`);
        throw new Error('No valid path found!');
    }
    if (!urlElements || urlElements.length === 0) {
        console.error('No URL Elements found for selector:', `.${urlClass} ${urlAttributes}`);
        throw new Error('No valid path found!');
    }



    // Process the elements
    /*for (let i = 0; i < titleElements.length; i++) {
        let titleText = titleElements[i].trim();
        let urlText = urlElements[i]?.trim(); // Use optional chaining to avoid errors

        // If one property is empty, the advertisement is invalid.
        if (titleText.length !== 0 && urlText.length !== 0) {
            titles.push(titleText);
            urls.push(urlText);
        }
    }

    /*if (companyClass !== undefined) {
        await page.waitForSelector(`.${companyClass} ${companyAttributes}`, { timeout: 500 }).catch(() => {
            console.error('Company Selector not found:', `.${companyClass} ${companyAttributes}`);
            throw new Error('No valid path found!');
        });

        let companyElements = await page.$$eval(`.${companyClass} ${companyAttributes}`, elements => elements.map(el => el.textContent.trim()));
        if (!companyElements || companyElements.length === 0) {
            console.error('No Company Elements found for selector:', `.${companyClass} ${companyAttributes}`);
            throw new Error('No valid path found!');
        }
    }*/

    // Extract the title and URL from the selected elements
    /*console.log('Element:', elements);
    elements.forEach(element => {

        if (element.title) titles.push(element.title);
        if (element.url) urls.push(element.url);
    });*/

    //let companySelector, companyElements;

    /*if (companyClass !== undefined) {
        companySelector = `.${companyClass} ${companyAttributes}`;
        console.log('Company Selector:', companySelector);
        companyElements = await page.$$eval(companySelector, elements => elements
            .map(el => el.textContent.trim()));
        console.log('Company Elements:', companyElements);
    }*/

    /*let urlSelector = `.${urlClass} ${urlAttributes}`;
    console.log('URL Selector:', urlSelector);

    // Ensure the page is fully loaded
    await page.waitForSelector(urlSelector, { timeout: 500 }).catch(() => {
        console.error('URL Selector not found:', urlSelector);
        throw new Error('No valid path found!');
    });*/

    /*let urlElements = await page.$$eval(urlSelector, elements => elements
        .map(el => el.href.trim()));
    console.log('URL Elements:', urlElements);*/

    /*// Runs through all advertisements with CSS selector on current page.
    for (let i = 0; i < elements.length; i++) {
        let titleText = elements[i].title.trim();
        let urlText = urlElements[i]?.trim(); // Use optional chaining to avoid errors

        // If one property is empty, the advertisement is invalid.
        if (titleText.length !== 0 && urlText.length !== 0) {
            titles.push(titleText);
            urls.push(urlText);
        }
    }

    // Run through company data for all ads on current page.
    if (companyElements !== undefined) {
        companyElements.forEach(companyText => {
            company.push(companyText);
        });
    }

    return { titleList: titles, urlList: urls, companyUrls: company };
} catch (error) {
    console.error('Error at getPageTitlesAndUrls() →');
    throw error;
}
}*/
    async tryPathVariationOnPage(page, titleClass, titleAttributes, urlClass, urlAttributes, companyClass, companyAttributes) {
        try {
            // Initialize arrays to store valid titles and URLs
            let titles = [];
            let urls = [];
            let company = [];

            // Define the selectors
            let titleSelector = `.${titleClass} ${titleAttributes}`;
            let urlSelector = `.${urlClass} ${urlAttributes}`;
            let companySelector = `.${companyClass} ${companyAttributes}`;

            const baseUrl = page.url();
            console.log("baseUrl: " + baseUrl);

            await page.goto(baseUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000,
            });

            // Retry element extraction up to 3 times
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Extract elements
                    let titleElements = await page.$$eval(titleSelector, elements =>
                        elements.map(el => el.textContent.trim()));
                    let urlElements = await page.$$eval(urlSelector, elements =>
                        elements.map(el => el.href.trim()));
                    let companyElements = await page.$$eval(companySelector, elements =>
                        elements.map(el => el.href.trim()));

                    // Process the elements
                    if (titleElements.length > 0 && urlElements.length > 0) {
                        titles = titleElements;
                        urls = urlElements;
                        if (companyElements) {
                            company = companyElements;
                        }
                        break; // Exit the loop if extraction is successful
                    } else {
                        console.log(`Attempt ${attempt} failed to extract all elements. Retrying...`);
                    }
                } catch (error) {
                    console.log(`Attempt ${attempt} failed → ${error}`);
                    if (attempt === maxRetries) {
                        throw new Error(`Failed to extract elements after ${maxRetries} attempts → ${error}`);
                    }
                }
            }

            if (titles.length === 0 || urls.length === 0) {
                throw new Error('No valid path found!');
            }

            return { titleList: titles, urlList: urls, companyUrls: company };
        } catch (error) {
            console.error('Error at tryPathVariationOnPage() →', error);
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


            console.log('Scrape page ' + (pageNum + 1) + ' begun');
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
                                        titleUrlList.PAGE_URLS[index], titleUrlList.PAGE_COMPANY_URLS[index], (index + 1), pageNum, scraperName)
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
                                    result += ("Error at scrapePageList() → " + error + ", ");
                                    settlePromise(index);
                                });
                        }
                    }, (error) => {
                        rejectCounter++;
                        result += ("Error at scrapePageList() → " + error + ", ");
                        settlePromise(index);
                    })
            }
        })
    }

    async scrapePage(page, title, url, index, pageNum, scraperName) {
        throw new Error("Missing scrapePage implementation");
    };

    //<editor-fold desc="HelperMethods">
    /**
     * Prints the statistics of the scrapers run.
     *
     * @since       1.0.0
     * @access      private
     */
    printDatabaseResult() {
        let totalEntries = this.successTotalCounter + this.existingTotalCounter + this.errorTotalCounter;

        console.log('----------------------------------------------------------');
        console.log(`${this.TARGET_WEBSITE} SCRAPER STATISTIK`);
        console.log('----------------------------------------------------------');
        console.log(`${this.successTotalCounter} OUT OF ${totalEntries} (${Math.round(this.successTotalCounter / totalEntries) * 100} %) --- INSERTS`);
        console.log('----------------------------------------------------------');
        console.log(`${this.existingTotalCounter} OUT OF ${totalEntries} (${Math.round(this.existingTotalCounter / totalEntries) * 100} %) --- EXISTS`);
        console.log('----------------------------------------------------------');
        console.log(`${this.errorTotalCounter} OUT OF ${totalEntries} (${Math.round(this.errorTotalCounter / totalEntries) * 100} %) --- ERRORS`);
        console.log('----------------------------------------------------------');
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
        throw ("getNumPages must be implemented for class");
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
    insertAnnonce(annonceTitle, rawHTMLText, annonceURL, cvr, scraperName) {
        console.log("Inserting Annonce:", { annonceTitle, annonceURL, cvr, scraperName });
        return new Promise((resolve, reject) => {

            let sha1Checksum = sha1(`${annonceURL}`);
            ORM.FindChecksum(sha1Checksum)
                .then((result) => {
                    console.log("Checksum found:", result);
                    if (!result)
                        return this.createAnnonceModel(
                            annonceTitle,
                            rawHTMLText,
                            currentRegionID,
                            sha1Checksum,
                            annonceURL,
                            cvr,
                            scraperName)
                            .catch((error) => {
                                console.error("Error creating Annonce model: " + error);
                                throw new Error("Error creating Annonce model: " + error);
                            });
                    this.existingTotalCounter++;
                    resolve();
                })
                .then((newAnnonceModel) => {
                    if (newAnnonceModel)
                        return ORM.InsertAnnonce(newAnnonceModel)
                            .catch((error) => {
                                console.error("Error inserting Annonce into database: " + error);
                                throw new Error("Error inserting Annonce into database: " + error);
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
    async createAnnonceModel(title, body, regionId = undefined, checksum, url, cvr, scraperName) {
        return new Promise((resolve, reject) => {
            try {
                // Format Timestamp:
                let newDate = new Date();
                let timestampFormat = newDate.getFullYear() + '-' + (newDate.getMonth() < 9 ? '0' : '') +
                    (newDate.getMonth() + 1) + '-' + (newDate.getDate() < 9 ? '0' : '') +
                    (newDate.getDate()) + ' ' + newDate.getHours() + ':' +
                    newDate.getMinutes() + ':' + newDate.getSeconds();


                // Model data into Annonce class:
                resolve(new annonceModel(title, body, regionId, timestampFormat, checksum.toString(), url, cvr, scraperName));
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
            if (this.PAGE_POOL.length < this.MAX_REQUESTS) {        // Check if there is room for creating a new page.
                let position = this.PAGE_POOL.length;
                this.PAGE_POOL[position] = { page: null, url: url };  // Reserve pool slot synchronously.
                this.browser.newPage()
                    .then((newPageObject) => {
                        this.PAGE_POOL[position] = { page: newPageObject, url: url };
                        newPageObject.setJavaScriptEnabled(true).then(() => {
                            newPageObject.setExtraHTTPHeaders({     // Handling of correct reading of danish alphabet
                                'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
                            }).then(() => {
                                resolve(newPageObject);
                            });
                        });
                    });
            }
            else {
                for (let page of this.PAGE_POOL) {                  // If a page is idle, put url in page.
                    if (page.url === undefined) {
                        page.url = url;
                        resolve(page.page);
                        return;
                    }
                }
                // No idle page found, add to queue.
                this.REQUEST_QUEUE.push({ url: url, resolve: resolve, reject: reject })
            }
        })
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
