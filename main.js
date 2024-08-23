// Import required modules
let puppeteer = require('puppeteer'); // Puppeteer for web scraping
let jobindexClass = require('./scrapers/jobindex-scraper-1.0.0'); // Jobindex scraper class
let careerjetClass = require('./scrapers/careerjet-scraper-1.0.0'); // Careerjet scraper class
let csvConverter = require('./data/CSV_Converter'); // CSV converter module
const { performance } = require('perf_hooks'); // Performance module for measuring execution time
let browser;  // Declare browser outside to reuse if needed across multiple scraping sessions

// Main function to run the scrapers and export data to CSV
async function main() {
    try {

        // TODO: Scraper skal hente hvilke side jobannonce kom fra og skrive til database

        // Run the job index scraper
        var jobStartTime = performance.now();
        await jobIndexScraping();
        var jobEndTime = performance.now();
        // Run the Careerjet scraper
        var careerStartTime = performance.now();
        await careerjetScraping();
        var careerEndTime = performance.now();

        // Run the CSV converter
        await initBrowser();  // Ensure the browser is initialized before scraping
        const page = await browser.newPage(); // Open a new tab in the browser
        // Set HTTP headers to handle the Danish alphabet correctly
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
        });
        // Export data to CSV
        var csvStartTime = performance.now();
        await csvConverter.exportToCSV(); // Call the exportToCSV function from the csvConverter module
        var csvEndTime = performance.now();

        console.log("Jobindex scraper execution time: " + (jobEndTime - jobStartTime) / 1000 + " seconds");
        console.log("Careerjet scraper execution time: " + (careerEndTime - careerStartTime) / 1000 + " seconds");
        console.log("CSV converter execution time: " + (csvEndTime - csvStartTime) / 1000 + " seconds");

        // Close the browser once all scraping tasks are completed to free resources.
        await closeBrowser();  // Close the browser instanceF
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
 * Initialize a shared browser instance to be reused.
 */
async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,                            // Run in headless mode without a GUI.
            defaultViewport: null,                     // Use the default viewport size.
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Security arguments for running in certain environments.
            protocolTimeout: 300000                    // Set a long timeout to avoid premature disconnections.
        });
    }
}

/**
 * Clean up browser instances when all scraping is done.
 */
async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;  // Reset the browser variable to allow reinitialization later
    }
}

/**
 * Asynchronously performs web scraping for job adverts using Puppeteer and a specific scraper implementation.
 */
async function jobIndexScraping() {
    await initBrowser();  // Ensure the browser is initialized before scraping
    // Open a new tab in the browser
    const page = await browser.newPage();
    // Set HTTP headers to handle the Danish alphabet correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    // Determine which scrapers to run based on environment variables.
    if (process.env.ADVERTS_SCRAPE === undefined   // Check if the variable is not set,
        || process.env.ADVERTS_SCRAPE === "all"    // or if it's set to scrape all sources,
        || process.env.ADVERTS_SCRAPE === "jobindex") {  // or specifically the "jobindex" source.
        // Create an instance of the Jobindex scraper class.
        let scraper = new jobindexClass();
        // Execute the scraping process using the instantiated scraper, browser, and page objects.
        await run(scraper, browser, page); // Run the scraper with the browser and page instances
        // After scraping, print results from the database operations performed by the scraper.
        scraper.printDatabaseResult(); // Print the result from the database
    }
    // Close the browser once all scraping tasks are completed to free resources.
    await closeBrowser();  // Close the browser instance
}



async function careerjetScraping() {
    await initBrowser();  // Ensure the browser is initialized before scraping
    // Open a new tab in the browser
    const page = await browser.newPage(); // Open a new tab in the browser
    // Set HTTP headers to handle the Danish alphabet correctly
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    if (process.env.ADVERTS_SCRAPE === undefined
        || process.env.ADVERTS_SCRAPE === "all"
        || process.env.ADVERTS_SCRAPE === "careerjet") {
        // If ADVERTS_SCRAPE is not set, or set to "all" or "careerjet", run the Careerjet scraper
        let scraper = new careerjetClass(); // Create an instance of the Careerjet scraper class
        await run(scraper, browser, page); // Run the scraper with the browser and page instances
        scraper.printDatabaseResult(); // Print the result from the database
    }
    // Close the browser once all scraping tasks are completed to free resources.
    await closeBrowser();  // Close the browser instance
}

/*// Function to run the scraper
// Input: scraper instance, browser instance, page instance
// Output: None (side effects: runs the scraper)
async function run(scraper, browser, page) {
    await scraper.connectDatabase()
        .catch((error) => {
            console.log("Error at main → connectDatabase(): " + error);
            throw error;
        });

    await scraper.initializeDatabase()
        .catch((error) => {
            console.log("Error at main → initializeDatabase(): " + error);
        });

    //<editor-fold desc="TestArea for interface">
    await scraper.beginScraping(page, browser, 1, 3)
        .catch((error) => {
            console.log("Error at main → beginScraping(): " + error);

        });

    await scraper.disconnectDatabase()
        .catch((error) => {
            console.log("Error at main → disconnectDatabase(): " + error);
            throw error;
        });
}*/

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
async function run(scraper, browser, page) {
    try {
        // Attempt to connect to the database.
        // This is essential to ensure data can be stored during the scraping process.
        await scraper.connectDatabase();

        // Initialize the database structure as needed.
        // This typically involves setting up tables and possibly seeding initial data.
        // This step can handle non-critical errors internally, allowing the process to continue.
        await scraper.initializeDatabase();

        // Begin the main scraping process.
        // This will typically navigate through web pages and collect data.
        // Errors during scraping are managed here but will not halt the process, as
        // the goal is to ensure all other cleanup operations (like database disconnection)
        // can still proceed.
        await scraper.beginScraping(page, browser, 1, 3);
    } catch (error) {
        // Log and handle any critical errors that occurred during the database connection,
        // initialization, or scraping process.
        console.log("Critical error during scraping process: " + error);
        // Attempt to safely close the database connection to prevent resource leaks.
        try {
            await scraper.disconnectDatabase();
        } catch (disconnectError) {
            // Log additional errors that occur during the cleanup phase.
            console.log("Error during database disconnection: " + disconnectError);
        }
        // Rethrow the error to handle or log it at a higher level, signaling an unsuccessful operation.
        throw error;
    }
    // Finally, ensure the database is disconnected cleanly.
    await scraper.disconnectDatabase();
}



// Run the main function
main().then((result) => {
    console.log("Successful termination: " + result);
}, (error) => {
    console.log("Failed termination: " + error);
});
