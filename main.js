// Import required modules
let puppeteer = require('puppeteer'); // Puppeteer for web scraping
let jobindexClass = require('./scrapers/jobindex-scraper-1.0.0'); // Jobindex scraper class
let careerjetClass = require('./scrapers/careerjet-scraper-1.0.0'); // Careerjet scraper class
let csvConverter = require('./data/CSV_Converter'); // CSV converter module
let uploadCSVToDatabase = require('./data/database_uploader'); // Database uploader module
const { performance } = require('perf_hooks'); // Performance module for measuring execution time
let browser;  // Declare browser outside to reuse if needed across multiple scraping sessions
const path = require('path'); // Path module for handling file paths
const possible_duplicates = require('./data/duplicates_Checker'); // Duplicates checker module

/**
 * Main function to run the scrapers and export data to CSV.
 * 
 * This function orchestrates the entire scraping process, including scraping
 * data from Jobindex and Careerjet, converting data to CSV format, uploading
 * the CSV data to a database, and checking for duplicates. Execution times for
 * each operation are measured and logged.
 */
async function main() {
    try {
        // Path to your CSV file (commented out, can be uncommented to use)
        //uploadCSVToDatabase.main();

        // Run the Jobindex scraper
        var jobStartTime = performance.now(); // Start timer for Jobindex scraper
        await jobIndexScraping(); // Run Jobindex scraping
        var jobEndTime = performance.now(); // End timer for Jobindex scraper

        // Run the Careerjet scraper
        var careerStartTime = performance.now(); // Start timer for Careerjet scraper
        await careerjetScraping(); // Run Careerjet scraping
        var careerEndTime = performance.now(); // End timer for Careerjet scraper

        // Run the CSV converter
        await initBrowser();  // Ensure the browser is initialized before scraping
        const page = await browser.newPage(); // Open a new tab in the browser
        // Set HTTP headers to handle the Danish alphabet correctly
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
        });
        // Export data to CSV
        var csvStartTime = performance.now(); // Start timer for CSV conversion
        await csvConverter.exportToCSV(); // Convert data to CSV and export
        var csvEndTime = performance.now(); // End timer for CSV conversion

        // Run the duplicates checker
        await initBrowser();  // Ensure the browser is initialized before scraping
        const page2 = await browser.newPage(); // Open a new tab in the browser
        // Set HTTP headers to handle the Danish alphabet correctly
        await page2.setExtraHTTPHeaders({
            'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        var duplicatesStartTime = performance.now(); // Start timer for duplicates checker
        await possible_duplicates.checkForDuplicates(); // Check for duplicates in the database
        var duplicatesEndTime = performance.now(); // End timer for duplicates checker

        // Log the execution time for each operation
        console.log("Jobindex scraper execution time: " + (jobEndTime - jobStartTime) / 1000 + " seconds");
        console.log("Careerjet scraper execution time: " + (careerEndTime - careerStartTime) / 1000 + " seconds");
        console.log("CSV converter execution time: " + (csvEndTime - csvStartTime) / 1000 + " seconds");
        console.log("Duplicates checker execution time: " + (duplicatesEndTime - duplicatesStartTime) / 1000 + " seconds");

        // Close the browser once all scraping tasks are completed to free resources.
        await closeBrowser();  // Close the browser instance
    } catch (error) {
        // Error handling
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
 * This function launches a new headless browser if one does not already exist,
 * setting specific options for security and performance.
 */
async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,                            // Run in headless mode without a GUI.
            defaultViewport: null,                     // Use the default viewport size.
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Security arguments for running in certain environments.
            protocolTimeout: 600000                    // Set a long timeout to avoid premature disconnections.
        });
    }
}

/**
 * Closes the Puppeteer browser instance.
 * 
 * This function ensures that the browser is closed and resources are freed,
 * allowing for the possibility of reinitialization later.
 */
async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;  // Reset the browser variable to allow reinitialization later
    }
}

/**
 * Asynchronously performs web scraping for job adverts using Puppeteer and the Jobindex scraper.
 * 
 * This function initializes the browser, creates a new tab, and runs the Jobindex
 * scraper to extract job adverts. After scraping, it closes the browser and logs
 * the results to the console.
 */
