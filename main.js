let puppeteer = require('puppeteer');
let scraper = require('./scrapers/jobindex-parallel-scraper-1.0.0');

async function main() {
    // Initialization:
    const browser = await puppeteer.launch({
        headless: true
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ // Håndtering af korrekt aflæsning af dansk alfabet
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    // let startTime = Date.now();
/*    await scraper.initializeDatabase()
        .catch((error) => {
            console.log("Error at main → initializeDatabase(): " + error);
        });*/

    await scraper.beginScraping(page, browser, 1)
        .catch((error) => {
            console.log("Error at main → beginScraping(): " + error);

        });

    //Print result
    printDatabaseResult();

    // Clean up:
    browser.close();

}

main().then((result) => {
    console.log("Succesful termination: "+result);
}, (error) => {
    console.log("Failed termination: "+error);
});
