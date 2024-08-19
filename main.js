let puppeteer = require('puppeteer');
let jobindexClass = require('./scrapers/jobindex-scraper-1.0.0');
let careerjetClass = require('./scrapers/careerjet-scraper-1.0.0');
let csvConverter = require('./data/CSV_Converter');

async function main() {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            protocolTimeout: 6000000
        });
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({ // Handling of correct reading of danish alphabet
            'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        /*if (process.env.ADVERTS_SCRAPE === undefined || process.env.ADVERTS_SCRAPE === "all" || process.env.ADVERTS_SCRAPE === "jobindex") {
    
            let scraper = new jobindexClass();
            await run(scraper, browser, page);
            //Print result
            scraper.printDatabaseResult();
        }*/
        /*if (process.env.ADVERTS_SCRAPE === undefined || process.env.ADVERTS_SCRAPE === "all" || process.env.ADVERTS_SCRAPE === "careerjet") {
    
            let scraper = new careerjetClass();
            await run(scraper, browser, page);
            //Print result
            scraper.printDatabaseResult();
        }*/
        // Export data to CSV
        await csvConverter.exportToCSV();

        // Clean up:
        browser.close();
    } catch (error) {
        if (error instanceof AggregateError) {
            console.error('AggregateError occurred:', error.errors);
        } else {
            console.error('An error occurred:', error);
        }
    }
}

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

main().then((result) => {
    console.log("Successful termination: " + result);
}, (error) => {
    console.log("Failed termination: " + error);
});
