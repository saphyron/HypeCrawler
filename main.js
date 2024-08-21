// Import required modules
let puppeteer = require('puppeteer'); // Puppeteer for web scraping
let jobindexClass = require('./scrapers/jobindex-scraper-1.0.0'); // Jobindex scraper class
let careerjetClass = require('./scrapers/careerjet-scraper-1.0.0'); // Careerjet scraper class
let csvConverter = require('./data/CSV_Converter'); // CSV converter module

// Main function to run the scrapers and export data to CSV
async function main() {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            protocolTimeout: 200000
        });
        const page = await browser.newPage(); // Open a new tab in the browser
        // Set HTTP headers to handle the Danish alphabet correctly
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
        });
        // TODO: Scraper skal hente hvilke side jobannonce kom fra og skrive til database

        // Check environment variable to determine which scrapers to run
        if (process.env.ADVERTS_SCRAPE === undefined
            || process.env.ADVERTS_SCRAPE === "all"
            || process.env.ADVERTS_SCRAPE === "jobindex") {
            // If ADVERTS_SCRAPE is not set, or set to "all" or "jobindex", run the Jobindex scraper
            let scraper = new jobindexClass(); // Create an instance of the Jobindex scraper class
            await run(scraper, browser, page); // Run the scraper with the browser and page instances
            scraper.printDatabaseResult(); // Print the result from the database
        }
        if (process.env.ADVERTS_SCRAPE === undefined
            || process.env.ADVERTS_SCRAPE === "all"
            || process.env.ADVERTS_SCRAPE === "careerjet") {
            // If ADVERTS_SCRAPE is not set, or set to "all" or "careerjet", run the Careerjet scraper
            let scraper = new careerjetClass(); // Create an instance of the Careerjet scraper class
            await run(scraper, browser, page); // Run the scraper with the browser and page instances
            scraper.printDatabaseResult(); // Print the result from the database
        }
        // Export data to CSV
        await csvConverter.exportToCSV(); // Call the exportToCSV function from the csvConverter module

        // Clean up:
        browser.close(); // Close the browser instance
    } catch (error) {
        // Error handling
        if (error instanceof AggregateError) {
            console.error('AggregateError occurred:', error.errors);
        } else {
            console.error('An error occurred:', error);
        }
    }
}
// Function to run the scraper
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
}
// Run the main function
main().then((result) => {
    console.log("Successful termination: " + result);
}, (error) => {
    console.log("Failed termination: " + error);
});
