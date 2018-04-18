// Imports:
const puppeteer = require('puppeteer');
const ORM = require('../data/general-orm-0.0.4');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');

// XPath selectors:
const TARGET_WEBSITE = 'https://www.jobindex.dk';
const SUBJECT_AREA_LEVEL = `https://www.jobindex.dk/job/it`;
const SUBJECT_CATEGORIES_LEVEL = 'https://it.jobindex.dk/job/it/database';

// Generic XPath to linked website element location:
const LIST_ITEM_URL_XPATH = '//*[@id="result_list_box"]/div/div[2]/div[INDEX]/div/a/@href';
const LIST_ITEM_TITLE_XPATH =
    '//*[@id="result_list_box"]/div/div[2]/div[INDEX]/div/a/b or //*[@id="result_list_box"]/div/div[2]/div[INDEX]/div/a'; // TODO! Skal have imeplementeret en or i XPATH.

// Counters:
let succesCounter = 0, existingCounter = 0, errorCounter = 0;

// Variabels:
let areaNames = ['storkoebenhavn', 'region-sjaelland', 'fyn', 'region-nordjylland', 'fyn', 'region-midtjylland',
                    'sydjylland', 'bornholm', 'skaane', 'groenland', ''];

async function main() {
    // DOM Selectors:
    const JOBLIST_SELECTOR = 'PaidJob';
    // Initialization:
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await ORM.CreateAnnonceTable();

    await page.goto('https://it.jobindex.dk/jobsoegning/it/storkoebenhavn');


    // List length on single page: Put in scrapelist
    let listLength = await page.evaluate((selector) => {
        return document.getElementsByClassName(selector).length;
    }, JOBLIST_SELECTOR);


    await scrapeCategory(page, listLength);
    //let res = await scrapePageList(page, listLength);
    console.log("SCRAPING DONE!");
    printDatabaseResult();


    // Clean up:
    browser.close();

}

async function scrapeCategory(page, listLength) {
    // goto next page:
    const GENERIC_PAGE_SELECTOR = 'https://it.jobindex.dk/jobsoegning/it/storkoebenhavn?page=PAGE_INDEX';
    const NUM_PAGES = await getNumPages(page, listLength);

    for (let index = 22; index <= NUM_PAGES; index++) {
        console.log('BEGINNING SCRAPING ON PAGE: ' + index);

        const PAGE_SELECTOR = GENERIC_PAGE_SELECTOR.replace('PAGE_INDEX', index);

        await page.goto(PAGE_SELECTOR);
        await scrapePageList(page, listLength, PAGE_SELECTOR);

    }

}


async function scrapePageList(page, listLength, currentPageUrl) {
    // Iterate through a single page list and get linked sites for each advertisement:
    for (let index = 1; index <= listLength; index++) {
        try {
            console.log('Run ' + index + ': begun');
            console.time('runTime');


            // Extracting url
            const LIST_ITEM_SELECTOR = LIST_ITEM_URL_XPATH.replace("INDEX", index);
            const LIST_ITEM_URL = await page.$x(LIST_ITEM_SELECTOR);
            let temp = LIST_ITEM_URL.length;


            let itemUrl = await page.evaluate(div => div.textContent, LIST_ITEM_URL[temp - 1]);
            console.log(itemUrl);


            // Extracting title for advertisement:
            const LIST_ITEM_TITLE_SELECTOR = LIST_ITEM_TITLE_XPATH.replace(/INDEX/g, index);
            const LIST_ITEM_TITLE = await page.$x(LIST_ITEM_TITLE_SELECTOR);
            let annonceTitle = await page.evaluate(div => div.textContent, LIST_ITEM_TITLE[0]);
            console.log(annonceTitle);

            // Goto linked site and scrape it:
            await page.goto(itemUrl, {
                // timeout: 1000  -- For later reference
            });

            const LINKED_SITE_BODY = await page.$x('/html/body');
            let rawBodyText = await page.evaluate(div => div.textContent, LINKED_SITE_BODY[0]);
            //console.log(rawBodyText);

            // Insert or update annonce to database:
            await insertAnnonce(annonceTitle, rawBodyText, itemUrl);

        } catch (e) {
            console.log("SOMETHING WENT WRONG");
            errorCounter++;
        }
        // Return to advertisement list on Jobindex.dk:
        await page.goto(currentPageUrl);
        console.timeEnd('runTime');
    }
}

//<editor-fold desc="HelperMethods">

function printDatabaseResult() {
    let totalEntries = succesCounter + existingCounter + errorCounter;

    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log('\t\t\tJOBINDEX.DK SCRAPER STATISTIK');
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[32m" + '\t\t\t' + succesCounter + ' OUT OF ' + totalEntries
        + ` (${(succesCounter / totalEntries) * 100} %) --- INSERTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');

    console.log("\x1b[33m" + '\t\t\t' + existingCounter + ' OUT OF ' + totalEntries
        + ` (${(existingCounter / totalEntries) * 100} %) --- EXISTS`);
    console.log("\x1b[0m", '----------------------------------------------------------');
    console.log("\x1b[31m" + '\t\t\t' + errorCounter + ' OUT OF ' + totalEntries
        + ` (${(errorCounter / totalEntries) * 100} %) --- ERRORS`);

    console.log("\x1b[0m", '----------------------------------------------------------');
}

async function getNumPages(page, listLength) {
    const TEXT_FILTER_REGEX = /[^0-9]/g;
    const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';
    const ADVERTS_PER_PAGE = listLength;

    let advertContent = await page.$x(TOTAL_ADVERTS_SELECTOR);                      // Collecting the part.
    let rawText = await page.evaluate(div => div.textContent, advertContent[0]);    // Extracting info.
    let filteredText = rawText.replace(TEXT_FILTER_REGEX, '');                      // Filtering number from text.

    let numPages = Math.ceil(filteredText / ADVERTS_PER_PAGE);                      // Calculating page numbers.
    return numPages;
}

async function insertAnnonce(annonceTitle, rawBodyText, annonceURL) {
    let sha1Checksum = sha1(`${annonceTitle}${annonceURL}`);
    let callResult = await ORM.FindChecksum(sha1Checksum);

    if (callResult.length === 0) {
        let newAnnonceModel = await createAnnonceModel(annonceTitle, rawBodyText, null, sha1Checksum);
        await ORM.InsertAnnonce(newAnnonceModel);
        succesCounter++;
    }
    else {
        //console.log('ALREADY IN DATABASE!')// Do nothing - TODO create update method.
        existingCounter++;
    }


}

async function createAnnonceModel(title, body, regionId = null, checksum) {
    // Format Timestamp:
    let newDate = new Date();
    let timestampFormat = newDate.getFullYear() + '-' + (newDate.getMonth() < 9 ? '0' : '') + (newDate.getMonth() + 1)
        + '-' + (newDate.getDate() < 9 ? '0' : '') + (newDate.getDate()) + ' ' + newDate.getHours() + ':' +
        newDate.getMinutes() + ':' + newDate.getSeconds();

    // model data into Annonce class:
    return new annonceModel(title, body, regionId, timestampFormat, checksum.toString());
}

//</editor-fold>

main();
