let ScraperInterface = require('./jobscraper-interface-1.0.0');


const TARGET_WEBSITE = 'https://www.jobindex.dk';
const REGION_NAMES = new Map([
    ['nordsjaelland', '/jobsoegning/nordsjaelland'],
    ['region-sjaelland', '/jobsoegning/region-sjaelland'],
    ['fyn', '/jobsoegning/fyn'],
    ['region-nordjylland', '/jobsoegning/region-nordjylland'],
    ['sydjylland', '/jobsoegning/sydjylland'],
    ['bornholm', '/jobsoegning/bornholm'],
    ['skaane', '/jobsoegning/skaane'],
    ['groenland', '/jobsoegning/groenland'],
    ['udlandet', '/jobsoegning/udlandet'],
    ['faeroeerne', '/jobsoegning/faeroeerne'],
    ['region-midtjylland', '/jobsoegning/region-midtjylland'],
    ['storkoebenhavn', '/jobsoegning/storkoebenhavn'],
]);
const PATH_VARIATIONS = [
    {
        URL_XPATH_CLASS: 'PaidJob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'PaidJob',
        TITLE_XPATH_ATTRIBUTES: '/a/*[1]', COMPANY_XPATH_CLASS: 'toolbar-companyprofile', COMPANY_XPATH_ATTRIBUTES: '/a/@href'
    },
    {
        URL_XPATH_CLASS: 'jix_robotjob', URL_XPATH_ATTRIBUTES: '/a/@href', TITLE_XPATH_CLASS: 'jix_robotjob',
        TITLE_XPATH_ATTRIBUTES: '/a/strong', COMPANY_XPATH_CLASS: 'jix_robotjob', COMPANY_XPATH_ATTRIBUTES: '/a/@href'
    }
];
const TOTAL_ADVERTS_SELECTOR = '//*[@id="result_list_box"]/div/div[1]/div/div[1]/h2/text()';
const TOTAL_ADVERTS_REGEX = /(\d*\.?\d*)/g;
const PAGE_TIMEOUT = 15000;

/**
 * @class
 * @implements {JocscraperTemplate}
 */
class JobindexScraper extends ScraperInterface {

    /**
     * Constructor for
     * @constructor
     */
    constructor() {
        super(TARGET_WEBSITE, REGION_NAMES, PATH_VARIATIONS, TOTAL_ADVERTS_SELECTOR, TOTAL_ADVERTS_REGEX, PAGE_TIMEOUT);
    }

    getPageExtension(pageNo) {
        return `?page=${pageNo}`;
    }

    /**
     * @inheritDoc
     */
    async getNumPages(page, listLength) {
        try {
            // Collecting num of pages element
            let pageRefs = await page.$x("(//a[@class=\"page-link\"])[last()]")
                .catch((error) => {
                    throw new Error("page.$x() → " + error);
                });

            // Extracting num of pages string
            let textNum = await page.evaluate(element => element.textContent, pageRefs[0])
                .catch((error) => {
                    throw new Error("page.evaluate() → " + error);
                });

            // Return number
            textNum = textNum.replace(/\./g, '');
            let totalJobCount = Number(textNum);
            var result = Math.ceil(totalJobCount / 20);
            return result;
        } catch (error) {
            console.log("Error at getNumPages() → " + error);
        }
    }

    /**
     * Scrapes the provided page and invokes database call.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {Object}              page                    Browser tab from pagePool.
     * @param {String}              title                   Title of the linked page.
     * @param {String}              url                     Url of linked page.
     * @param {int}                 index                   Indicator of advertisement position in the list.
     * @param {int}                 pageNum                 Indicator of advertisement list page number in region.
     *
     * @returns {Promise<void>}
     */
    async scrapePage(page, title, url, companyURL, index, pageNum) {
        //let newPage = undefined;
        let errorResult = undefined;
        console.time("runTime page number " + pageNum + " annonce " + index);

        try {
            await page.goto(url, {
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
            let cvr = undefined;

            if(companyURL !== undefined) {
                await page.goto(companyURL, {
                    timeout: this.PAGE_TIMEOUT
                }) .catch((error) => {
                    throw new Error("page.goto(): " + error)
                })

                let companyHTML = await page.evaluate(() => document.body.outerHTML)
                    .catch((error)=> {
                        "CompanyDataScrape: " + error
                    });


                let cvrRegexp = /DK([0-9]{8})/g
                cvr = cvrRegexp.exec(companyHTML)
                cvr = cvr[1]; // Extract cvr in first capture group.

            }



            // Insert or update annonce to database:
            await this.insertAnnonce(title, bodyHTML, url, cvr)
                .catch((error) => {
                    throw new Error("insertAnnonce(" + url + "): " + error)
                })



        } catch (error) {
            errorResult = error;
        }

        if (errorResult) {
            this.errorTotalCounter++;
            console.log("Error at scrapePage(" + url + ") → " + errorResult);
        }

        console.timeEnd("runTime page number " + pageNum + " annonce " + index);
    }

}

module.exports = JobindexScraper;
