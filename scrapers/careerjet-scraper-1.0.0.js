let ScraperInterface = require('./jobscraper-interface-1.0.0');


const TARGET_WEBSITE = 'https://www.careerjet.dk';
const REGION_NAMES = new Map([
    ['bornholm', '/wsog/jobs?l=Bornholm&lid=268760&b='],
    ['storkoebenhavn', '/wsog/jobs?l=Storkøbenhavn&lid=270167&b='],
    ['region-sjaelland', '/wsog/jobs?l=Sjælland&lid=268728&b='],
    ['region-nordjylland', '/wsog/jobs?l=Nordjylland&lid=268731&b='],
    ['region-midtjylland', '/wsog/jobs?l=Midtjylland&lid=268730&b='],
    ['sydjylland', '/wsog/jobs?l=Syddanmark&lid=268729&b='],
]);

const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'job', URL_XPATH_ATTRIBUTES: '/h2/a/@href', TITLE_XPATH_CLASS: 'job',
        TITLE_XPATH_ATTRIBUTES: '/h2/a'
    },
    {
        URL_XPATH_CLASS: 'jix_robotjob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'jix_robotjob',
        TITLE_XPATH_ATTRIBUTES: '/a/strong'
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

    /**
     * @inheritDoc
     */
    async scrapeRegion(page, browser, REGION_PAGE_SELECTOR, fromPage, toPage) {
        return new Promise((resolve, reject) => {
            let resolveCounter = 0, rejectCounter = 0;
            let result = '';

            // Utility method to limit the amount of simultaneous running pages.
            let settlePromise = () => {
                if (resolveCounter + rejectCounter === (toPage - fromPage))
                    if (rejectCounter > 0)
                        reject(result);
                    else
                        resolve();
            };

            for (let index = fromPage; index < toPage; index++) {
                console.log('BEGINNING SCRAPING ON PAGE: ' + index);
                let pageExtension = (index * 20) + 1;
                const PAGE_SELECTOR = REGION_PAGE_SELECTOR.concat(`${pageExtension}`);

                this.getCurrentPageURLTitles(page, PAGE_SELECTOR)
                    .then((pageURLsAndTitles) => {
                        return this.scrapePageList(browser, pageURLsAndTitles, index)
                            .catch((error) => {
                                rejectCounter++;
                                result += "Error at scrapeRegion → scrapePageList: " + error + '\n';
                            })
                    })
                    .then(() => {
                        resolveCounter++;
                        settlePromise();
                    })
                    .catch((error) => {
                        rejectCounter++;
                        result += "Error at scrapeRegion → getCurrentPageURLTitles: " + error + '\n';
                        settlePromise();
                    })
            }
        });
    }

    /**
     * @inheritDoc
     */
    async scrapePage(page, title, url, index, pageNum) {
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
            //*[@id="rightcol"]/div[1]/nobr/table/tbody/tr/td/span/nobr
            //*[@id="rightcol"]/div[1]/nobr/table/tbody/tr/td/span/nobr
            let pageRefs = await page.$x("//*[@id=\"rightcol\"]/div[1]/nobr/table/tbody/tr/td/span/nobr")
                .catch((error) => {
                    throw new Error("page.$x() → " + error);
                });
            let pageText = await page.evaluate(element => element.textContent, pageRefs[0])

            // Extracting num of pages substrings
            var pageRegEx = /([0-9]+)( til )([0-9]+)( af )([0-9]+) jobs/;
            var pageSubstrings = pageText.match(pageRegEx);

            // Calculate num of pages
            var firstJobNo = Number(pageSubstrings[1]);
            var lastJobNo = Number(pageSubstrings[3]);
            var totalJobCount = Number(pageSubstrings[5]);
            var result = Math.ceil(totalJobCount / (lastJobNo-firstJobNo+1));

            return result;
        } catch (error) {
            console.log("Error at getNumPages("+page+") → " + error);
        }
    }
}

module.exports = CareerjetScraper;
