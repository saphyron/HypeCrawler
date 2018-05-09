let puppeteer = require('puppeteer');
let scraper = require('./scrapers/jobindex-parallel-scraper-1.0.2');
let scraperInterface = require('./scrapers/jobscraper-interface-1.0.0');

async function main() {
    // Initialization:
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ // Håndtering af korrekt aflæsning af dansk alfabet
        'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    // let startTime = Date.now();
    await scraper.initializeDatabase()
        .catch((error) => {
            console.log("Error at main → initializeDatabase(): " + error);
        });

    //<editor-fold desc="TestArea for interface">
        const TARGET_WEBSITE = 'https://www.jobindex.dk';
        const REGION_NAMES = new Map([
            ['faeroeerne', '/jobsoegning/faeroeerne'],
            ['region-midtjylland', '/jobsoegning/region-midtjylland'],
            ['storkoebenhavn', '/jobsoegning/storkoebenhavn'],
            ['nordsjaelland', '/jobsoegning/nordsjaelland'],
            ['region-sjaelland', '/jobsoegning/region-sjaelland'],
            ['fyn', '/jobsoegning/fyn'],
            ['region-nordjylland', '/jobsoegning/region-nordjylland'],
            ['sydjylland', '/jobsoegning/sydjylland'],
            ['bornholm', '/jobsoegning/bornholm'],
            ['skaane', '/jobsoegning/skaane'],
            ['groenland', '/jobsoegning/groenland'],
            ['udlandet', '/jobsoegning/udlandet']
        ]);
        const PATH_VARIATIONS = [
            {
                URL_XPATH_CLASS: 'PaidJob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'PaidJob',
                TITLE_XPATH_ATTRIBUTES: '/a/*[1]'
            },
            {
                URL_XPATH_CLASS: 'jix_robotjob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'jix_robotjob',
                TITLE_XPATH_ATTRIBUTES: '/a/strong'
            }
        ];
        const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';

        const PAGE_TIMEOUT = 30000;

        let jobindexScraper = new scraperInterface(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, PAGE_TIMEOUT);

        await jobindexScraper.beginScraping(page, browser, 1)
            .catch((error) => {
                console.log("Error at main → beginScraping(): " + error);

            });
    //</editor-fold>

/*    await scraper.beginScraping(page, browser, 1)
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
