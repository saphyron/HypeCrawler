// Import the ScraperInterface module from a local file.
let ScraperInterface = require('./jobscraper-interface-1.0.0');

// Define the base URL of the job indexing site to scrape.
const TARGET_WEBSITE = 'https://www.jobindex.dk';
// Define a mapping from region names to their specific search URL paths.
const REGION_NAMES = new Map([
    ['nordsjaelland', '/jobsoegning/nordsjaelland?jobage=1'],
    ['region-sjaelland', '/jobsoegning/region-sjaelland?jobage=1'],
    ['fyn', '/jobsoegning/fyn?jobage=1'],
    ['region-nordjylland', '/jobsoegning/region-nordjylland?jobage=1'],
    ['sydjylland', '/jobsoegning/sydjylland?jobage=1'],
    ['bornholm', '/jobsoegning/bornholm?jobage=1'],
    ['skaane', '/jobsoegning/skaane?jobage=1'],
    ['groenland', '/jobsoegning/groenland?jobage=1'],
    ['udlandet', '/jobsoegning/udlandet?jobage=1'],
    ['faeroeerne', '/jobsoegning/faeroeerne?jobage=1'],
    ['region-midtjylland', '/jobsoegning/region-midtjylland?jobage=1'],
    ['storkoebenhavn', '/jobsoegning/storkoebenhavn?jobage=1'],
    // Any regions below this are Temporary search criterias
    // Aim is to have extended functionality in future that allows for custom search criterias
    //['cyber', '/jobsoegning?maxdate=20240731&mindate=20240101&jobage=archive&q=it-sikkerhed+%27cyber+security%27'],
]);

// Define different configurations for locating job details in the scraped HTML using XPath classes and attributes.
const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'PaidJob-inner',
        URL_XPATH_ATTRIBUTES: 'h4 a[href]',
        TITLE_XPATH_CLASS: 'PaidJob-inner',
        TITLE_XPATH_ATTRIBUTES: 'h4 a',
        COMPANY_XPATH_CLASS: 'jix-toolbar-top__company',
        COMPANY_XPATH_ATTRIBUTES: 'a[href]'
    },
    {
        URL_XPATH_CLASS: 'jix_robotjob-inner',
        URL_XPATH_ATTRIBUTES: 'h4 a[href]',
        TITLE_XPATH_CLASS: 'jix_robotjob-inner',
        TITLE_XPATH_ATTRIBUTES: 'h4 a',
        COMPANY_XPATH_CLASS: 'jix_robotjob-inner',
        COMPANY_XPATH_ATTRIBUTES: 'h4 a[href]'
    }
];
// Define the XPath selector for finding the total number of job adverts on a page.
const TOTAL_ADVERTS_SELECTOR = '//*[@class="results"]/div/div/div/div[1]/h2/text()';
// Regular expression to extract numerical values, intended to parse the total number of job adverts.
const TOTAL_ADVERTS_REGEX = /(\d*\.?\d*)/g;
// Define the maximum timeout in milliseconds to wait for page responses.
const PAGE_TIMEOUT = 60000;

/**
 * Class for scraping job listings from Jobindex.dk.
 * Implements methods from ScraperInterface to customize for specific site structure.
 */
class JobindexScraper extends ScraperInterface {

    /**
     * Initializes the scraper with website-specific settings.
     */
    constructor() {
        super(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, TOTAL_ADVERTS_REGEX, PAGE_TIMEOUT);
    }
    /**
     * Generates a URL parameter for pagination based on the current page number.
     * @param {number} pageNo - Current page number.
     * @returns {string} URL parameter to access the next page.
     */
    getPageExtension(pageNo) {
        return `&page=${pageNo + 1}`;
    }

    /**
     * Retrieves the total number of pages available for job listings.
     * @param {object} page - Puppeteer page object for browser interaction.
     * @returns {Promise<number>} Total number of pages as an integer.
     */
    async getNumPages(page) {
        let numPages;
        const baseUrl = page.url();
        //console.log("baseUrl: " + baseUrl);
        await page.goto(baseUrl, { waitUntil: 'networkidle2' });
        try {
            console.log("Attempting to find the total number of pages using CSS selector...");
            const pageRefs = await page.evaluate(() => {
                const selector = "div.jix_pagination.jix_pagination_wide ul.pagination li.page-item a";
                const elements = document.querySelectorAll(selector);
                if (elements.length === 0) {
                    return null;
                }
                const lastPageElement = elements[elements.length - 2]; // Second to last element
                console.log("Last page element:", lastPageElement);
                return lastPageElement ? lastPageElement.textContent : null;
            });

            if (!pageRefs) {
                console.log("No pagination elements found. Assuming there is only 1 page.");
                numPages = 1;
            } else {
                console.log("Found the pagination element:", pageRefs);
                numPages = parseInt(pageRefs, 10);
                if (isNaN(numPages)) {
                    throw new Error("Failed to parse the number of pages.");
                }
            }
        } catch (error) {
            console.error("Error while collecting num of pages element:", error);
            throw new Error("document.querySelector() → " + error);
        }

        console.log("Total number of pages:", numPages);
        return numPages;
    }

    /**
     * Scrapes job data from a specific page and optionally navigates to a company URL for additional details.
     * @param {Object} page - Puppeteer page object.
     * @param {String} title - Job title.
     * @param {String} url - URL of the job listing.
     * @param {String} companyURL - URL of the company listing the job.
     * @param {int} index - Job listing's index on the page.
     * @param {int} pageNum - Current page number of job listings.
     * @returns {Promise<void>} Completes when the scraping and any data insertion are done.
     */
    async scrapePage(page, title, url, companyURL, index, pageNum, scraperName) {
        let errorResult = undefined;
        console.time("runTime page number " + pageNum + " annonce " + index);
    
        try {
            // Validate the URL
            if (!url || !url.startsWith("http")) {
                throw new Error("Invalid URL: " + url);
            }
    
            await page.goto(url, {
                timeout: this.PAGE_TIMEOUT
            });
    
            let bodyHTML = undefined;
            await Promise.race([
                page.evaluate(() => document.body.innerText),
                page.waitForSelector('body', { timeout: this.PAGE_TIMEOUT })
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
    
            let cvr = undefined;
            if (companyURL !== undefined && companyURL.startsWith("http")) {
                await page.goto(companyURL, {
                    timeout: this.PAGE_TIMEOUT
                });
    
                let companyHTML = await page.evaluate(() => document.body.outerHTML);
                let cvrRegexp = /DK([0-9]{8})/g;
                let match = cvrRegexp.exec(companyHTML);
                if (match) {
                    cvr = match[1];
                }
            }
    
            console.log(`Attempting to insert with body length: ${bodyHTML.length}`);
            await this.insertAnnonce(title, bodyHTML, url, cvr, scraperName);
        } catch (error) {
            if (error.message.includes('net::ERR_CERT_DATE_INVALID')) {
                console.error(`SSL certificate error at ${url}: ${error.message}`);
                console.log("Inserting the record with an empty body due to SSL issue.");
    
                // Insert with empty body due to SSL issue
                console.log(`Attempting to insert with empty body for URL: ${url}`);
                await this.insertAnnonce(title, "", url, null, scraperName);
            } else {
                errorResult = error;
            }
        }
    
        if (errorResult) {
            this.errorTotalCounter++;
            console.log("Error at scrapePage(" + url + ") → " + errorResult);
        }
    
        console.timeEnd("runTime page number " + pageNum + " annonce " + index);
    }
    

}
// Export the JobindexScraper class for use in other modules.
module.exports = JobindexScraper;