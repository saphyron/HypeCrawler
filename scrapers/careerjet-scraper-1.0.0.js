// Import the ScraperInterface module from the local file 'jobscraper-interface-1.0.0'
let ScraperInterface = require('./jobscraper-interface-1.0.0');

// TODO:Fix careerjet error when no jobs in a region. It should continue with next region instead of stopping fully.

// Define the target website URL for scraping
const TARGET_WEBSITE = 'https://www.careerjet.dk';
// Define a map of region names to their corresponding URL paths for job listings
const REGION_NAMES = new Map([
    ['bornholm', '/jobs?s=&l=Bornholm&nw=1&p='], // URL path for Bornholm region
    ['storkoebenhavn', '/jobs?s=&l=Storkøbenhavn&nw=1&p='], // URL path for Storkøbenhavn region
    ['region-sjaelland', '/jobs?s=&l=Sjælland&nw=1&p='], // URL path for Sjælland region
    ['region-nordjylland', '/jobs?s=&l=Nordjylland&nw=1&p='], // URL path for Nordjylland region
    ['region-midtjylland', '/jobs?s=&l=Midtjylland&nw=1&p='], // URL path for Midtjylland region
    ['sydjylland', '/jobs?s=&l=Syddanmark&nw=1&p='], // URL path for Syddanmark region
]);
// Define an array of path variations for extracting job URLs and titles
const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'jobs',  // XPath class for job URLs
        URL_XPATH_ATTRIBUTES: 'li article header h2 a[href]', // XPath attributes for job URLs
        TITLE_XPATH_CLASS: 'jobs', // XPath class for job titles
        TITLE_XPATH_ATTRIBUTES: 'li article header h2 a' // XPath attributes for job titles
    }
];
// Define the XPath selector for the total number of job adverts
const TOTAL_ADVERTS_SELECTOR = '//*[@id="rightcol"]/div[1]/nobr/table/tbody/tr/td/span/nobr';
// Define the regex pattern for extracting the total number of job adverts
const TOTAL_ADVERTS_REGEX = /af (.*?) jobs/g;
// Define the page timeout duration in milliseconds
const PAGE_TIMEOUT = 60000;

/**
 * Class representing the algorithm for careerjet.dk
 * @class
 * @implements {JocscraperTemplate}
 */
class CareerjetScraper extends ScraperInterface {
    /**
     * Initializes the scraper with specific configurations for the Careerjet.dk website.
     */
    constructor() {
        super(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, TOTAL_ADVERTS_REGEX, PAGE_TIMEOUT);
    }
    /**
     * Generates the pagination extension for URLs based on the page number.
     * @param {number} pageNo - The current page number.
     * @returns {string} - Returns the incremented page number as a string.
     */
    getPageExtension(pageNo) {
        return `${pageNo + 1}`;
    }

    /**
     * Scrapes a single page for job listings.
     * @param {object} page - The Puppeteer page object.
     * @param {string} title - The job title.
     * @param {string} url - The URL of the job listing.
     * @param {string} companyUrl - The URL of the company listing the job.
     * @param {number} index - The index of the job listing on the current page.
     * @param {number} pageNum - The number of the page being scraped.
     * @async
     */
    async scrapePage(page, title, url, companyUrl, index, pageNum, scraperName) {
        let formattedUrl = url;
        let cvr;
        //console.log("Scraping page: " + formattedUrl);
        let errorResult = undefined;
        console.time("runTime page number " + pageNum + " annonce " + index);

        try {
            await page.goto(formattedUrl, {
                timeout: this.PAGE_TIMEOUT
            })
                .catch((error) => {
                    throw new Error("page.goto(): " + error);
                });
            // Attempt to extract the inner text of the page's body, handling any errors that occur.
            let bodyHTML = undefined

            // Deprecated code that is kept just in case.
            /*await Promise.race([
                page.evaluate(() => document.body.outerHTML),
                page.waitForSelector('body', { timeout: this.PAGE_TIMEOUT }) // Ensure a valid selector is used
            ])
                .then((value) => {
                    if (typeof value === "string") {
                        bodyHTML = value
                    } else {
                        throw new Error("newPage.evaluate() TIMEOUT")
                    }
                })
                .catch((error) => {
                    throw new Error("newPage.evaluate() ERROR: " + error)
                });*/

            // Test to see if I only get Inner value from html body.
            await Promise.race([
                page.evaluate(() => document.body.innerText),
                page.waitForSelector('body', { timeout: this.PAGE_TIMEOUT }) // Ensure a valid selector is used
            ])
                .then((value) => {
                    if (typeof value === "string") {
                        bodyHTML = value;
                    } else {
                        throw new Error("newPage.evaluate() TIMEOUT");
                    }
                })
                .catch((error) => {
                    throw new Error("newPage.evaluate() ERROR: " + error);
                });

            // Insert or update the job listing in the database.
            await this.insertAnnonce(title, bodyHTML, formattedUrl, cvr, scraperName)
                .catch((error) => {
                    throw new Error("insertAnnonce(" + formattedUrl + "): " + error)
                });

        } catch (error) {
            errorResult = error;
        }

        if (errorResult) {
            this.errorTotalCounter++;
            console.log("Error at scrapePage(" + formattedUrl + ") → " + errorResult);
        }

        console.timeEnd("runTime page number " + pageNum + " annonce " + index);
    }

