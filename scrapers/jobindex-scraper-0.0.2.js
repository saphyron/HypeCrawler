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
    const title = await page.$x("//*[@id=\"result_list_box\"]/div/div[2]/div[1]/div");
    let text = await page.evaluate(div => div.textContent, title[0]);
    console.log(text);

    //browser.close();
}

run();