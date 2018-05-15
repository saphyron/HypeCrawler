let puppeteer = require('puppeteer');
let scraperClass = require('./scrapers/jobindex-scraper-1.0.0');

async function main() {
    // Initialization:
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ // Håndtering af korrekt aflæsning af dansk alfabet
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    let scraper = new scraperClass();
    // let startTime = Date.now();
/*    await jobindexScraper.initializeDatabase()
        .catch((error) => {
            console.log("Error at main → initializeDatabase(): " + error);
        });*/

    //<editor-fold desc="TestArea for interface">
    await scraper.beginScraping(page, browser, 1, 3)
        .catch((error) => {
            console.log("Error at main → beginScraping(): " + error);

        });
    //</editor-fold>
/*        await scraper.beginScraping(page, browser, 1)
            .catch((error) => {
                console.log("Error at main → beginScraping(): " + error);

            });*/

    //Print result
    scraper.printDatabaseResult();

    // Clean up:
    browser.close();

}

main().then((result) => {
    console.log("Succesful termination: " + result);
}, (error) => {
    console.log("Failed termination: " + error);
});
