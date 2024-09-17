// Import required modules
let puppeteer = require('puppeteer'); // Puppeteer for web scraping
let jobindexClass = require('./scrapers/jobindex-scraper-1.0.0'); // Jobindex scraper class
let careerjetClass = require('./scrapers/careerjet-scraper-1.0.0'); // Careerjet scraper class
let csvConverter = require('./data/CSV_Converter'); // CSV converter module
let uploadCSVToDatabase = require('./data/database_uploader'); // Database uploader module
const { performance } = require('perf_hooks'); // Performance module for measuring execution time
let browser;  // Declare browser outside to reuse across multiple scraping sessions
const path = require('path'); // Path module for handling file paths
const possible_duplicates = require('./data/duplicates_Checker'); // Duplicates checker module

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
async function main() {
    try {
        await initBrowser();  // Initialize the browser once here to be reused across functions
        const page = await browser.newPage(); // Create the first browser tab for scraping
        const page2 = await browser.newPage(); // Create the second tab for other tasks

        // (optional, remove comments if function is needed)
        //await uploadCSVToDatabase.uploadJSONToDatabase();

        // Log the start time for Jobindex scraping
        var jobStartTime = performance.now(); 
        //await jobIndexScraping(page); // Run Jobindex scraping task
        var jobEndTime = performance.now(); // Log the end time for Jobindex scraping

        // Log the start time for Careerjet scraping
        var careerStartTime = performance.now(); 
        //await careerjetScraping(page2); // Run Careerjet scraping task
        var careerEndTime = performance.now(); // Log the end time for Careerjet scraping

        // Log the start time for CSV conversion
        var csvStartTime = performance.now(); 
        await csvConverter.exportToCSV(2); // Convert the scraped data to CSV
        var csvEndTime = performance.now(); // Log the end time for CSV conversion

        // Log the start time for the duplicates checker
        var duplicatesStartTime = performance.now(); 
        await possible_duplicates.checkForDuplicates(); // Check for duplicate entries in the database
        var duplicatesEndTime = performance.now(); // Log the end time for the duplicates checker

        // Output the execution time for each operation
        console.log("Jobindex scraper execution time: " + (jobEndTime - jobStartTime) / 1000 + " seconds");
        console.log("Careerjet scraper execution time: " + (careerEndTime - careerStartTime) / 1000 + " seconds");
        console.log("CSV converter execution time: " + (csvEndTime - csvStartTime) / 1000 + " seconds");
        console.log("Duplicates checker execution time: " + (duplicatesEndTime - duplicatesStartTime) / 1000 + " seconds");

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
 * The browser is launched with headless mode and specific arguments to ensure compatibility 
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
        browser = null;  // Reset the browser variable
    }
}

/**
 * Performs web scraping for job adverts using the Jobindex scraper.
 * 
 * @param {Object} page - Puppeteer Page instance used for scraping.
 * This function sets HTTP headers, runs the Jobindex scraper, and logs the results.
 */
async function jobIndexScraping(page) {
    // Set HTTP headers to handle the Danish alphabet correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    // Check if the scraping source is set to "jobindex" or all sources
    if (process.env.ADVERTS_SCRAPE === undefined || process.env.ADVERTS_SCRAPE === "all" || process.env.ADVERTS_SCRAPE === "jobindex") {  
        let scraper = new jobindexClass(); // Create a new instance of the Jobindex scraper class
        await run(scraper, browser, page, "JobIndex"); // Run the scraper
        scraper.printDatabaseResult(); // Print the scraping results to the database
    }
}

/**
 * Performs web scraping for job adverts using the Careerjet scraper.
 * 
 * @param {Object} page - Puppeteer Page instance used for scraping.
 * This function sets HTTP headers, runs the Careerjet scraper, and logs the results.
 */
async function careerjetScraping(page) {
    // Set HTTP headers to handle the Danish alphabet correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    // Check if the scraping source is set to "careerjet" or all sources
    if (process.env.ADVERTS_SCRAPE === undefined || process.env.ADVERTS_SCRAPE === "all" || process.env.ADVERTS_SCRAPE === "careerjet") {
        let scraper = new careerjetClass(); // Create a new instance of the Careerjet scraper class
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
 * This function handles database connection, initialization, scraping, and error handling.
 */
async function run(scraper, browser, page, scraperName) {
    try {
        await retryOperation(() => scraper.connectDatabase()); // Connect to the database with retry mechanism
        await retryOperation(() => scraper.initializeDatabase()); // Initialize the database
        await retryOperation(() => scraper.beginScraping(page, browser, 1, 3, scraperName)); // Start the scraping process
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
        if (page) await page.close(); // Close the browser page instance
        scraper = null;  // Release memory
        page = null;
    }
}

/**
 * Retry an asynchronous operation a specified number of times with exponential backoff.
 *
 * @param {Function} operation - The asynchronous operation to be retried.
 * @param {number} [retries=3] - The number of times to retry the operation (default is 3).
 * @param {number} [delay=2000] - The initial delay between retries in milliseconds (default is 2000ms).
 * @param {number} [maxWait=30000] - The maximum time to wait for retries before giving up.
 * @returns {Promise<any>} - Resolves with the result of the operation if successful, otherwise throws an error after exhausting retries.
 */
async function retryOperation(operation, retries = 3, delay = 2000, maxWait = 30000) {
    let totalWait = 0;  // Track total wait time across retries
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();  // Attempt the operation
        } catch (error) {
            if (totalWait >= maxWait || attempt === retries) throw error;  // Stop if max wait is reached
            console.log(`Retrying operation... Attempt ${attempt}`);
            await new Promise(resolve => setTimeout(resolve, delay));  // Wait before retrying
            totalWait += delay;
            delay *= 2;  // Exponential backoff
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
