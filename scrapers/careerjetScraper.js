/**
 * @file careerjetScraper.js
 * @description Scraper class for extracting job listings from Careerjet.dk.
 * This class extends the ScraperInterface and implements methods specific to scraping Careerjet.
 * It handles pagination, error retries, and data extraction tailored to the Careerjet website structure.
 */

let ScraperInterface = require('./scraperInterface'); // Import the base ScraperInterface class

// The base URL of the target website to scrape
const TARGET_WEBSITE = 'https://www.careerjet.dk';

// A map of region names to their corresponding URL paths on Careerjet
const REGION_NAMES = new Map([
    ['bornholm', '/jobs?s=&l=Bornholm&nw=1&p='], // URL path for Bornholm region
    ['storkoebenhavn', '/jobs?s=&l=Storkøbenhavn&nw=1&p='], // URL path for Storkøbenhavn region
    ['region-sjaelland', '/jobs?s=&l=Sjælland&nw=1&p='], // URL path for Sjælland region
    ['region-nordjylland', '/jobs?s=&l=Nordjylland&nw=1&p='], // URL path for Nordjylland region
    ['region-midtjylland', '/jobs?s=&l=Midtjylland&nw=1&p='], // URL path for Midtjylland region
    ['sydjylland', '/jobs?s=&l=Syddanmark&nw=1&p='], // URL path for Syddanmark region
]);

// Configuration for different path variations used in scraping
const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'jobs',  // CSS class for job listings container
        URL_XPATH_ATTRIBUTES: 'li article header h2 a[href]', // CSS selector for job URLs
        TITLE_XPATH_CLASS: 'jobs', // CSS class for job titles
        TITLE_XPATH_ATTRIBUTES: 'li article header h2 a' // CSS selector for job titles
    }
];

// Selector and regex pattern to extract the total number of adverts
const TOTAL_ADVERTS_SELECTOR = '//*[@id="rightcol"]/div[1]/nobr/table/tbody/tr/td/span/nobr';
const TOTAL_ADVERTS_REGEX = /af (.*?) jobs/g;

// Timeout settings for page navigation and requests
const PAGE_TIMEOUT = 60000; // Timeout for page loading in milliseconds

/**
 * CareerjetScraper class extends the ScraperInterface to implement scraping logic specific to Careerjet.dk.
 */
class CareerjetScraper extends ScraperInterface {

    /**
     * Constructor initializes the scraper with specific configurations for Careerjet.dk.
     * It calls the parent class constructor with the appropriate parameters.
     */
    constructor() {
        super(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, TOTAL_ADVERTS_REGEX, PAGE_TIMEOUT);
    }

    /**
     * Overrides the getPageExtension method to return the correct page number parameter for Careerjet pagination.
     *
     * @param {number} pageNo - The current page number (zero-based index).
     * @returns {string} - The page number adjusted for Careerjet's pagination (one-based index).
     */
    getPageExtension(pageNo) {
        // Careerjet pages start from 1, so we increment the zero-based pageNo
        return `${pageNo + 1}`;
    }

