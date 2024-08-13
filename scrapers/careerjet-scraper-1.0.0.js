let ScraperInterface = require('./jobscraper-interface-1.0.0');


const TARGET_WEBSITE = 'https://www.careerjet.dk';
const REGION_NAMES = new Map([
    ['bornholm', '/jobs?s=&l=Bornholm&p='],
    ['storkoebenhavn', '/jobs?s=&l=Storkøbenhavn&p='],
    ['region-sjaelland', '/jobs?s=&l=Sjælland&p='],
    ['region-nordjylland', '/jobs?s=&l=Nordjylland&p='],
    ['region-midtjylland', '/jobs?s=&l=Midtjylland&p='],
    ['sydjylland', '/jobs?s=&l=Syddanmark&p='],
]);

const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'jobs', URL_XPATH_ATTRIBUTES: '/header/h2/a/@href', TITLE_XPATH_CLASS: 'jobs',
        TITLE_XPATH_ATTRIBUTES: '/header/h2/a'
    }
];
const TOTAL_ADVERTS_SELECTOR = '//*[@id="rightcol"]/div[1]/nobr/table/tbody/tr/td/span/nobr';
const TOTAL_ADVERTS_REGEX = /af (.*?) jobs/g;
const PAGE_TIMEOUT = 15000;

/**
 * Class representing the algorithm for careerjet.dk
 * @class
 * @implements {JocscraperTemplate}
 */
class CareerjetScraper extends ScraperInterface {
    constructor() {
        super(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, TOTAL_ADVERTS_REGEX, PAGE_TIMEOUT);
    }

    getPageExtension(pageNo) {
        return `${pageNo + 1}`;
    }

    /**
     * @inheritDoc
     */
    async scrapePage(page, title, url, companyUrl, index, pageNum) {
        let formattedUrl = (TARGET_WEBSITE + url);
        let errorResult = undefined;
        console.time("runTime page number " + pageNum + " annonce " + index);

        try {
            await page.goto(formattedUrl, {
                timeout: this.PAGE_TIMEOUT
            })
                .catch((error) => {
                    throw new Error("page.goto(): " + error);
                });

            // Filter the object and extract body as raw text.
            let bodyHTML = undefined
            await Promise.race([
                page.evaluate(() => document.body.outerHTML),
                page.waitFor(this.PAGE_TIMEOUT)
            ])
                .then((value) => {
                    if (typeof value === "string") {
                        bodyHTML = value
                    } else {
                        throw new Error("newPage.evaluate() TIMEOUT")
                    }
                })
                .catch((error) => {
                    throw new Error("newPage.evaluate() ERROR: " + error)
                });

            // Insert or update annonce to database:
            await this.insertAnnonce(title, bodyHTML, formattedUrl)
                .catch((error) => {
                    throw new Error("insertAnnonce(" + formattedUrl + "): " + error)
                });

        } catch (error) {
            errorResult = error;
        }

        if (errorResult) {
            this.errorTotalCounter++;
            console.log("Error at scrapePage(" + formattedUrl + ") → " + errorResult);
        }

        console.timeEnd("runTime page number " + pageNum + " annonce " + index);
    }

    /**
     * Extracts the text containing the innerHTML which holds the number of pages in the region.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param page
     * @param listLength
     * @returns {Promise<number>}
     */
    async getNumPages(page, listLength) {
        try {
            // Log the HTML content of the page for debugging
            const pageContent = await page.content();
            console.log("Page Content: ", pageContent);
            // Collecting num of pages element text
            let pageRefs = await page.$$('ul[data-page]');
            if (pageRefs.length === 0) {
                console.log("No elements found using CSS selector 'ul[data-page]'.");
            } else {
                //console.log("Elements found using CSS selector 'ul[data-page]': ", pageRefs);
            }
            // Extracting the data-page attribute value
            let currentPage = await page.evaluate(element => element.getAttribute('data-page'), pageRefs[0])
                .catch((error) => {
                    throw new Error("page.evaluate() → " + error);
                });

            console.log("Current page: " + currentPage);

            // Further processing if needed
            // For example, you can parse the currentPage to an integer
            let currentPageNumber = parseInt(currentPage, 10);
            if (isNaN(currentPageNumber)) {
                throw new Error("Failed to parse current page number from data-page attribute: " + currentPage);
            }

            return currentPageNumber;
        } catch (error) {
            console.log("Error at getNumPages(" + page + ") → " + error);
            console.error("getNumPages() → " + error);
            throw error;
        }
    }
}

module.exports = CareerjetScraper;
