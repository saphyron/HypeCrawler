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

// Main function to run the scrapers and export data to CSV
async function main() {
    try {
        // Path to your CSV file
        //uploadCSVToDatabase.main();

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

        await initBrowser();  // Ensure the browser is initialized before scraping
        const page2 = await browser.newPage(); // Open a new tab in the browser
        // Set HTTP headers to handle the Danish alphabet correctly
        await page2.setExtraHTTPHeaders({
            'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        var duplicatesStartTime = performance.now();
        await possible_duplicates.checkForDuplicates();
        var duplicatesEndTime = performance.now();

        console.log("Jobindex scraper execution time: " + (jobEndTime - jobStartTime) / 1000 + " seconds");
        console.log("Careerjet scraper execution time: " + (careerEndTime - careerStartTime) / 1000 + " seconds");
        console.log("CSV converter execution time: " + (csvEndTime - csvStartTime) / 1000 + " seconds");
        console.log("Duplicates checker execution time: " + (duplicatesEndTime - duplicatesStartTime) / 1000 + " seconds");
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

async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;  // Reset the browser variable to allow reinitialization later
    }
}

/**
 * Initialize a shared browser instance to be reused.
 */
/*async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,                            // Run in headless mode without a GUI.
            defaultViewport: null,                     // Use the default viewport size.
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Security arguments for running in certain environments.
            protocolTimeout: 300000                    // Set a long timeout to avoid premature disconnections.
        });
    }
}*/

/**
 * Clean up browser instances when all scraping is done.
 */
/*async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;  // Reset the browser variable to allow reinitialization later
    }
}*/

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
        await run(scraper, browser, page, "JobIndex"); // Run the scraper with the browser and page instances
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
        await run(scraper, browser, page, "CareerJet"); // Run the scraper with the browser and page instances
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
async function retryOperation(operation, retries = 3, delay = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === retries) throw error;
            console.log(`Retrying operation... Attempt ${attempt}`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
}

async function run(scraper, browser, page, scraperName) {
    try {
        await retryOperation(() => scraper.connectDatabase());
        await retryOperation(() => scraper.initializeDatabase());
        await retryOperation(() => scraper.beginScraping(page, browser, 1, 3, scraperName));
    } catch (error) {
        console.log("Critical error during scraping process: " + error);
        try {
            await scraper.disconnectDatabase();
        } catch (disconnectError) {
            console.log("Error during database disconnection: " + disconnectError);
        }
        throw error;
    } finally {
        await scraper.disconnectDatabase();
        if (page) await page.close(); // Ensure pages are closed
    }
}



// Run the main function
main().then((result) => {
    console.log("Successful termination: " + result);
}, (error) => {
    console.log("Failed termination: " + error);
});
