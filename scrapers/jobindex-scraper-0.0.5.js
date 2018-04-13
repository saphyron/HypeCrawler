const puppeteer = require('puppeteer');

const TARGET_WEBSITE = 'https://www.jobindex.dk';
const SUBJECT_AREA_LEVEL = `https://www.jobindex.dk/job/it`;
const SUBJECT_CATEGORIES_LEVEL = 'https://it.jobindex.dk/job/it/database';

// Generic XPath to linked website element location:
const LIST_ITEM_GENERIC_XPATH = '//*[@id="result_list_box"]/div/div[2]/div[INDEX]/div/a/@href';


async function run() {
    // DOM Selectors:
    const JOBLIST_SELECTOR = 'PaidJob';

    // Initialization:
    const browser = await puppeteer.launch({
        //headless: false
    });
    const page = await browser.newPage();

    await page.goto('https://it.jobindex.dk/jobsoegning/it/database/storkoebenhavn');


    // List length on single page:
    let listLength = await page.evaluate((selector) => {
        return document.getElementsByClassName(selector).length;
    }, JOBLIST_SELECTOR);


    //await scrapePage(page, listLength);


    // goto next page:
    const GENERIC_PAGE_SELECTOR = 'https://it.jobindex.dk/jobsoegning/it/database/storkoebenhavn?page=PAGE_INDEX';
    const NUM_PAGES = getNumPages(page, listLength);

  /*  for(let index = 2; index <= 10; index++) {
        const PAGE_SELECTOR = GENERIC_PAGE_SELECTOR.replace('PAGE_INDEX', index);

        await page.goto(PAGE_SELECTOR);
    }*/


    // Clean up:
    // browser.close();

}


async function scrapePage(page, listLength) {
    // Iterate through a single page list and get linked sites for each advertisement:
    for(let index = 1; index <= listLength; index++) {
        const LIST_ITEM_SELECTOR = LIST_ITEM_GENERIC_XPATH.replace("INDEX", index);

        const LIST_ITEM_URL = await page.$x(LIST_ITEM_SELECTOR);
        let itemUrl = await page.evaluate(div => div.textContent, LIST_ITEM_URL[0]);
        console.log(itemUrl);

        /*        // Goto linked site and scrape it:
                await page.goto(itemUrl);

                const LINKED_SITE_BODY = await page.$x('/html/body');
                let items = await page.evaluate(div => div.textContent, LINKED_SITE_BODY[0]);
                console.log(items);*/
    }
}

async function getNumPages(page, listLength) {
    const TEXT_FILTER_REGEX = /[^0-9]/g;
    const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';
    const ADVERTS_PER_PAGE = listLength;

    let advertContent = await page.$x(TOTAL_ADVERTS_SELECTOR);                      // Collecting the part.
    let rawText = await page.evaluate(div => div.textContent, advertContent[0]);    // Extracting info.
    let filteredText = rawText.replace(TEXT_FILTER_REGEX, '');                      // Filtering number from text.

    let numPages = Math.ceil(filteredText / ADVERTS_PER_PAGE);                      // Finding actual page numbers.
    return numPages;
}

run();