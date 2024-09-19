// Import required modules
const puppeteer = require('puppeteer'); // Puppeteer for web scraping
const JobindexScraper = require('./scrapers/jobindex-scraper-1.0.0'); // Jobindex scraper class
const CareerjetScraper = require('./scrapers/careerjet-scraper-1.0.0'); // Careerjet scraper class
const csvConverter = require('./data_functions/csvConverter'); // CSV converter module
const uploadCSVToDatabase = require('./data_functions/database_uploader'); // Database uploader module
const { performance } = require('perf_hooks'); // Performance module for measuring execution time
const path = require('path'); // Path module for handling file paths
const duplicateChecker = require('./data_functions/duplicates_Checker'); // Duplicates checker module

let browser; // Declare browser variable to reuse across multiple scraping sessions

/**
 * Main function to run the scrapers, convert data to CSV, upload CSV to the database, and check for duplicates.
 *
 * The function handles:
 * 1. Initializing the Puppeteer browser.
 * 2. Running the Jobindex and Careerjet scrapers.
 * 3. Converting the scraped data to CSV format.
 * 4. Checking for duplicate entries.
 *
 * It also logs the execution time for each task and closes the browser when done.
 */
async function main_sequential() {
    try {
        // Initialize the browser once to be reused across functions
        await initBrowser();

        // Create browser pages (tabs) for scraping
        const page = await browser.newPage();  // Page for Jobindex scraping
        const page2 = await browser.newPage(); // Page for Careerjet scraping

        // Uncomment the following line if you need to upload JSON data to the database
        // await uploadCSVToDatabase.uploadJSONToDatabase();

        // Run Jobindex scraping task and measure execution time
        const jobStartTime = performance.now();
        await jobIndexScraping(page);
        const jobEndTime = performance.now();

        // Run Careerjet scraping task and measure execution time
        const careerStartTime = performance.now();
        await careerjetScraping(page2);
        const careerEndTime = performance.now();

        // Convert the scraped data to CSV and measure execution time
        const csvStartTime = performance.now();
        await csvConverter.exportToCSV(2); // The argument '2' could specify a format version
        const csvEndTime = performance.now();

        // Check for duplicate entries in the database and measure execution time
        const duplicatesStartTime = performance.now();
        await duplicateChecker.checkForDuplicates();
        const duplicatesEndTime = performance.now();

        // Output the execution time for each operation
        console.log("Jobindex scraper execution time: " + ((jobEndTime - jobStartTime) / 1000).toFixed(2) + " seconds");
        console.log("Careerjet scraper execution time: " + ((careerEndTime - careerStartTime) / 1000).toFixed(2) + " seconds");
        console.log("CSV converter execution time: " + ((csvEndTime - csvStartTime) / 1000).toFixed(2) + " seconds");
        console.log("Duplicates checker execution time: " + ((duplicatesEndTime - duplicatesStartTime) / 1000).toFixed(2) + " seconds");

        // Close the browser after all operations are done
        await closeBrowser();
    } catch (error) {
        // Error handling for aggregate errors and other exceptions
        if (error instanceof AggregateError) {
            console.error('AggregateError occurred:', error.errors);
        } else {
            console.error('An error occurred:', error);
        }
    }
}

/**
 * Initializes the Puppeteer browser instance.
 *
 * The browser is launched in headless mode with specific arguments to ensure compatibility
 * with sandboxed environments. The browser instance is reused across multiple scraping tasks.
 */
async function initBrowser() {
    if (!browser) {
        // Launch the browser with necessary configurations
        browser = await puppeteer.launch({
            headless: true,                            // Run in headless mode without a GUI
            defaultViewport: null,                     // Use the default viewport size
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Security options
            protocolTimeout: 600000                    // Set a long timeout to avoid premature disconnections
        });
    }
}

/**
 * Closes the Puppeteer browser instance.
 *
 * This function ensures the browser is closed to free resources once all tasks are completed.
 * It also resets the browser variable, allowing reinitialization for future tasks.
 */
