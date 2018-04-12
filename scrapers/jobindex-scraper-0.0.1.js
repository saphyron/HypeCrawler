const puppeteer = require('puppeteer');

const TARGET_WEBSITE = 'https://www.jobindex.dk';
const SUBJECT_AREA_LEVEL = `https://www.jobindex.dk/job/it`;
const SUBJECT_CATEGORIES_LEVEL = 'https://it.jobindex.dk/job/it/database';

async function run() {
    // DOM Selectors:
    const JOBLIST_SELECTOR = 'PaidJob';
    const LIST = '#result_list_box > div';

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


    // UNSTABLE

    let divs = await page.evaluate((selector) => {
        return document.getElementsByClassName(selector);
    }, JOBLIST_SELECTOR);

    let divChildren = divs.children;
    for(let i = 0; i < divChildren.length; i++) {
        let child = divChildren[i];
        console.log(child);

    }

    console.log(divs);


//    await page.goto(TARGET_WEBSITE);

    /*
        // First Level:
        await page.goto(SUBJECT_AREA_LEVEL);

        // Second Level:
        await page.goto(SUBJECT_CATEGORIES_LEVEL);*/

    // let a = '#result_list_box > div > div.results.component--default'
}

run();