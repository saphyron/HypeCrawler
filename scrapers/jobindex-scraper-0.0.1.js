const puppeteer = require('puppeteer');

const TARGET_WEBSITE = 'https://www.jobindex.dk';
const SUBJECT_AREA_LEVEL = `https://www.jobindex.dk/job/it`;
const SUBJECT_CATEGORIES_LEVEL = 'https://it.jobindex.dk/job/it/database';

async function run() {
    // DOM Selectors:
    const JOBLIST_SELECTOR = '#result_list_box > div > div.results.component--default';

    // Initialization:
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await page.goto(TARGET_WEBSITE);


    // First Level:
    await page.goto(SUBJECT_AREA_LEVEL);

    // Second Level:
    await page.goto(SUBJECT_CATEGORIES_LEVEL);
}
run();