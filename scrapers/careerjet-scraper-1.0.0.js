let ScraperInterface = require('./jobscraper-interface-1.0.0');


const TARGET_WEBSITE = 'https://www.careerjet.dk';
const REGION_NAMES = new Map([
    ['bornholm', '/jobs-i-bornholm-268760.html?p='],
    ['storkoebenhavn', '/jobs-i-hovedstaden-268727.html?p='],
    ['region-sjaelland', '/jobs-i-sjaelland-268728.html?p='],
    ['region-nordjylland', '/jobs-i-nordjylland-268731.html?p='],
    ['region-midtjylland', '/jobs-i-midtjylland-268730.html?p='],
    ['sydjylland', '/jobs-i-syddanmark-268729.html?p='],
]);

const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'job', URL_XPATH_ATTRIBUTES: '/header/h2/a/@href', TITLE_XPATH_CLASS: 'job',
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
            let bodyHTML = await page.evaluate(() => document.body.outerHTML)
                .catch((error) => {
                    throw new Error("newPage.evaluate(): " + error)
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
            // Collecting num of pages element text
            let pageRefs = await page.$x('//*[@id="search-content"]/header/p[2]/span[1]')
                .catch((error) => {
                    throw new Error("page.$x() → " + error);
                });
            let pageText = await page.evaluate(element => element.textContent, pageRefs[0]);

            // Extracting num of pages substrings
            var pageRegEx = /([0-9]+) jobs/;
            var pageSubstrings = pageText.match(pageRegEx);

            // Calculate num of pages
            var totalJobCount = Number(pageSubstrings[1]);
            var result = Math.ceil(totalJobCount / 20);

            return result;
        } catch (error) {
            console.log("Error at getNumPages("+page+") → " + error);
        }
    }
}

module.exports = CareerjetScraper;