    /**
     * Scrapes a single job listing page and inserts the data into the database.
     * Implements retry logic for handling network errors and SSL issues.
     *
     * @async
     * @param {object} page - The Puppeteer page object.
     * @param {string} title - The title of the job listing.
     * @param {string} url - The URL of the job listing page.
     * @param {string|null} companyUrl - The URL of the company (not used here, hence null).
     * @param {number} index - The index of the job listing on the current page.
     * @param {number} pageNum - The current page number.
     * @param {string} scraperName - The name of the scraper ("CareerJet").
     * @returns {Promise<void>}
     */
    async scrapePage(page, title, url, companyUrl, index, pageNum, scraperName) {
        let formattedUrl = url; // URL to navigate to
        let cvr; // CVR number (not used here, hence undefined)
        let errorResult = undefined; // Variable to store any errors encountered
        let retries = 3; // Number of retries allowed for HTTP/2 errors
        let http1Retries = 2; // Number of retries allowed for HTTP/1.1
        let retryDelay = 2000; // Initial delay between retries in milliseconds
        let backoffFactor = 2; // Multiplier for exponential backoff
        let useHttp1 = false; // Flag to force HTTP/1.1 if HTTP/2 fails
    
        // Start a timer to measure how long the scraping of this page takes
        console.time("runTime page number " + pageNum + " annonce " + index);
    
        // Loop to implement retry logic
        for (let attempt = 1; attempt <= retries + http1Retries; attempt++) {
            try {
                // If previous attempts failed due to HTTP/2 errors, force HTTP/1.1
                if (useHttp1 && attempt > retries) {
                    console.log(`Retrying with HTTP/1.1, attempt ${attempt - retries} of ${http1Retries}`);
                    await page.setExtraHTTPHeaders({
                        'Upgrade-Insecure-Requests': '1'
                    });
                }
    
                // Navigate to the job listing page with a timeout
                await page.goto(formattedUrl, {
                    timeout: this.PAGE_TIMEOUT
                });
    
                // Extract the body text of the page or wait for the 'body' selector
                let bodyHTML = await Promise.race([
                    page.evaluate(() => document.body.innerText),
                    page.waitForSelector('body', { timeout: this.PAGE_TIMEOUT })
                ]);
    
                // Check if the body content is a string
                if (typeof bodyHTML !== "string") {
                    throw new Error("newPage.evaluate() TIMEOUT");
                }
    
                // Insert the scraped data into the database
                await this.insertAnnonce(title, bodyHTML, formattedUrl, cvr, scraperName, null);
                break; // Exit the retry loop on success
    
            } catch (error) {
                // Handle specific error types for retries
                if (error.message.includes('net::ERR_HTTP2_PROTOCOL_ERROR') || error.message.includes('net::ERR_HTTP2_INADEQUATE_TRANSPORT_SECURITY')) {
                    console.error(`HTTP/2 error at ${formattedUrl}: ${error.message}`);
    
                    if (!useHttp1) {
                        console.log("Retrying with HTTP/1.1...");
                        useHttp1 = true; // Set flag to force HTTP/1.1 on next attempt
                    } else if (attempt <= retries + http1Retries) {
                        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay)); // Wait before retrying
                        retryDelay *= backoffFactor; // Apply exponential backoff
                    } else {
                        console.error(`Failed after ${retries + http1Retries} attempts: ${error.message}`);
                        errorResult = error; // Store the error to handle after loop
                    }
                } else if (error.message.includes('net::ERR_CONNECTION_CLOSED')) {
                    console.error(`Connection closed error at ${formattedUrl}: ${error.message}`);
    
                    if (attempt < retries + http1Retries) {
                        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay)); // Wait before retrying
                        retryDelay *= backoffFactor; // Apply exponential backoff
                    } else {
                        console.error(`Failed after ${retries + http1Retries} attempts: ${error.message}`);
                        errorResult = error; // Store the error to handle after loop
                    }
                } else if (error.message.includes("net::ERR_CERT_DATE_INVALID")) {
                    console.error(`SSL certificate error at ${formattedUrl}: ${error.message}`);
                    console.log("Inserting the record with an empty body due to SSL issue.");
    
                    // Insert the record with an empty body due to SSL issue
                    await this.insertAnnonce(title, "", formattedUrl, null, scraperName, null);
                    break; // Exit loop after handling SSL issue
                } else {
                    // For other types of errors, store the error and exit the loop
                    errorResult = error;
                    break;
                }
            }
        }
    
        // If there was an error after all retries, increment the error counter and log it
        if (errorResult) {
            this.errorTotalCounter++;
            console.log(`Error at scrapePage(${formattedUrl}) → ${errorResult}`);
        }
    
        // End the timer and log how long the scraping of this page took
        console.timeEnd("runTime page number " + pageNum + " annonce " + index);
    }

    /**
     * Determines the total number of pages to scrape for a given region.
     * Parses the total number of job listings and calculates the number of pages based on listings per page.
     *
     * @async
     * @param {object} page - The Puppeteer page object.
     * @param {number} listLength - The number of job listings per page (not used here).
     * @returns {Promise<number>} - The maximum number of pages to scrape.
     */
    async getNumPages(page, listLength) {
        try {
            // Initialize the maximum page number
            let maxPage = 0;
            let currentPageNumber = 1; // Start from the first page
            const baseUrl = page.url(); // Get the base URL
            const url = baseUrl + currentPageNumber; // Construct the URL for the current page
            await page.goto(url, { waitUntil: 'networkidle2' }); // Navigate to the page and wait until network is idle
    
            // Evaluate the page to extract the total number of job listings
            const pageRefs = await page.evaluate(() => {
                const selector = "p.col.col-xs-12.col-m-4.col-m-r.cr span"; // CSS selector for the total job count
                const elements = document.querySelectorAll(selector);
    
                if (elements.length === 0) {
                    console.log("No elements found using CSS selector.");
                    return null;
                }
    
                // Extract the numbers from the text content of the selected elements
                const textContents = Array.from(elements).map(element => {
                    const text = element.textContent.trim();
                    const numberOnly = text.match(/\d+/); // Match digits
                    return numberOnly ? numberOnly[0] : null;
                });
    
                // Filter out any null values
                return textContents.filter(number => number !== null);
            });
    
            // If no valid numbers were found, return 0 to skip the region
            if (!pageRefs || pageRefs.length === 0) {
                console.log("No valid page references found, returning 0 pages.");
                return 0;
            }
    
            // Parse the total number of job listings
            const totalNumbersFromPage = parseInt(pageRefs[0], 10);
    
            if (isNaN(totalNumbersFromPage)) {
                console.log("Failed to parse total numbers from page content.");
                return 0; // Return 0 to indicate that the region should be skipped
            }
    
            // Calculate the maximum number of pages based on 20 listings per page
            maxPage = Math.ceil(totalNumbersFromPage / 20);
            console.log("Max Page:", maxPage);
    
            return maxPage; // Return the calculated number of pages
        } catch (error) {
            // Log any errors encountered during the process
            console.log("Error at getNumPages(" + page.url() + ") → " + error);
            console.error("getNumPages() → " + error);
            return 0;  // Return 0 to indicate that the region should be skipped
        }
    }

}

// Export the CareerjetScraper class for use in other modules
module.exports = CareerjetScraper;