async function closeBrowser() {
    if (browser) {
        await browser.close();  // Close the browser instance
        browser = null;         // Reset the browser variable
    }
}

/**
 * Performs web scraping for job adverts using the Jobindex scraper.
 *
 * @param {Object} page - Puppeteer Page instance used for scraping.
 */
async function jobIndexScraping(page) {
    // Set HTTP headers to handle the Danish language correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    // Check if the scraping source is set to "jobindex" or all sources
    if (!process.env.ADVERTS_SCRAPE || process.env.ADVERTS_SCRAPE === "all" || process.env.ADVERTS_SCRAPE === "jobindex") {
        const scraper = new JobindexScraper(); // Create a new instance of the Jobindex scraper class
        await run(scraper, browser, page, "JobIndex"); // Run the scraper
        scraper.printDatabaseResult(); // Print the scraping results to the database
    }
}

/**
 * Performs web scraping for job adverts using the Careerjet scraper.
 *
 * @param {Object} page - Puppeteer Page instance used for scraping.
 */
async function careerjetScraping(page) {
    // Set HTTP headers to handle the Danish language correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    // Check if the scraping source is set to "careerjet" or all sources
    if (!process.env.ADVERTS_SCRAPE || process.env.ADVERTS_SCRAPE === "all" || process.env.ADVERTS_SCRAPE === "careerjet") {
        const scraper = new CareerjetScraper(); // Create a new instance of the Careerjet scraper class
        await run(scraper, browser, page, "CareerJet"); // Run the scraper
        scraper.printDatabaseResult(); // Print the scraping results to the database
    }
}

/**
 * Executes a web scraping operation with retries and error handling.
 *
 * @param {Object} scraper - The scraper instance to be used for the task.
 * @param {Object} browser - The Puppeteer Browser instance.
 * @param {Object} page - The Puppeteer Page instance.
 * @param {string} scraperName - The name of the scraper being run.
 */
async function run(scraper, browser, page, scraperName) {
    try {
        // Connect to the database with retry mechanism
        await retryOperation(() => scraper.connectDatabase());
        // Initialize the database
        await retryOperation(() => scraper.initializeDatabase());
        // Start the scraping process
        await retryOperation(() => scraper.beginScraping(page, browser, 1, 3, scraperName));
    } catch (error) {
        console.log("Critical error during scraping process: " + error);
        try {
            await scraper.disconnectDatabase(); // Ensure database is disconnected in case of error
        } catch (disconnectError) {
            console.log("Error during database disconnection: " + disconnectError);
        }
        throw error; // Re-throw error to the calling function
    } finally {
        await scraper.disconnectDatabase(); // Ensure the database is disconnected
        if (page && !page.isClosed()) {
            await page.close(); // Close the browser page instance
        }
        // Clean up references
        scraper = null;
        page = null;
    }
}

/**
 * Retries an asynchronous operation a specified number of times with exponential backoff.
 *
 * @param {Function} operation - The asynchronous operation to be retried.
 * @param {number} [retries=3] - The number of times to retry the operation (default is 3).
 * @param {number} [delay=2000] - The initial delay between retries in milliseconds (default is 2000ms).
 * @param {number} [maxWait=30000] - The maximum total wait time in milliseconds before giving up.
 * @returns {Promise<any>} - Resolves with the result of the operation if successful, otherwise throws an error after exhausting retries.
 */
async function retryOperation(operation, retries = 3, delay = 2000, maxWait = 30000) {
    let totalWait = 0; // Track total wait time across retries
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation(); // Attempt the operation
        } catch (error) {
            totalWait += delay;
            if (totalWait >= maxWait || attempt === retries) {
                throw error; // Stop if max wait is reached or max retries exhausted
            }
            console.log(`Retrying operation... Attempt ${attempt} of ${retries}`);
            await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retrying
            delay *= 2; // Exponential backoff
        }
    }
}

// Run the main function
main_sequential().then((result) => {
    console.log("Successful termination: " + result);
}).catch((error) => {
    console.log("Failed termination: " + error);
});

module.exports = { main_sequential };
