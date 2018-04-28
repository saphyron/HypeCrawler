const puppeteer = require('puppeteer');
let async = require('./scrapers/async-jobindex-scraper-1.0.0');

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
    await async.initializeDatabase()
        .catch((value) => {
            console.log("Error at main → initializeDatabase(): " + value);
        });

    let results = await async.scrapeRegions(page, browser)
        .catch((value) => {
            console.log("Error at main → scrapeRegions(): " + value);
        });

    printDatabaseResult(results);

    // Clean up:
    browser.close();

}

main()
    .catch(() => {
    console.log("Something went wrong in main!")
});


function printDatabaseResult(results) {
    let successCounter = results.successCounter;
    let existingCounter = results.existingCounter;
    let errorCounter = results.errorCounter;

    let totalEntries = successCounter + existingCounter + errorCounter;

    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log('\t\t\tJOBINDEX.DK SCRAPER STATISTIK');
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[32m" + '\t\t\t' + successCounter + ' OUT OF ' + totalEntries
        + ` (${(successCounter / totalEntries) * 100} %) --- INSERTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');

    console.log("\x1b[33m" + '\t\t\t' + existingCounter + ' OUT OF ' + totalEntries
        + ` (${(existingCounter / totalEntries) * 100} %) --- EXISTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[31m" + '\t\t\t' + errorCounter + ' OUT OF ' + totalEntries
        + ` (${(errorCounter / totalEntries) * 100} %) --- ERRORS`);

    console.log("\x1b[0m", '----------------------------------------------------------');
}