async function jobIndexScraping() {
    await initBrowser();  // Ensure the browser is initialized before scraping
    const page = await browser.newPage(); // Open a new tab in the browser
    // Set HTTP headers to handle the Danish alphabet correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    if (process.env.ADVERTS_SCRAPE === undefined   // Check if the variable is not set,
        || process.env.ADVERTS_SCRAPE === "all"    // or if it's set to scrape all sources,
        || process.env.ADVERTS_SCRAPE === "jobindex") {  // or specifically the "jobindex" source.
        let scraper = new jobindexClass(); // Create an instance of the Jobindex scraper class.
        await run(scraper, browser, page, "JobIndex"); // Run the scraper with the browser and page instances
        scraper.printDatabaseResult(); // Print the result from the database
    }
    await closeBrowser();  // Close the browser instance
}

/**
 * Asynchronously performs web scraping for job adverts using Puppeteer and the Careerjet scraper.
 * 
 * This function initializes the browser, creates a new tab, and runs the Careerjet
 * scraper to extract job adverts. After scraping, it closes the browser and logs
 * the results to the console.
 */
async function careerjetScraping() {
    await initBrowser();  // Ensure the browser is initialized before scraping
    const page = await browser.newPage(); // Open a new tab in the browser
    // Set HTTP headers to handle the Danish alphabet correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    if (process.env.ADVERTS_SCRAPE === undefined
        || process.env.ADVERTS_SCRAPE === "all"
        || process.env.ADVERTS_SCRAPE === "careerjet") {
        let scraper = new careerjetClass(); // Create an instance of the Careerjet scraper class
        await run(scraper, browser, page, "CareerJet"); // Run the scraper with the browser and page instances
        scraper.printDatabaseResult(); // Print the result from the database
    }
    await closeBrowser();  // Close the browser instance
}

/**
 * Orchestrates the sequence of operations for the scraper process including database
 * connections, initializations, the main scraping operation, and cleanup.
 *
 * @param {Object} scraper - An instance of a scraper class that implements methods for
 *                           connecting to, initializing, scraping data from, and disconnecting
 *                           from a database.
 * @param {Object} browser - A Puppeteer Browser instance used for scraping.
 * @param {Object} page - A Puppeteer Page instance to be used for scraping.
 */
async function run(scraper, browser, page, scraperName) {
    try {
        await retryOperation(() => scraper.connectDatabase()); // Connect to the database with retries
        await retryOperation(() => scraper.initializeDatabase()); // Initialize the database with retries
        await retryOperation(() => scraper.beginScraping(page, browser, 1, 3, scraperName)); // Start scraping with retries
    } catch (error) {
        console.log("Critical error during scraping process: " + error);
        try {
            await scraper.disconnectDatabase(); // Disconnect from the database in case of error
        } catch (disconnectError) {
            console.log("Error during database disconnection: " + disconnectError);
        }
        throw error; // Re-throw the error to be caught by the calling function
    } finally {
        await scraper.disconnectDatabase(); // Ensure the database is disconnected
        if (page) await page.close(); // Ensure pages are closed
    }
}

/**
 * Retry an asynchronous operation a specified number of times with exponential backoff.
 *
 * @param {Function} operation - The asynchronous operation to be retried.
 * @param {number} [retries=3] - The number of times to retry the operation (default is 3).
 * @param {number} [delay=2000] - The initial delay between retries in milliseconds (default is 2000ms).
 * @returns {Promise<any>} - Resolves with the result of the operation if successful, otherwise throws an error after exhausting retries.
 */
async function retryOperation(operation, retries = 3, delay = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation(); // Attempt to execute the operation
        } catch (error) {
            if (attempt === retries) throw error; // If the final attempt fails, throw the error
            console.log(`Retrying operation... Attempt ${attempt}`);
            await new Promise(resolve => setTimeout(resolve, delay)); // Wait for the specified delay before retrying
            delay *= 2; // Double the delay for the next retry (exponential backoff)
        }
    }
}

// Run the main function
main().then((result) => {
    console.log("Successful termination: " + result);
}, (error) => {
    console.log("Failed termination: " + error);
});

module.exports = { main };