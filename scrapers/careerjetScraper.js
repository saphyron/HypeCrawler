// Import the ScraperInterface module from the local file 'jobscraper-interface-1.0.0'
let ScraperInterface = require('./scraperInterface');

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
        let errorResult = undefined;
        let retries = 3; // Number of retries allowed for HTTP/2
        let http1Retries = 2; // Number of retries allowed for HTTP/1.1
        let retryDelay = 2000; // Initial delay between retries (in ms)
        let backoffFactor = 2; // Backoff multiplier for retries
        let useHttp1 = false; // Flag to force HTTP/1.1 if HTTP/2 fails
    
        console.time("runTime page number " + pageNum + " annonce " + index);
    
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Force HTTP/1.1 only if previous attempts failed due to HTTP/2 errors
                if (useHttp1 && attempt > retries) {
                    console.log(`Retrying with HTTP/1.1, attempt ${attempt - retries} of ${http1Retries}`);
                    await page.setExtraHTTPHeaders({
                        'Upgrade-Insecure-Requests': '1'
                    });
                }
    
                await page.goto(formattedUrl, {
                    timeout: this.PAGE_TIMEOUT
                });
    
                let bodyHTML = await Promise.race([
                    page.evaluate(() => document.body.innerText),
                    page.waitForSelector('body', { timeout: this.PAGE_TIMEOUT })
                ]);
    
                if (typeof bodyHTML !== "string") {
                    throw new Error("newPage.evaluate() TIMEOUT");
                }
    
                await this.insertAnnonce(title, bodyHTML, formattedUrl, cvr, scraperName);
                break; // Exit loop on success
    
            } catch (error) {
                if (error.message.includes('net::ERR_HTTP2_PROTOCOL_ERROR') || error.message.includes('net::ERR_HTTP2_INADEQUATE_TRANSPORT_SECURITY')) {
                    console.error(`HTTP/2 error at ${formattedUrl}: ${error.message}`);
    
                    if (!useHttp1) {
                        console.log("Retrying with HTTP/1.1...");
                        useHttp1 = true; // Force HTTP/1.1 for the next attempt
                    } else if (attempt <= retries + http1Retries) {
                        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay)); // Wait before retrying
                        retryDelay *= backoffFactor; // Exponential backoff
                    } else {
                        console.error(`Failed after ${retries + http1Retries} attempts: ${error.message}`);
                        errorResult = error;
                    }
                } else if (error.message.includes('net::ERR_CONNECTION_CLOSED')) {
                    console.error(`Connection closed error at ${formattedUrl}: ${error.message}`);
    
                    if (attempt < retries + http1Retries) {
                        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay)); // Wait before retrying
                        retryDelay *= backoffFactor; // Exponential backoff
                    } else {
                        console.error(`Failed after ${retries + http1Retries} attempts: ${error.message}`);
                        errorResult = error;
                    }
                } else if (error.message.includes("net::ERR_CERT_DATE_INVALID")) {
                    console.error(`SSL certificate error at ${formattedUrl}: ${error.message}`);
                    console.log("Inserting the record with an empty body due to SSL issue.");
    
                    // Insert with empty body due to SSL issue
                    await this.insertAnnonce(title, "", formattedUrl, null, scraperName);
                    break; // Exit loop after handling SSL issue
                } else {
                    errorResult = error;
                    break; // Exit loop for other types of errors
                }
            }
        }
    
        if (errorResult) {
            this.errorTotalCounter++;
            console.log(`Error at scrapePage(${formattedUrl}) → ${errorResult}`);
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
                console.log("No valid page references found, returning 0 pages.");
                return 0;
            }
    
            const totalNumbersFromPage = parseInt(pageRefs[0], 10);
    
            if (isNaN(totalNumbersFromPage)) {
                console.log("Failed to parse total numbers from page content.");
                return 0;
            }
    
            maxPage = Math.ceil(totalNumbersFromPage / 20);
            console.log("Max Page:", maxPage);
    
            return maxPage;
        } catch (error) {
            console.log("Error at getNumPages(" + page.url() + ") → " + error);
            console.error("getNumPages() → " + error);
            return 0;  // Return 0 to indicate that the region should be skipped
        }
    }
    
}
// Make the CareerjetScraper class available for import in other files.
module.exports = CareerjetScraper;