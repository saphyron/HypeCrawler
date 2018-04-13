const puppeteer = require('puppeteer');

const TARGET_WEBSITE = 'https://www.jobindex.dk';
const SUBJECT_AREA_LEVEL = `https://www.jobindex.dk/job/it`;
const SUBJECT_CATEGORIES_LEVEL = 'https://it.jobindex.dk/job/it/database';

async function run() {
    // DOM Selectors:
    const JOBLIST_SELECTOR = 'PaidJob';

    // Initialization:
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();

    await page.goto('https://it.jobindex.dk/jobsoegning/it/database/storkoebenhavn');

    // List length on one page:
    let listLength = await page.evaluate((selector) => {
        return document.getElementsByClassName(selector).length;
    }, JOBLIST_SELECTOR);

    console.log(listLength);


    // Indsæt XPath
    const LIST_ITEM_URL = await page.$x('//*[@id="result_list_box"]/div/div[2]/div[1]/div/a/@href');
    //const title = await page.$x("//*[@id=\"result_list_box\"]/div/div[2]/div[1]/div");
    let url = await page.evaluate(div => div.textContent, LIST_ITEM_URL[0]);
    console.log(url);

    //browser.close();
}

run();