    /**
     * Determines the total number of pages available for job listings.
     * @param {object} page - The Puppeteer page object.
     * @param {number} listLength - The expected number of job listings per page (unused).
     * @returns {Promise<number>} - The total number of pages of job listings.
     * @async
     */
    async getNumPages(page, listLength) {
        try {
            // Log the current URL of the page
            //console.log("Current URL: " + page.url());

            // Initialize the maximum page number
            let maxPage = 0;
            let currentPageNumber = 1;
            const baseUrl = page.url();
            const url = baseUrl + currentPageNumber;
            await page.goto(url, { waitUntil: 'networkidle2' });

            const pageRefs = await page.evaluate(() => {
                const selector = "p.col.col-xs-12.col-m-4.col-m-r.cr span";
                const elements = document.querySelectorAll(selector);

                if (elements.length === 0) {
                    console.log("No elements found using CSS selector.");
                    return null;
                }

                const textContents = Array.from(elements).map(element => {
                    const text = element.textContent.trim();
                    const numberOnly = text.match(/\d+/);
                    return numberOnly ? numberOnly[0] : null;
                });

                return textContents.filter(number => number !== null);
            });

            if (!pageRefs || pageRefs.length === 0) {
                throw new Error("Failed to retrieve valid number from page.");
            }

            const totalNumbersFromPage = parseInt(pageRefs[0], 10);

            if (isNaN(totalNumbersFromPage)) {
                throw new Error("Failed to parse total numbers from page content.");
            }

            maxPage = Math.ceil(totalNumbersFromPage / 20);
            console.log("Max Page:", maxPage);


            /*while (true) {
                // Update the URL to the current page number
                const url = baseUrl + currentPageNumber;
                await page.goto(url, { waitUntil: 'networkidle2' });

                // Collecting num of pages element text
                let pageRefs = await page.$$('ul[data-page="' + currentPageNumber + '"]');
                if (pageRefs.length === 0) {
                    console.log("No elements found using CSS selector 'ul[data-page=\"" + currentPageNumber + "\"]'.");
                    break;
                } else {
                    console.log("Elements found for page number: " + currentPageNumber);
                    // Extracting the data-page attribute value
                    let currentPage = await page.evaluate(element => element.getAttribute('data-page'), pageRefs[0])
                        .catch((error) => {
                            throw new Error("page.evaluate() → " + error);
                        });

                    console.log("Current page: " + currentPage);
                    maxPage = parseInt(currentPage, 10);
                    if (isNaN(maxPage)) {
                        throw new Error("Failed to parse current page number from data-page attribute: " + currentPage);
                    }
                }

                // Make sure to increment the currentPageNumber
                currentPageNumber++;
            };*/

            // Deprecated code that is kept just in case.
            /*
            // Further processing if needed
            // For example, you can parse the currentPage to an integer
            let currentPageNumber = parseInt(currentPage, 10);
            if (isNaN(currentPageNumber)) {
                throw new Error("Failed to parse current page number from data-page attribute: " + currentPage);
            }*/

            return maxPage;
        } catch (error) {
            console.log("Error at getNumPages(" + page + ") → " + error);
            console.error("getNumPages() → " + error);
            throw error;
        }
    }
}
// Make the CareerjetScraper class available for import in other files.
module.exports = CareerjetScraper;